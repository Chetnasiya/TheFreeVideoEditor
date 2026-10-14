import { describe, expect, it } from 'vitest';
import {
	createSeededRandom,
	downscaleGray,
	estimateSimilarity2Points,
	evaluateTracker,
	extractNormalizedPatch,
	gaussianBlur3x3,
	matchTemplateNcc,
	ransacSimilarity,
	refineLkSingleScale,
	smoothSamples,
	toGrayscale,
	type GrayImage,
	type PointCorrespondence,
	type Tracker,
	type TrackerSample
} from '../index';
import type { TrackerId } from '../../types';

describe('Image preparation & Pyramid', () => {
	it('converts RGBA to grayscale using Rec.709 coefficients', () => {
		// Pure Red (255, 0, 0) => 0.2126
		const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
		const gray = toGrayscale(rgba, 3, 1);
		expect(gray.width).toBe(3);
		expect(gray.height).toBe(1);
		expect(gray.data[0]).toBeCloseTo(0.2126, 3);
		expect(gray.data[1]).toBeCloseTo(0.7152, 3);
		expect(gray.data[2]).toBeCloseTo(0.0722, 3);
	});

	it('downscales and blurs deterministically', () => {
		const img: GrayImage = {
			width: 4,
			height: 4,
			data: new Float32Array([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1])
		};
		const blurred = gaussianBlur3x3(img);
		expect(blurred.width).toBe(4);
		expect(blurred.data.length).toBe(16);
		// Center pixels must be smoothed between 0 and 1
		expect(blurred.data[5]).toBeGreaterThan(0.2);
		expect(blurred.data[5]).toBeLessThan(0.8);

		const down = downscaleGray(img, 2, 2);
		expect(down.width).toBe(2);
		expect(down.height).toBe(2);
	});
});

describe('Normalized Cross-Correlation (NCC) Matcher', () => {
	it('recovers integer translation exactly against ground truth synthetic pattern', () => {
		const W = 64;
		const H = 64;
		const img1Data = new Float32Array(W * H);
		const img2Data = new Float32Array(W * H);

		// Place a distinct 5x5 square pattern at (20, 20) in img1 and (26, 23) in img2 (dx=+6, dy=+3)
		for (let y = 18; y <= 22; y++) {
			for (let x = 18; x <= 22; x++) {
				img1Data[y * W + x] = 1.0;
			}
		}
		for (let y = 21; y <= 25; y++) {
			for (let x = 24; x <= 28; x++) {
				img2Data[y * W + x] = 1.0;
			}
		}

		const img1: GrayImage = { data: img1Data, width: W, height: H };
		const img2: GrayImage = { data: img2Data, width: W, height: H };

		const patch = extractNormalizedPatch(img1, 20, 20, 4, 4);
		expect(patch).not.toBeNull();

		const match = matchTemplateNcc(img2, patch!.patch, patch!.norm, 4, 4, 20, 20, 10);
		expect(match.score).toBeGreaterThan(0.95);
		expect(Math.round(match.x)).toBe(26);
		expect(Math.round(match.y)).toBe(23);
	});
});

describe('Inverse-Compositional Lucas-Kanade (LK) Refinement', () => {
	it('recovers sub-pixel translation within 0.05 px error', () => {
		const W = 64;
		const H = 64;
		// Smooth Gaussian spot with known analytical subpixel displacement
		const trueDx = 2.35;
		const trueDy = -1.45;

		const img1Data = new Float32Array(W * H);
		const img2Data = new Float32Array(W * H);

		const c1x = 30.0;
		const c1y = 30.0;
		const c2x = c1x + trueDx;
		const c2y = c1y + trueDy;
		const sigmaSq = 16.0;

		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				const d1 = (x - c1x) * (x - c1x) + (y - c1y) * (y - c1y);
				img1Data[y * W + x] = Math.exp(-d1 / sigmaSq);

				const d2 = (x - c2x) * (x - c2x) + (y - c2y) * (y - c2y);
				img2Data[y * W + x] = Math.exp(-d2 / sigmaSq);
			}
		}

		const tImg: GrayImage = { data: img1Data, width: W, height: H };
		const tgtImg: GrayImage = { data: img2Data, width: W, height: H };

		const res = refineLkSingleScale(
			tImg,
			tgtImg,
			c1x,
			c1y,
			8,
			8,
			{ x: c1x + 2, y: c1y - 1, rotation: 0, scale: 1 }, // initial rough guess within 0.5px
			{
				trackRotation: false,
				trackScale: false,
				maxIterations: 20,
				tolerance: 1e-4,
				huberThreshold: 0.1
			}
		);

		const recoveredDx = res.state.x - c1x;
		const recoveredDy = res.state.y - c1y;

		expect(Math.abs(recoveredDx - trueDx)).toBeLessThan(0.05);
		expect(Math.abs(recoveredDy - trueDy)).toBeLessThan(0.05);
	});
});

