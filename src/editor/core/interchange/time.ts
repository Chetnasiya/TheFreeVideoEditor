/**
 * Pure rational time, frame grid, and SMPTE 12M drop-frame timecode calculations.
 * Avoids cumulative floating-point drift by computing all conversions using exact rational arithmetic.
 */

export interface RationalRate {
	numerator: number;
	denominator: number;
	timebase: number;
	ntsc: boolean;
	dropFrame: boolean;
}

export const STANDARD_RATES: Record<string, RationalRate> = {
	'23.976': { numerator: 24000, denominator: 1001, timebase: 24, ntsc: true, dropFrame: false },
	'24': { numerator: 24, denominator: 1, timebase: 24, ntsc: false, dropFrame: false },
	'25': { numerator: 25, denominator: 1, timebase: 25, ntsc: false, dropFrame: false },
	'29.97-ndf': { numerator: 30000, denominator: 1001, timebase: 30, ntsc: true, dropFrame: false },
	'29.97-df': { numerator: 30000, denominator: 1001, timebase: 30, ntsc: true, dropFrame: true },
	'30': { numerator: 30, denominator: 1, timebase: 30, ntsc: false, dropFrame: false },
	'50': { numerator: 50, denominator: 1, timebase: 50, ntsc: false, dropFrame: false },
	'59.94-ndf': { numerator: 60000, denominator: 1001, timebase: 60, ntsc: true, dropFrame: false },
	'59.94-df': { numerator: 60000, denominator: 1001, timebase: 60, ntsc: true, dropFrame: true },
	'60': { numerator: 60, denominator: 1, timebase: 60, ntsc: false, dropFrame: false }
};

/**
 * Resolves a nominal fps number to a RationalRate.
 * E.g. 23.976 -> 24000/1001, 29.97 -> 30000/1001, 59.94 -> 60000/1001.
 */
export function resolveRate(fps: number, dropFrame = false): RationalRate {
	const rounded = Math.round(fps * 1000) / 1000;
	if (Math.abs(rounded - 23.976) < 0.01 || Math.abs(rounded - 23.98) < 0.01) {
		return STANDARD_RATES['23.976']!;
	}
	if (Math.abs(rounded - 29.97) < 0.01) {
		return dropFrame ? STANDARD_RATES['29.97-df']! : STANDARD_RATES['29.97-ndf']!;
	}
	if (Math.abs(rounded - 59.94) < 0.01) {
		return dropFrame ? STANDARD_RATES['59.94-df']! : STANDARD_RATES['59.94-ndf']!;
	}
	const intFps = Math.round(fps);
	return {
		numerator: intFps,
		denominator: 1,
		timebase: intFps,
		ntsc: false,
		dropFrame: false
	};
}

/**
 * Converts integer microseconds to rational frame count on the grid.
 * Formula: round( (micros * rateNum) / (rateDen * 1_000_000) )
 */
export function microsToFrames(micros: number, rate: RationalRate): number {
	if (micros <= 0) return 0;
	// Use BigInt to prevent intermediate 64-bit integer overflow on long projects
	const microsBig = BigInt(Math.round(micros));
	const numBig = BigInt(rate.numerator);
	const denBig = BigInt(rate.denominator) * 1_000_000n;
	const div = (microsBig * numBig + denBig / 2n) / denBig;
	return Number(div);
}

/**
 * Converts rational frame count to integer microseconds.
 * Formula: round( (frames * rateDen * 1_000_000) / rateNum )
 */
export function framesToMicros(frames: number, rate: RationalRate): number {
	if (frames <= 0) return 0;
	const framesBig = BigInt(Math.round(frames));
	const numBig = BigInt(rate.numerator);
	const denBig = BigInt(rate.denominator) * 1_000_000n;
	const div = (framesBig * denBig + numBig / 2n) / numBig;
	return Number(div);
}

/**
 * SMPTE 12M drop-frame conversion from continuous frame number to timecode components.
 * For 29.97 DF (30000/1001), 2 frames are dropped at the start of every minute EXCEPT every 10th minute.
 * For 59.94 DF (60000/1001), 4 frames are dropped at the start of every minute EXCEPT every 10th minute.
 */
