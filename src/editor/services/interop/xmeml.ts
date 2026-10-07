import type { Project, Track } from '../../core';
import { frames, mediaPath, escapeXml, trackAsset, type InteropOptions } from './exportUtils';

function rateXml(fps: number): string {
	return `<rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>`;
}

function fileXml(
	project: Project,
	assetId: import('../../core').AssetId,
	options: InteropOptions
): string {
	const asset = trackAsset(project, assetId);
	const path = mediaPath(project, asset, options)
		.split('/')
		.map((part) => encodeURIComponent(part))
		.join('/');
	return `<file id="file-${escapeXml(asset.id)}"><name>${escapeXml(asset.name)}</name><pathurl>file://localhost/${path}</pathurl>${rateXml(project.settings.fps)}<duration>${frames(asset.duration, project)}</duration><media><video><samplecharacteristics><width>${asset.width ?? project.settings.width}</width><height>${asset.height ?? project.settings.height}</height></samplecharacteristics></video><audio><channelcount>2</channelcount></audio></media></file>`;
}

function clipItemXml(
	project: Project,
	track: Track,
	clip: Track['clips'][number],
	trackIndex: number,
	options: InteropOptions
): string {
	if (!clip.assetId) return '';
	const asset = trackAsset(project, clip.assetId);
	const start = frames(clip.start, project);
	const duration = Math.max(1, frames(clip.duration, project));
	const sourceIn = frames(clip.sourceIn, project);
	const sourceOut = Math.max(sourceIn, frames(clip.sourceOut, project) - 1);
	const file = fileXml(project, asset.id, options);
	const links = clip.linkId
		? project.tracks.flatMap((linkedTrack, linkedTrackIndex) =>
				linkedTrack.clips.flatMap((linkedClip, linkedClipIndex) =>
					linkedClip.linkId === clip.linkId
						? [
								`<link><linkclipref>clip-${escapeXml(linkedClip.id)}</linkclipref><mediatype>${linkedTrack.kind}</mediatype><trackindex>${linkedTrackIndex + 1}</trackindex><clipindex>${linkedClipIndex + 1}</clipindex></link>`
							]
						: []
				)
			)
		: [];
	return `<clipitem id="clip-${escapeXml(clip.id)}"><name>${escapeXml(asset.name)}</name><duration>${duration}</duration>${rateXml(project.settings.fps)}<start>${start}</start><end>${start + duration}</end><in>${sourceIn}</in><out>${sourceOut}</out>${file}<sourcetrack><mediatype>${track.kind}</mediatype><trackindex>${trackIndex + 1}</trackindex></sourcetrack>${links.join('')}</clipitem>`;
}

export function exportXmeml(project: Project, options: InteropOptions = {}): string {
	const duration = Math.max(
		1,
		frames(
			project.tracks.reduce(
				(latest, track) =>
					track.clips.reduce((end, clip) => Math.max(end, clip.start + clip.duration), latest),
				0
			),
			project
		)
	);
	const tracks = (kind: Track['kind']) =>
		project.tracks
			.map((track, trackIndex) => ({ track, trackIndex }))
			.filter(({ track }) => track.kind === kind)
			.map(
				({ track, trackIndex }) =>
					`<track><enabled>${track.hidden || track.muted ? 0 : 1}</enabled><locked>${track.locked ? 1 : 0}</locked>${track.clips
						.filter((clip) => Boolean(clip.assetId))
						.toSorted((a, b) => a.start - b.start)
						.map((clip) => clipItemXml(project, track, clip, trackIndex, options))
						.join('')}</track>`
			)
			.join('');
	const markers = project.markers
		.map(
			(marker) =>
				`<marker><name>${escapeXml(marker.label)}</name><in>${frames(marker.time, project)}</in><out>${frames(marker.time, project)}</out></marker>`
		)
		.join('');
	return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE xmeml><xmeml version="4"><sequence id="sequence-1"><name>${escapeXml(project.name)}</name><duration>${duration}</duration>${rateXml(project.settings.fps)}${markers}<media><video><format><samplecharacteristics><width>${project.settings.width}</width><height>${project.settings.height}</height>${rateXml(project.settings.fps)}</samplecharacteristics></format>${tracks('video')}</video><audio><numOutputChannels>2</numOutputChannels>${tracks('audio')}</audio></media></sequence></xmeml>`;
}
