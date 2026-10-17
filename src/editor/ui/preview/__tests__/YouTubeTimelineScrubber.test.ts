import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../../../core/time';

function formatPlayerTime(ticks: number): string {
	const totalSecs = Math.max(0, Math.floor(ticks / TICKS_PER_SECOND));
	const hours = Math.floor(totalSecs / 3600);
	const mins = Math.floor((totalSecs % 3600) / 60);
	const secs = totalSecs % 60;
	if (hours > 0) {
		return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	}
	return `${mins}:${String(secs).padStart(2, '0')}`;
}

describe('YouTubeTimelineScrubber helper functions', () => {
	it('formats player time properly for seconds, minutes, and hours', () => {
		expect(formatPlayerTime(0)).toBe('0:00');
		expect(formatPlayerTime(5 * TICKS_PER_SECOND)).toBe('0:05');
		expect(formatPlayerTime(65 * TICKS_PER_SECOND)).toBe('1:05');
		expect(formatPlayerTime(600 * TICKS_PER_SECOND)).toBe('10:00');
		expect(formatPlayerTime(3665 * TICKS_PER_SECOND)).toBe('1:01:05');
	});

	it('calculates progress percentage cleanly across duration bounds', () => {
		const duration = 10 * TICKS_PER_SECOND;
		const calcPercent = (t: number) =>
			duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0;

		expect(calcPercent(0)).toBe(0);
		expect(calcPercent(5 * TICKS_PER_SECOND)).toBe(50);
		expect(calcPercent(10 * TICKS_PER_SECOND)).toBe(100);
		expect(calcPercent(12 * TICKS_PER_SECOND)).toBe(100); // clamped
		expect(calcPercent(-1 * TICKS_PER_SECOND)).toBe(0); // clamped
	});
});

