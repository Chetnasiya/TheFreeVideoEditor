import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../../core/factory';
import type { AssetId, ClipId, MarkerId } from '../../../core/types';
import { exportOtio } from '../otio';
import { exportFcpxml } from '../fcpxml';
import { exportXmeml } from '../xmeml';
import { exportEdlTracks } from '../edl';
import { parseOtio } from './importOtio';
import { parseEdl } from './importEdl';
import { parseFcpxml } from './importFcpxml';
import { parseXmeml } from './importXmeml';
import { identifyMissingAssets, matchCandidateFile, interchangeToProject } from './relink';

function testProject() {
	const project = createEmptyProject({
		name: 'Roundtrip Spec',
		settings: { fps: 25, width: 1920, height: 1080 }
	});
	const assetId = 'asset-1' as AssetId;
	project.assets[assetId] = {
		id: assetId,
		kind: 'video',
		name: 'Action.mp4',
		mimeType: 'video/mp4',
		size: 1000,
		duration: 10_000_000,
		width: 1920,
		height: 1080,
		hasAudio: true,
		opfsPath: 'action.mp4'
	};

	const vTrack = project.tracks.find((t) => t.kind === 'video')!;
	vTrack.clips.push({
		id: 'clip-1' as ClipId,
		assetId,
		start: 1_000_000,
		duration: 3_000_000,
		sourceIn: 500_000,
		sourceOut: 3_500_000,
		speed: 1,
		volume: 1,
		linkId: 'link-av'
	});

	const aTrack = project.tracks.find((t) => t.kind === 'audio')!;
	aTrack.clips.push({
		id: 'clip-2' as ClipId,
		assetId,
		start: 1_000_000,
		duration: 3_000_000,
		sourceIn: 500_000,
		sourceOut: 3_500_000,
		speed: 1,
		volume: 0.8,
		linkId: 'link-av'
	});

	project.markers.push({
		id: 'm1' as MarkerId,
		time: 2_000_000,
		name: 'Cue Point',
		color: 'blue'
	});

	return project;
}

describe('Interchange Importers & Relinking', () => {
	it('parses OTIO exports and roundtrips to Project model', () => {
		const base = testProject();
		const otioJson = exportOtio(base);
		const ir = parseOtio(otioJson);

		expect(ir.name).toBe('Roundtrip Spec');
		expect(ir.tracks).toHaveLength(2);
		expect(ir.tracks[0]?.clips[0]?.recordIn).toBe(25); // 1s at 25fps = 25 frames
		expect(ir.tracks[0]?.clips[0]?.duration).toBe(75); // 3s at 25fps = 75 frames

		const { project, offlineCount } = interchangeToProject(ir);
		expect(offlineCount).toBe(1); // No local files provided yet
		expect(project.tracks).toHaveLength(2);
		expect(project.tracks[0]?.clips[0]?.start).toBe(1_000_000);
		expect(project.tracks[0]?.clips[0]?.duration).toBe(3_000_000);
	});

	it('parses CMX3600 EDL with comments, markers, and source timecodes', () => {
		const base = testProject();
		const edlDocs = exportEdlTracks(base);
		expect(edlDocs.length).toBeGreaterThan(0);

		const ir = parseEdl(edlDocs[0]!.content, 25);
		expect(ir.tracks.length).toBeGreaterThan(0);
		expect(ir.tracks[0]?.clips).toHaveLength(1);
		expect(ir.tracks[0]?.clips[0]?.recordIn).toBe(25);
		expect(ir.tracks[0]?.clips[0]?.name).toBe('Action.mp4');
		expect(ir.markers).toHaveLength(1);
		expect(ir.markers[0]?.name).toBe('Cue Point');
	});

	it('parses FCPXML exports with spine gaps, asset-clips, and markers', () => {
		const base = testProject();
		const fcpxml = exportFcpxml(base);
		const ir = parseFcpxml(fcpxml);

		expect(ir.name).toBe('Roundtrip Spec');
		expect(ir.tracks.length).toBeGreaterThan(0);
		expect(ir.tracks[0]?.clips[0]?.recordIn).toBe(25);
		expect(ir.tracks[0]?.clips[0]?.duration).toBe(75);
		expect(ir.markers).toHaveLength(1);
		expect(ir.markers[0]?.name).toBe('Cue Point');
	});

	it('parses xmeml v4 exports with track hierarchy, links, and filters', () => {
		const base = testProject();
		const xmeml = exportXmeml(base);
		const ir = parseXmeml(xmeml);

		expect(ir.name).toBe('Roundtrip Spec');
		expect(ir.tracks).toHaveLength(2);
		expect(ir.tracks[0]?.clips[0]?.recordIn).toBe(25);
		expect(ir.tracks[0]?.clips[0]?.recordOut).toBe(100);
		expect(ir.tracks[0]?.clips[0]?.linkId).toBeDefined();
		expect(ir.markers).toHaveLength(1);
		expect(ir.markers[0]?.name).toBe('Cue Point');
	});

	it('identifies missing assets and matches candidate files with high confidence', () => {
		const base = testProject();
		const ir = parseOtio(exportOtio(base));

		const missing = identifyMissingAssets(ir, new Map());
		expect(missing).toHaveLength(1);
		expect(missing[0]?.name).toBe('Action.mp4');

		// Candidate matching
		const dummyFile = new File(['mock content'], 'action.mp4', { type: 'video/mp4' });
		const candidate = matchCandidateFile(missing[0]!, [dummyFile]);
		expect(candidate).not.toBeNull();
		expect(candidate?.score).toBe(1.0);
		expect(candidate?.reason).toBe('Exact filename match');

		// Format variation match
		const dummyMov = new File(['mock content'], 'action.mov', { type: 'video/quicktime' });
		const candidateMov = matchCandidateFile(missing[0]!, [dummyMov]);
		expect(candidateMov?.score).toBe(0.9);

		// Relink resolution
		const resolvedMap = new Map([[missing[0]!.id, dummyFile]]);
		const { project, offlineCount } = interchangeToProject(ir, resolvedMap);
		expect(offlineCount).toBe(0);
		expect(project.assets[missing[0]!.id]?.offline).toBe(false);
	});

	it('unpacks ZIP interchange packages containing timeline and media', async () => {
		const { exportInterchangePackage } = await import('../export');
		const { unpackInterchangePackage } = await import('./importProject');

		const base = testProject();
		const zipBlob = await exportInterchangePackage(base, 'otio', {
			includeMedia: false
		});

		const arrayBuf = await zipBlob.arrayBuffer();
		const unpacked = await unpackInterchangePackage({
			name: 'Package.zip',
			buffer: arrayBuf
		});

		expect(unpacked.format).toBe('otio');
		expect(unpacked.timeline.name).toBe('Roundtrip Spec');
		expect(unpacked.timeline.tracks).toHaveLength(2);
	});
});
