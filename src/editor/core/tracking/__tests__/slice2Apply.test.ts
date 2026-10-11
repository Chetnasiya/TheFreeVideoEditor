import { describe, expect, it } from 'vitest';
import type {
	Asset,
	AssetId,
	Clip,
	ClipId,
	Keyframe,
	Project,
	ProjectId,
	Tracker,
	TrackerId,
	TrackId
} from '../../types';
import {
	bakeTrackingToKeyframes,
	captureBindingOffsets,
	evaluateLiveTrackingBinding,
	thinPositionKeyframes,
	trackedPointToComposition
} from '../apply';

describe('Slice 2: Apply, Follow (Live), Bake, Offsets & Time Mapping', () => {
	const mockTrackedClip: Clip = {
		id: 'clip-video' as ClipId,
		start: 1_000_000, // starts at 1s
		duration: 4_000_000, // 4s long (ends at 5s)
		sourceIn: 500_000, // trimmed: source 0.5s - 4.5s
		sourceOut: 4_500_000,
		speed: 1,
		volume: 1,
		trackers: []
	};

	const mockTracker: Tracker = {
		id: 'tracker-1' as TrackerId,
		name: 'Tracker 1',
		type: 'point',
		enabled: true,
		seedTime: 500_000,
		initialRegion: { x: 0.2, y: 0.3, width: 0.05, height: 0.05 },
		params: {
			trackTranslation: true,
			trackRotation: false,
			trackScale: false,
			pyramidLevels: 3,
			searchRadiusPx: 25,
			maxIterations: 20,
			tolerance: 0.01,
			nccThreshold: 0.7,
			huberThreshold: 1.5,
			confidenceThreshold: 0.5
		},
		samples: [
			// Source times: 0.5s (u: 0.2, v: 0.3) -> 1.5s (u: 0.4, v: 0.5) -> 2.5s (u: 0.6, v: 0.7)
			{ sourceTime: 500_000, x: 0.2, y: 0.3, rotation: 0, scale: 1, confidence: 0.95 },
			{ sourceTime: 1_500_000, x: 0.4, y: 0.5, rotation: 0, scale: 1, confidence: 0.95 },
			{ sourceTime: 2_500_000, x: 0.6, y: 0.7, rotation: 0, scale: 1, confidence: 0.95 },
			{ sourceTime: 3_500_000, x: 0.8, y: 0.9, rotation: 0, scale: 1, confidence: 0.95 }
		]
	};

	const mockTargetClip: Clip = {
		id: 'clip-text' as ClipId,
		start: 1_000_000,
		duration: 4_000_000,
		sourceIn: 0,
		sourceOut: 4_000_000,
		speed: 1,
		volume: 1,
		properties: {
			position: {
				keyframes: [{ time: 0, value: [100, 50], interpolation: 'linear' }]
			}
		}
	};

	const testAssetId = 'asset-1' as AssetId;
	const mockAssets: Record<AssetId, Asset> = {
		[testAssetId]: {
			id: testAssetId,
			name: 'test.mp4',
			kind: 'video',
			width: 1920,
			height: 1080,
			duration: 10_000_000,
			fps: 30,
			mimeType: 'video/mp4',
			size: 1000,
			hasAudio: false,
			opfsPath: '/test.mp4'
		}
	};

	const mockProject: Project = {
		id: 'proj-1' as ProjectId,
		schemaVersion: 1,
		name: 'Test Project',
		createdAt: '2026-01-01',
		updatedAt: '2026-01-01',
		markers: [],
		settings: {
			width: 1920,
			height: 1080,
			fps: 30,
			sampleRate: 48000
		},
		assets: mockAssets,
		tracks: [
			{
				id: 't1' as TrackId,
				kind: 'video',
				name: 'V1',
				muted: false,
				locked: false,
				hidden: false,
				clips: [mockTrackedClip]
			},
			{
				id: 't2' as TrackId,
				kind: 'video',
				name: 'V2',
				muted: false,
				locked: false,
				hidden: false,
				clips: [mockTargetClip]
			}
		]
	};

	it('1. Maps normalized tracked point through crop, layerAffine to composition coordinates', () => {
		// Centered 1920x1080 frame with unit quad mapping:
		// [0.5, 0.5] should map to composition center [0, 0]
		const compCenter = trackedPointToComposition(
			mockTrackedClip,
			{
				sourceTime: 0,
				x: 0.5,
				y: 0.5,
				rotation: 0,
				scale: 1,
				confidence: 1,
				lost: false,
				inBounds: true
			},
			1920,
			1080,
			1920,
			1080,
			0
		);
		expect(Math.abs(compCenter.x)).toBeLessThan(0.01);
		expect(Math.abs(compCenter.y)).toBeLessThan(0.01);

		// [0, 0] (top-left) in a 1920x1080 comp with standard fit maps to [-960, -540]
		const topLeft = trackedPointToComposition(
			mockTrackedClip,
			{
				sourceTime: 0,
				x: 0,
				y: 0,
				rotation: 0,
				scale: 1,
				confidence: 1,
				lost: false,
				inBounds: true
			},
			1920,
			1080,
			1920,
			1080,
			0
		);
		expect(topLeft.x).toBeCloseTo(-960, 1);
		expect(topLeft.y).toBeCloseTo(-540, 1);
	});

	it('2. Live Follow binding: computes position offset and follows motion accurately', () => {
		const offsets = captureBindingOffsets(
			mockProject,
			mockTrackedClip,
			mockTargetClip,
			mockTracker,
			1_000_000, // clip start = source time 500_000
			1920,
			1080
		);

		const trackerWithBinding: Tracker = {
			...mockTracker,
			binding: {
				targetClipId: mockTargetClip.id,
				applyPosition: true,
				applyRotation: false,
				applyScale: false,
				offsetPosition: offsets.offsetPosition,
				offsetRotation: offsets.offsetRotation,
				offsetScale: offsets.offsetScale
			}
		};

		// At reference time t = 1_000_000:
		const evalAtRef = evaluateLiveTrackingBinding(
			mockProject,
			mockTrackedClip,
			trackerWithBinding,
			1_000_000,
			1920,
			1080
		);

		// Target initial position was [100, 50]. At reference time, it must exactly reproduce [100, 50]
		expect(evalAtRef).not.toBeNull();
		expect(evalAtRef!.position[0]).toBeCloseTo(100, 1);
		expect(evalAtRef!.position[1]).toBeCloseTo(50, 1);

		// At timeline time t = 2_000_000 (source time 1_500_000, point moved from [0.2, 0.3] to [0.4, 0.5]):
		// Delta in normalized u: +0.2 (0.2 * 1920 = +384 px), v: +0.2 (0.2 * 1080 = +216 px)
		const evalAtNext = evaluateLiveTrackingBinding(
			mockProject,
			mockTrackedClip,
			trackerWithBinding,
			2_000_000,
			1920,
			1080
		);

		expect(evalAtNext).not.toBeNull();
		expect(evalAtNext!.position[0]).toBeCloseTo(100 + 384, 1);
		expect(evalAtNext!.position[1]).toBeCloseTo(50 + 216, 1);
	});

	it('3. Outside clip range: target outside tracked clip range is inactive / falls back gracefully', () => {
		const trackerWithBinding: Tracker = {
			...mockTracker,
			binding: {
				targetClipId: mockTargetClip.id,
				applyPosition: true,
				applyRotation: false,
				applyScale: false,
				offsetPosition: [0, 0],
				offsetRotation: 0,
				offsetScale: [1, 1]
			}
		};

		// Before tracked clip start (t = 500_000, tracked clip starts at 1_000_000)
		const evalOutside = evaluateLiveTrackingBinding(
			mockProject,
			mockTrackedClip,
			trackerWithBinding,
			500_000,
			1920,
			1080
		);

		// When inactive/outside, returns inactive state
		expect(evalOutside).not.toBeNull();
		expect(evalOutside!.active).toBe(false);
	});

	it('4. Time mapping: speed 200% correctly maps timeline intervals to source intervals', () => {
		const clip200: Clip = {
			...mockTrackedClip,
			speed: 2.0 // 2x speed: 1 second on timeline = 2 seconds of media
		};

		const offsets = captureBindingOffsets(
			mockProject,
			clip200,
			mockTargetClip,
			mockTracker,
			1_000_000,
			1920,
			1080
		);

		const trackerWithBinding: Tracker = {
			...mockTracker,
			binding: {
				targetClipId: mockTargetClip.id,
				applyPosition: true,
				applyRotation: false,
				applyScale: false,
				offsetPosition: offsets.offsetPosition,
				offsetRotation: offsets.offsetRotation,
				offsetScale: offsets.offsetScale
			}
		};

		// At t = 1.5s (+0.5s timeline -> +1.0s source -> sourceTime = 500_000 + 1_000_000 = 1_500_000)
		const evalAt15 = evaluateLiveTrackingBinding(
			mockProject,
			clip200,
			trackerWithBinding,
			1_500_000,
			1920,
			1080
		);

		// Target tracked sample at 1_500_000 has u = 0.4, v = 0.5 (delta +384, +216)
		expect(evalAt15).not.toBeNull();
		expect(evalAt15!.position[0]).toBeCloseTo(100 + 384, 1);
		expect(evalAt15!.position[1]).toBeCloseTo(50 + 216, 1);
	});

	it('5. Bake to Keyframes: baked keyframes equal live evaluation within <= 0.5 px', () => {
		const trackerWithBinding: Tracker = {
			...mockTracker,
			binding: {
				targetClipId: mockTargetClip.id,
				applyPosition: true,
				applyRotation: false,
				applyScale: false,
				offsetPosition: [0, 0],
				offsetRotation: 0,
				offsetScale: [1, 1]
			}
		};

		const bakedProps = bakeTrackingToKeyframes(
			mockProject,
			mockTrackedClip,
			mockTargetClip,
			trackerWithBinding,
			0.1, // fine tolerance
			1920,
			1080
		);

		expect(bakedProps.position).toBeDefined();
		expect('keyframes' in bakedProps.position!).toBe(true);
		const kfs = (bakedProps.position as { keyframes: Keyframe<[number, number]>[] }).keyframes;
		expect(kfs.length).toBeGreaterThanOrEqual(2);

		// Sample across clip duration and verify baked matches live
		for (
			let t = mockTrackedClip.start;
			t < mockTrackedClip.start + mockTrackedClip.duration;
			t += 500_000
		) {
			const live = evaluateLiveTrackingBinding(
				mockProject,
				mockTrackedClip,
				trackerWithBinding,
				t,
				1920,
				1080
			);

			// Interpolate baked keyframes at time t
			// Note: keyframe times are local to targetClip: localTime = t - targetClip.start
			const targetLocalTime = t - mockTargetClip.start;
			if (!live || !live.position) continue;

			let bakedVal: [number, number] | null = null;
			for (let i = 0; i < kfs.length - 1; i++) {
				if (targetLocalTime >= kfs[i]!.time && targetLocalTime <= kfs[i + 1]!.time) {
					const span = kfs[i + 1]!.time - kfs[i]!.time;
					const alpha = span > 0 ? (targetLocalTime - kfs[i]!.time) / span : 0;
					const v0 = kfs[i]!.value as [number, number];
					const v1 = kfs[i + 1]!.value as [number, number];
					bakedVal = [v0[0] + alpha * (v1[0] - v0[0]), v0[1] + alpha * (v1[1] - v0[1])];
					break;
				}
			}

			if (bakedVal) {
				const dx = Math.abs(bakedVal[0] - live.position[0]);
				const dy = Math.abs(bakedVal[1] - live.position[1]);
				expect(dx).toBeLessThanOrEqual(0.5);
				expect(dy).toBeLessThanOrEqual(0.5);
			}
		}
	});

	it('6. Douglas-Peucker thinning: reduces redundant collinear keyframes while respecting tolerance', () => {
		// 10 collinear points along a line
		const linearKfs = Array.from({ length: 10 }, (_, i) => ({
			id: `k-${i}`,
			time: i * 100_000,
			value: [i * 10, i * 20] as [number, number],
			interpolation: 'linear' as const
		}));

		const thinned = thinPositionKeyframes(linearKfs, 0.5);
		// Perfect line should be thinned down to just the start and end keyframes
		expect(thinned.length).toBe(2);
		expect(thinned[0].time).toBe(linearKfs[0].time);
		expect(thinned[1].time).toBe(linearKfs[linearKfs.length - 1].time);
	});
});
