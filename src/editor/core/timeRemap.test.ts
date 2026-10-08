import { describe, expect, it } from 'vitest';
import { timelineToSource, sourceToTimeline } from './timeRemap';
import type { AssetId, Clip, ClipId, Project, ProjectId, TrackId } from './types';

type C = Pick<Clip, 'start' | 'sourceIn' | 'speed' | 'timeRemap'>;
const base: C = { start: 1_000_000, sourceIn: 2_000_000, speed: 1 };
const keys = (
	...frames: Array<[number, number, 'linear' | 'hold' | 'bezier']>
): Clip['timeRemap'] => ({
	keyframes: frames.map(([time, value, interpolation]) => ({ time, value, interpolation }))
});

describe('timelineToSource', () => {
	it('is bit-identical to Phase 1 without timeRemap', () => {
		for (const speed of [0.25, 0.5, 1, 1.5, 2, 3.3333]) {
			for (const time of [1_000_000, 1_333_333, 2_999_999, 5_000_000]) {
				const clip = { ...base, speed };
				expect(timelineToSource(clip, time)).toBe(
					Math.round(clip.sourceIn + (time - clip.start) * clip.speed)
				);
			}
		}
	});

	it('handles constant, reverse and freeze', () => {
		expect(timelineToSource({ ...base, timeRemap: { value: 2 } }, 2_000_000)).toBe(4_000_000);
		expect(timelineToSource({ ...base, timeRemap: { value: -1 } }, 1_500_000)).toBe(1_500_000);
		expect(timelineToSource({ ...base, timeRemap: { value: 0 } }, 9_000_000)).toBe(2_000_000);
	});

	it('clamps negative results to zero', () => {
		expect(timelineToSource({ ...base, timeRemap: { value: -10 } }, 9_000_000)).toBe(0);
	});

	it('integrates a linear ramp exactly (trapezoid)', () => {
		const clip = { ...base, timeRemap: keys([0, 1, 'linear'], [1_000_000, 3, 'linear']) };
		expect(timelineToSource(clip, 2_000_000)).toBe(2_000_000 + 2_000_000);
		expect(timelineToSource(clip, 3_000_000)).toBe(2_000_000 + 2_000_000 + 3_000_000);
	});

	it('integrates piecewise and hold segments', () => {
		const clip = { ...base, timeRemap: keys([0, 2, 'hold'], [1_000_000, 0, 'hold']) };
		expect(timelineToSource(clip, 2_000_000)).toBe(2_000_000 + 2_000_000);
		expect(timelineToSource(clip, 4_000_000)).toBe(2_000_000 + 2_000_000);
	});

	it('integrates a symmetric bezier ramp accurately', () => {
		const clip = { ...base, timeRemap: keys([0, 0, 'bezier'], [1_000_000, 2, 'linear']) };
		expect(timelineToSource(clip, 2_000_000)).toBeCloseTo(2_000_000 + 1_000_000, -2);
	});

	it('is monotonic for non-negative speeds', () => {
		const clip = {
			...base,
			timeRemap: keys([0, 0.5, 'bezier'], [500_000, 3, 'bezier'], [1_000_000, 0, 'linear'])
		};
		let previous = -1;
		for (let time = 1_000_000; time <= 3_000_000; time += 50_000) {
			const value = timelineToSource(clip, time);
			expect(value).toBeGreaterThanOrEqual(previous);
			previous = value;
		}
	});
});

describe('sourceToTimeline', () => {
	it('round-trips', () => {
		const clip = { ...base, timeRemap: keys([0, 1, 'linear'], [1_000_000, 3, 'linear']) };
		for (const time of [1_000_000, 1_700_000, 2_400_000]) {
			const source = timelineToSource(clip, time);
			expect(Math.abs(sourceToTimeline(clip, source, 3_000_000) - time)).toBeLessThanOrEqual(1);
		}
		expect(sourceToTimeline(base, 3_000_000, 0)).toBe(2_000_000);
	});
});

