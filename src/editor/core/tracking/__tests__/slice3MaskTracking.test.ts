import { describe, expect, it } from 'vitest';
import type { Clip, ClipId, Keyframe, Mask, MaskPoint, Tracker, TrackerId } from '../../types';
import {
	bakeTrackingToMask,
	transformEllipseShape,
	transformPathPoints,
	transformRectShape
} from '../maskTracking';
import { evaluateMask } from '../../masks';

describe('Slice 3: Mask Tracking (shapes, paths, bezier tangents, invert, keyframing)', () => {
	const mockTracker: Tracker = {
		id: 'tracker-1' as TrackerId,
		name: 'Tracker 1',
		type: 'point',
		enabled: true,
		seedTime: 0,
		initialRegion: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 },
		params: {
			trackTranslation: true,
			trackRotation: true,
			trackScale: true,
			pyramidLevels: 3,
			searchRadiusPx: 25,
			maxIterations: 20,
			tolerance: 0.01,
			nccThreshold: 0.7,
			huberThreshold: 1.5,
			confidenceThreshold: 0.5
		},
		samples: [
			// Translates +0.1 in x, +0.05 in y, rotates 90 deg (PI/2), scales 2x
			{ sourceTime: 0, x: 0.5, y: 0.5, rotation: 0, scale: 1.0, confidence: 0.95 },
			{
				sourceTime: 1_000_000,
				x: 0.6,
				y: 0.55,
				rotation: Math.PI / 2,
				scale: 2.0,
				confidence: 0.95
			}
		]
	};

	it('1. Transforms RectShape geometry by translation, rotation, and scale', () => {
		const baseRect = [0.5, 0.5, 0.2, 0.2, 0, 0]; // center (0.5, 0.5), size 0.2x0.2
		const delta = {
			dx: 0.1,
			dy: 0.05,
			rotationRad: Math.PI / 2, // 90 deg
			scale: 1.5
		};
		const origin = { x: 0.5, y: 0.5 };

		const transformed = transformRectShape(baseRect, origin, delta);

		// Center moves by dx, dy
		expect(transformed[0]).toBeCloseTo(0.6, 5);
		expect(transformed[1]).toBeCloseTo(0.55, 5);
		// Width and height scale by 1.5
		expect(transformed[2]).toBeCloseTo(0.3, 5);
		expect(transformed[3]).toBeCloseTo(0.3, 5);
		// Rotation increases by 90 deg
		expect(transformed[4]).toBeCloseTo(90, 5);
	});

	it('2. Transforms EllipseShape geometry by translation, rotation, and scale', () => {
		const baseEllipse = [0.5, 0.5, 0.15, 0.1, 10];
		const delta = {
			dx: -0.05,
			dy: 0.08,
			rotationRad: Math.PI / 4, // 45 deg
			scale: 2.0
		};
		const origin = { x: 0.5, y: 0.5 };

		const transformed = transformEllipseShape(baseEllipse, origin, delta);

		expect(transformed[0]).toBeCloseTo(0.45, 5);
		expect(transformed[1]).toBeCloseTo(0.58, 5);
		expect(transformed[2]).toBeCloseTo(0.3, 5);
		expect(transformed[3]).toBeCloseTo(0.2, 5);
		expect(transformed[4]).toBeCloseTo(10 + 45, 5);
	});

	it('3. Transforms PathMask vertices and preserves bezier tangents rigidly rotated and scaled', () => {
		const basePoints: MaskPoint[] = [
			{
				x: 0.4,
				y: 0.5,
				inHandle: { x: 0.38, y: 0.48 },
				outHandle: { x: 0.42, y: 0.52 }
			},
			{
				x: 0.6,
				y: 0.5,
				inHandle: { x: 0.58, y: 0.48 },
				outHandle: { x: 0.62, y: 0.52 }
			}
		];
		const origin = { x: 0.5, y: 0.5 };
		const delta = {
			dx: 0.05,
			dy: -0.02,
			rotationRad: Math.PI / 2, // 90 deg
			scale: 1.0
		};

		const transformed = transformPathPoints(basePoints, origin, delta);

		expect(transformed.length).toBe(2);

		// First point was at (0.4, 0.5) relative to (0.5, 0.5): offset (-0.1, 0)
		// 90 deg rotation maps (-0.1, 0) to (0, -0.1)
		// Uncenter + delta: (0.5 + 0 + 0.05, 0.5 - 0.1 - 0.02) = (0.55, 0.38)
		expect(transformed[0]!.x).toBeCloseTo(0.55, 4);
		expect(transformed[0]!.y).toBeCloseTo(0.38, 4);

		// Verify inHandle and outHandle exist and rotate consistently
		expect(transformed[0]!.inHandle).toBeDefined();
		expect(transformed[0]!.outHandle).toBeDefined();

		// Handle vectors relative to vertex:
		// Base outHandle relative: (0.42 - 0.4, 0.52 - 0.5) = (+0.02, +0.02)
		// 90 deg rotated: (-0.02, +0.02)
		const outRelX = transformed[0]!.outHandle!.x - transformed[0]!.x;
		const outRelY = transformed[0]!.outHandle!.y - transformed[0]!.y;
		expect(outRelX).toBeCloseTo(-0.02, 4);
		expect(outRelY).toBeCloseTo(0.02, 4);
	});

	it('4. Bakes tracking to mask shape keyframes and verifies evaluation along timeline', () => {
		const mask: Mask = {
			id: 'mask-1',
			name: 'Test Rect Mask',
			type: 'rect',
			mode: 'add',
			inverted: false,
			feather: 10,
			expansion: 5,
			opacity: 1,
			shape: [0.5, 0.5, 0.3, 0.3, 0, 0]
		};

		const clip: Clip = {
			id: 'clip-1' as ClipId,
			start: 0,
			duration: 1_000_000,
			sourceIn: 0,
			sourceOut: 1_000_000,
			speed: 1,
			volume: 1,
			masks: [mask],
			trackers: [mockTracker]
		};

		const bakedShapeAnim = bakeTrackingToMask(clip, mask.id, mockTracker, 30, 0.1, 1920, 1080);

		expect(bakedShapeAnim).not.toBeNull();
		expect('keyframes' in bakedShapeAnim!).toBe(true);
		const kfs = (bakedShapeAnim as { keyframes: Keyframe<number[]>[] }).keyframes;
		expect(kfs.length).toBeGreaterThanOrEqual(2);

		// Attach baked keyframes onto clip
		const shapePropId = `mask:${mask.id}:shape`;
		const clipWithBaked: Clip = {
			...clip,
			properties: {
				[shapePropId]: bakedShapeAnim!
			}
		};

		// Evaluate mask at start (t = 0)
		const evalAt0 = evaluateMask(mask, 0, clipWithBaked.properties);
		expect(evalAt0.shape[0]).toBeCloseTo(0.5, 2);
		expect(evalAt0.shape[1]).toBeCloseTo(0.5, 2);
		expect(evalAt0.shape[2]).toBeCloseTo(0.3, 2);

		// Evaluate mask at end (t = 1s, source time 1s)
		const evalAtEnd = evaluateMask(mask, 1_000_000, clipWithBaked.properties);
		// Center shifted +0.1 in x, +0.05 in y -> (0.6, 0.55)
		expect(evalAtEnd.shape[0]).toBeCloseTo(0.6, 2);
		expect(evalAtEnd.shape[1]).toBeCloseTo(0.55, 2);
		// Size scaled 2x -> 0.6
		expect(evalAtEnd.shape[2]).toBeCloseTo(0.6, 2);
		expect(evalAtEnd.shape[3]).toBeCloseTo(0.6, 2);
	});

	it('5. Invert and effect-mask properties remain preserved when shape is tracked', () => {
		const mask: Mask = {
			id: 'mask-inv',
			name: 'Inverted Effect Mask',
			type: 'rect',
			mode: 'subtract',
			inverted: true,
			feather: 15,
			expansion: -2,
			opacity: 0.8,
			effectId: 'effect-color-1',
			shape: [0.5, 0.5, 0.2, 0.2, 0, 0]
		};

		const clip: Clip = {
			id: 'clip-inv' as ClipId,
			start: 0,
			duration: 1_000_000,
			sourceIn: 0,
			sourceOut: 1_000_000,
			speed: 1,
			volume: 1,
			masks: [mask],
			trackers: [mockTracker]
		};

		const baked = bakeTrackingToMask(clip, mask.id, mockTracker, 30, 0.1, 1920, 1080);
		expect(baked).not.toBeNull();

		const evaluated = evaluateMask(mask, 500_000, {
			[`mask:${mask.id}:shape`]: baked!
		});

		expect(evaluated.inverted).toBe(true);
		expect(evaluated.mode).toBe('subtract');
		expect(evaluated.effectId).toBe('effect-color-1');
		expect(evaluated.feather).toBe(15);
		expect(evaluated.expansion).toBe(-2);
		expect(evaluated.opacity).toBe(0.8);
	});
});
