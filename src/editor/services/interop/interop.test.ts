import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { createEmptyProject } from '../../core';
import { exportInterchangePackage, streamInterchangePackage } from './export';
import { exportEdlTracks } from './edl';
import { exportFcpxml } from './fcpxml';
import { exportOtio } from './otio';
import { exportXmeml } from './xmeml';
import { uniqueMediaPaths } from './exportUtils';

function fixture() {
	const project = createEmptyProject({ name: 'Cut & Mix', settings: { fps: 25 } });
	const assetId = 'asset-1' as keyof typeof project.assets;
	project.assets[assetId] = {
		id: assetId,
		kind: 'video',
		name: 'Shot <one>.mp4',
		mimeType: 'video/mp4',
		size: 12,
		duration: 8_000_000,
		width: 1920,
		height: 1080,
		hasAudio: true,
		opfsPath: 'asset-1.mp4'
	};
	const videoTrack = project.tracks.find((track) => track.kind === 'video');
	const audioTrack = project.tracks.find((track) => track.kind === 'audio');
	if (!videoTrack || !audioTrack) throw new Error('Factory tracks missing.');
	videoTrack.clips.push({
		id: 'clip-a' as (typeof videoTrack.clips)[number]['id'],
		assetId,
		start: 0,
		duration: 2_000_000,
		sourceIn: 1_000_000,
		sourceOut: 3_000_000,
		speed: 1,
		volume: 1,
		linkId: 'link-a'
	});
	videoTrack.clips.push({
		id: 'clip-b' as (typeof videoTrack.clips)[number]['id'],
		assetId,
		start: 4_000_000,
		duration: 2_000_000,
		sourceIn: 3_000_000,
		sourceOut: 5_000_000,
		speed: 1,
		volume: 1
	});
	audioTrack.muted = true;
	audioTrack.locked = true;
	audioTrack.clips.push({
		id: 'audio-a' as (typeof audioTrack.clips)[number]['id'],
		assetId,
		start: 0,
		duration: 2_000_000,
		sourceIn: 0,
		sourceOut: 2_000_000,
		speed: 1,
		volume: 0.5,
		linkId: 'link-a'
	});
	return project;
}

