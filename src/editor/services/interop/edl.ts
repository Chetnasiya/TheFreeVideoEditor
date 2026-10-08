import { sourceExtent, type Project, type Track } from '../../core';
import { frames, framesToTimecode, mediaPath, trackAsset } from './exportUtils';
import type { InteropOptions } from './exportUtils';
import { escapeXml } from './exportUtils';

export interface EdlDocument {
	filename: string;
	content: string;
	trackId: Track['id'];
}

function reelName(name: string): string {
	return name
		.replace(/\.[^.]+$/, '')
		.normalize('NFKD')
		.replace(/[^a-z0-9]/gi, '')
		.toUpperCase()
		.slice(0, 8)
		.padEnd(1, 'A');
}

export function exportEdlTrack(
	project: Project,
	track: Track,
	options: InteropOptions = {}
): string {
	const events = track.clips
		.filter((clip) => Boolean(clip.assetId))
		.toSorted((first, second) => first.start - second.start)
		.map((clip, index) => {
			const asset = trackAsset(project, clip.assetId!);
			const extent = sourceExtent(clip);
			const sourceIn = frames(extent.min, project);
			const sourceOutExclusive = Math.max(sourceIn + 1, frames(extent.max, project));
			const recordIn = frames(clip.start, project);
			const recordOutExclusive = recordIn + Math.max(1, frames(clip.duration, project));
			return [
				`${String(index + 1).padStart(3, '0')}  ${reelName(asset.name)} V     C        ${framesToTimecode(sourceIn, project.settings.fps)} ${framesToTimecode(sourceOutExclusive - 1, project.settings.fps)} ${framesToTimecode(recordIn, project.settings.fps)} ${framesToTimecode(recordOutExclusive - 1, project.settings.fps)}`,
				`* FROM CLIP NAME: ${asset.name}`,
				`* MEDIA PATH: ${mediaPath(project, asset, options)}`
			].join('\n');
		});
	const markerComments = project.markers.map(
		(marker) =>
			`* MARKER ${framesToTimecode(frames(marker.time, project), project.settings.fps)} ${marker.label}`
	);
	return [
		`TITLE: ${project.name}`,
		`FCM: NON-DROP FRAME`,
		...events,
		...markerComments,
		'* CMX3600 EDL contains cuts for this video track only. Audio is not included.'
	].join('\n\n');
}

export function exportEdlTracks(project: Project, options: InteropOptions = {}): EdlDocument[] {
	return project.tracks
		.filter((track) => track.kind === 'video')
		.map((track, index) => ({
			filename: `sequence-v${index + 1}-${escapeXml(track.name).replace(/[^a-z0-9_-]/gi, '-')}.edl`,
			content: exportEdlTrack(project, track, options),
			trackId: track.id
		}));
}
