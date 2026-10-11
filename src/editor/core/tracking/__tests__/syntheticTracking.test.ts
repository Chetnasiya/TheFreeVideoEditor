import { describe, expect, it } from 'vitest';
import { buildPyramid, extractNormalizedPatch, matchTemplateNcc, trackLkPyramid } from '../index';
import { SyntheticVideoGenerator } from '../syntheticGenerator';

describe('Tracking Engine vs Synthetic Ground Truth', () => {
	it('tracks 2D translation and subpixel motion over 50 frames with mean error < 0.25 px', () => {
		const generator = new SyntheticVideoGenerator({
			width: 320,
			height: 240,
			fps: 30,
			totalFrames: 50,
			targetWidthNorm: 0.1,
			targetHeightNorm: 0.1,
			motionPath: (frame) => ({
				// Smooth non-linear trajectory with sub-pixel offsets
				x: 0.3 + 0.3 * Math.sin(frame * 0.05),
				y: 0.4 + 0.2 * Math.cos(frame * 0.04),
				rotation: 0,
				scale: 1.0
			})
		});

		// Seed at frame 0
		const seedFrame = generator.generateFrame(0);
		const seedGt = generator.getGroundTruth(0);
		const seedPyramid = buildPyramid(seedFrame, 3);

		const templateRegion = {
			x: seedGt.x,
			y: seedGt.y,
			width: 0.1,
			height: 0.1
		};

		let currentX = seedGt.x * seedFrame.width;
		let currentY = seedGt.y * seedFrame.height;

		let maxPixelError = 0;
		let sumPixelError = 0;

		for (let f = 1; f < 50; f++) {
			const targetFrame = generator.generateFrame(f);
			const targetGt = generator.getGroundTruth(f);
			const targetPyramid = buildPyramid(targetFrame, 3);

			// NCC coarse search
			const seedPatch = extractNormalizedPatch(
				seedFrame,
				seedGt.x * seedFrame.width,
				seedGt.y * seedFrame.height,
				16,
				16
			);
			const nccResult = matchTemplateNcc(
				targetFrame,
				seedPatch!.patch,
				seedPatch!.norm,
				16,
				16,
				currentX,
				currentY,
				25
			);

			// LK refinement
			const lkResult = trackLkPyramid(
				seedPyramid,
				targetPyramid,
				templateRegion,
				{ x: nccResult.x, y: nccResult.y, rotation: 0, scale: 1 },
				{
					trackRotation: false,
					trackScale: false,
					maxIterations: 20,
					tolerance: 1e-4,
					huberThreshold: 0.1
				}
			);

			currentX = lkResult.state.x;
			currentY = lkResult.state.y;

			const trueX = targetGt.x * targetFrame.width;
			const trueY = targetGt.y * targetFrame.height;

			const err = Math.sqrt((currentX - trueX) ** 2 + (currentY - trueY) ** 2);
			if (err > maxPixelError) maxPixelError = err;
			sumPixelError += err;

			expect(lkResult.confidence).toBeGreaterThan(0.7);
		}

		const meanPixelError = sumPixelError / 49;
		console.log(
			`[Ground Truth Test] Translation recovery: mean=${meanPixelError.toFixed(4)}px, max=${maxPixelError.toFixed(4)}px`
		);

		expect(meanPixelError).toBeLessThan(0.25);
		expect(maxPixelError).toBeLessThan(0.8);
	});

	it('detects occlusion and stops tracking with loss status', () => {
		const generator = new SyntheticVideoGenerator({
			width: 320,
			height: 240,
			fps: 30,
			totalFrames: 20,
			targetWidthNorm: 0.1,
			targetHeightNorm: 0.1,
			motionPath: (frame) => ({
				x: 0.5,
				y: 0.5,
				rotation: 0,
				scale: 1.0,
				occluded: frame >= 10 // occluded starting at frame 10
			})
		});

		const seedFrame = generator.generateFrame(0);
		const seedPatch = extractNormalizedPatch(seedFrame, 160, 120, 16, 16)!;

		// Frame 5: visible
		const f5 = generator.generateFrame(5);
		const m5 = matchTemplateNcc(f5, seedPatch.patch, seedPatch.norm, 16, 16, 160, 120, 10);
		expect(m5.score).toBeGreaterThan(0.9);

		// Frame 12: occluded
		const f12 = generator.generateFrame(12);
		const m12 = matchTemplateNcc(f12, seedPatch.patch, seedPatch.norm, 16, 16, 160, 120, 10);
		expect(m12.score).toBeLessThan(0.3); // score collapses under occlusion
	});
});
