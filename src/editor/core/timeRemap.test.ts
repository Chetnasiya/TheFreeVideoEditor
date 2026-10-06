import { describe, expect, it } from 'vitest';
import { timelineToSource, sourceToTimeline } from './timeRemap';
import type { Clip } from './types';

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