export function framesToTimecodeComponents(
	frame: number,
	rate: RationalRate
): { hours: number; minutes: number; seconds: number; frames: number; isDropFrame: boolean } {
	let totalFrames = Math.max(0, Math.round(frame));
	const isDrop = rate.dropFrame;

	if (isDrop && (rate.timebase === 30 || rate.timebase === 60)) {
		const dropFrames = rate.timebase === 60 ? 4 : 2;
		const framesPerMinute = rate.timebase * 60 - dropFrames; // 1798 for 30fps, 3596 for 60fps
		const framesPer10Minutes = framesPerMinute * 9 + rate.timebase * 60; // 17982 for 30fps

		const d = Math.floor(totalFrames / framesPer10Minutes);
		const m = totalFrames % framesPer10Minutes;

		if (m >= dropFrames) {
			totalFrames +=
				dropFrames * 9 * d + dropFrames * Math.floor((m - dropFrames) / framesPerMinute);
		} else {
			totalFrames += dropFrames * 9 * d;
		}
	}

	const fps = rate.timebase;
	const framePart = totalFrames % fps;
	const totalSeconds = Math.floor(totalFrames / fps);
	const seconds = totalSeconds % 60;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const minutes = totalMinutes % 60;
	const hours = Math.floor(totalMinutes / 60);

	return {
		hours,
		minutes,
		seconds,
		frames: framePart,
		isDropFrame: isDrop
	};
}

/**
 * Formats a frame number as standard SMPTE timecode string:
 * HH:MM:SS:FF for non-drop frame
 * HH:MM:SS;FF for drop frame
 */
export function framesToTimecode(frame: number, rate: RationalRate): string {
	const tc = framesToTimecodeComponents(frame, rate);
	const pad = (v: number) => String(v).padStart(2, '0');
	const sep = tc.isDropFrame ? ';' : ':';
	return `${pad(tc.hours)}:${pad(tc.minutes)}:${pad(tc.seconds)}${sep}${pad(tc.frames)}`;
}

/**
 * Parses a SMPTE timecode string back to continuous rational frame count.
 */
export function timecodeToFrames(tc: string, rate: RationalRate): number {
	const match = tc.trim().match(/^(\d{2}):(\d{2}):(\d{2})([:;])(\d{2})$/);
	if (!match) throw new Error(`Invalid SMPTE timecode format: "${tc}"`);

	const hours = parseInt(match[1]!, 10);
	const minutes = parseInt(match[2]!, 10);
	const seconds = parseInt(match[3]!, 10);
	const sep = match[4]!;
	const frames = parseInt(match[5]!, 10);
	const isDrop = sep === ';' || rate.dropFrame;

	if (isDrop && (rate.timebase === 30 || rate.timebase === 60)) {
		const dropFrames = rate.timebase === 60 ? 4 : 2;
		const totalMinutes = 60 * hours + minutes;
		const totalFrames =
			(hours * 3600 + minutes * 60 + seconds) * rate.timebase +
			frames -
			dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));
		return totalFrames;
	}

	return (hours * 3600 + minutes * 60 + seconds) * rate.timebase + frames;
}

/**
 * Returns FCPXML frame duration rational string, e.g. "1/25s", "1001/24000s", "1001/30000s".
 */
export function rateToFcpxmlDuration(rate: RationalRate): string {
	return `${rate.denominator}/${rate.numerator}s`;
}

/**
 * Returns FCPXML time rational string for a given frame count,
 * e.g. "50/25s" or "(50 * 1001)/30000s" = "50050/30000s".
 */
export function framesToFcpxmlTime(frames: number, rate: RationalRate): string {
	const count = Math.max(0, Math.round(frames));
	const num = count * rate.denominator;
	const den = rate.numerator;
	// Simplify if possible or keep standard denominator
	return `${num}/${den}s`;
}

/**
 * Parses FCPXML rational time string, e.g. "50050/30000s" or "2s" or "10/25s", into rational frames.
 */
export function fcpxmlTimeToFrames(timeStr: string, rate: RationalRate): number {
	const clean = timeStr.trim().replace(/s$/, '');
	if (!clean.includes('/')) {
		const seconds = parseFloat(clean);
		return Math.round((seconds * rate.numerator) / rate.denominator);
	}
	const [numStr, denStr] = clean.split('/');
	const num = BigInt(numStr!);
	const den = BigInt(denStr!);

	// frames = (num / den) * (rate.numerator / rate.denominator)
	// = (num * rate.numerator) / (den * rate.denominator)
	const productNum = num * BigInt(rate.numerator);
	const productDen = den * BigInt(rate.denominator);
	const roundedFrames = (productNum + productDen / 2n) / productDen;
	return Number(roundedFrames);
}
