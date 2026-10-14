import type { Project } from '../../core';
import {
	type InterchangeTimeline,
	type InterchangeTrack,
	projectToInterchange
} from '../../core/interchange/ir';
import type { InteropOptions } from './exportUtils';

interface RationalTime {
	OTIO_SCHEMA: 'RationalTime.1';
	value: number;
	rate: number;
}

interface TimeRange {
	OTIO_SCHEMA: 'TimeRange.1';
	start_time: RationalTime;
	duration: RationalTime;
}

function time(value: number, fps: number): RationalTime {
	return { OTIO_SCHEMA: 'RationalTime.1', value, rate: fps };
}

function timeRange(start: number, duration: number, fps: number): TimeRange {
	return {
		OTIO_SCHEMA: 'TimeRange.1',
		start_time: time(start, fps),
		duration: time(duration, fps)
	};
}

function trackChildren(ir: InterchangeTimeline, track: InterchangeTrack) {
	const fps = ir.rate.timebase;
	const clips = track.clips.toSorted((first, second) => first.recordIn - second.recordIn);
	const children: Record<string, unknown>[] = [];
	let position = 0;

	for (const clip of clips) {
		const start = clip.recordIn;
		const duration = Math.max(1, clip.duration);

		if (start > position) {
			children.push({
				OTIO_SCHEMA: 'Gap.1',
				name: 'Gap',
				source_range: timeRange(0, start - position, fps),
				metadata: {}
			});
		}

		const asset = clip.assetId ? ir.assets.get(clip.assetId) : undefined;
		const availableDuration = asset ? asset.durationFrames : duration;
		const encodedPath = (clip.mediaPath || '').split('/').map(encodeURIComponent).join('/');

		const effects: Record<string, unknown>[] = [];
		if (clip.speed !== 1) {
			effects.push({
				OTIO_SCHEMA: 'LinearTimeWarp.1',
				name: 'Speed',
				time_scalar: clip.speed,
				metadata: {}
			});
		}

		const markers = ir.markers
			.filter((m) => m.frame >= clip.recordIn && m.frame < clip.recordOut)
			.map((m) => ({
				OTIO_SCHEMA: 'Marker.1',
				name: m.name,
				color: m.color ? 'RED' : 'GREEN',
				marked_range: timeRange(m.frame - clip.recordIn, 1, fps),
				metadata: { originalName: m.name }
			}));

		children.push({
			OTIO_SCHEMA: 'Clip.2',
			name: clip.name,
			source_range: timeRange(clip.sourceIn, duration, fps),
			effects,
			markers,
			media_reference: {
				OTIO_SCHEMA: 'ExternalReference.1',
				target_url: `file://localhost/${encodedPath}`,
				available_range: timeRange(0, availableDuration, fps),
				metadata: {}
			},
			metadata: {
				thefreevideoeditor: {
					assetId: clip.assetId,
					clipId: clip.id,
					linkId: clip.linkId ?? null,
					speed: clip.speed,
					volume: clip.volume,
					pan: clip.pan,
					transform: clip.transform ?? null,
					crop: clip.crop ?? null,
					text: clip.text ?? null,
					caption: clip.caption ?? null
				}
			}
		});

		position = start + duration;
	}

	if (ir.durationFrames > position) {
		children.push({
			OTIO_SCHEMA: 'Gap.1',
			name: 'Gap',
			source_range: timeRange(0, ir.durationFrames - position, fps),
			metadata: {}
		});
	}

	return children;
}

export function exportOtioFromIr(ir: InterchangeTimeline): string {
	const fps = ir.rate.timebase;
	const result = {
		OTIO_SCHEMA: 'Timeline.1',
		name: ir.name,
		global_start_time: time(0, fps),
		duration: time(ir.durationFrames, fps),
		tracks: {
			OTIO_SCHEMA: 'Stack.1',
			name: 'Tracks',
			children: ir.tracks.map((track) => ({
				OTIO_SCHEMA: 'Track.1',
				name: track.name,
				kind: track.kind === 'video' ? 'Video' : 'Audio',
				children: trackChildren(ir, track),
				metadata: {
					thefreevideoeditor: {
						trackId: track.id,
						enabled: track.enabled,
						locked: track.locked,
						volume: track.volume,
						pan: track.pan
					}
				}
			})),
			metadata: {}
		},
		markers: ir.markers.map((marker) => ({
			OTIO_SCHEMA: 'Marker.1',
			name: marker.name,
			color: marker.color ? 'RED' : 'GREEN',
			marked_range: timeRange(marker.frame, 1, fps),
			metadata: { originalName: marker.name }
		})),
		metadata: {
			thefreevideoeditor: {
				rate: ir.rate,
				width: ir.width,
				height: ir.height,
				omissions: ir.omissions,
				featureAudits: ir.featureAudits
			}
		}
	};

	return JSON.stringify(result, null, 2);
}

export function exportOtio(project: Project, options: InteropOptions = {}): string {
	const ir = projectToInterchange(project, { mediaPaths: options.mediaPaths });
	return exportOtioFromIr(ir);
}
