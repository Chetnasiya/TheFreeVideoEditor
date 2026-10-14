import type { Project } from '../../core';
import {
	type InterchangeClip,
	type InterchangeTimeline,
	type InterchangeTrack,
	projectToInterchange
} from '../../core/interchange/ir';
import { framesToTimecode } from '../../core/interchange/time';
import type { InteropOptions } from './exportUtils';
import { escapeXml } from './exportUtils';

function rateXml(ir: InterchangeTimeline): string {
	const ntscStr = ir.rate.ntsc ? 'TRUE' : 'FALSE';
	return `<rate><timebase>${ir.rate.timebase}</timebase><ntsc>${ntscStr}</ntsc></rate>`;
}

function fileXml(ir: InterchangeTimeline, clip: InterchangeClip): string {
	if (!clip.assetId) return '';
	const asset = ir.assets.get(clip.assetId);
	const width = asset?.width ?? ir.width;
	const height = asset?.height ?? ir.height;
	const duration = asset?.durationFrames ?? clip.duration;
	const encodedPath = (clip.mediaPath || '').split('/').map(encodeURIComponent).join('/');

	return `<file id="file-${escapeXml(clip.assetId)}"><name>${escapeXml(clip.name)}</name><pathurl>file://localhost/${encodedPath}</pathurl>${rateXml(ir)}<duration>${duration}</duration><media><video><samplecharacteristics><width>${width}</width><height>${height}</height></samplecharacteristics></video><audio><channelcount>2</channelcount></audio></media></file>`;
}

function clipTransformFilters(clip: InterchangeClip): string {
	if (!clip.transform) return '';
	const [sx] = clip.transform.scale;
	const [px, py] = clip.transform.position;
	const rot = clip.transform.rotation;
	const opacity = Math.round(clip.transform.opacity * 100);

	return [
		`<filter>`,
		`<effect>`,
		`<name>Basic Motion</name>`,
		`<effectid>basic</effectid>`,
		`<effectcategory>motion</effectcategory>`,
		`<effecttype>motion</effecttype>`,
		`<mediatype>video</mediatype>`,
		`<parameter><parameterid>scale</parameterid><name>Scale</name><value>${Math.round(sx * 100)}</value></parameter>`,
		`<parameter><parameterid>rotation</parameterid><name>Rotation</name><value>${rot}</value></parameter>`,
		`<parameter><parameterid>center</parameterid><name>Center</name><value><horiz>${px}</horiz><vert>${py}</vert></value></parameter>`,
		`</effect>`,
		`</filter>`,
		`<filter>`,
		`<effect>`,
		`<name>Opacity</name>`,
		`<effectid>opacity</effectid>`,
		`<effectcategory>motion</effectcategory>`,
		`<effecttype>motion</effecttype>`,
		`<mediatype>video</mediatype>`,
		`<parameter><parameterid>opacity</parameterid><name>Opacity</name><value>${opacity}</value></parameter>`,
		`</effect>`,
		`</filter>`
	].join('');
}

function clipAudioFilters(clip: InterchangeClip): string {
	if (clip.volume === 1 && clip.pan === 0) return '';
	return [
		`<filter>`,
		`<effect>`,
		`<name>Audio Levels</name>`,
		`<effectid>audiolevels</effectid>`,
		`<effectcategory>audio</effectcategory>`,
		`<effecttype>audio</effecttype>`,
		`<mediatype>audio</mediatype>`,
		`<parameter><parameterid>level</parameterid><name>Level</name><value>${clip.volume}</value></parameter>`,
		`<parameter><parameterid>pan</parameterid><name>Pan</name><value>${clip.pan}</value></parameter>`,
		`</effect>`,
		`</filter>`
	].join('');
}

function clipItemXml(
	ir: InterchangeTimeline,
	track: InterchangeTrack,
	clip: InterchangeClip,
	trackIndex: number
): string {
	const file = fileXml(ir, clip);
	const links = clip.linkId
		? ir.tracks.flatMap((linkedTrack, linkedTrackIndex) =>
				linkedTrack.clips.flatMap((linkedClip, linkedClipIndex) =>
					linkedClip.linkId === clip.linkId
						? [
								`<link><linkclipref>clip-${escapeXml(linkedClip.id)}</linkclipref><mediatype>${linkedTrack.kind}</mediatype><trackindex>${linkedTrackIndex + 1}</trackindex><clipindex>${linkedClipIndex + 1}</clipindex></link>`
							]
						: []
				)
			)
		: [];

	const filters = track.kind === 'video' ? clipTransformFilters(clip) : clipAudioFilters(clip);

	return `<clipitem id="clip-${escapeXml(clip.id)}"><name>${escapeXml(clip.name)}</name><duration>${clip.duration}</duration>${rateXml(ir)}<start>${clip.recordIn}</start><end>${clip.recordOut}</end><in>${clip.sourceIn}</in><out>${clip.sourceOut}</out>${file}${filters}<sourcetrack><mediatype>${track.kind}</mediatype><trackindex>${trackIndex + 1}</trackindex></sourcetrack>${links.join('')}</clipitem>`;
}

export function exportXmemlFromIr(ir: InterchangeTimeline): string {
	const tracks = (kind: 'video' | 'audio') =>
		ir.tracks
			.map((track, trackIndex) => ({ track, trackIndex }))
			.filter(({ track }) => track.kind === kind)
			.map(
				({ track, trackIndex }) =>
					`<track><enabled>${track.enabled ? 1 : 0}</enabled><locked>${track.locked ? 1 : 0}</locked>${track.clips
						.filter((clip) => Boolean(clip.assetId) || Boolean(clip.text))
						.toSorted((a, b) => a.recordIn - b.recordIn)
						.map((clip) => clipItemXml(ir, track, clip, trackIndex))
						.join('')}</track>`
			)
			.join('');

	const markers = ir.markers
		.map(
			(m) =>
				`<marker><name>${escapeXml(m.name)}</name><comment>${escapeXml(m.comment ?? '')}</comment><in>${m.frame}</in><out>${m.frame}</out></marker>`
		)
		.join('');

	const displayFormat = ir.rate.dropFrame ? 'DF' : 'NDF';
	const tcString = framesToTimecode(0, ir.rate);
	const timecodeTag = `<timecode>${rateXml(ir)}<string>${tcString}</string><frame>0</frame><displayformat>${displayFormat}</displayformat></timecode>`;

	return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE xmeml><xmeml version="4"><sequence id="sequence-1"><name>${escapeXml(ir.name)}</name><duration>${ir.durationFrames}</duration>${rateXml(ir)}${timecodeTag}${markers}<media><video><format><samplecharacteristics><width>${ir.width}</width><height>${ir.height}</height>${rateXml(ir)}</samplecharacteristics></format>${tracks('video')}</video><audio><numOutputChannels>2</numOutputChannels>${tracks('audio')}</audio></media></sequence></xmeml>`;
}

export function exportXmeml(project: Project, options: InteropOptions = {}): string {
	const ir = projectToInterchange(project, { mediaPaths: options.mediaPaths });
	return exportXmemlFromIr(ir);
}
