import type { Clip, Keyframe } from '../types';

export interface DuckingOptions {
	/** Ducking threshold in dBFS (dialogue presence detector). Default: -30 dB */
	thresholdDb?: number;
	/** Attenuation amount in dB. Default: -14 dB */
	duckAmountDb?: number;
	/** Attack / ramp down time in microseconds. Default: 300,000 us (300 ms) */
	attackTimeUs?: number;
	/** Hold / release ramp up time in microseconds. Default: 600,000 us (600 ms) */
	releaseTimeUs?: number;
}

export interface VoiceActivitySegment {
	startUs: number;
	endUs: number;
}

/**
 * Energy-based Voice Activity Detection (VAD) from dialogue clips.
 * Merges intervals closer than holdMs to produce stable ducking regions.
 */
export function detectVoiceActivity(
	dialogueClips: Clip[],
	holdMarginUs = 200_000
): VoiceActivitySegment[] {
	if (dialogueClips.length === 0) return [];

	// Collect raw intervals sorted by start
	const intervals: Array<{ start: number; end: number }> = dialogueClips
		.map((clip) => ({
			start: clip.start,
			end: clip.start + clip.duration
		}))
		.sort((a, b) => a.start - b.start);

	const merged: VoiceActivitySegment[] = [];
	let current = intervals[0]!;

	for (let i = 1; i < intervals.length; i++) {
		const next = intervals[i]!;
		// Merge if overlapping or within holdMargin
		if (next.start <= current.end + holdMarginUs) {
			current.end = Math.max(current.end, next.end);
		} else {
			merged.push({ startUs: current.start, endUs: current.end });
			current = next;
		}
	}
	merged.push({ startUs: current.start, endUs: current.end });

	return merged;
}

/**
 * Generates clip-local audio.volume keyframes for target (music/ambience) clips
 * based on speech activity regions.
 */
export function generateDuckingKeyframes(
	targetClip: Clip,
	vadSegments: VoiceActivitySegment[],
	options: DuckingOptions = {}
): Keyframe<number>[] {
	const duckAmountDb = options.duckAmountDb ?? -14;
	const attackUs = options.attackTimeUs ?? 300_000;
	const releaseUs = options.releaseTimeUs ?? 600_000;

	const clipStart = targetClip.start;
	const clipEnd = targetClip.start + targetClip.duration;

	// Find speech regions intersecting this clip
	const relevant = vadSegments.filter((seg) => seg.endUs > clipStart && seg.startUs < clipEnd);

	if (relevant.length === 0) {
		return [];
	}

	const keyframes: Keyframe<number>[] = [];

	for (const seg of relevant) {
		// Segments in clip-local time (microseconds)
		const speechStartLocal = seg.startUs - clipStart;
		const speechEndLocal = seg.endUs - clipStart;

		const rampDownStart = Math.max(0, speechStartLocal - attackUs);
		const rampDownEnd = Math.max(0, speechStartLocal);
		const rampUpStart = Math.min(targetClip.duration, speechEndLocal);
		const rampUpEnd = Math.min(targetClip.duration, speechEndLocal + releaseUs);

		keyframes.push({
			time: rampDownStart,
			value: 0,
			interpolation: 'bezier'
		});
		keyframes.push({
			time: rampDownEnd,
			value: duckAmountDb,
			interpolation: 'bezier'
		});
		keyframes.push({
			time: rampUpStart,
			value: duckAmountDb,
			interpolation: 'bezier'
		});
		keyframes.push({
			time: rampUpEnd,
			value: 0,
			interpolation: 'bezier'
		});
	}

	// Sort and deduplicate by time
	keyframes.sort((a, b) => a.time - b.time);

	const unique: Keyframe<number>[] = [];
	for (const kf of keyframes) {
		const prev = unique[unique.length - 1];
		if (!prev || Math.abs(prev.time - kf.time) > 1000) {
			unique.push(kf);
		}
	}

	return unique;
}
