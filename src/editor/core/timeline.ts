import { ticksToTimecode } from './time';
import type { Clip, ClipId, Project, Time, Track } from './types';

export interface SnapOptions {
	excludeClipIds?: readonly ClipId[];
	playhead?: Time;
	includeMarkers?: boolean;
}

export interface SnapResult {
	time: Time;
	snappedTo?: Time;
}

export function clipEnd(clip: Clip): Time {
	return clip.start + clip.duration;
}

export function timelineDuration(project: Project): Time {
	return project.tracks.reduce(
		(duration, track) =>
			track.clips.reduce((latest, clip) => Math.max(latest, clipEnd(clip)), duration),
		0
	);
}

export function clipAt(track: Track, time: Time): Clip | undefined {
	return track.clips.find((clip) => clip.start <= time && time < clipEnd(clip));
}

export function clipsOverlappingRange(track: Track, start: Time, end: Time): Clip[] {
	if (end <= start) return [];
	return track.clips.filter((clip) => clip.start < end && clipEnd(clip) > start);
}

export function findFreeGap(
	track: Track,
	desiredStart: Time,
	duration: Time,
	excludeClipIds: readonly ClipId[] = []
): Time | null {
	if (
		!Number.isSafeInteger(desiredStart) ||
		desiredStart < 0 ||
		!Number.isSafeInteger(duration) ||
		duration <= 0
	) {
		throw new RangeError(
			'A timeline gap requires a non-negative start and a positive integer duration.'
		);
	}
	const excluded = new Set(excludeClipIds);
	const clips = track.clips
		.filter((clip) => !excluded.has(clip.id))
		.toSorted((first, second) => first.start - second.start);
	const candidates = new Set<Time>([desiredStart]);
	let previousEnd = 0;
	for (const clip of clips) {
		if (clip.start - previousEnd >= duration) {
			candidates.add(Math.max(previousEnd, Math.min(desiredStart, clip.start - duration)));
		}
		previousEnd = Math.max(previousEnd, clipEnd(clip));
	}
	candidates.add(Math.max(desiredStart, previousEnd));
	const available = [...candidates].filter((start) =>
		clips.every((clip) => start + duration <= clip.start || start >= clipEnd(clip))
	);
	return (
		available.sort(
			(first, second) =>
				Math.abs(first - desiredStart) - Math.abs(second - desiredStart) || first - second
		)[0] ?? null
	);
}

export function nearestValidStart(
	track: Track,
	desiredStart: Time,
	duration: Time,
	excludeClipIds: readonly ClipId[] = []
): Time | null {
	return findFreeGap(track, desiredStart, duration, excludeClipIds);
}

export function collectSnapPoints(project: Project, options: SnapOptions = {}): Time[] {
	const excluded = new Set(options.excludeClipIds ?? []);
	const points = new Set<Time>();
	if (options.playhead !== undefined) points.add(options.playhead);
	for (const track of project.tracks) {
		for (const clip of track.clips) {
			if (excluded.has(clip.id)) continue;
			points.add(clip.start);
			points.add(clipEnd(clip));
		}
	}
	if (options.includeMarkers) {
		for (const marker of project.markers) points.add(marker.time);
	}
	return [...points].toSorted((first, second) => first - second);
}

export function snapTime(time: Time, points: readonly Time[], toleranceTicks: Time): SnapResult {
	if (
		!Number.isSafeInteger(time) ||
		time < 0 ||
		!Number.isSafeInteger(toleranceTicks) ||
		toleranceTicks < 0
	) {
		throw new RangeError('Snap time and tolerance must be non-negative integer ticks.');
	}
	const snappedTo = points
		.filter(
			(point) =>
				Number.isSafeInteger(point) && point >= 0 && Math.abs(point - time) <= toleranceTicks
		)
		.toSorted(
			(first, second) => Math.abs(first - time) - Math.abs(second - time) || first - second
		)[0];
	return snappedTo === undefined ? { time } : { time: snappedTo, snappedTo };
}

export function groupOf(project: Project, clipId: ClipId): Clip[] {
	const clip = project.tracks.flatMap((track) => track.clips).find((item) => item.id === clipId);
	if (!clip) return [];
	if (!clip.linkId) return [clip];
	return project.tracks.flatMap((track) =>
		track.clips.filter((item) => item.linkId === clip.linkId)
	);
}

export function rulerTickStep(pixelsPerSecond: number, fps: number): Time {
	if (
		!Number.isFinite(pixelsPerSecond) ||
		pixelsPerSecond <= 0 ||
		!Number.isFinite(fps) ||
		fps <= 0
	) {
		throw new RangeError('Timeline zoom and frame rate must be positive finite numbers.');
	}
	const choices = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
	const seconds = choices.find((step) => step * pixelsPerSecond >= 72) ?? 3600;
	const frameStep = Math.max(1, Math.round(seconds * fps));
	return Math.round((frameStep / fps) * 1_000_000);
}

export function rulerLabel(time: Time, fps: number): string {
	return ticksToTimecode(time, fps);
}
