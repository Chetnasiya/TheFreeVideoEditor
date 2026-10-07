import type { Project, Track } from '../../core';
import { timelineDuration } from '../../core';
import { frames, mediaPath, trackAsset } from './exportUtils';
import type { InteropOptions } from './exportUtils';

interface RationalTime {
	OTIO_SCHEMA: 'RationalTime.1';
	value: number;
	rate: number;
}

function time(value: number, fps: number): RationalTime {
	return { OTIO_SCHEMA: 'RationalTime.1', value, rate: fps };
}

function timeRange(start: number, duration: number, fps: number) {
	return {
		OTIO_SCHEMA: 'TimeRange.1',
		start_time: time(start, fps),
		duration: time(duration, fps)
	};
}

function trackChildren(project: Project, track: Track, options: InteropOptions) {
	const fps = project.settings.fps;
	const clips = track.clips.toSorted((first, second) => first.start - second.start);
	const children: Record<string, unknown>[] = [];
	let position = 0;
	for (const clip of clips) {
		if (!clip.assetId) continue;
		const start = frames(clip.start, project);
		const duration = Math.max(1, frames(clip.duration, project));
		if (start > position) {
			children.push({
				OTIO_SCHEMA: 'Gap.1',
				name: 'Gap',
				source_range: timeRange(0, start - position, fps),
				metadata: {}
			});
		}
		const asset = trackAsset(project, clip.assetId);
		children.push({
			OTIO_SCHEMA: 'Clip.2',
			name: asset.name,
			source_range: timeRange(frames(clip.sourceIn, project), duration, fps),
			media_reference: {
				OTIO_SCHEMA: 'ExternalReference.1',
				target_url: `file://localhost/${mediaPath(project, asset, options)
					.split('/')
					.map(encodeURIComponent)
					.join('/')}`,
				available_range: timeRange(0, frames(asset.duration, project), fps),
				metadata: {}
			},
			metadata: {
				thefreevideoeditor: {
					assetId: asset.id,
					clipId: clip.id,
					linkId: clip.linkId ?? null,
					speed: clip.speed,
					volume: clip.volume,
					trackMuted: track.muted,
					trackHidden: track.hidden,
					trackLocked: track.locked
				}
			}
		});
		position = start + duration;
	}
	const projectDuration = frames(timelineDuration(project), project);
	if (projectDuration > position) {
		children.push({
			OTIO_SCHEMA: 'Gap.1',
			name: 'Gap',
			source_range: timeRange(0, projectDuration - position, fps),
			metadata: {}
		});
	}
	return children;
}

export function exportOtio(project: Project, options: InteropOptions = {}): string {
	const fps = project.settings.fps;
	const result = {
		OTIO_SCHEMA: 'Timeline.1',
		name: project.name,
		global_start_time: time(0, fps),
		duration: time(frames(timelineDuration(project), project), fps),
		tracks: {
			OTIO_SCHEMA: 'Stack.1',
			name: 'Tracks',
			children: project.tracks.map((track) => ({
				OTIO_SCHEMA: 'Track.1',
				name: track.name,
				kind: track.kind === 'video' ? 'Video' : 'Audio',
				children: trackChildren(project, track, options),
				metadata: {
					thefreevideoeditor: {
						trackId: track.id,
						muted: track.muted,
						hidden: track.hidden,
						locked: track.locked
					}
				}
			})),
			metadata: {}
		},
		metadata: {
			thefreevideoeditor: {
				projectId: project.id,
				schemaVersion: project.schemaVersion,
				settings: project.settings,
				markers: project.markers.map((marker) => ({
					id: marker.id,
					time: time(frames(marker.time, project), fps),
					label: marker.label,
					color: marker.color ?? null
				}))
			}
		}
	};
	return JSON.stringify(result, null, 2);
}
