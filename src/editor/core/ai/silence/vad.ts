import type { AudioFeatures, SilenceTrimOptions } from './types';

export interface SpeechInterval {
	startUs: number;
	endUs: number;
}

/**
 * Computes the p-th percentile of an array slice.
 */
function computePercentile(values: Float32Array, start: number, end: number, p = 0.1): number {
	const count = end - start;
	if (count <= 0) return -60;
	const slice = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		slice[i] = values[start + i]!;
	}
	slice.sort();
	const idx = Math.min(count - 1, Math.max(0, Math.floor(count * p)));
	return slice[idx]!;
}

/**
 * Pure voice activity detection (VAD) from precomputed audio features:
 * - Adaptive sliding noise floor (10th percentile over 2.5s window)
 * - Energy threshold with hysteresis (hangover)
 * - Voice-only band energy (300-3400 Hz) and spectral flatness filtering
 * - Pre-speech breath preservation
 * - Padding before/after with automatic interval merging
 */
export function detectSpeechIntervals(
	features: AudioFeatures,
	options: Partial<SilenceTrimOptions> = {}
): SpeechInterval[] {
	const {
		thresholdMode = 'auto',
		manualThresholdDb = -40,
		sensitivity = 0.5,
		paddingBeforeMs = 80,
		paddingAfterMs = 80,
		keepBreaths = false,
		voiceOnly = true
	} = options;

	const { numFrames, hopSize, sampleRate, rmsDb, speechBandRatio, spectralFlatness } = features;
	if (numFrames === 0) return [];

	const frameDurationUs = Math.round((hopSize * 1_000_000) / sampleRate); // 10,000 µs (10 ms)
	const slidingWindowFrames = Math.round((2.5 * sampleRate) / hopSize); // 250 frames (~2.5s)
	const halfWindow = Math.floor(slidingWindowFrames / 2);

	// 1. Calculate adaptive noise floor per frame
	const noiseFloor = new Float32Array(numFrames);
	for (let f = 0; f < numFrames; f++) {
		const start = Math.max(0, f - halfWindow);
		const end = Math.min(numFrames, f + halfWindow);
		noiseFloor[f] = computePercentile(rmsDb, start, end, 0.1);
	}

	// 2. Determine per-frame speech activation with hysteresis
	const isSpeech = new Uint8Array(numFrames);
	let inSpeech = false;

	// Delta above noise floor governed by sensitivity (0.0: +20dB, 0.5: +10dB, 1.0: +3dB)
	const deltaDb = 20 - sensitivity * 17; // 3dB to 20dB

	for (let f = 0; f < numFrames; f++) {
		const floor = noiseFloor[f]!;
		const baseThreshold =
			thresholdMode === 'auto' ? Math.max(-55, Math.min(-18, floor + deltaDb)) : manualThresholdDb;

		const thOn = baseThreshold;
		const thOff = baseThreshold - 3.5; // 3.5 dB hangover for hysteresis

		const frameRms = rmsDb[f]!;
		const bandRatio = speechBandRatio[f]!;
		const flatness = spectralFlatness[f]!;

		let passesAcoustic = true;
		if (voiceOnly) {
			// Speech concentrated in 300-3400Hz and non-white spectrum
			passesAcoustic = bandRatio >= 0.35 && flatness <= 0.7;
		}

		if (!inSpeech) {
			if (frameRms >= thOn && passesAcoustic) {
				inSpeech = true;
			}
		} else {
			if (frameRms < thOff || (voiceOnly && bandRatio < 0.2)) {
				inSpeech = false;
			}
		}

		isSpeech[f] = inSpeech ? 1 : 0;
	}

	// 3. Keep breaths (expand 200ms prior to speech onsets if breath characteristics match)
	if (keepBreaths) {
		const breathLookbackFrames = 20; // 200 ms
		for (let f = 1; f < numFrames; f++) {
			if (isSpeech[f] === 1 && isSpeech[f - 1] === 0) {
				// Onset found, look back for inhalation
				const lookbackStart = Math.max(0, f - breathLookbackFrames);
				for (let b = f - 1; b >= lookbackStart; b--) {
					const bRms = rmsDb[b]!;
					const bFloor = noiseFloor[b]!;
					if (bRms > bFloor + 2.0 && bRms < -25) {
						isSpeech[b] = 1;
					} else {
						break;
					}
				}
			}
		}
	}

	// 4. Temporal smoothing: drop isolated spikes (<40ms) and bridge micro-gaps (<60ms)
	const minSpeechFrames = 4; // 40ms
	const minGapFrames = 6; // 60ms

	// Bridge short gaps
	let gapStart = -1;
	for (let f = 0; f < numFrames; f++) {
		if (isSpeech[f] === 0) {
			if (gapStart === -1) gapStart = f;
		} else {
			if (gapStart !== -1) {
				const gapLen = f - gapStart;
				if (gapLen <= minGapFrames && gapStart > 0) {
					for (let i = gapStart; i < f; i++) isSpeech[i] = 1;
				}
				gapStart = -1;
			}
		}
	}

	// Filter out tiny spikes
	let burstStart = -1;
	for (let f = 0; f <= numFrames; f++) {
		if (f < numFrames && isSpeech[f] === 1) {
			if (burstStart === -1) burstStart = f;
		} else {
			if (burstStart !== -1) {
				const burstLen = f - burstStart;
				if (burstLen < minSpeechFrames) {
					for (let i = burstStart; i < f; i++) isSpeech[i] = 0;
				}
				burstStart = -1;
			}
		}
	}

	// 5. Extract contiguous speech intervals
	const rawIntervals: SpeechInterval[] = [];
	let currentStart = -1;
	for (let f = 0; f < numFrames; f++) {
		if (isSpeech[f] === 1) {
			if (currentStart === -1) currentStart = f;
		} else {
			if (currentStart !== -1) {
				rawIntervals.push({
					startUs: currentStart * frameDurationUs,
					endUs: f * frameDurationUs
				});
				currentStart = -1;
			}
		}
	}
	if (currentStart !== -1) {
		rawIntervals.push({
			startUs: currentStart * frameDurationUs,
			endUs: numFrames * frameDurationUs
		});
	}

	if (rawIntervals.length === 0) return [];

	// 6. Apply padding (before and after) and merge overlapping intervals
	const paddingBeforeUs = Math.max(0, paddingBeforeMs * 1000);
	const paddingAfterUs = Math.max(0, paddingAfterMs * 1000);

	const paddedIntervals: SpeechInterval[] = rawIntervals.map((interval) => ({
		startUs: Math.max(0, interval.startUs - paddingBeforeUs),
		endUs: interval.endUs + paddingAfterUs
	}));

	const merged: SpeechInterval[] = [];
	let current = paddedIntervals[0]!;

	for (let i = 1; i < paddedIntervals.length; i++) {
		const next = paddedIntervals[i]!;
		if (next.startUs <= current.endUs) {
			// Overlap -> merge
			current = {
				startUs: current.startUs,
				endUs: Math.max(current.endUs, next.endUs)
			};
		} else {
			merged.push(current);
			current = next;
		}
	}
	merged.push(current);

	return merged;
}
