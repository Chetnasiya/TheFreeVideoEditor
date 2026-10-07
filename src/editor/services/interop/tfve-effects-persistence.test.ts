import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createAdjustmentClip,
	createEmptyProject,
	createEffectInstance,
	createSolidClip,
	insertClip,
	projectSchema,
	type AssetId,
	type ClipId,
	type EffectInstance
} from '../../core';
import { exportTfve, importTfve } from './native';
import { getProject } from '../storage/projectDb';

vi.mock('../storage/projectDb', () => ({
	getProject: vi.fn().mockResolvedValue(null)
}));

describe('TFVE Effects & Layer Persistence', () => {
	beforeEach(() => {
		vi.mocked(getProject).mockReset().mockResolvedValue(null);
	});

	it('persists color grading, curves, chroma key, and all starter effects faithfully across TFVE roundtrip', async () => {
		let project = createEmptyProject({ name: 'Effects Roundtrip Test' });
		const videoTrack = project.tracks.find((t) => t.kind === 'video')!;

		const videoAssetId = 'video-test-asset' as AssetId;
		project.assets[videoAssetId] = {
			id: videoAssetId,
			kind: 'video',
			name: 'sample.mp4',
			mimeType: 'video/mp4',
			size: 2048,
			duration: 2_000_000,
			hasAudio: true,
			opfsPath: `projects/${project.id}/media/${videoAssetId}.mp4`
		};

		// 1. Setup a video clip with colorCorrection, curves, chromaKey, and blur
		const colorCorrectionEffect: EffectInstance = createEffectInstance('colorCorrection', {
			exposure: 0.5,
			contrast: 0.2,
			highlights: -0.1,
			shadows: 0.15,
			whites: 0.05,
			blacks: -0.05,
			temperature: 0.3,
			tint: -0.2,
			saturation: 0.25,
			vibrance: 0.1,
			liftR: 0.05,
			liftG: -0.02,
			liftB: 0.01,
			gammaR: 1.1,
			gammaG: 0.95,
			gammaB: 1.05,
			gainR: 1.2,
			gainG: 0.9,
			gainB: 1.15,
			mix: 0.9
		});

		const curvesEffect: EffectInstance = createEffectInstance('curves', {
			rgb: [
				{ x: 0, y: 0 },
				{ x: 0.25, y: 0.2 },
				{ x: 0.75, y: 0.85 },
				{ x: 1, y: 1 }
			],
			red: [
				{ x: 0, y: 0 },
				{ x: 0.5, y: 0.6 },
				{ x: 1, y: 1 }
			],
			green: [
				{ x: 0, y: 0 },
				{ x: 0.4, y: 0.35 },
				{ x: 1, y: 1 }
			],
			blue: [
				{ x: 0, y: 0 },
				{ x: 0.6, y: 0.65 },
				{ x: 1, y: 1 }
			],
			mix: 1
		});

		const chromaKeyEffect: EffectInstance = createEffectInstance('chromaKey', {
			color: [0.1, 0.9, 0.2],
			tolerance: 0.45,
			softness: 0.12,
			spill: 0.3,
			mix: 1
		});

		const gaussianBlurEffect: EffectInstance = createEffectInstance('gaussianBlur', {
			radius: 12,
			mix: 0.8
		});

		const clip1 = {
			id: 'clip-with-effects' as ClipId,
			assetId: videoAssetId,
			start: 0,
			duration: 2_000_000,
			sourceIn: 0,
			sourceOut: 2_000_000,
			speed: 1,
			volume: 1,
			effects: [colorCorrectionEffect, curvesEffect, chromaKeyEffect, gaussianBlurEffect],
			properties: {
				'effect:gaussianBlur:eff_blur:radius': {
					keyframes: [
						{ id: 'kf1', time: 0, value: 5, interpolation: 'linear' as const },
						{ id: 'kf2', time: 1_000_000, value: 20, interpolation: 'linear' as const }
					]
				}
			}
		};

		// 2. Setup an Adjustment Layer clip
		const adjClip = createAdjustmentClip(2_000_000, 2_000_000, {
			effects: [
				createEffectInstance('vignette', { amount: 0.6, radius: 0.75 }),
				createEffectInstance('filmGrain', { amount: 0.35 })
			]
		});

		// 3. Setup a Solid Color clip
		const solidClip = createSolidClip(
			4_000_000,
			1_000_000,
			{ r: 1, g: 0.2, b: 0.4, a: 1 },
			{
				effects: [createEffectInstance('invert', { mix: 0.5 })]
			}
		);

		// 4. Setup 3D LUT effect
		const lutAssetId = 'lut-test-asset' as AssetId;
		project.assets[lutAssetId] = {
			id: lutAssetId,
			kind: 'lut',
			name: 'creative_teal_orange.cube',
			mimeType: 'application/x-cube',
			size: 1024,
			duration: 0,
			hasAudio: false,
			opfsPath: `projects/${project.id}/media/${lutAssetId}.cube`
		};

		const lutEffect = createEffectInstance('lut3d', {
			lutAssetId,
			intensity: 0.85,
			mix: 1
		});

		if (!solidClip.effects) solidClip.effects = [];
		solidClip.effects.push(lutEffect);

		// Insert clips into project
		project = insertClip(project, videoTrack.id, clip1);
		project = insertClip(project, videoTrack.id, adjClip);
		project = insertClip(project, videoTrack.id, solidClip);

		// Verify schema validation pre-export
		expect(() => projectSchema.parse(project)).not.toThrow();

		// Export to TFVE blob
		const blob = await exportTfve(project);
		expect(blob.size).toBeGreaterThan(0);

		// Import from TFVE blob
		const restored = await importTfve(blob);

		// Verify restored project parses cleanly through Zod schema
		expect(() => projectSchema.parse(restored)).not.toThrow();

		const restoredTrack = restored.tracks.find((t) => t.id === videoTrack.id)!;
		expect(restoredTrack.clips).toHaveLength(3);

		// Check clip 1 (effects)
		const restoredClip1 = restoredTrack.clips[0]!;
		expect(restoredClip1.effects).toHaveLength(4);

		// Check Color Correction parameters (including Lift, Gamma, Gain)
		const restoredCc = restoredClip1.effects?.find((e) => e.type === 'colorCorrection');
		expect(restoredCc).toBeDefined();
		expect(restoredCc?.params.exposure).toBe(0.5);
		expect(restoredCc?.params.contrast).toBe(0.2);
		expect(restoredCc?.params.liftR).toBe(0.05);
		expect(restoredCc?.params.gammaG).toBe(0.95);
		expect(restoredCc?.params.gainB).toBe(1.15);

		// Check Curves parameter (RGB, R, G, B point arrays)
		const restoredCurves = restoredClip1.effects?.find((e) => e.type === 'curves');
		expect(restoredCurves).toBeDefined();
		expect(restoredCurves?.params.rgb).toEqual([
			{ x: 0, y: 0 },
			{ x: 0.25, y: 0.2 },
			{ x: 0.75, y: 0.85 },
			{ x: 1, y: 1 }
		]);
		expect(restoredCurves?.params.red).toEqual([
			{ x: 0, y: 0 },
			{ x: 0.5, y: 0.6 },
			{ x: 1, y: 1 }
		]);

		// Check Chroma Key parameter (color tuple)
		const restoredChroma = restoredClip1.effects?.find((e) => e.type === 'chromaKey');
		expect(restoredChroma).toBeDefined();
		expect(restoredChroma?.params.color).toEqual([0.1, 0.9, 0.2]);
		expect(restoredChroma?.params.tolerance).toBe(0.45);
		expect(restoredChroma?.params.softness).toBe(0.12);

		// Check keyframed property on clip 1
		const prop = restoredClip1.properties?.['effect:gaussianBlur:eff_blur:radius'];
		expect(prop).toBeDefined();
		expect(prop && 'keyframes' in prop ? prop.keyframes : undefined).toHaveLength(2);

		// Check Adjustment Layer
		const restoredAdj = restoredTrack.clips[1]!;
		expect(restoredAdj.source).toEqual({ type: 'adjustment' });
		expect(restoredAdj.effects).toHaveLength(2);
		expect(restoredAdj.effects?.[0]?.type).toBe('vignette');
		expect(restoredAdj.effects?.[0]?.params.amount).toBe(0.6);

		// Check Solid Color Layer & 3D LUT
		const restoredSolid = restoredTrack.clips[2]!;
		expect(restoredSolid.source).toEqual({
			type: 'solid',
			color: { r: 1, g: 0.2, b: 0.4, a: 1 }
		});
		expect(restoredSolid.effects).toHaveLength(2);
		const restoredLut = restoredSolid.effects?.find((e) => e.type === 'lut3d');
		expect(restoredLut).toBeDefined();
		expect(restoredLut?.params.lutAssetId).toBe(lutAssetId);
		expect(restoredLut?.params.intensity).toBe(0.85);

		// Verify asset metadata for LUT is restored
		expect(restored.assets[lutAssetId]).toBeDefined();
		expect(restored.assets[lutAssetId]?.kind).toBe('lut');
		expect(restored.assets[lutAssetId]?.name).toBe('creative_teal_orange.cube');
	});
});
