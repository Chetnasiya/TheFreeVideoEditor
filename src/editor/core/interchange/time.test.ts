import { describe, expect, it } from 'vitest';
import {
	STANDARD_RATES,
	fcpxmlTimeToFrames,
	framesToFcpxmlTime,
	framesToMicros,
	framesToTimecode,
	microsToFrames,
	rateToFcpxmlDuration,
	resolveRate,
	timecodeToFrames
} from './time';

describe('Interchange Time & SMPTE 12M Drop-Frame Calculations', () => {
	it('resolves fractional and integer frame rates correctly', () => {
		expect(resolveRate(23.976)).toEqual(STANDARD_RATES['23.976']);
		expect(resolveRate(24)).toEqual(STANDARD_RATES['24']);
		expect(resolveRate(25)).toEqual(STANDARD_RATES['25']);
		expect(resolveRate(29.97, false)).toEqual(STANDARD_RATES['29.97-ndf']);
		expect(resolveRate(29.97, true)).toEqual(STANDARD_RATES['29.97-df']);
		expect(resolveRate(30)).toEqual(STANDARD_RATES['30']);
		expect(resolveRate(50)).toEqual(STANDARD_RATES['50']);
		expect(resolveRate(59.94, false)).toEqual(STANDARD_RATES['59.94-ndf']);
		expect(resolveRate(59.94, true)).toEqual(STANDARD_RATES['59.94-df']);
		expect(resolveRate(60)).toEqual(STANDARD_RATES['60']);
	});

	it('converts microseconds to frames and back with zero drift', () => {
		const rate25 = STANDARD_RATES['25']!;
		expect(microsToFrames(0, rate25)).toBe(0);
		expect(microsToFrames(1_000_000, rate25)).toBe(25);
		expect(microsToFrames(2_000_000, rate25)).toBe(50);
		expect(framesToMicros(25, rate25)).toBe(1_000_000);

		const rate23976 = STANDARD_RATES['23.976']!;
		// 1001 frames at 24000/1001 fps = exactly (1001 * 1001 / 24) * 1000 = 41750041.666 us
		const microsFor1001 = Math.round((1001 * 1001 * 1_000_000) / 24000);
		expect(microsToFrames(microsFor1001, rate23976)).toBe(1001);
		expect(framesToMicros(1001, rate23976)).toBe(microsFor1001);
	});

	it('formats non-drop frame timecodes accurately', () => {
		const rate25 = STANDARD_RATES['25']!;
		expect(framesToTimecode(0, rate25)).toBe('00:00:00:00');
		expect(framesToTimecode(24, rate25)).toBe('00:00:00:24');
		expect(framesToTimecode(25, rate25)).toBe('00:00:01:00');
		expect(framesToTimecode(1500, rate25)).toBe('00:01:00:00'); // 1 minute
		expect(framesToTimecode(90000, rate25)).toBe('01:00:00:00'); // 1 hour

		expect(timecodeToFrames('01:00:00:00', rate25)).toBe(90000);
		expect(timecodeToFrames('00:01:00:00', rate25)).toBe(1500);
	});

	it('computes exact SMPTE 12M drop-frame timecode for 29.97 DF', () => {
		const rate2997Df = STANDARD_RATES['29.97-df']!;

		// Frame 0 is 00:00:00;00
		expect(framesToTimecode(0, rate2997Df)).toBe('00:00:00;00');

		// 1 minute in continuous frames is 30 * 60 = 1800 frames
		// At frame 1799: last frame of minute 0 is 00:00:59;29
		expect(framesToTimecode(1799, rate2997Df)).toBe('00:00:59;29');

		// At frame 1800: minute 1 begins, frame numbers ;00 and ;01 are skipped!
		expect(framesToTimecode(1800, rate2997Df)).toBe('00:01:00;02');

		// At frame 1801:
		expect(framesToTimecode(1801, rate2997Df)).toBe('00:01:00;03');

		// 10 minutes: 1800 + 9 * 1798 = 17982 frames
		// At frame 17981: last frame of minute 9 is 00:09:59;29
		expect(framesToTimecode(17981, rate2997Df)).toBe('00:09:59;29');

		// At frame 17982: minute 10 begins, NO frames dropped (tenth minute rule)!
		expect(framesToTimecode(17982, rate2997Df)).toBe('00:10:00;00');
		expect(framesToTimecode(17983, rate2997Df)).toBe('00:10:00;01');

		// 1 hour: exactly 107892 frames = 01:00:00;00
		expect(framesToTimecode(107892, rate2997Df)).toBe('01:00:00;00');
	});

	it('computes exact SMPTE 12M drop-frame timecode for 59.94 DF (4-frame drops)', () => {
		const rate5994Df = STANDARD_RATES['59.94-df']!;

		// Minute 1 begins at frame 60 * 60 = 3600 frames
		// Frames ;00, ;01, ;02, ;03 dropped
		expect(framesToTimecode(3599, rate5994Df)).toBe('00:00:59;59');
		expect(framesToTimecode(3600, rate5994Df)).toBe('00:01:00;04');

		// 10 minutes: 3600 + 9 * 3596 = 35964 frames
		expect(framesToTimecode(35964, rate5994Df)).toBe('00:10:00;00');
	});

	it('guarantees round-trip bijection timecode -> frames -> timecode', () => {
		const rate2997Df = STANDARD_RATES['29.97-df']!;
		const testFrames = [0, 1, 100, 1797, 1798, 1799, 3595, 3596, 17981, 17982, 107892, 200000];

		for (const f of testFrames) {
			const tc = framesToTimecode(f, rate2997Df);
			const back = timecodeToFrames(tc, rate2997Df);
			expect(back).toBe(f);
			expect(framesToTimecode(back, rate2997Df)).toBe(tc);
		}
	});

	it('formats and parses FCPXML frame duration and rational times without float inaccuracies', () => {
		const rate25 = STANDARD_RATES['25']!;
		expect(rateToFcpxmlDuration(rate25)).toBe('1/25s');
		expect(framesToFcpxmlTime(50, rate25)).toBe('50/25s');
		expect(fcpxmlTimeToFrames('50/25s', rate25)).toBe(50);
		expect(fcpxmlTimeToFrames('2s', rate25)).toBe(50);

		const rate2997 = STANDARD_RATES['29.97-ndf']!;
		expect(rateToFcpxmlDuration(rate2997)).toBe('1001/30000s');
		expect(framesToFcpxmlTime(300, rate2997)).toBe('300300/30000s');
		expect(fcpxmlTimeToFrames('300300/30000s', rate2997)).toBe(300);
	});

	it('property test: 10-hour duration maintains zero drift across all standard rates', () => {
		const tenHoursMicros = 10 * 3600 * 1_000_000;

		for (const [, rate] of Object.entries(STANDARD_RATES)) {
			const frames = microsToFrames(tenHoursMicros, rate);
			const reconstructedMicros = framesToMicros(frames, rate);

			// Expected drift is strictly within 1 frame duration
			const frameDurationMicros = (rate.denominator * 1_000_000) / rate.numerator;
			const drift = Math.abs(reconstructedMicros - tenHoursMicros);
			expect(drift).toBeLessThanOrEqual(frameDurationMicros / 2 + 1);

			// Check timecode roundtrip at 10 hours
			const tc = framesToTimecode(frames, rate);
			const backFrames = timecodeToFrames(tc, rate);
			expect(backFrames).toBe(frames);
		}
	});
});
