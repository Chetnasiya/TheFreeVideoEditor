import { framesToTicks, ticksToFrames } from '../../core/time';
import type { Time } from '../../core/types';

export type PlaybackRate = -8 | -4 | -2 | -1 | 1 | 2 | 4 | 8;
export type ClockListener = (time: Time, playing: boolean, rate: PlaybackRate) => void;

export interface PlaybackClockOptions {
	duration: Time;
	fps: number;
	initialTime?: Time;
	now?: () => number;
	requestFrame?: (callback: FrameRequestCallback) => number;
	cancelFrame?: (handle: number) => void;
}

export interface PlaybackClock {
	readonly time: Time;
	readonly playing: boolean;
	readonly rate: PlaybackRate;
	readonly looping: boolean;
	play(): void;
	pause(): void;
	toggle(): void;
	seek(time: Time): void;
	setDuration(duration: Time): void;
	setLoop(looping: boolean): void;
	setRate(rate: PlaybackRate): void;
	onTick(listener: ClockListener): () => void;
	dispose(): void;
}

export function createPlaybackClock(options: PlaybackClockOptions): PlaybackClock {
	if (!Number.isSafeInteger(options.duration) || options.duration < 0) {
		throw new RangeError('Playback duration must be a non-negative integer tick value.');
	}
	if (!Number.isFinite(options.fps) || options.fps <= 0) {
		throw new RangeError('Playback frame rate must be positive and finite.');
	}

	const now = options.now ?? (() => performance.now());
	const requestFrame = options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
	const cancelFrame = options.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));
	const listeners = new Set<ClockListener>();
	let duration = options.duration;
	let time = snapTime(options.initialTime ?? 0, duration, options.fps);
	let playing = false;
	let rate: PlaybackRate = 1;
	let looping = false;
	let previousTime = 0;
	let frameHandle: number | null = null;
	let disposed = false;

	function emit(): void {
		for (const listener of listeners) listener(time, playing, rate);
	}

	function cancelScheduledFrame(): void {
		if (frameHandle === null) return;
		cancelFrame(frameHandle);
		frameHandle = null;
	}

	function stopAtBoundary(): void {
		playing = false;
		cancelScheduledFrame();
	}

	function schedule(): void {
		if (disposed || !playing || frameHandle !== null) return;
		frameHandle = requestFrame(tick);
	}

	function tick(timestamp: number): void {
		frameHandle = null;
		if (disposed || !playing) return;
		const current = Number.isFinite(timestamp) ? timestamp : now();
		const delta = Math.max(0, current - previousTime);
		previousTime = current;
		const requested = time + Math.round(delta * 1_000 * rate);
		if (rate > 0 && requested >= duration) {
			if (looping && duration > 0) time = snapTime(requested % duration, duration, options.fps);
			else {
				time = duration;
				stopAtBoundary();
			}
		} else if (rate < 0 && requested <= 0) {
			if (looping && duration > 0)
				time = snapTime(duration + (requested % duration), duration, options.fps);
			else {
				time = 0;
				stopAtBoundary();
			}
		} else {
			time = snapTime(requested, duration, options.fps);
		}
		emit();
		schedule();
	}

	function play(): void {
		if (disposed || playing || duration <= 0) return;
		if (rate > 0 && time >= duration && !looping) time = 0;
		if (rate < 0 && time <= 0 && !looping) time = duration;
		playing = true;
		previousTime = now();
		emit();
		schedule();
	}

	function pause(): void {
		if (!playing) return;
		playing = false;
		cancelScheduledFrame();
		emit();
	}

	function seek(nextTime: Time): void {
		if (!Number.isFinite(nextTime)) throw new RangeError('Seek time must be finite.');
		time = snapTime(Math.round(nextTime), duration, options.fps);
		previousTime = now();
		emit();
	}

	function setRate(nextRate: PlaybackRate): void {
		rate = nextRate;
		previousTime = now();
		emit();
	}

	function setLoop(nextLooping: boolean): void {
		looping = nextLooping;
		emit();
	}

	function setDuration(nextDuration: Time): void {
		if (!Number.isSafeInteger(nextDuration) || nextDuration < 0) {
			throw new RangeError('Playback duration must be a non-negative integer tick value.');
		}
		duration = nextDuration;
		if (time > duration) time = duration;
		if (duration === 0) pause();
		emit();
	}

	return {
		get time() {
			return time;
		},
		get playing() {
			return playing;
		},
		get rate() {
			return rate;
		},
		get looping() {
			return looping;
		},
		play,
		pause,
		toggle() {
			if (playing) pause();
			else play();
		},
		seek,
		setDuration,
		setLoop,
		setRate,
		onTick(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		dispose() {
			disposed = true;
			stopAtBoundary();
			listeners.clear();
		}
	};
}

function snapTime(time: Time, duration: Time, fps: number): Time {
	const bounded = Math.max(0, Math.min(time, duration));
	return bounded === duration ? duration : framesToTicks(ticksToFrames(bounded, fps), fps);
}
