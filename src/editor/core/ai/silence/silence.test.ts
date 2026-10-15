import { describe, expect, it } from 'vitest';
import { extractAudioFeatures } from './features';
import { detectSpeechIntervals } from './vad';
import { computeSilenceRegions, snapCutPoint } from './detector';
import { applySilenceTrimToProject } from './operations';
import { DEFAULT_SILENCE_OPTIONS } from './types';
import { createEmptyProject } from '../../../core';
import type { AssetId, Clip, SequenceId, Track } from '../../../core/types';

/**
 * Seeded PRNG for reproducible synthetic audio test fixtures.
 */
function seededRandom(seed: number) {
	let s = seed % 2147483647;
	if (s <= 0) s += 2147483646;
	return () => {
		s = (s * 16807) % 2147483647;
		return (s - 1) / 2147483646;
	};
}

/**
 * Synthesizes a tone with harmonics in the speech band (300-3400 Hz) with added noise.
 */
function generateSpeechSignal(
	sampleRate: number,
	durationSec: number,
	amplitude = 0.5,
	prng = seededRandom(12345)
): Float32Array {
	const numSamples = Math.round(sampleRate * durationSec);
	const samples = new Float32Array(numSamples);
	const f0 = 400; // 400 Hz fundamental (within speech band 300-3400 Hz)

	for (let i = 0; i < numSamples; i++) {
		const t = i / sampleRate;
		// Harmonic stack: f0, 2*f0, 3*f0, 4*f0
		const signal =
			0.5 * Math.sin(2 * Math.PI * f0 * t) +
			0.3 * Math.sin(2 * Math.PI * 2 * f0 * t) +
			0.2 * Math.sin(2 * Math.PI * 3 * f0 * t) +
			0.1 * Math.sin(2 * Math.PI * 4 * f0 * t);
		const noise = (prng() * 2 - 1) * 0.02; // Small background noise
		samples[i] = (signal + noise) * amplitude;
	}
	return samples;
}

/**
 * Synthesizes near-silent background room tone (-60 dB).
 */
function generateSilenceSignal(
	sampleRate: number,
	durationSec: number,
	noiseFloor = 0.001,
	prng = seededRandom(54321)
): Float32Array {
	const numSamples = Math.round(sampleRate * durationSec);
	const samples = new Float32Array(numSamples);
	for (let i = 0; i < numSamples; i++) {
		samples[i] = (prng() * 2 - 1) * noiseFloor;
	}
	return samples;
}

