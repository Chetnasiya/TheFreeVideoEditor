import { evaluate, isAnimated } from './animation';
import type { Clip, Time } from './types';

type RemapClip = Pick<Clip, 'start' | 'sourceIn' | 'speed' | 'timeRemap'>;

const SIMPSON_STEPS = 64;

/** Source position gained by integrating the speed curve over [0, localTime] (µs). */
function integrateSpeed(speed: NonNullable<Clip['timeRemap']>, localTime: Time): number {
	if (!isAnimated(speed)) return speed.value * localTime;
	const keyframes = speed.keyframes;
	let total = 0;
	let cursor = 0;
	const first = keyframes[0];
	const last = keyframes[keyframes.length - 1];
	if (!first || !last) return 0;
	const stops = [
		...keyframes.map((item) => item.time).filter((time) => time > 0 && time < localTime),
		localTime
	];
	for (const stop of stops) {
		total += integrateSegment(speed, cursor, stop);
		cursor = stop;
	}
	return total;
}

function integrateSegment(speed: NonNullable<Clip['timeRemap']>, from: Time, to: Time): number {
	if (!isAnimated(speed) || to <= from) return 0;
	const keyframes = speed.keyframes;
	const startKey = [...keyframes].reverse().find((item) => item.time <= from);
	if (startKey?.interpolation === 'hold' || !startKey) {
		return evaluate(speed, from) * (to - from);
	}
	const endKey = keyframes.find((item) => item.time > from);
	if (!endKey) return evaluate(speed, from) * (to - from);
	if (startKey.interpolation === 'linear') {
		return ((evaluate(speed, from) + evaluate(speed, to)) / 2) * (to - from);
	}
	const h = (to - from) / SIMPSON_STEPS;
	let sum = evaluate(speed, from) + evaluate(speed, to);
	for (let index = 1; index < SIMPSON_STEPS; index += 1) {
		sum += (index % 2 === 0 ? 2 : 4) * evaluate(speed, from + index * h);
	}
	return (sum * h) / 3;
}

/** Maps a timeline time to a source time (µs). Bit-identical to Phase 1 without `timeRemap`. */
export function timelineToSource(clip: RemapClip, time: Time): Time {
	if (!clip.timeRemap) return Math.round(clip.sourceIn + (time - clip.start) * clip.speed);
	const local = time - clip.start;
	const offset =
		local >= 0 ? integrateSpeed(clip.timeRemap, local) : local * evaluate(clip.timeRemap, 0);
	return Math.max(0, Math.round(clip.sourceIn + offset));
}

/**
 * Inverse of `timelineToSource` by binary search over [start, start + span].
 * Only well-defined while the speed does not change sign; returns the nearest match otherwise.
 */
export function sourceToTimeline(clip: RemapClip, sourceTime: Time, span: Time): Time {
	if (!clip.timeRemap) return Math.round(clip.start + (sourceTime - clip.sourceIn) / clip.speed);
	const ascending = timelineToSource(clip, clip.start + span) >= timelineToSource(clip, clip.start);
	let low = clip.start;
	let high = clip.start + span;
	for (let step = 0; step < 48 && high - low > 0.5; step += 1) {
		const middle = (low + high) / 2;
		const value = timelineToSource(clip, middle);
		if (value < sourceTime === ascending) low = middle;
		else high = middle;
	}
	return Math.round((low + high) / 2);
}