describe('interchange serializers', () => {
	it('serializes xmeml with ordered tracks, source ranges and frame positions', () => {
		const xml = exportXmeml(fixture());
		expect(xml).toContain('<xmeml version="4">');
		expect(xml).toContain('<timebase>25</timebase><ntsc>FALSE</ntsc>');
		expect(xml).toContain('<start>100</start><end>150</end><in>75</in><out>124</out>');
		expect(xml).toContain('<locked>1</locked>');
		expect(xml).toContain('Shot &lt;one&gt;.mp4');
	});

	it('writes CMX3600 non-drop events with source and record in/out frames', () => {
		const documents = exportEdlTracks(fixture());
		expect(documents).toHaveLength(1);
		expect(documents[0]?.content).toContain('FCM: NON-DROP FRAME');
		expect(documents[0]?.content).toContain('00:00:01:00 00:00:02:24 00:00:00:00 00:00:01:24');
	});

	it('emits FCPXML with asset resources, a gap and frame-rational clip timing', () => {
		const xml = exportFcpxml(fixture());
		expect(xml).toContain('<fcpxml version="1.10">');
		expect(xml).toContain('<asset id="r2"');
		expect(xml).toContain('duration="50/25s"');
		expect(xml).toContain('<gap');
		expect(xml).toContain('offset="100/25s"');
	});

	it('generates parseable OTIO and places explicit gaps before later clips', () => {
		const timeline = JSON.parse(exportOtio(fixture())) as {
			tracks: {
				children: Array<{
					OTIO_SCHEMA: string;
					children: Array<{
						OTIO_SCHEMA: string;
						source_range?: { start_time: { value: number } };
					}>;
				}>;
			};
		};
		const video = timeline.tracks.children[0];
		expect(video?.children.map((item) => item.OTIO_SCHEMA)).toEqual(['Clip.2', 'Gap.1', 'Clip.2']);
		expect(video?.children[1]?.source_range?.start_time.value).toBe(0);
	});

	it('deduplicates sanitized media names case-insensitively', () => {
		const project = fixture();
		const first = Object.values(project.assets)[0];
		if (!first) throw new Error('Fixture asset missing.');
		project.assets['asset-2' as keyof typeof project.assets] = {
			...first,
			id: 'asset-2' as typeof first.id,
			name: first.name.toUpperCase()
		};
		expect([...uniqueMediaPaths(project).values()]).toEqual([
			'media/Shot -one-.mp4',
			'media/SHOT -ONE- (2).mp4'
		]);
	});

	it('creates a named ZIP package without media and supports a cancelled package', async () => {
		const project = fixture();
		const blob = await exportInterchangePackage(project, 'xmeml', { includeMedia: false });
		const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
		expect(Object.keys(files)).toEqual(['Cut & Mix.xml']);
		expect(strFromU8(files['Cut & Mix.xml'] ?? new Uint8Array())).toContain('<xmeml version="4">');

		const controller = new AbortController();
		controller.abort();
		await expect(
			streamInterchangePackage(project, 'otio', async () => {}, {
				includeMedia: false,
				signal: controller.signal
			})
		).rejects.toMatchObject({ name: 'AbortError' });
	});

	it('packages every video track as an EDL document with a clear audio note', async () => {
		const project = fixture();
		const secondVideo = {
			...project.tracks.find((track) => track.kind === 'video')!
		};
		secondVideo.id = 'video-track-2' as typeof secondVideo.id;
		secondVideo.name = 'Video 2';
		project.tracks.push(secondVideo);
		const blob = await exportInterchangePackage(project, 'edl', { includeMedia: false });
		const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
		expect(Object.keys(files)).toEqual([
			'sequence-v1-Video-1.edl',
			'sequence-v2-Video-2.edl',
			'AUDIO-NOTE.txt'
		]);
	});

	it('flattens projects with nested sequences for xmeml, edl, fcpxml, and otio output and lists omissions', async () => {
		const { createSequence, addSequenceInstance, flattenForInterchange } =
			await import('../../core/sequences/operations');
		const { ROOT_SEQUENCE_ID } = await import('../../core/sequences/access');
		const base = fixture();
		const { project: pWithSeq, sequenceId } = createSequence(base, 'Nested B-Roll');
		const rootVTrack = pWithSeq.tracks.find((t) => t.kind === 'video')!;
		// Add valid sequence instance
		const { project: pWithInst } = addSequenceInstance(
			pWithSeq,
			ROOT_SEQUENCE_ID,
			sequenceId,
			2_000_000,
			rootVTrack.id
		);

		// Add a speed-altered instance that cannot be flattened
		const speedClip: import('../../core/types').Clip = {
			id: 'clip-speed-inst' as import('../../core/types').ClipId,
			start: 8_000_000,
			duration: 2_000_000,
			sourceIn: 0,
			sourceOut: 2_000_000,
			speed: 2,
			volume: 1,
			source: { type: 'sequence', sequenceId }
		};
		const pWithSpeedInst = {
			...pWithInst,
			tracks: pWithInst.tracks.map((t) =>
				t.id === rootVTrack.id ? { ...t, clips: [...t.clips, speedClip] } : t
			)
		};

		const { project: flattened, omissions } = flattenForInterchange(pWithSpeedInst);
		expect(omissions.length).toBeGreaterThan(0);
		expect(omissions[0]).toContain('has speed 2 or time remap and was omitted');

		// Check xmeml serialization
		const xmemlStr = exportXmeml(flattened);
		expect(xmemlStr).toContain('<xmeml version="4">');

		// Check EDL serialization
		const edlDocs = exportEdlTracks(flattened);
		expect(edlDocs.length).toBeGreaterThan(0);
		expect(edlDocs[0]!.content).toContain('FCM: NON-DROP FRAME');

		// Check FCPXML serialization
		const fcpxmlStr = exportFcpxml(flattened);
		expect(fcpxmlStr).toContain('<fcpxml version="1.10">');

		// Check OTIO serialization
		const otioStr = exportOtio(flattened);
		const parsedOtio = JSON.parse(otioStr);
		expect(parsedOtio.OTIO_SCHEMA).toContain('Timeline');
	});
});
