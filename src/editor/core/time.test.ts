import { describe, expect, it } from 'vitest';
import {
	framesToTicks,
	framesToTimecode,
	secondsToTicks,
	ticksToFrames,
	ticksToSeconds,
	ticksToTimecode,
	timecodeToFrames,
	timecodeToTicks
} from './time';

describe('time conversion', () => {
	it('converts integer microsecond ticks to seconds and back', () => {
		expect(secondsToTicks(1.234567)).toBe(1_234_567);
		expect(ticksToSeconds(1_234_567)).toBe(1.234567);
	});

	it('rounds frame conversions consistently', () => {
		expect(framesToTicks(30, 30)).toBe(1_000_000);
		expect(ticksToFrames(1_000_000, 30)).toBe(30);
		expect(ticksToTimecode(framesToTicks(90_003, 30), 30)).toBe('00:50:00:03');
	});

	it('round-trips timecode, including times beyond one day', () => {
		const frames = timecodeToFrames('27:05:09:12', 30);
		expect(framesToTimecode(frames, 30)).toBe('27:05:09:12');
		expect(timecodeToTicks('00:00:00:01', 24)).toBe(framesToTicks(1, 24));
	});

	it('rejects malformed or out-of-range values', () => {
		expect(() => timecodeToFrames('00:61:00:00', 30)).toThrow();
		expect(() => timecodeToFrames('00:00:00:30', 30)).toThrow();
		expect(() => secondsToTicks(-1)).toThrow();
		expect(() => ticksToSeconds(0.5)).toThrow();
		expect(() => framesToTicks(0.5, 30)).toThrow();
		expect(() => timecodeToFrames('999999999999999999999:00:00:00', 30)).toThrow();
	});
});
