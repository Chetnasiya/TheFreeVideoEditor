import { timelineToSource } from './timeRemap';
import { clipEnd, timelineDuration } from './timeline';
import { evaluateOr } from './animation';
import { clampCrop, isCrop, isDefaultCrop, type Crop } from './crop';
import { evaluateEffect } from './effects/instance';
import type { EvaluatedEffect } from './effects/types';
import { evaluateMask, type EvaluatedMask } from './masks';
import { transitionWindow, transitionProgress, transitionGain } from './transitions';
import type {
	AnimatedValue,
	AssetId,
	BlendMode,
	Clip,
	ClipTransform,
	JsonValue,
	Project,
	Time,
	TrackId
} from './types';

const IDENTITY_TRANSFORM: ClipTransform = {
	x: 0,
	y: 0,
	scaleX: 1,
	scaleY: 1,
	rotation: 0,
	opacity: 1
};

function numberPair(value: unknown): [number, number] | null {
	return Array.isArray(value) &&
		value.length === 2 &&
		typeof value[0] === 'number' &&
		typeof value[1] === 'number'
		? [value[0], value[1]]
		: null;
}

function finite(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Evaluates animated clip properties at a clip-local time and merges them over the legacy
 * static transform. Property ids: position [x, y], scale [x, y], rotation (deg), opacity (0–1),
 * anchor [x, y]. Renderers never read keyframes; they only see this result.
 */
export function evaluateLayerProperties(
	clip: Clip,
	localTime: Time
): Pick<ActiveLayer, 'transform' | 'anchor' | 'blendMode' | 'crop'> {
	const properties = clip.properties;
	const result: Pick<ActiveLayer, 'transform' | 'anchor' | 'blendMode' | 'crop'> = {};
	if (clip.blendMode && clip.blendMode !== 'normal') result.blendMode = clip.blendMode;
	if (!properties) {
		if (clip.transform) result.transform = clip.transform;
		return result;
	}
	const read = (id: string): unknown => {
		const animated = properties[id] as AnimatedValue<unknown> | undefined;
		return animated ? evaluateOr(animated, localTime, undefined) : undefined;
	};
	const base = clip.transform ?? IDENTITY_TRANSFORM;
	const position = numberPair(read('position'));
	const scale = numberPair(read('scale'));
	const anchor = numberPair(read('anchor'));
	result.transform = {
		x: position?.[0] ?? base.x,
		y: position?.[1] ?? base.y,
		scaleX: scale?.[0] ?? base.scaleX,
		scaleY: scale?.[1] ?? base.scaleY,
		rotation: finite(read('rotation'), base.rotation),
		opacity: Math.min(1, Math.max(0, finite(read('opacity'), base.opacity)))
	};
	if (anchor && (anchor[0] !== 0 || anchor[1] !== 0))
		result.anchor = { x: anchor[0], y: anchor[1] };
	const cropValue = read('crop');
	if (isCrop(cropValue)) {
		const crop = clampCrop(cropValue);
		if (!isDefaultCrop(crop)) result.crop = crop;
	}
	return result;
}

export interface ActiveLayer {
	clipId: Clip['id'];
	assetId?: AssetId;
	trackId: TrackId;
	trackOrder: number;
	sourceTime: Time;
	kind: 'video' | 'image' | 'solid' | 'adjustment';
	opacity: number;
	transform?: Clip['transform'];
	/** Pivot offset from the layer center, in composition pixels. */
	anchor?: { x: number; y: number };
	blendMode?: BlendMode;
	/** Source insets [left, top, right, bottom] as fractions; the visible part keeps its position. */
	crop?: Crop;
	solidColor?: { r: number; g: number; b: number; a: number };
	masks?: EvaluatedMask[];
	effects?: EvaluatedEffect[];
	/** Transition details when this layer represents a transition blend between two layers */
	transition?: {
		type: string;
		progress: number;
		fromLayer: ActiveLayer;
		toLayer: ActiveLayer;
		params: Record<string, JsonValue>;
	};
}

export interface ActiveAudio {
	clipId: Clip['id'];
	assetId: AssetId;
	trackId: TrackId;
	trackOrder: number;
	sourceTime: Time;
	volume: number;
}

export interface ResolvedFrame {
	videoLayers: ActiveLayer[];
	audioSources: ActiveAudio[];
	duration: Time;
	missing: AssetId[];
}

export function resolveFrame(project: Project, time: Time): ResolvedFrame {
	if (!Number.isSafeInteger(time) || time < 0) {
		throw new RangeError('Playback time must be a non-negative integer tick value.');
	}

	const videoLayers: ActiveLayer[] = [];
	const audioSources: ActiveAudio[] = [];
	const missing = new Set<AssetId>();

	// Build clip lookup map per track
	for (const [trackOrder, track] of project.tracks.entries()) {
		if ((track.kind === 'video' && track.hidden) || (track.kind === 'audio' && track.muted)) {
			continue;
		}

		// Helper to build ActiveLayer for a clip at a timeline time t (even if outside clip.start..clipEnd for handles)
		const makeClipLayer = (clip: Clip, t: Time): ActiveLayer | null => {
			const localTime = t - clip.start;
			const evaluatedEffects =
				clip.effects && clip.effects.length > 0
					? clip.effects.map((eff) => evaluateEffect(eff, localTime))
					: undefined;
			const evaluatedMasks =
				clip.masks && clip.masks.length > 0
					? clip.masks.map((m) => evaluateMask(m, localTime))
					: undefined;

			if (clip.source?.type === 'adjustment') {
				if (track.kind !== 'video') return null;
				return {
					clipId: clip.id,
					trackId: track.id,
					trackOrder,
					sourceTime: localTime,
					kind: 'adjustment',
					opacity: 1,
					masks: evaluatedMasks,
					effects: evaluatedEffects,
					...evaluateLayerProperties(clip, localTime)
				};
			}

			if (clip.source?.type === 'solid') {
				if (track.kind !== 'video') return null;
				return {
					clipId: clip.id,
					trackId: track.id,
					trackOrder,
					sourceTime: localTime,
					kind: 'solid',
					solidColor: clip.source.color,
					opacity: 1,
					masks: evaluatedMasks,
					effects: evaluatedEffects,
					...evaluateLayerProperties(clip, localTime)
				};
			}

			if (!clip.assetId) return null;
			const asset = project.assets[clip.assetId];
			if (!asset) return null;
			if (asset.offline) {
				missing.add(asset.id);
				return null;
			}

			const rawSource = timelineToSource(clip, t);
			const maxSource = asset.duration > 0 ? asset.duration : rawSource;
			const sourceTime = Math.max(0, Math.min(maxSource, rawSource));
			if (track.kind === 'video' && (asset.kind === 'video' || asset.kind === 'image')) {
				return {
					clipId: clip.id,
					assetId: asset.id,
					trackId: track.id,
					trackOrder,
					sourceTime,
					kind: asset.kind,
					opacity: 1,
					masks: evaluatedMasks,
					effects: evaluatedEffects,
					...evaluateLayerProperties(clip, localTime)
				};
			}
			return null;
		};

		// Check active transitions on this track at current time
		const activeTransitions = (track.transitions ?? []).filter((tr) => {
			let cutTime = 0;
			if (tr.edge.kind === 'cut') {
				const edge = tr.edge;
				const cA = track.clips.find((c) => c.id === edge.fromClipId);
				const cB = track.clips.find((c) => c.id === edge.toClipId);
				if (!cA || !cB) return false;
				cutTime = clipEnd(cA);
			} else if (tr.edge.kind === 'head') {
				const edge = tr.edge;
				const c = track.clips.find((c) => c.id === edge.clipId);
				if (!c) return false;
				cutTime = c.start;
			} else {
				const edge = tr.edge;
				const c = track.clips.find((c) => c.id === edge.clipId);
				if (!c) return false;
				cutTime = clipEnd(c);
			}
			const win = transitionWindow(cutTime, tr.duration, tr.alignment);
			return time >= win.start && time < win.end;
		});

		if (activeTransitions.length > 0) {
			const tr = activeTransitions[0];
			let cutTime = 0;
			let clipA: Clip | undefined;
			let clipB: Clip | undefined;

			if (tr.edge.kind === 'cut') {
				const edge = tr.edge;
				clipA = track.clips.find((c) => c.id === edge.fromClipId);
				clipB = track.clips.find((c) => c.id === edge.toClipId);
				if (clipA) cutTime = clipEnd(clipA);
			} else if (tr.edge.kind === 'head') {
				const edge = tr.edge;
				clipB = track.clips.find((c) => c.id === edge.clipId);
				if (clipB) cutTime = clipB.start;
			} else {
				const edge = tr.edge;
				clipA = track.clips.find((c) => c.id === edge.clipId);
				if (clipA) cutTime = clipEnd(clipA);
			}

			const win = transitionWindow(cutTime, tr.duration, tr.alignment);
			const progress = transitionProgress(time, win, tr.easing ?? 'linear');

			if (track.kind === 'video') {
				const layerA = clipA ? makeClipLayer(clipA, time) : null;
				const layerB = clipB ? makeClipLayer(clipB, time) : null;

				if (layerA && layerB) {
					// Both clips present (cut transition): emit composite transition layer
					videoLayers.push({
						clipId: layerA.clipId,
						trackId: track.id,
						trackOrder,
						sourceTime: layerA.sourceTime,
						kind: layerA.kind,
						opacity: 1,
						transition: {
							type: tr.type,
							progress,
							fromLayer: layerA,
							toLayer: layerB,
							params: tr.params
						}
					});
				} else if (layerA && !layerB) {
					// Tail fade (fade to black or transparency)
					videoLayers.push({
						...layerA,
						opacity: layerA.opacity * (1 - progress)
					});
				} else if (!layerA && layerB) {
					// Head fade (fade in from black or transparency)
					videoLayers.push({
						...layerB,
						opacity: layerB.opacity * progress
					});
				}

				// If the video transition has audioCrossfade enabled (default true), apply audio crossfade to the audio components of clipA & clipB
				if (tr.audioCrossfade !== false) {
					const { gainA, gainB } = transitionGain(time, win, 'equalPower');
					if (clipA && clipA.assetId) {
						const assetA = project.assets[clipA.assetId];
						if (assetA?.hasAudio && !assetA.offline) {
							audioSources.push({
								clipId: clipA.id,
								assetId: assetA.id,
								trackId: track.id,
								trackOrder,
								sourceTime: Math.max(0, timelineToSource(clipA, time)),
								volume: clipA.volume * gainA
							});
						}
					}
					if (clipB && clipB.assetId) {
						const assetB = project.assets[clipB.assetId];
						if (assetB?.hasAudio && !assetB.offline) {
							audioSources.push({
								clipId: clipB.id,
								assetId: assetB.id,
								trackId: track.id,
								trackOrder,
								sourceTime: Math.max(0, timelineToSource(clipB, time)),
								volume: clipB.volume * gainB
							});
						}
					}
				}
				continue;
			} else if (track.kind === 'audio') {
				const { gainA, gainB } = transitionGain(time, win, 'equalPower');
				if (clipA && clipA.assetId) {
					const assetA = project.assets[clipA.assetId];
					if (assetA?.hasAudio && !assetA.offline) {
						audioSources.push({
							clipId: clipA.id,
							assetId: assetA.id,
							trackId: track.id,
							trackOrder,
							sourceTime: Math.max(0, timelineToSource(clipA, time)),
							volume: clipA.volume * gainA
						});
					}
				}
				if (clipB && clipB.assetId) {
					const assetB = project.assets[clipB.assetId];
					if (assetB?.hasAudio && !assetB.offline) {
						audioSources.push({
							clipId: clipB.id,
							assetId: assetB.id,
							trackId: track.id,
							trackOrder,
							sourceTime: Math.max(0, timelineToSource(clipB, time)),
							volume: clipB.volume * gainB
						});
					}
				}
				continue;
			}
		}

		// Standard non-transition clip loop (fast path bit-identical to Phase 1 / Gate H/I/J)
		for (const clip of track.clips) {
			if (time < clip.start || time >= clipEnd(clip)) continue;
			const localTime = time - clip.start;
			const evaluatedEffects =
				clip.effects && clip.effects.length > 0
					? clip.effects.map((eff) => evaluateEffect(eff, localTime))
					: undefined;
			const evaluatedMasks =
				clip.masks && clip.masks.length > 0
					? clip.masks.map((m) => evaluateMask(m, localTime))
					: undefined;

			if (clip.source?.type === 'adjustment') {
				if (track.kind === 'video') {
					videoLayers.push({
						clipId: clip.id,
						trackId: track.id,
						trackOrder,
						sourceTime: localTime,
						kind: 'adjustment',
						opacity: 1,
						masks: evaluatedMasks,
						effects: evaluatedEffects,
						...evaluateLayerProperties(clip, localTime)
					});
				}
				continue;
			}

			if (clip.source?.type === 'solid') {
				if (track.kind === 'video') {
					videoLayers.push({
						clipId: clip.id,
						trackId: track.id,
						trackOrder,
						sourceTime: localTime,
						kind: 'solid',
						solidColor: clip.source.color,
						opacity: 1,
						masks: evaluatedMasks,
						effects: evaluatedEffects,
						...evaluateLayerProperties(clip, localTime)
					});
				}
				continue;
			}

			if (!clip.assetId) continue;
			const asset = project.assets[clip.assetId];
			if (!asset) continue;
			if (asset.offline) {
				missing.add(asset.id);
				continue;
			}

			const sourceTime = timelineToSource(clip, time);
			if (track.kind === 'video' && (asset.kind === 'video' || asset.kind === 'image')) {
				videoLayers.push({
					clipId: clip.id,
					assetId: asset.id,
					trackId: track.id,
					trackOrder,
					sourceTime,
					kind: asset.kind,
					opacity: 1,
					masks: evaluatedMasks,
					effects: evaluatedEffects,
					...evaluateLayerProperties(clip, localTime)
				});
			} else if (track.kind === 'audio' && asset.hasAudio) {
				audioSources.push({
					clipId: clip.id,
					assetId: asset.id,
					trackId: track.id,
					trackOrder,
					sourceTime,
					volume: clip.volume
				});
			}
		}
	}

	return {
		videoLayers: videoLayers.reverse(),
		audioSources,
		duration: timelineDuration(project),
		missing: [...missing]
	};
}

export function nextBoundary(project: Project, time: Time, direction: 1 | -1): Time | null {
	if (!Number.isSafeInteger(time) || time < 0) {
		throw new RangeError('Playback time must be a non-negative integer tick value.');
	}
	const boundaries = project.tracks.flatMap((track) =>
		track.clips.flatMap((clip) => [clip.start, clipEnd(clip)])
	);
	if (direction === 1) {
		return boundaries.filter((boundary) => boundary > time).toSorted((a, b) => a - b)[0] ?? null;
	}
	return boundaries.filter((boundary) => boundary < time).toSorted((a, b) => b - a)[0] ?? null;
}