describe('RANSAC & Similarity Solver', () => {
	it('recovers rotation and scale from 2 correspondences analytically', () => {
		const p1: PointCorrespondence = { x1: 10, y1: 10, x2: 20, y2: 30 };
		// True transform: scale = 2.0, rotation = 90 deg (pi/2)
		// R = [0, -1; 1, 0] * 2 = [0, -2; 2, 0]
		// [x2, y2] = [ -2*y1 + tx, 2*x1 + ty ]
		// For p1=(10,10): [-20 + tx, 20 + ty] = [20, 30] => tx = 40, ty = 10
		// For p2=(20, 10): [-20 + 40, 40 + 10] = [20, 50]
		const p2: PointCorrespondence = { x1: 20, y1: 10, x2: 20, y2: 50 };

		const model = estimateSimilarity2Points(p1, p2);
		expect(model).not.toBeNull();
		expect(model!.scale).toBeCloseTo(2.0, 5);
		expect(model!.rotation).toBeCloseTo(Math.PI / 2, 5);
		expect(model!.tx).toBeCloseTo(40, 5);
		expect(model!.ty).toBeCloseTo(10, 5);
	});

	it('RANSAC is strictly deterministic across runs with seeded PRNG', () => {
		const rng = createSeededRandom(1337);
		const pairs: PointCorrespondence[] = [];
		// 20 inliers + 10 outliers
		for (let i = 0; i < 20; i++) {
			const x1 = rng() * 100;
			const y1 = rng() * 100;
			pairs.push({ x1, y1, x2: x1 + 5.0, y2: y1 - 3.0 });
		}
		for (let i = 0; i < 10; i++) {
			pairs.push({ x1: rng() * 100, y1: rng() * 100, x2: rng() * 100, y2: rng() * 100 });
		}

		const run1 = ransacSimilarity(pairs, 50, 1.0, 42);
		const run2 = ransacSimilarity(pairs, 50, 1.0, 42);

		expect(run1.tx).toBe(run2.tx);
		expect(run1.ty).toBe(run2.ty);
		expect(run1.rotation).toBe(run2.rotation);
		expect(run1.scale).toBe(run2.scale);
		expect(run1.inliers).toEqual(run2.inliers);
		expect(run1.tx).toBeCloseTo(5.0, 1);
		expect(run1.ty).toBeCloseTo(-3.0, 1);
	});
});

