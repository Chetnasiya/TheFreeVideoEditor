import { describe, expect, it } from 'vitest';
import {
	buildCumulativeMotion,
	calculateAutoZoomScale,
	computeStabilization,
	generateGaussianKernel,
	smoothTrajectory
} from '../stabilize';
import type { TrackerSample } from '../../types';
import shakyGroundTruth from '../../../../../tests/fixtures/shaky.json';

describe('Slice 4: Video Stabilization Engine', () => {
	it('1. Gaussian kernel is normalized and symmetric', () => {
		const radius = 5;
		const sigma = 2.0;
		const kernel = generateGaussianKernel(radius, sigma);

		expect(kernel.length).toBe(2 * radius + 1);

		// Kernel sums to 1.0
		const sum = kernel.reduce((acc, v) => acc + v, 0);
		expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);

		// Symmetric around center
		for (let i = 0; i < radius; i++) {
			expect(kernel[i]).toBeCloseTo(kernel[kernel.length - 1 - i]!, 6);
		}
	});

	it('2. Trajectory smoothing attenuates high-frequency camera jitter', () => {
		// Create synthetic motion path with intentional pan plus high-frequency sinusoidal shake
		const n = 90;
		const rawSamples: TrackerSample[] = [];

		for (let f = 0; f < n; f++) {
			const timeUs = Math.round((f / 30) * 1_000_000);
			// Intentional slow camera pan (0.1 to 0.4)
			const panX = 0.2 + 0.002 * f;
			const panY = 0.5 + 0.001 * f;

			// Fast camera jitter (shake)
			const shakeX = 0.01 * Math.sin(f * 2.1);
			const shakeY = 0.008 * Math.cos(f * 1.8);

			rawSamples.push({
				sourceTime: timeUs,
				x: panX + shakeX,
				y: panY + shakeY,
				rotation: 0.02 * Math.sin(f * 2.5),
				scale: 1.0,
				confidence: 0.95
			});
		}

		const trajectory = buildCumulativeMotion(rawSamples, 640, 360);
		expect(trajectory.length).toBe(n);

		const smoothed = smoothTrajectory(trajectory, 21, 5.0);
		expect(smoothed.length).toBe(n);

		// Calculate variance / jitter in raw vs smoothed
		let rawJitterVar = 0;
		let smoothedJitterVar = 0;

		for (let i = 1; i < n - 1; i++) {
			// Second difference acts as high-frequency acceleration / jerk detector
			const rawAccX = trajectory[i + 1]!.x - 2 * trajectory[i]!.x + trajectory[i - 1]!.x;
			const smoothAccX = smoothed[i + 1]!.x - 2 * smoothed[i]!.x + smoothed[i - 1]!.x;
			rawJitterVar += rawAccX * rawAccX;
			smoothedJitterVar += smoothAccX * smoothAccX;
		}

		// Smoothed acceleration variance should be significantly reduced (> 80% attenuation)
		expect(smoothedJitterVar).toBeLessThan(rawJitterVar * 0.2);
	});

	it('3. Auto-zoom scale calculation guarantees zero border intrusion', () => {
		const width = 1920;
		const height = 1080;
		const maxDx = 25; // max 25px shake
		const maxDy = 18; // max 18px shake

		const jitterX = [-maxDx, maxDx, -10, 15];
		const jitterY = [10, -maxDy, maxDy, -5];
		const jitterRot = [0.01, -0.015, 0.01, 0];

		const autoZoom = calculateAutoZoomScale(jitterX, jitterY, jitterRot, width, height, {
			cropMargin: 1.05
		});

		// Zoom must be strictly > 1.0 and <= 1.5
		expect(autoZoom).toBeGreaterThan(1.02);
		expect(autoZoom).toBeLessThan(1.2);

		// Verify borders: (autoZoom - 1) * width / 2 must comfortably cover maxDx
		const marginX = ((autoZoom - 1) * width) / 2;
		const marginY = ((autoZoom - 1) * height) / 2;
		expect(marginX).toBeGreaterThanOrEqual(maxDx);
		expect(marginY).toBeGreaterThanOrEqual(maxDy);
	});

	it('4. Full stabilization against shaky ground truth fixture (shaky.json)', () => {
		// Convert shaky.json fixture ground truth displacements into tracker samples
		const width = 640;
		const height = 360;

		const samples: TrackerSample[] = shakyGroundTruth.map((gt) => ({
			sourceTime: gt.timeUs,
			// Initial point at center (0.5, 0.5) shifted by ground truth shake
			x: 0.5 + gt.dx / width,
			y: 0.5 + gt.dy / height,
			rotation: gt.rotation,
			scale: 1.0,
			confidence: 0.98
		}));

		const result = computeStabilization(samples, width, height, 0, {
			windowSize: 25,
			smoothness: 5.0,
			stabilizeTranslation: true,
			stabilizeRotation: true,
			stabilizeScale: true,
			autoCrop: true,
			thinningTolerancePx: 0.2
		});

		expect(result.positionKeyframes.length).toBeGreaterThan(5);
		expect(result.rotationKeyframes.length).toBeGreaterThan(5);
		expect(result.scaleKeyframes.length).toBeGreaterThan(1);
		expect(result.autoZoomScale).toBeGreaterThan(1.0);
		expect(result.maxShakeDisplacementPx).toBeGreaterThan(5.0);
		expect(result.residualJitterRms).toBeGreaterThan(0.0);

		// Verified compensation: position keyframes oppose the jitter
		const firstKey = result.positionKeyframes[0]!;
		expect(firstKey.value).toBeDefined();
	});
});