describe('Gate M operations and helpers', () => {
	const dummyClip: Clip = {
		id: 'c1' as ClipId,
		assetId: 'a1' as AssetId,
		start: 1_000_000,
		duration: 2_000_000,
		sourceIn: 1_000_000,
		sourceOut: 3_000_000,
		speed: 1,
		volume: 1
	};

	it('computes sourceExtent accurately for constant, reversed, and curve clips', async () => {
		const { sourceExtent } = await import('./timeRemap');
		expect(sourceExtent(dummyClip)).toEqual({ min: 1_000_000, max: 3_000_000 });

		const reversed: Clip = {
			...dummyClip,
			speed: -1,
			sourceIn: 3_000_000,
			sourceOut: 1_000_000
		};
		expect(sourceExtent(reversed)).toEqual({ min: 1_000_000, max: 3_000_000 });

		const remapClip: Clip = {
			...dummyClip,
			timeRemap: {
				keyframes: [
					{ time: 0, value: 2, interpolation: 'linear' },
					{ time: 2_000_000, value: 0, interpolation: 'linear' }
				]
			}
		};
		const extent = sourceExtent(remapClip);
		expect(extent.min).toBe(1_000_000);
		// Trapezoid from 2 to 0 over 2s has average speed 1 => 2s total advancement => 3_000_000 max
		expect(extent.max).toBe(3_000_000);
	});

	it('evaluates speedAt correctly across keyframes', async () => {
		const { speedAt } = await import('./timeRemap');
		expect(speedAt(dummyClip, 1_500_000)).toBe(1);

		const remapClip: Clip = {
			...dummyClip,
			timeRemap: {
				keyframes: [
					{ time: 0, value: 1, interpolation: 'linear' },
					{ time: 2_000_000, value: 3, interpolation: 'linear' }
				]
			}
		};
		// At midway local time 1_000_000 (timeline 2_000_000), speed is 2
		expect(speedAt(remapClip, 2_000_000)).toBe(2);
	});

	it('re-bases timeRemap on head trim (retimeForHeadTrim)', async () => {
		const { retimeForHeadTrim, timelineToSource } = await import('./timeRemap');
		const remapClip: Clip = {
			...dummyClip,
			timeRemap: {
				keyframes: [
					{ time: 0, value: 1, interpolation: 'linear' },
					{ time: 2_000_000, value: 3, interpolation: 'linear' }
				]
			}
		};

		// Source time at timeline 1_500_000 (local 500_000)
		const expectedSourceAtCut = timelineToSource(remapClip, 1_500_000);

		// Trim 500_000 off head -> new duration 1_500_000
		const trimmed = retimeForHeadTrim(remapClip, 500_000, 1_500_000);
		expect(trimmed.sourceIn).toBe(expectedSourceAtCut);
		expect(
			trimmed.timeRemap && 'keyframes' in trimmed.timeRemap
				? trimmed.timeRemap.keyframes[0]?.time
				: undefined
		).toBe(0);
	});

	it('inverts clip direction cleanly with reverseClip', async () => {
		const { reverseClip } = await import('./timeRemap');
		const rev = reverseClip(dummyClip);
		expect(rev.speed).toBe(-1);
		expect(rev.sourceIn).toBe(3_000_000);
		expect(rev.sourceOut).toBe(1_000_000);

		// Double reverse returns back
		const revBack = reverseClip(rev);
		expect(revBack.speed).toBe(1);
		expect(revBack.sourceIn).toBe(1_000_000);
		expect(revBack.sourceOut).toBe(3_000_000);
	});

	it('splits clip and creates hold segment with addFreezeFrame', async () => {
		const { addFreezeFrame } = await import('./timeRemap');
		const project: Project = {
			id: 'p1' as ProjectId,
			schemaVersion: 2,
			name: 'Test Project',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			settings: { fps: 30, width: 1920, height: 1080, sampleRate: 48000 },
			assets: {},
			markers: [],
			tracks: [
				{
					id: 't1' as TrackId,
					name: 'Video 1',
					kind: 'video',
					muted: false,
					locked: false,
					hidden: false,
					clips: [dummyClip]
				}
			]
		};

		const updated = addFreezeFrame(project, dummyClip.id, 2_000_000, 2_000_000, { ripple: true });
		const clips = updated.tracks[0]!.clips;
		expect(clips.length).toBe(3); // head, freeze, tail
		const freezeClip = clips[1]!;
		expect(freezeClip.duration).toBe(2_000_000);
		expect(freezeClip.timeRemap).toEqual({ value: 0 });
	});
});
