import type { Project, Track } from '../../core';
import {
	type InterchangeTimeline,
	type InterchangeTrack,
	projectToInterchange
} from '../../core/interchange/ir';
import { framesToTimecode } from '../../core/interchange/time';
import type { InteropOptions } from './exportUtils';
import { escapeXml } from './exportUtils';

export interface EdlDocument {
	filename: string;
	content: string;
	trackId: Track['id'];
}

export function reelName(name: string): string {
	return name
		.replace(/\.[^.]+$/, '')
		.normalize('NFKD')
		.replace(/[^a-z0-9]/gi, '')
		.toUpperCase()
		.slice(0, 8)
		.padEnd(1, 'A');
}

export function exportEdlFromIr(ir: InterchangeTimeline, track: InterchangeTrack): string {
	const fcm = ir.rate.dropFrame ? 'DROP FRAME' : 'NON-DROP FRAME';
	const events = track.clips
		.filter((clip) => Boolean(clip.assetId))
		.toSorted((first, second) => first.recordIn - second.recordIn)
		.map((clip, index) => {
			const sourceIn = clip.sourceIn;
			const sourceOutExclusive = Math.max(sourceIn + 1, clip.sourceOut + 1);
			const recordIn = clip.recordIn;
			const recordOutExclusive = Math.max(recordIn + 1, clip.recordOut);

			const srcInTc = framesToTimecode(sourceIn, ir.rate);
			const srcOutTc = framesToTimecode(sourceOutExclusive - 1, ir.rate);
			const recInTc = framesToTimecode(recordIn, ir.rate);
			const recOutTc = framesToTimecode(recordOutExclusive - 1, ir.rate);

			const lines = [
				`${String(index + 1).padStart(3, '0')}  ${reelName(clip.name)} V     C        ${srcInTc} ${srcOutTc} ${recInTc} ${recOutTc}`,
				`* FROM CLIP NAME: ${clip.name}`,
				`* MEDIA PATH: ${clip.mediaPath}`
			];

			if (clip.speed !== 1) {
				lines.push(`* SPEED: ${clip.speed.toFixed(2)}x (approximated as cut)`);
			}

			return lines.join('\n');
		});

	const markerComments = ir.markers.map(
		(marker) => `* MARKER ${framesToTimecode(marker.frame, ir.rate)} ${marker.name}`
	);

	return [
		`TITLE: ${ir.name}`,
		`FCM: ${fcm}`,
		...events,
		...markerComments,
		'* CMX3600 EDL contains cuts for this video track only. Audio is not included.'
	].join('\n\n');
}

export function exportEdlTrack(
	project: Project,
	track: Track,
	options: InteropOptions = {}
): string {
	const ir = projectToInterchange(project, { mediaPaths: options.mediaPaths });
	const irTrack = ir.tracks.find((t) => t.id === track.id) ?? {
		id: track.id,
		name: track.name,
		kind: track.kind,
		enabled: true,
		locked: false,
		volume: 1,
		pan: 0,
		clips: []
	};
	return exportEdlFromIr(ir, irTrack);
}

export function exportEdlTracks(project: Project, options: InteropOptions = {}): EdlDocument[] {
	const ir = projectToInterchange(project, { mediaPaths: options.mediaPaths });
	return ir.tracks
		.filter((track) => track.kind === 'video')
		.map((track, index) => ({
			filename: `sequence-v${index + 1}-${escapeXml(track.name).replace(/[^a-z0-9_-]/gi, '-')}.edl`,
			content: exportEdlFromIr(ir, track),
			trackId: track.id as Track['id']
		}));
}
