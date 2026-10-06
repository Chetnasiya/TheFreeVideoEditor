import type { Time } from './types';

export const TICKS_PER_SECOND = 1_000_000;

function assertPositiveFps(fps: number): void {
	if (!Number.isFinite(fps) || fps <= 0) {
		throw new RangeError('Frame rate must be a positive finite number.');
	}
}

function assertNonNegativeFinite(value: number, label: string): void {
	if (!Number.isFinite(value) || value < 0) {
		throw new RangeError(`${label} must be a non-negative finite number.`);
	}
}

function assertNonNegativeInteger(value: number, label: string): void {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError(`${label} must be a non-negative safe integer.`);
	}
}

export function secondsToTicks(seconds: number): Time {
	assertNonNegativeFinite(seconds, 'Seconds');
	const ticks = Math.round(seconds * TICKS_PER_SECOND);
	assertNonNegativeInteger(ticks, 'Resulting ticks');
	return ticks;
}

export function ticksToSeconds(ticks: Time): number {
	assertNonNegativeInteger(ticks, 'Ticks');
	return ticks / TICKS_PER_SECOND;
}

export function framesToTicks(frames: number, fps: number): Time {
	assertNonNegativeInteger(frames, 'Frames');
	assertPositiveFps(fps);
	const ticks = Math.round((frames / fps) * TICKS_PER_SECOND);
	assertNonNegativeInteger(ticks, 'Resulting ticks');
	return ticks;
}

export function ticksToFrames(ticks: Time, fps: number): number {
	assertNonNegativeInteger(ticks, 'Ticks');
	assertPositiveFps(fps);
	return Math.round((ticks / TICKS_PER_SECOND) * fps);
}

export function framesToTimecode(frames: number, fps: number): string {
	assertNonNegativeInteger(frames, 'Frames');
	assertPositiveFps(fps);
	const wholeFrames = Math.round(frames);
	const nominalFps = Math.round(fps);
	const totalSeconds = Math.floor(wholeFrames / nominalFps);
	const frame = wholeFrames % nominalFps;
	const seconds = totalSeconds % 60;
	const minutes = Math.floor(totalSeconds / 60) % 60;
	const hours = Math.floor(totalSeconds / 3600);

	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frame).padStart(2, '0')}`;
}

export function ticksToTimecode(ticks: Time, fps: number): string {
	return framesToTimecode(ticksToFrames(ticks, fps), fps);
}

export function timecodeToFrames(timecode: string, fps: number): number {
	assertPositiveFps(fps);
	const match = /^(\d{2,}):([0-5]\d):([0-5]\d):(\d{2})$/.exec(timecode);
	if (!match) {
		throw new RangeError('Timecode must use HH:MM:SS:FF format.');
	}

	const [, hoursPart, minutesPart, secondsPart, framesPart] = match;
	const hours = Number(hoursPart);
	const minutes = Number(minutesPart);
	const seconds = Number(secondsPart);
	const frames = Number(framesPart);
	const nominalFps = Math.round(fps);
	if (frames >= nominalFps) {
		throw new RangeError(`Frame field must be less than ${nominalFps}.`);
	}

	const totalFrames = ((hours * 60 + minutes) * 60 + seconds) * nominalFps + frames;
	assertNonNegativeInteger(totalFrames, 'Timecode frame count');
	return totalFrames;
}

export function timecodeToTicks(timecode: string, fps: number): Time {
	return framesToTicks(timecodeToFrames(timecode, fps), fps);
}
