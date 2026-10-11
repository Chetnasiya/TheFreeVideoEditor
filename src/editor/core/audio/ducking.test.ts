import { describe, expect, it } from 'vitest';
import { detectVoiceActivity, generateDuckingKeyframes } from './ducking';
import type { Clip, ClipId } from '../types';

describe('Slice 3 Auto-Ducking & VAD', () => {
	it('detectVoiceActivity merges overlapping and close speech segments', () => {
		const clips: Clip[] = [
			{
				id: 'c1' as ClipId,
				start: 1_000_000,
				duration: 2_000_000, // 1.0s to 3.0s
				sourceIn: 0,
				sourceOut: 2_000_000,
				speed: 1,
				volume: 0,
				audioTag: 'dialogue'
			},
			{
				id: 'c2' as ClipId,
				start: 3_100_000, // 3.1s to 5.0s (gap is 100ms, less than holdMargin 200ms)
				duration: 1_900_000,
				sourceIn: 0,
				sourceOut: 1_900_000,
				speed: 1,
				volume: 0,
				audioTag: 'dialogue'
			},
			{
				id: 'c3' as ClipId,
				start: 7_000_000, // 7.0s to 9.0s (distant segment)
				duration: 2_000_000,
				sourceIn: 0,
				sourceOut: 2_000_000,
				speed: 1,
				volume: 0,
				audioTag: 'dialogue'
			}
		];

		const activity = detectVoiceActivity(clips, 200_000);
		expect(activity.length).toBe(2);

		// First merged segment: 1.0s to 5.0s
		expect(activity[0]!.startUs).toBe(1_000_000);
		expect(activity[0]!.endUs).toBe(5_000_000);

		// Second segment: 7.0s to 9.0s
		expect(activity[1]!.startUs).toBe(7_000_000);
		expect(activity[1]!.endUs).toBe(9_000_000);
	});

	it('generateDuckingKeyframes produces correct ramp-down and ramp-up keyframe envelopes', () => {
		const musicClip: Clip = {
			id: 'm1' as ClipId,
			start: 0,
			duration: 10_000_000, // 0 to 10s
			sourceIn: 0,
			sourceOut: 10_000_000,
			speed: 1,
			volume: 0,
			audioTag: 'music'
		};

		const activity = [
			{ startUs: 2_000_000, endUs: 4_000_000 } // speech from 2s to 4s
		];

		const keyframes = generateDuckingKeyframes(musicClip, activity, {
			duckAmountDb: -16,
			attackTimeUs: 300_000,
			releaseTimeUs: 500_000
		});

		expect(keyframes.length).toBe(4);

		// 1. Ramp down start (2.0s - 300ms = 1.7s)
		expect(keyframes[0]!.time).toBe(1_700_000);
		expect(keyframes[0]!.value).toBe(0);

		// 2. Full duck reached at speech start (2.0s)
		expect(keyframes[1]!.time).toBe(2_000_000);
		expect(keyframes[1]!.value).toBe(-16);

		// 3. Duck held until speech end (4.0s)
		expect(keyframes[2]!.time).toBe(4_000_000);
		expect(keyframes[2]!.value).toBe(-16);

		// 4. Restored at speech end + release (4.0s + 500ms = 4.5s)
		expect(keyframes[3]!.time).toBe(4_500_000);
		expect(keyframes[3]!.value).toBe(0);
	});
});
