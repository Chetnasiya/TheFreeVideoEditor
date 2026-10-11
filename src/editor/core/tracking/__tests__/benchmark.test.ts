import { describe, expect, it } from 'vitest';
import { buildPyramid, extractNormalizedPatch, matchTemplateNcc, trackLkPyramid } from '../index';
import { SyntheticVideoGenerator } from '../syntheticGenerator';

describe('Tracking Engine Performance Benchmarks (Slice 5)', () => {
	it('measures tracking throughput on 360p proxy resolution (>= 60 FPS)', () => {
		const generator = new SyntheticVideoGenerator({
			width: 640,
			height: 360,
			fps: 30,
			totalFrames: 10,
			targetWidthNorm: 0.1,
			targetHeightNorm: 0.1,
			motionPath: (frame) => ({
				x: 0.5 + frame * 0.005,
				y: 0.5 + frame * 0.003,
				rotation: 0,
				scale: 1.0
			})
		});

		const frame0 = generator.generateFrame(0);
		const frame1 = generator.generateFrame(1);
		const pyr0 = buildPyramid(frame0, 3);
		const pyr1 = buildPyramid(frame1, 3);

		const templateRegion = { x: 0.5, y: 0.5, width: 0.1, height: 0.1 };
		const initialState = {
			x: 0.5 * frame0.width,
			y: 0.5 * frame0.height,
			rotation: 0,
			scale: 1.0
		};
		const options = {
			trackRotation: false,
			trackScale: false,
			maxIterations: 10,
			tolerance: 0.01,
			huberThreshold: 5.0
		};

		// Warmup
		trackLkPyramid(pyr0, pyr1, templateRegion, initialState, options);

		// Benchmark 40 iterations
		const iterations = 40;
		const start = performance.now();
		for (let i = 0; i < iterations; i++) {
			trackLkPyramid(pyr0, pyr1, templateRegion, initialState, options);
		}
		const elapsedMs = performance.now() - start;
		const fps = (iterations / elapsedMs) * 1000;

		expect(fps).toBeGreaterThan(60);
	});

	it('measures tracking throughput on 1080p full-res (>= 20 FPS)', () => {
		const generator = new SyntheticVideoGenerator({
			width: 1920,
			height: 1080,
			fps: 30,
			totalFrames: 5,
			targetWidthNorm: 0.08,
			targetHeightNorm: 0.08,
			motionPath: (frame) => ({
				x: 0.5 + frame * 0.002,
				y: 0.5 + frame * 0.001,
				rotation: 0,
				scale: 1.0
			})
		});

		const frame0 = generator.generateFrame(0);
		const frame1 = generator.generateFrame(1);
		const pyr0 = buildPyramid(frame0, 4);
		const pyr1 = buildPyramid(frame1, 4);

		const templateRegion = { x: 0.5, y: 0.5, width: 0.08, height: 0.08 };
		const initialState = {
			x: 0.5 * frame0.width,
			y: 0.5 * frame0.height,
			rotation: 0,
			scale: 1.0
		};
		const options = {
			trackRotation: false,
			trackScale: false,
			maxIterations: 12,
			tolerance: 0.01,
			huberThreshold: 5.0
		};

		// Warmup
		trackLkPyramid(pyr0, pyr1, templateRegion, initialState, options);

		const iterations = 20;
		const start = performance.now();
		for (let i = 0; i < iterations; i++) {
			trackLkPyramid(pyr0, pyr1, templateRegion, initialState, options);
		}
		const elapsedMs = performance.now() - start;
		const fps = (iterations / elapsedMs) * 1000;

		expect(fps).toBeGreaterThan(20);
	});

	it('measures NCC template matching performance', () => {
		const generator = new SyntheticVideoGenerator({
			width: 320,
			height: 240,
			fps: 30,
			totalFrames: 5,
			targetWidthNorm: 0.1,
			targetHeightNorm: 0.1,
			motionPath: (frame) => ({
				x: 0.5 + frame * 0.005,
				y: 0.5,
				rotation: 0,
				scale: 1.0
			})
		});

		const frame0 = generator.generateFrame(0);
		const frame1 = generator.generateFrame(1);

		const halfW = 12;
		const halfH = 12;
		const patchRes = extractNormalizedPatch(frame0, 160, 120, halfW, halfH);
		expect(patchRes).not.toBeNull();

		const iterations = 20;
		const start = performance.now();
		for (let i = 0; i < iterations; i++) {
			matchTemplateNcc(frame1, patchRes!.patch, patchRes!.norm, halfW, halfH, 160, 120, 16);
		}
		const elapsedMs = performance.now() - start;
		const durationPerMatch = elapsedMs / iterations;

		// Each NCC match should execute under 15ms
		expect(durationPerMatch).toBeLessThan(15);
	});
});
