export type { Marker, ClipMarker, MarkerColor, MarkerId, MarkerType } from '../types';
import type { Clip, Marker, MarkerColor, MarkerId, MarkerType, Time } from '../types';
import { framesToTicks, ticksToFrames } from '../time';
import { sourceToTimeline, timelineToSource } from '../timeRemap';

export const MARKER_COLORS: readonly MarkerColor[] = [
	'green',
	'red',
	'purple',
	'orange',
	'yellow',
	'white',
	'blue',
	'cyan'
] as const;

export const MARKER_TYPES: readonly MarkerType[] = [
	'comment',
	'chapter',
	'segment',
	'web-link'
] as const;

export function generateMarkerId(): MarkerId {
	return `marker-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}` as MarkerId;
}

export function snapTimeToFps(time: Time, fps: number): Time {
	if (!Number.isFinite(fps) || fps <= 0) return Math.max(0, Math.round(time));
	const frame = ticksToFrames(time, fps);
	return framesToTicks(frame, fps);
}

export function validateMarker(marker: Marker): boolean {
	if (!marker.id || typeof marker.id !== 'string') return false;
	if (!Number.isFinite(marker.time) || !Number.isSafeInteger(marker.time) || marker.time < 0) {
		return false;
	}
	if (marker.duration !== undefined) {
		if (
			!Number.isFinite(marker.duration) ||
			!Number.isSafeInteger(marker.duration) ||
			marker.duration <= 0
		) {
			return false;
		}
	}
	if (!marker.name && !marker.label) return false;
	const validColors: MarkerColor[] = [
		'green',
		'red',
		'purple',
		'orange',
		'yellow',
		'white',
		'blue',
		'cyan'
	];
	if (!validColors.includes(marker.color)) return false;
	if (marker.type && !['comment', 'chapter', 'segment', 'web-link'].includes(marker.type)) {
		return false;
	}
	return true;
}

export function sortMarkers(markers: readonly Marker[]): Marker[] {
	return [...markers].sort((a, b) => {
		if (a.time !== b.time) return a.time - b.time;
		const durA = a.duration ?? 0;
		const durB = b.duration ?? 0;
		if (durA !== durB) return durA - durB;
		return a.id.localeCompare(b.id);
	});
}

export interface CreateMarkerOptions {
	id?: MarkerId;
	time: Time;
	duration?: Time;
	name?: string;
	label?: string;
	comment?: string;
	color?: MarkerColor;
	type?: MarkerType;
	url?: string;
	fps?: number;
}

export function createMarker(options: CreateMarkerOptions): Marker {
	const fps = options.fps;
	const time = fps ? snapTimeToFps(options.time, fps) : Math.max(0, Math.round(options.time));
	const duration =
		options.duration && options.duration > 0
			? fps
				? snapTimeToFps(options.duration, fps)
				: Math.max(0, Math.round(options.duration))
			: undefined;
	const name = options.name ?? options.label ?? 'Marker';

	const marker: Marker = {
		id: options.id ?? generateMarkerId(),
		time,
		...(duration ? { duration } : {}),
		name,
		label: name,
		...(options.comment ? { comment: options.comment } : {}),
		color: options.color ?? 'green',
		type: options.type ?? 'comment',
		...(options.url ? { url: options.url } : {})
	};

	return marker;
}

export function addMarker(
	markers: readonly Marker[] | undefined,
	markerOrOptions: Marker | CreateMarkerOptions,
	fps?: number
): Marker[] {
	const currentMarkers = markers ?? [];
	const marker = validateMarker(markerOrOptions as Marker)
		? (markerOrOptions as Marker)
		: createMarker({
				...markerOrOptions,
				fps: fps ?? ('fps' in markerOrOptions ? markerOrOptions.fps : undefined)
			});

	if (!validateMarker(marker)) {
		throw new Error(`Invalid marker: ${JSON.stringify(marker)}`);
	}

	return sortMarkers([...currentMarkers, marker]);
}

export function updateMarker(
	markers: readonly Marker[] | undefined,
	id: MarkerId,
	patch: Partial<Omit<Marker, 'id'>>,
	fps?: number
): Marker[] {
	const current = markers ?? [];
	return sortMarkers(
		current.map((m) => {
			if (m.id !== id) return m;

			let time = patch.time !== undefined ? patch.time : m.time;
			if (patch.time !== undefined && fps) {
				time = snapTimeToFps(time, fps);
			}

			let duration: Time | undefined = m.duration;
			if ('duration' in patch) {
				if (patch.duration && patch.duration > 0) {
					duration = fps ? snapTimeToFps(patch.duration, fps) : Math.round(patch.duration);
				} else {
					duration = undefined;
				}
			}

			const name = patch.name ?? patch.label ?? m.name;
			const updated: Marker = {
				...m,
				...patch,
				id: m.id,
				time,
				name,
				label: name
			};

			if (duration !== undefined && duration > 0) {
				updated.duration = duration;
			} else {
				delete updated.duration;
			}

			if (!validateMarker(updated)) {
				throw new Error(`Invalid marker patch result: ${JSON.stringify(updated)}`);
			}
			return updated;
		})
	);
}