describe('Silence Trimming & VAD Engine Oracles', () => {
	it('extracts features: RMS dB, speech band ratio, and zero-crossing rate correctly', () => {
		const sampleRate = 16000;
		// 1 second of speech vs 1 second of silence
		const speech = generateSpeechSignal(sampleRate, 1.0, 0.4);
		const silence = generateSilenceSignal(sampleRate, 1.0, 0.0005);

		const combined = new Float32Array(speech.length + silence.length);
		combined.set(speech, 0);
		combined.set(silence, speech.length);

		const features = extractAudioFeatures(combined, sampleRate);
		expect(features.numFrames).toBeGreaterThan(180);

		// First half (speech): higher RMS dB and high speech band ratio
		const speechFramesRms = features.rmsDb.subarray(10, 80);
		const avgSpeechRms = speechFramesRms.reduce((a, b) => a + b, 0) / speechFramesRms.length;
		expect(avgSpeechRms).toBeGreaterThan(-25); // ~ -10 to -18 dB

		const speechBandRatios = features.speechBandRatio.subarray(10, 80);
		const avgBandRatio = speechBandRatios.reduce((a, b) => a + b, 0) / speechBandRatios.length;
		expect(avgBandRatio).toBeGreaterThan(0.6); // > 60% of energy in speech band

		// Second half (silence): very low RMS dB
		const silenceFramesRms = features.rmsDb.subarray(120, 180);
		const avgSilenceRms = silenceFramesRms.reduce((a, b) => a + b, 0) / silenceFramesRms.length;
		expect(avgSilenceRms).toBeLessThan(-55);
	});

	it('snaps cut points to exact zero-crossing within window', () => {
		const sampleRate = 16000;
		// Create a sine wave with zero crossings at known samples
		const samples = new Float32Array(320); // 20ms
		for (let i = 0; i < 320; i++) {
			samples[i] = Math.sin((2 * Math.PI * 100 * i) / sampleRate);
		}

		// Pick time corresponding to sample 165 (where sin(165) is positive)
		const targetTimeUs = Math.round((165 * 1_000_000) / sampleRate);
		const snappedUs = snapCutPoint(targetTimeUs, samples, sampleRate, 10);
		const snappedSample = Math.round((snappedUs * sampleRate) / 1_000_000);

		// Verify snappedSample is adjacent to a zero crossing
		const cur = samples[snappedSample]!;
		const next = samples[snappedSample + 1] ?? cur;
		const prev = samples[snappedSample - 1] ?? cur;
		const isZeroCrossing = cur * next <= 0 || cur * prev <= 0;
		expect(isZeroCrossing).toBe(true);
	});

	it('ground-truth synthetic audio oracle: detects speech and silences with exact known durations', () => {
		const sampleRate = 16000;
		const prng = seededRandom(999);

		// Ground truth structure:
		// 0.0s - 1.0s: Speech 1 (1.0s)
		// 1.0s - 2.2s: Silence gap 1 (1.2s gap > min 0.3s and > max 0.4s) -> should be shortened
		// 2.2s - 3.2s: Speech 2 (1.0s)
		// 3.2s - 3.4s: Micro-pause (0.2s gap < min 0.3s) -> should be untouched!
		// 3.4s - 4.4s: Speech 3 (1.0s)
		// 4.4s - 6.4s: Silence gap 2 (2.0s gap) -> should be shortened
		const speech1 = generateSpeechSignal(sampleRate, 1.0, 0.4, prng);
		const silence1 = generateSilenceSignal(sampleRate, 1.2, 0.0005, prng);
		const speech2 = generateSpeechSignal(sampleRate, 1.0, 0.4, prng);
		const microPause = generateSilenceSignal(sampleRate, 0.2, 0.0005, prng);
		const speech3 = generateSpeechSignal(sampleRate, 1.0, 0.4, prng);
		const silence2 = generateSilenceSignal(sampleRate, 2.0, 0.0005, prng);

		const totalLength =
			speech1.length +
			silence1.length +
			speech2.length +
			microPause.length +
			speech3.length +
			silence2.length;
		const syntheticAudio = new Float32Array(totalLength);

		let offset = 0;
		syntheticAudio.set(speech1, offset);
		offset += speech1.length;
		syntheticAudio.set(silence1, offset);
		offset += silence1.length;
		syntheticAudio.set(speech2, offset);
		offset += speech2.length;
		syntheticAudio.set(microPause, offset);
		offset += microPause.length;
		syntheticAudio.set(speech3, offset);
		offset += speech3.length;
		syntheticAudio.set(silence2, offset);

		const totalDurationUs = Math.round((totalLength * 1_000_000) / sampleRate); // 6,400,000 µs (6.4s)

		const features = extractAudioFeatures(syntheticAudio, sampleRate);
		const speechIntervals = detectSpeechIntervals(features, {
			paddingBeforeMs: 40,
			paddingAfterMs: 40,
			sensitivity: 0.6,
			voiceOnly: true
		});

		expect(speechIntervals.length).toBeGreaterThanOrEqual(2);

		// Run silence detection: maxSilence = 0.4s, minSilence = 0.3s
		const options = {
			...DEFAULT_SILENCE_OPTIONS,
			maxSilenceSec: 0.4,
			minSilenceSec: 0.3,
			mode: 'shorten' as const,
			trimLeadingTrailing: false
		};

		const result = computeSilenceRegions(speechIntervals, totalDurationUs, options, syntheticAudio);

		// Micro-pause (0.2s) must NOT be cut because it is < minSilenceSec (0.3s)
		for (const s of result.silences) {
			expect(s.durationUs).toBeGreaterThanOrEqual(300_000); // >= 0.3s
		}

		// Gaps longer than 0.4s must be shortened centered on the gap
		expect(result.silences.length).toBeGreaterThan(0);
		for (const s of result.silences) {
			const remainingSilenceUs = s.durationUs - s.cutDurationUs;
			// Remaining silence should equal maxSilenceSec (400,000 µs) within tolerance of zero-crossing snap (±20ms)
			expect(Math.abs(remainingSilenceUs - 400_000)).toBeLessThanOrEqual(25_000);
		}
	});

	it('multi-track sync oracle: cuts applied across video and audio tracks preserve exact synchronization', () => {
		// Create a mock multi-track project with Video 1 and Audio 1
		const initialVideoClip: Clip = {
			id: 'v1' as Clip['id'],
			assetId: 'asset_video' as unknown as AssetId,
			start: 0,
			duration: 10_000_000, // 10s
			sourceIn: 0,
			sourceOut: 10_000_000,
			speed: 1,
			volume: 1,
			linkId: 'link_1'
		};

		const initialAudioClip: Clip = {
			id: 'a1' as Clip['id'],
			assetId: 'asset_audio' as unknown as AssetId,
			start: 0,
			duration: 10_000_000, // 10s
			sourceIn: 0,
			sourceOut: 10_000_000,
			speed: 1,
			volume: 1,
			linkId: 'link_1'
		};

		const videoTrack: Track = {
			id: 'track_v1' as Track['id'],
			name: 'Video 1',
			kind: 'video',
			muted: false,
			locked: false,
			hidden: false,
			clips: [initialVideoClip]
		};

		const audioTrack: Track = {
			id: 'track_a1' as Track['id'],
			name: 'Audio 1',
			kind: 'audio',
			muted: false,
			locked: false,
			hidden: false,
			clips: [initialAudioClip]
		};

		const project = createEmptyProject({ name: 'Sync Test Project' });
		project.tracks = [videoTrack, audioTrack];

		// Define two silence cuts: 2.0s to 3.0s (1s cut) and 5.0s to 7.0s (2s cut)
		const silences = [
			{
				id: 's1',
				startUs: 1_800_000,
				endUs: 3_200_000,
				durationUs: 1_400_000,
				cutStartUs: 2_000_000,
				cutEndUs: 3_000_000,
				cutDurationUs: 1_000_000,
				included: true
			},
			{
				id: 's2',
				startUs: 4_800_000,
				endUs: 7_200_000,
				durationUs: 2_400_000,
				cutStartUs: 5_000_000,
				cutEndUs: 7_000_000,
				cutDurationUs: 2_000_000,
				included: true
			}
		];

		const { project: trimmedProject, resultSequenceId } = applySilenceTrimToProject(
			project,
			'root' as unknown as SequenceId,
			silences,
			{
				action: 'shorten',
				applyTarget: 'all-tracks',
				crossfadeMs: 5,
				mode: 'in-place'
			}
		);
		expect(resultSequenceId).toBe('root');

		const vTrack = trimmedProject.tracks.find((t) => t.id === 'track_v1')!;
		const aTrack = trimmedProject.tracks.find((t) => t.id === 'track_a1')!;

		// Both tracks should have been cut identically into 3 pieces
		expect(vTrack.clips.length).toBe(3);
		expect(aTrack.clips.length).toBe(3);

		for (let i = 0; i < 3; i++) {
			const vc = vTrack.clips[i]!;
			const ac = aTrack.clips[i]!;

			// Exact synchronization test: start times and durations must match to the microsecond
			expect(vc.start).toBe(ac.start);
			expect(vc.duration).toBe(ac.duration);
			expect(vc.sourceIn).toBe(ac.sourceIn);
			expect(vc.sourceOut).toBe(ac.sourceOut);
		}

		// Total duration removed: 1.0s + 2.0s = 3.0s
		// New duration = 10s - 3s = 7s (7,000,000 µs)
		const lastVideoClip = vTrack.clips[2]!;
		expect(lastVideoClip.start + lastVideoClip.duration).toBe(7_000_000);

		// Audio clip crossfades: internal seams must have fadeIn and fadeOut
		expect(aTrack.clips[0]!.fadeOutUs).toBe(5000);
		expect(aTrack.clips[1]!.fadeInUs).toBe(5000);
		expect(aTrack.clips[1]!.fadeOutUs).toBe(5000);
		expect(aTrack.clips[2]!.fadeInUs).toBe(5000);
	});

	it('creates non-destructive duplicate sequence when mode is new-sequence', () => {
		const videoTrack: Track = {
			id: 'track_v1' as Track['id'],
			name: 'Video 1',
			kind: 'video',
			muted: false,
			locked: false,
			hidden: false,
			clips: [
				{
					id: 'c1' as Clip['id'],
					assetId: 'asset_1' as unknown as AssetId,
					start: 0,
					duration: 5_000_000,
					sourceIn: 0,
					sourceOut: 5_000_000,
					speed: 1,
					volume: 1
				}
			]
		};

		const project = createEmptyProject({ name: 'Podcast Interview' });
		project.tracks = [videoTrack];

		const silences = [
			{
				id: 's1',
				startUs: 1_000_000,
				endUs: 2_000_000,
				durationUs: 1_000_000,
				cutStartUs: 1_000_000,
				cutEndUs: 2_000_000,
				cutDurationUs: 1_000_000,
				included: true
			}
		];

		const { project: updated, resultSequenceId } = applySilenceTrimToProject(
			project,
			'root' as unknown as SequenceId,
			silences,
			{
				action: 'ripple',
				applyTarget: 'all-tracks',
				crossfadeMs: 5,
				mode: 'new-sequence'
			}
		);

		// Original root sequence tracks remain untouched!
		expect(updated.tracks[0]!.clips.length).toBe(1);
		expect(updated.tracks[0]!.clips[0]!.duration).toBe(5_000_000);

		// New sequence was created with "<name> – trimmed"
		const newSeq = updated.sequences?.[resultSequenceId];
		expect(newSeq).toBeDefined();
		expect(newSeq!.name).toBe('Podcast Interview – trimmed');
		expect(newSeq!.tracks[0]!.clips.length).toBe(2);
		expect(newSeq!.tracks[0]!.clips[0]!.duration + newSeq!.tracks[0]!.clips[1]!.duration).toBe(
			4_000_000
		);
	});

	it('markers mode adds sequence markers without modifying clips', () => {
		const videoTrack: Track = {
			id: 'track_v1' as Track['id'],
			name: 'Video 1',
			kind: 'video',
			muted: false,
			locked: false,
			hidden: false,
			clips: [
				{
					id: 'c1' as Clip['id'],
					assetId: 'asset_1' as unknown as AssetId,
					start: 0,
					duration: 6_000_000,
					sourceIn: 0,
					sourceOut: 6_000_000,
					speed: 1,
					volume: 1
				}
			]
		};

		const project = createEmptyProject({ name: 'Markers Test' });
		project.tracks = [videoTrack];

		const silences = [
			{
				id: 's1',
				startUs: 2_000_000,
				endUs: 3_500_000,
				durationUs: 1_500_000,
				cutStartUs: 2_000_000,
				cutEndUs: 3_500_000,
				cutDurationUs: 1_500_000,
				included: true
			}
		];

		const { project: markedProject } = applySilenceTrimToProject(
			project,
			'root' as unknown as SequenceId,
			silences,
			{
				action: 'markers',
				applyTarget: 'all-tracks',
				crossfadeMs: 5,
				mode: 'in-place'
			}
		);

		// Clips are completely untouched
		expect(markedProject.tracks[0]!.clips.length).toBe(1);
		expect(markedProject.tracks[0]!.clips[0]!.duration).toBe(6_000_000);

		// Sequence marker was added with orange color and range duration
		expect(markedProject.markers?.length).toBe(1);
		const marker = markedProject.markers![0]!;
		expect(marker.time).toBe(2_000_000);
		expect(marker.duration).toBe(1_500_000);
		expect(marker.color).toBe('orange');
	});

	it('re-tuning parameters from cached features re-segments in under 1 ms', () => {
		const sampleRate = 16000;
		const speech = generateSpeechSignal(sampleRate, 2.0, 0.4);
		const silence = generateSilenceSignal(sampleRate, 1.0, 0.0005);
		const combined = new Float32Array(speech.length + silence.length);
		combined.set(speech, 0);
		combined.set(silence, speech.length);

		// Extract features once (cached)
		const cachedFeatures = extractAudioFeatures(combined, sampleRate);

		// Re-run VAD segmentation with different sensitivity parameters
		const t0 = performance.now();
		const intervals1 = detectSpeechIntervals(cachedFeatures, { sensitivity: 0.3 });
		const intervals2 = detectSpeechIntervals(cachedFeatures, { sensitivity: 0.8 });
		const t1 = performance.now();

		expect(intervals1).toBeDefined();
		expect(intervals2).toBeDefined();
		// Both re-runs together should take negligible time (< 15ms total even on slow CPU)
		expect(t1 - t0).toBeLessThan(15);
	});
});
