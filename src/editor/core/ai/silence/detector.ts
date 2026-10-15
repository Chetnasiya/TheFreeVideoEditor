import { createAssetId } from '../../../core/ids';
import type { Time } from '../../../core/types';
import type { DetectedSilence, SilenceDetectionResult, SilenceTrimOptions } from './types';
import type { SpeechInterval } from './vad';

/**
 * Snaps a cut point in microseconds to the nearest zero-crossing or quietest sample within windowMs (default ±10 ms).
 */
export function snapCutPoint(
	timeUs: Time,
	samples?: Float32Array,
	sampleRate = 16000,
	windowMs = 10
): Time {
	if (!samples || samples.length === 0) return timeUs;

	const targetSample = Math.round((timeUs * sampleRate) / 1_000_000);
	const radius = Math.round((windowMs * sampleRate) / 1000); // 160 samples (10ms)
	const start = Math.max(0, targetSample - radius);
	const end = Math.min(samples.length - 1, targetSample + radius);

	let bestZeroCrossing = -1;
	let minZeroDist = Infinity;

	let quietestSample = targetSample;
	let minAbs = Infinity;
	let minAbsDist = Infinity;

	for (let i = start; i < end; i++) {
		const cur = samples[i]!;
		const next = samples[i + 1]!;
		const dist = Math.abs(i - targetSample);

		// Zero crossing test
		if (cur * next <= 0) {
			if (dist < minZeroDist) {
				minZeroDist = dist;
				bestZeroCrossing = Math.abs(cur) <= Math.abs(next) ? i : i + 1;
			}
		}

		// Quietest sample fallback
		const absVal = Math.abs(cur);
		if (absVal < minAbs || (absVal === minAbs && dist < minAbsDist)) {
			minAbs = absVal;
			minAbsDist = dist;
			quietestSample = i;
		}
	}

	const chosen = bestZeroCrossing !== -1 ? bestZeroCrossing : quietestSample;
	return Math.round((chosen * 1_000_000) / sampleRate);
}

/**
 * Finds all silence gaps between speech intervals according to user policy:
 * - Gaps < minSilenceSec are untouched
 * - Gaps > maxSilenceSec are shortened to maxSilenceSec (centered on gap)
 * - If maxSilenceSec == 0, gap is removed completely
 * - Cut points snap to quietest sample / zero-crossing
 */
export function computeSilenceRegions(
	speechIntervals: SpeechInterval[],
	timelineDurationUs: Time,
	options: SilenceTrimOptions,
	samples?: Float32Array
): SilenceDetectionResult {
	const minSilenceUs = Math.round(options.minSilenceSec * 1_000_000);
	const maxSilenceUs = Math.round(options.maxSilenceSec * 1_000_000);
	const isShortenMode = options.mode === 'shorten';

	const rawGaps: Array<{
		startUs: Time;
		endUs: Time;
		isLeadingOrTrailing?: boolean;
	}> = [];

	if (speechIntervals.length === 0) {
		// Entire timeline is silence
		if (timelineDurationUs > 0) {
			rawGaps.push({ startUs: 0, endUs: timelineDurationUs, isLeadingOrTrailing: true });
		}
	} else {
		// 1. Leading silence
		const firstSpeech = speechIntervals[0]!;
		if (firstSpeech.startUs > 0) {
			rawGaps.push({ startUs: 0, endUs: firstSpeech.startUs, isLeadingOrTrailing: true });
		}

		// 2. Gaps between speech intervals
		for (let i = 0; i < speechIntervals.length - 1; i++) {
			const prev = speechIntervals[i]!;
			const next = speechIntervals[i + 1]!;
			if (next.startUs > prev.endUs) {
				rawGaps.push({ startUs: prev.endUs, endUs: next.startUs, isLeadingOrTrailing: false });
			}
		}

		// 3. Trailing silence
		const lastSpeech = speechIntervals[speechIntervals.length - 1]!;
		if (timelineDurationUs > lastSpeech.endUs) {
			rawGaps.push({
				startUs: lastSpeech.endUs,
				endUs: timelineDurationUs,
				isLeadingOrTrailing: true
			});
		}
	}

	const silences: DetectedSilence[] = [];

	for (const gap of rawGaps) {
		const gapDuration = gap.endUs - gap.startUs;

		// If leading/trailing silence trimming is disabled, skip leading/trailing gaps
		if (gap.isLeadingOrTrailing && !options.trimLeadingTrailing) {
			continue;
		}

		// Gaps shorter than minSilenceSec are untouched
		if (gapDuration < minSilenceUs) {
			continue;
		}

		let cutStartUs: Time = gap.startUs;
		let cutEndUs: Time = gap.endUs;

		if (isShortenMode && maxSilenceUs > 0) {
			// Gap is only cut if it exceeds maxSilenceSec
			if (gapDuration <= maxSilenceUs) {
				continue;
			}

			if (gap.isLeadingOrTrailing) {
				if (gap.startUs === 0) {
					// Leading gap: keep maxSilenceUs before speech, cut 0 to (gapDuration - maxSilenceUs)
					cutStartUs = 0;
					cutEndUs = gap.endUs - maxSilenceUs;
				} else {
					// Trailing gap: keep maxSilenceUs after speech, cut remainder
					cutStartUs = gap.startUs + maxSilenceUs;
					cutEndUs = gap.endUs;
				}
			} else {
				// Internal gap: center the cut so maxSilenceUs is kept evenly split
				const keepStart = Math.floor(maxSilenceUs / 2);
				const keepEnd = maxSilenceUs - keepStart;
				cutStartUs = gap.startUs + keepStart;
				cutEndUs = gap.endUs - keepEnd;
			}
		}

		// Snap cut boundaries to zero crossings
		const snappedCutStart = snapCutPoint(cutStartUs, samples);
		const snappedCutEnd = snapCutPoint(cutEndUs, samples);

		// Clamp within gap
		const finalCutStart = Math.max(gap.startUs, Math.min(gap.endUs, snappedCutStart));
		const finalCutEnd = Math.max(finalCutStart, Math.min(gap.endUs, snappedCutEnd));
		const cutDurationUs = finalCutEnd - finalCutStart;

		if (cutDurationUs > 0) {
			silences.push({
				id: createAssetId(),
				startUs: gap.startUs,
				endUs: gap.endUs,
				durationUs: gapDuration,
				cutStartUs: finalCutStart,
				cutEndUs: finalCutEnd,
				cutDurationUs,
				included: true,
				isLeadingOrTrailing: gap.isLeadingOrTrailing
			});
		}
	}

	const includedSilences = silences.filter((s) => s.included);
	const totalRemovedUs = includedSilences.reduce((sum, s) => sum + s.cutDurationUs, 0);

	return {
		silences,
		totalSilencesCount: silences.length,
		includedCount: includedSilences.length,
		totalRemovedUs,
		originalDurationUs: timelineDurationUs,
		newDurationUs: Math.max(0, timelineDurationUs - totalRemovedUs)
	};
}
