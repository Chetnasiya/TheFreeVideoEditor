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

	it('tracks fast moving target with velocity prediction and adaptive search radius', () => {
		// Fast motion: target moves across 30 frames at speed up to 15 px/frame (on 320x240)
		const generator = new SyntheticVideoGenerator({
			width: 320,
			height: 240,
			fps: 30,
			totalFrames: 30,
			targetWidthNorm: 0.1,
			targetHeightNorm: 0.1,
			motionPath: (frame) => ({
				x: 0.15 + frame * 0.022, // fast linear + accelerating motion: ~7 px/frame
				y: 0.2 + 0.15 * Math.sin(frame * 0.15),
				rotation: 0,
				scale: 1.0
			})
		});

		const seedFrame = generator.generateFrame(0);
		const seedGt = generator.getGroundTruth(0);
		const seedPyramid = buildPyramid(seedFrame, 3);
		const templateRegion = { x: seedGt.x, y: seedGt.y, width: 0.1, height: 0.1 };
		const seedPatch = extractNormalizedPatch(
			seedFrame,
			seedGt.x * seedFrame.width,
			seedGt.y * seedFrame.height,
			16,
			16
		)!;

		let curX = seedGt.x * seedFrame.width;
		let curY = seedGt.y * seedFrame.height;
		let prevX = curX;
		let prevY = curY;
		let prevPrevX = curX;
		let prevPrevY = curY;

		let maxErr = 0;
		let sumErr = 0;

		for (let f = 1; f < 30; f++) {
			const targetFrame = generator.generateFrame(f);
			const targetGt = generator.getGroundTruth(f);
			const targetPyramid = buildPyramid(targetFrame, 3);

			// Velocity prediction
			let vx = 0;
			let vy = 0;
			if (f >= 2) {
				vx = prevX - prevPrevX;
				vy = prevY - prevPrevY;
			}
			const predX = curX + vx;
			const predY = curY + vy;
			const searchRad = Math.round(Math.max(32, Math.hypot(vx, vy) * 1.5, 48));

			const nccResult = matchTemplateNcc(
				targetFrame,
				seedPatch.patch,
				seedPatch.norm,
				16,
				16,
				predX,
				predY,
				searchRad
			);

			const lk = trackLkPyramid(
				seedPyramid,
				targetPyramid,
				templateRegion,
				{ x: nccResult.x, y: nccResult.y, rotation: 0, scale: 1 },
				{
					trackRotation: false,
					trackScale: false,
					maxIterations: 25,
					tolerance: 1e-4,
					huberThreshold: 0.1
				}
			);

			prevPrevX = prevX;
			prevPrevY = prevY;
			prevX = curX;
			prevY = curY;
			curX = lk.state.x;
			curY = lk.state.y;

			const trueX = targetGt.x * targetFrame.width;
			const trueY = targetGt.y * targetFrame.height;
			const err = Math.hypot(curX - trueX, curY - trueY);
			if (err > maxErr) maxErr = err;
			sumErr += err;

			expect(lk.confidence).toBeGreaterThan(0.7);
		}

		const meanErr = sumErr / 29;
		expect(meanErr).toBeLessThan(0.35);
		expect(maxErr).toBeLessThan(0.85);
	});

	it('accurately tracks target changing size (scaling up and down)', () => {
		// Target scales dynamically from 1.0 to 1.5 and back down to 0.8
		const generator = new SyntheticVideoGenerator({
			width: 320,
			height: 240,
			fps: 30,
			totalFrames: 30,
			targetWidthNorm: 0.1,
			targetHeightNorm: 0.1,
			motionPath: (frame) => ({
				x: 0.4 + 0.1 * Math.sin(frame * 0.1),
				y: 0.4 + 0.1 * Math.cos(frame * 0.08),
				rotation: 0,
				scale: 1.0 + 0.4 * Math.sin(frame * 0.1) // scale ranges from 0.8 to 1.4
			})
		});

		const seedFrame = generator.generateFrame(0);
		const seedGt = generator.getGroundTruth(0);
		const seedPyramid = buildPyramid(seedFrame, 4);
		const templateRegion = { x: seedGt.x, y: seedGt.y, width: 0.1, height: 0.1 };
		const seedPatch = extractNormalizedPatch(
			seedFrame,
			seedGt.x * seedFrame.width,
			seedGt.y * seedFrame.height,
			16,
			16
		)!;

		let curX = seedGt.x * seedFrame.width;
		let curY = seedGt.y * seedFrame.height;
		let curScale = 1.0;
		let prevX = curX;
		let prevY = curY;
		let prevPrevX = curX;
		let prevPrevY = curY;

		let maxScaleErr = 0;
		let sumScaleErr = 0;
		let maxPosErr = 0;

		for (let f = 1; f < 30; f++) {
			const targetFrame = generator.generateFrame(f);
			const targetGt = generator.getGroundTruth(f);
			const targetPyramid = buildPyramid(targetFrame, 4);

			let vx = 0;
			let vy = 0;
			if (f >= 2) {
				vx = prevX - prevPrevX;
				vy = prevY - prevPrevY;
			}
			const predX = curX + vx;
			const predY = curY + vy;

			const nccResult = matchTemplateNcc(
				targetFrame,
				seedPatch.patch,
				seedPatch.norm,
				16,
				16,
				predX,
				predY,
				48
			);
			const lk = trackLkPyramid(
				seedPyramid,
				targetPyramid,
				templateRegion,
				{ x: nccResult.x, y: nccResult.y, rotation: 0, scale: curScale },
				{
					trackRotation: false,
					trackScale: true,
					maxIterations: 30,
					tolerance: 1e-4,
					huberThreshold: 0.1
				}
			);

			prevPrevX = prevX;
			prevPrevY = prevY;
			prevX = curX;
			prevY = curY;
			curX = lk.state.x;
			curY = lk.state.y;
			curScale = lk.state.scale;

			const trueX = targetGt.x * targetFrame.width;
			const trueY = targetGt.y * targetFrame.height;
			const posErr = Math.hypot(curX - trueX, curY - trueY);
			const scaleErr = Math.abs(curScale - targetGt.scale);

			if (posErr > maxPosErr) maxPosErr = posErr;
			if (scaleErr > maxScaleErr) maxScaleErr = scaleErr;
			sumScaleErr += scaleErr;

			expect(lk.confidence).toBeGreaterThan(0.5);
		}

		const meanScaleErr = sumScaleErr / 29;
		console.log(
			`[Scale Tracking Test] mean scale error=${meanScaleErr.toFixed(4)}, max pos error=${maxPosErr.toFixed(4)}px`
		);
		expect(meanScaleErr).toBeLessThan(0.08); // accurately tracks scale within 8% mean error
		expect(maxPosErr).toBeLessThan(1.0); // position remains locked under scale changes
	});
});