export function moveMarker(
	markers: readonly Marker[] | undefined,
	id: MarkerId,
	newTime: Time,
	fps?: number
): Marker[] {
	const targetTime = fps ? snapTimeToFps(newTime, fps) : Math.max(0, Math.round(newTime));
	return updateMarker(markers, id, { time: targetTime }, fps);
}

export function deleteMarker(markers: readonly Marker[] | undefined, id: MarkerId): Marker[] {
	return (markers ?? []).filter((m) => m.id !== id);
}

export function deleteMarkers(
	markers: readonly Marker[] | undefined,
	ids: readonly MarkerId[]
): Marker[] {
	const toDelete = new Set(ids);
	return (markers ?? []).filter((m) => !toDelete.has(m.id));
}

export function duplicateMarker(
	markers: readonly Marker[] | undefined,
	id: MarkerId,
	offsetTicks: Time = 0
): Marker[] {
	const list = markers ?? [];
	const existing = list.find((m) => m.id === id);
	if (!existing) return [...list];

	const copy: Marker = {
		...existing,
		id: generateMarkerId(),
		time: Math.max(0, existing.time + offsetTicks),
		name: `${existing.name} (Copy)`,
		label: `${existing.name} (Copy)`
	};

	return sortMarkers([...list, copy]);
}

export function setMarkerColor(
	markers: readonly Marker[] | undefined,
	ids: readonly MarkerId[],
	color: MarkerColor
): Marker[] {
	const targets = new Set(ids);
	return (markers ?? []).map((m) => (targets.has(m.id) ? { ...m, color } : m));
}

export function setMarkerType(
	markers: readonly Marker[] | undefined,
	ids: readonly MarkerId[],
	type: MarkerType
): Marker[] {
	const targets = new Set(ids);
	return (markers ?? []).map((m) => (targets.has(m.id) ? { ...m, type } : m));
}

export function convertMarkerRange(
	markers: readonly Marker[],
	id: MarkerId,
	duration: Time,
	fps?: number
): Marker[] {
	const dur = fps && duration > 0 ? snapTimeToFps(duration, fps) : duration;
	return updateMarker(markers, id, { duration: dur > 0 ? dur : undefined });
}

export function findNextMarker(
	markers: readonly Marker[],
	currentTime: Time,
	options: { wrap?: boolean } = {}
): Marker | null {
	if (markers.length === 0) return null;
	const sorted = sortMarkers(markers);
	const next = sorted.find((m) => m.time > currentTime);
	if (next) return next;
	return options.wrap ? (sorted[0] ?? null) : null;
}

export function findPrevMarker(
	markers: readonly Marker[],
	currentTime: Time,
	options: { wrap?: boolean } = {}
): Marker | null {
	if (markers.length === 0) return null;
	const sorted = sortMarkers(markers);
	for (let i = sorted.length - 1; i >= 0; i--) {
		const m = sorted[i];
		if (m && m.time < currentTime) return m;
	}
	return options.wrap ? (sorted[sorted.length - 1] ?? null) : null;
}

export function queryMarkersInRange(markers: readonly Marker[], start: Time, end: Time): Marker[] {
	const minTime = Math.min(start, end);
	const maxTime = Math.max(start, end);

	return markers.filter((m) => {
		const mStart = m.time;
		const mEnd = m.duration && m.duration > 0 ? m.time + m.duration : m.time;
		return mEnd >= minTime && mStart <= maxTime;
	});
}

// Clip marker coordinate transformations
export function clipMarkerToTimeline(sourceTime: Time, clip: Clip): Time {
	return sourceToTimeline(clip, sourceTime, clip.duration);
}

export function timelineToClipMarker(timelineTime: Time, clip: Clip): Time {
	return timelineToSource(clip, timelineTime);
}

export function isClipMarkerVisible(markerSourceTime: Time, clip: Clip): boolean {
	const start = Math.min(clip.sourceIn, clip.sourceOut);
	const end = Math.max(clip.sourceIn, clip.sourceOut);
	return markerSourceTime >= start && markerSourceTime <= end;
}

export function distributeClipMarkersOnSplit(
	clip: Clip,
	splitSourceTime: Time
): { leftMarkers: Marker[]; rightMarkers: Marker[] } {
	const markers = clip.markers ?? [];
	const leftMarkers: Marker[] = [];
	const rightMarkers: Marker[] = [];

	for (const m of markers) {
		if (m.time < splitSourceTime) {
			leftMarkers.push({ ...m });
		} else {
			rightMarkers.push({ ...m });
		}
	}

	return { leftMarkers, rightMarkers };
}

export function duplicateClipMarkers(markers: readonly Marker[] | undefined): Marker[] {
	if (!markers) return [];
	return markers.map((m) => ({
		...m,
		id: generateMarkerId()
	}));
}
