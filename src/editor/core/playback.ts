import { clipEnd, timelineDuration } from './timeline';
import type { AssetId, Clip, Project, Time, TrackId } from './types';

export interface ActiveLayer {
	clipId: Clip['id'];
	assetId: AssetId;
	trackId: TrackId;
	trackOrder: number;
	sourceTime: Time;
	kind: 'video' | 'image';
	opacity: 1;
	transform?: Clip['transform'];
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

	for (const [trackOrder, track] of project.tracks.entries()) {
		if ((track.kind === 'video' && track.hidden) || (track.kind === 'audio' && track.muted)) {
			continue;
		}

		for (const clip of track.clips) {
			if (time < clip.start || time >= clipEnd(clip)) continue;
			const asset = project.assets[clip.assetId];
			if (!asset) continue;
			if (asset.offline) {
				missing.add(asset.id);
				continue;
			}

			const sourceTime = Math.round(clip.sourceIn + (time - clip.start) * clip.speed);
			if (track.kind === 'video' && (asset.kind === 'video' || asset.kind === 'image')) {
				videoLayers.push({
					clipId: clip.id,
					assetId: asset.id,
					trackId: track.id,
					trackOrder,
					sourceTime,
					kind: asset.kind,
					opacity: 1,
					...(clip.transform ? { transform: clip.transform } : {})
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
