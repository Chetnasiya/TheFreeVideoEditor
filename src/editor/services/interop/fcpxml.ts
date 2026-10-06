import type { Project, Track } from '../../core';
import { timelineDuration } from '../../core';
import { frames, mediaPath, secondsAsRational, trackAsset, escapeXml } from './exportUtils';
import type { InteropOptions } from './exportUtils';

function clipXml(
	project: Project,
	track: Track,
	clip: Track['clips'][number],
	ref: string
): string {
	const asset = trackAsset(project, clip.assetId);
	const start = frames(clip.start, project);
	const duration = Math.max(1, frames(clip.duration, project));
	const sourceIn = frames(clip.sourceIn, project);
	const mediaType = track.kind === 'video' ? 'video' : 'audio';
	const content = `<${mediaType} ref="${ref}"${track.kind === 'audio' ? ` role="audio.${track.muted ? 'dialogue' : 'music'}"` : ''}/>`;
	const markers = project.markers
		.filter((marker) => marker.time >= clip.start && marker.time < clip.start + clip.duration)
		.map(
			(marker) =>
				`<marker start="${secondsAsRational(frames(marker.time - clip.start, project), project.settings.fps)}" value="${escapeXml(marker.label)}"/>`
		)
		.join('');
	return `<asset-clip name="${escapeXml(asset.name)}" ref="${ref}" offset="${secondsAsRational(start, project.settings.fps)}" start="${secondsAsRational(sourceIn, project.settings.fps)}" duration="${secondsAsRational(duration, project.settings.fps)}" lane="0" enabled="${track.hidden || track.muted ? '0' : '1'}">${content}${markers}</asset-clip>`;
}

export function exportFcpxml(project: Project, options: InteropOptions = {}): string {
	const fps = project.settings.fps;
	const assets = Object.values(project.assets);
	const formatId = 'r1';
	const assetRefs = new Map(assets.map((asset, index) => [asset.id, `r${index + 2}`]));
	const resources = [
		`<format id="${formatId}" name="FFVideoFormat${project.settings.height}p${fps}" frameDuration="1/${fps}s" width="${project.settings.width}" height="${project.settings.height}"/>`,
		...assets.map((asset) => {
			const ref = assetRefs.get(asset.id);
			if (!ref) return '';
			return `<asset id="${ref}" name="${escapeXml(asset.name)}" start="0s" duration="${secondsAsRational(frames(asset.duration, project), fps)}" hasVideo="${asset.kind === 'video' || asset.kind === 'image' ? 1 : 0}" hasAudio="${asset.hasAudio ? 1 : 0}"><media-rep kind="original-media" src="file://localhost/${mediaPath(
				project,
				asset,
				options
			)
				.split('/')
				.map(encodeURIComponent)
				.join('/')}" /></asset>`;
		})
	].join('');
	const tracks = project.tracks;
	const primary = tracks.find((track) => track.kind === 'video');
	const spineChildren: string[] = [];
	if (primary) {
		let cursor = 0;
		for (const clip of primary.clips.toSorted((a, b) => a.start - b.start)) {
			const start = frames(clip.start, project);
			if (start > cursor) {
				spineChildren.push(
					`<gap name="Gap" offset="${secondsAsRational(cursor, fps)}" duration="${secondsAsRational(start - cursor, fps)}"/>`
				);
			}
			const ref = assetRefs.get(clip.assetId);
			if (ref) spineChildren.push(clipXml(project, primary, clip, ref));
			cursor = start + Math.max(1, frames(clip.duration, project));
		}
	}
	const connected = tracks
		.filter((track) => track !== primary)
		.flatMap((track, index) =>
			track.clips.map((clip) => {
				const ref = assetRefs.get(clip.assetId);
				if (!ref) return '';
				const lane = index + 1;
				return `<asset-clip lane="${lane}" name="${escapeXml(track.name)} — ${escapeXml(trackAsset(project, clip.assetId).name)}" offset="${secondsAsRational(frames(clip.start, project), fps)}" start="${secondsAsRational(frames(clip.sourceIn, project), fps)}" duration="${secondsAsRational(Math.max(1, frames(clip.duration, project)), fps)}" ref="${ref}" enabled="${track.hidden || track.muted ? '0' : '1'}"/>`;
			})
		)
		.join('');
	const duration = Math.max(1, frames(timelineDuration(project), project));
	return `<?xml version="1.0" encoding="UTF-8"?><fcpxml version="1.10"><resources>${resources}</resources><library><event name="${escapeXml(project.name)}"><project name="${escapeXml(project.name)}"><sequence format="${formatId}" duration="${secondsAsRational(duration, fps)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k"><spine>${spineChildren.join('')}${connected}</spine></sequence></project></event></library></fcpxml>`;
}