describe('evaluateTracker & Smoothing', () => {
	it('interpolates intermediate frame position smoothly', () => {
		const tracker: Tracker = {
			id: 'trk-1' as TrackerId,
			name: 'Test Tracker',
			type: 'point',
			enabled: true,
			seedTime: 1_000_000,
			initialRegion: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 },
			params: {
				trackTranslation: true,
				trackRotation: false,
				trackScale: false,
				pyramidLevels: 3,
				searchRadiusPx: 20,
				maxIterations: 15,
				tolerance: 0.01,
				nccThreshold: 0.8,
				huberThreshold: 0.1,
				confidenceThreshold: 0.6
			},
			samples: [
				{ sourceTime: 1_000_000, x: 0.2, y: 0.3, rotation: 0, scale: 1, confidence: 1.0 },
				{ sourceTime: 2_000_000, x: 0.4, y: 0.7, rotation: 0, scale: 1, confidence: 1.0 }
			]
		};

		const mid = evaluateTracker(tracker, 1_500_000);
		expect(mid.x).toBeCloseTo(0.3, 5);
		expect(mid.y).toBeCloseTo(0.5, 5);
		expect(mid.confidence).toBe(1.0);
		expect(mid.lost).toBe(false);
	});

	it('smooths noisy jitter samples with Gaussian window filter', () => {
		const noisySamples: TrackerSample[] = [
			{ sourceTime: 0, x: 10, y: 10, rotation: 0, scale: 1, confidence: 1 },
			{ sourceTime: 10, x: 14, y: 8, rotation: 0, scale: 1, confidence: 1 },
			{ sourceTime: 20, x: 8, y: 12, rotation: 0, scale: 1, confidence: 1 },
			{ sourceTime: 30, x: 12, y: 9, rotation: 0, scale: 1, confidence: 1 },
			{ sourceTime: 40, x: 10, y: 10, rotation: 0, scale: 1, confidence: 1 }
		];

		const smoothed = smoothSamples(noisySamples, {
			enabled: true,
			windowFrames: 5,
			positionSigma: 1.5
		});

		expect(smoothed.length).toBe(5);
		// Center sample (idx 2, x=8) should be pulled closer to 10
		expect(smoothed[2]!.x).toBeGreaterThan(8.5);
		expect(smoothed[2]!.x).toBeLessThan(11.5);
	});

	it('merges backward and forward samples maintaining strict ascending order and seamless evaluation', () => {
		// Forward tracking from 1s to 2s
		const forwardSamples: TrackerSample[] = [
			{ sourceTime: 1_000_000, x: 0.5, y: 0.5, rotation: 0, scale: 1, confidence: 1 },
			{ sourceTime: 1_500_000, x: 0.6, y: 0.55, rotation: 0, scale: 1.1, confidence: 1 },
			{ sourceTime: 2_000_000, x: 0.7, y: 0.6, rotation: 0, scale: 1.2, confidence: 1 }
		];

		// Backward tracking from 1s down to 0s (received in descending order from backward pass)
		const backwardSamples: TrackerSample[] = [
			{ sourceTime: 1_000_000, x: 0.5, y: 0.5, rotation: 0, scale: 1, confidence: 1 },
			{ sourceTime: 500_000, x: 0.4, y: 0.45, rotation: 0, scale: 0.9, confidence: 1 },
			{ sourceTime: 0, x: 0.3, y: 0.4, rotation: 0, scale: 0.8, confidence: 1 }
		];

		// Deduplicate by timestamp and sort ascending
		const sampleMap = new Map<number, TrackerSample>();
		for (const s of forwardSamples) sampleMap.set(s.sourceTime, s);
		for (const s of backwardSamples) sampleMap.set(s.sourceTime, s);
		const mergedSamples = Array.from(sampleMap.values()).sort(
			(a, b) => a.sourceTime - b.sourceTime
		);

		expect(mergedSamples.length).toBe(5);
		expect(mergedSamples.map((s) => s.sourceTime)).toEqual([
			0, 500_000, 1_000_000, 1_500_000, 2_000_000
		]);

		const tracker: Tracker = {
			id: 'trk-bidirectional' as TrackerId,
			name: 'Bidirectional Tracker',
			type: 'point',
			enabled: true,
			seedTime: 1_000_000,
			initialRegion: { x: 0.5, y: 0.5, width: 0.08, height: 0.08, searchMultiplier: 2.5 },
			params: {
				trackTranslation: true,
				trackRotation: false,
				trackScale: true,
				pyramidLevels: 4,
				searchRadiusPx: 32,
				maxIterations: 25,
				tolerance: 0.01,
				nccThreshold: 0.5,
				huberThreshold: 0.1,
				confidenceThreshold: 0.4
			},
			samples: mergedSamples
		};

		// Test evaluation at backward time 250ms
		const earlyState = evaluateTracker(tracker, 250_000);
		expect(earlyState.x).toBeCloseTo(0.35, 4);
		expect(earlyState.y).toBeCloseTo(0.425, 4);
		expect(earlyState.scale).toBeCloseTo(0.85, 4);

		// Test evaluation at forward time 1750ms
		const lateState = evaluateTracker(tracker, 1_750_000);
		expect(lateState.x).toBeCloseTo(0.65, 4);
		expect(lateState.y).toBeCloseTo(0.575, 4);
		expect(lateState.scale).toBeCloseTo(1.15, 4);
	});

	it('supports configuring tracker box dimensions and search multipliers', () => {
		const tracker: Tracker = {
			id: 'trk-size' as TrackerId,
			name: 'Size Tracker',
			type: 'point',
			enabled: true,
			seedTime: 0,
			initialRegion: { x: 0.5, y: 0.5, width: 0.15, height: 0.12, searchMultiplier: 3.5 },
			params: {
				trackTranslation: true,
				trackRotation: false,
				trackScale: false,
				pyramidLevels: 4,
				searchRadiusPx: 48,
				maxIterations: 25,
				tolerance: 0.01,
				nccThreshold: 0.5,
				huberThreshold: 0.1,
				confidenceThreshold: 0.4
			},
			samples: []
		};

		expect(tracker.initialRegion.width).toBe(0.15);
		expect(tracker.initialRegion.height).toBe(0.12);
		expect(tracker.initialRegion.searchMultiplier).toBe(3.5);
	});
});
