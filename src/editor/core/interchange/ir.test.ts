import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../factory';
import type { AssetId, ClipId, MarkerId } from '../types';
import { projectToInterchange } from './ir';

describe('Interchange Intermediate Representation (IR)', () => {
	it('converts a standard project into a pure InterchangeTimeline with exact frame timing', () => {
		const project = createEmptyProject({ name: 'Commercial Cut', settings: { fps: 29.97 } });
		project.assets['asset-v1' as keyof typeof project.assets] = {
			id: 'asset-v1' as AssetId,
			kind: 'video',
			name: 'interview.mp4',
			mimeType: 'video/mp4',
			size: 1024,
			duration: 10_000_000,
			width: 1920,
			height: 1080,
			hasAudio: true,
			opfsPath: 'interview.mp4'
		};

		const vTrack = project.tracks.find((t) => t.kind === 'video')!;
		const aTrack = project.tracks.find((t) => t.kind === 'audio')!;

		vTrack.clips.push({
			id: 'clip-1' as ClipId,
			assetId: 'asset-v1' as AssetId,
			start: 1_000_000,
			duration: 3_000_000,
			sourceIn: 500_000,
			sourceOut: 3_500_000,
			speed: 1,
			volume: 1,
			linkId: 'link-1'
		});

		aTrack.clips.push({
			id: 'clip-2' as ClipId,
			assetId: 'asset-v1' as AssetId,
			start: 1_000_000,
			duration: 3_000_000,
			sourceIn: 500_000,
			sourceOut: 3_500_000,
			speed: 1,
			volume: 0.8,
			linkId: 'link-1'
		});

		project.markers.push({
			id: 'm1' as MarkerId,
			time: 2_000_000,
			name: 'Sync Point',
			color: 'red'
		});

		const ir = projectToInterchange(project, { dropFrame: true });

		expect(ir.name).toBe('Commercial Cut');
		expect(ir.rate.timebase).toBe(30);
		expect(ir.rate.dropFrame).toBe(true);
		expect(ir.rate.numerator).toBe(30000);
		expect(ir.rate.denominator).toBe(1001);

		// 1_000_000 us at 29.97 fps = 30 frames
		expect(ir.tracks[0]?.clips[0]?.recordIn).toBe(30);
		// 3_000_000 us at 29.97 fps = 90 frames
		expect(ir.tracks[0]?.clips[0]?.duration).toBe(90);
		expect(ir.tracks[0]?.clips[0]?.linkId).toBe('link-1');

		// Markers
		expect(ir.markers).toHaveLength(1);
		expect(ir.markers[0]?.name).toBe('Sync Point');
		expect(ir.markers[0]?.frame).toBe(60);

		// Feature audits
		expect(ir.featureAudits.length).toBeGreaterThan(0);
		const cutsAudit = ir.featureAudits.find((a) => a.feature.includes('Cuts'));
		expect(cutsAudit?.xmeml.status).toBe('native');
		expect(cutsAudit?.edl.status).toBe('native');
		expect(cutsAudit?.fcpxml.status).toBe('native');
		expect(cutsAudit?.otio.status).toBe('native');
	});
});
