import type { Project } from '../../core';
import {
	type InterchangeClip,
	type InterchangeTimeline,
	type InterchangeTrack,
	projectToInterchange
} from '../../core/interchange/ir';
import { framesToFcpxmlTime, rateToFcpxmlDuration } from '../../core/interchange/time';
import type { InteropOptions } from './exportUtils';
import { escapeXml } from './exportUtils';

function clipToFcpxml(
	ir: InterchangeTimeline,
	track: InterchangeTrack,
	clip: InterchangeClip,
	ref: string | undefined,
	lane = 0
): string {
	const rate = ir.rate;
	const offsetStr = framesToFcpxmlTime(clip.recordIn, rate);
	const startStr = framesToFcpxmlTime(clip.sourceIn, rate);
	const durationStr = framesToFcpxmlTime(clip.duration, rate);
	const enabledStr = track.enabled ? '1' : '0';

	// Text clip
	if (clip.text) {
		const titleText = escapeXml(clip.text.content);
		return `<title name="${escapeXml(clip.name)}" offset="${offsetStr}" start="0s" duration="${durationStr}" lane="${lane}"><text><text-style ref="ts1">${titleText}</text-style></text><text-style-def id="ts1"><text-style font="Helvetica" fontSize="${clip.text.fontSize ?? 48}" fontColor="${clip.text.fill ?? '#ffffff'}" alignment="${clip.text.align ?? 'center'}"/></text-style-def></title>`;
	}

	if (!ref) return '';

	const mediaType = track.kind === 'video' ? 'video' : 'audio';
	const roleAttr = track.kind === 'audio' ? ` role="audio.dialogue"` : '';
	const content = `<${mediaType} ref="${ref}"${roleAttr}/>`;

	const markersXml = ir.markers
		.filter((m) => m.frame >= clip.recordIn && m.frame < clip.recordOut)
		.map(
			(m) =>
				`<marker start="${framesToFcpxmlTime(m.frame - clip.recordIn, rate)}" value="${escapeXml(m.name)}"/>`
		)
		.join('');

	let adjustments = '';
	if (clip.volume !== 1 && clip.volume > 0) {
		const db = (20 * Math.log10(clip.volume)).toFixed(1);
		adjustments += `<adjust-volume amount="${db}dB"/>`;
	}
	if (clip.transform) {
		const [sx, sy] = clip.transform.scale;
		const [px, py] = clip.transform.position;
		adjustments += `<adjust-transform scale="${sx} ${sy}" rotation="${clip.transform.rotation}" position="${px} ${py}"/>`;
	}

	return `<asset-clip name="${escapeXml(clip.name)}" ref="${ref}" offset="${offsetStr}" start="${startStr}" duration="${durationStr}" lane="${lane}" enabled="${enabledStr}">${content}${adjustments}${markersXml}</asset-clip>`;
}

export function exportFcpxmlFromIr(ir: InterchangeTimeline): string {
	const rate = ir.rate;
	const formatId = 'r1';
	const assets = Array.from(ir.assets.values());
	const assetRefs = new Map(assets.map((asset, index) => [asset.id, `r${index + 2}`]));

	const formatDuration = rateToFcpxmlDuration(rate);
	const resources = [
		`<format id="${formatId}" name="FFVideoFormat${ir.height}p${rate.timebase}" frameDuration="${formatDuration}" width="${ir.width}" height="${ir.height}"/>`,
		...assets.map((asset) => {
			const ref = assetRefs.get(asset.id);
			if (!ref) return '';
			const encodedPath = asset.path.split('/').map(encodeURIComponent).join('/');
			return `<asset id="${ref}" name="${escapeXml(asset.name)}" start="0s" duration="${framesToFcpxmlTime(asset.durationFrames, rate)}" hasVideo="${asset.width ? 1 : 0}" hasAudio="${asset.hasAudio ? 1 : 0}"><media-rep kind="original-media" src="file://localhost/${encodedPath}" /></asset>`;
		})
	].join('');

	const tracks = ir.tracks;
	const primary = tracks.find((track) => track.kind === 'video');
	const spineChildren: string[] = [];

	if (primary) {
		let cursor = 0;
		for (const clip of primary.clips.toSorted((a, b) => a.recordIn - b.recordIn)) {
			if (clip.recordIn > cursor) {
				spineChildren.push(
					`<gap name="Gap" offset="${framesToFcpxmlTime(cursor, rate)}" duration="${framesToFcpxmlTime(clip.recordIn - cursor, rate)}"/>`
				);
			}
			const ref = clip.assetId ? assetRefs.get(clip.assetId) : undefined;
			spineChildren.push(clipToFcpxml(ir, primary, clip, ref, 0));
			cursor = clip.recordOut;
		}
	}

	const connected = tracks
		.filter((track) => track !== primary)
		.flatMap((track, trackIndex) =>
			track.clips.map((clip) => {
				const ref = clip.assetId ? assetRefs.get(clip.assetId) : undefined;
				const lane = trackIndex + 1;
				return clipToFcpxml(ir, track, clip, ref, lane);
			})
		)
		.join('');

	const totalDuration = framesToFcpxmlTime(ir.durationFrames, rate);
	const tcFormat = rate.dropFrame ? 'DF' : 'NDF';

	return `<?xml version="1.0" encoding="UTF-8"?><fcpxml version="1.10"><resources>${resources}</resources><library><event name="${escapeXml(ir.name)}"><project name="${escapeXml(ir.name)}"><sequence format="${formatId}" duration="${totalDuration}" tcStart="0s" tcFormat="${tcFormat}" audioLayout="stereo" audioRate="48k"><spine>${spineChildren.join('')}${connected}</spine></sequence></project></event></library></fcpxml>`;
}

export function exportFcpxml(project: Project, options: InteropOptions = {}): string {
	const ir = projectToInterchange(project, { mediaPaths: options.mediaPaths });
	return exportFcpxmlFromIr(ir);
}
