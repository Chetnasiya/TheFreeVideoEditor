import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
	buildPyramid,
	extractNormalizedPatch,
	matchTemplateNcc,
	trackLkPyramid,
	type GrayImage
} from '../index';
import { SyntheticVideoGenerator } from '../syntheticGenerator';

describe('Slice 1 Oracles vs Ground Truth & Invariants', () => {
	it('translation recovery: integer and subpixel motion across 300 frames within tolerance', () => {
		const generator = new SyntheticVideoGenerator({
			width: 320,
			height: 240,
			fps: 30,
			totalFrames: 300,
			targetWidthNorm: 0.1,
			targetHeightNorm: 0.1,
			motionPath: (frame) => ({
				x: 0.4 + 0.25 * Math.sin(frame * 0.02),
				y: 0.4 + 0.15 * Math.cos(frame * 0.015),
				rotation: 0,
				scale: 1.0
			})
		});

		const seedFrame = generator.generateFrame(0);
		const seedGt = generator.getGroundTruth(0);
		const seedPyramid = buildPyramid(seedFrame, 3);
		const templateRegion = { x: seedGt.x, y: seedGt.y, width: 0.1, height: 0.1 };

		let currentX = seedGt.x * seedFrame.width;
		let currentY = seedGt.y * seedFrame.height;

		let maxErr = 0;
		let sumErr = 0;

		const patch = extractNormalizedPatch(seedFrame, currentX, currentY, 16, 16)!;

		for (let f = 1; f < 300; f++) {
			const targetFrame = generator.generateFrame(f);
			const targetGt = generator.getGroundTruth(f);
			const targetPyramid = buildPyramid(targetFrame, 3);

			const ncc = matchTemplateNcc(
				targetFrame,
				patch.patch,
				patch.norm,
				16,
				16,
				currentX,
				currentY,
				20
			);

			const lk = trackLkPyramid(
				seedPyramid,
				targetPyramid,
				templateRegion,
				{ x: ncc.x, y: ncc.y, rotation: 0, scale: 1 },
				{
					trackRotation: false,
					trackScale: false,
					maxIterations: 20,
					tolerance: 1e-4,
					huberThreshold: 0.1
				}
			);

			currentX = lk.state.x;
			currentY = lk.state.y;

			const trueX = targetGt.x * targetFrame.width;
			const trueY = targetGt.y * targetFrame.height;
			const err = Math.sqrt((currentX - trueX) ** 2 + (currentY - trueY) ** 2);

			if (err > maxErr) maxErr = err;
			sumErr += err;
		}

		const meanErr = sumErr / 299;
		console.log(
			`[300 Frame Drift Test] mean error: ${meanErr.toFixed(4)}px, max error: ${maxErr.toFixed(4)}px`
		);

		expect(meanErr).toBeLessThan(0.35);
		expect(maxErr).toBeLessThan(0.95);
	});

	it('backward == forward tracking equivalence within tolerance', () => {
		const generator = new SyntheticVideoGenerator({
			width: 320,
			height: 240,
			fps: 30,
			totalFrames: 30,
			targetWidthNorm: 0.1,
			targetHeightNorm: 0.1,
			motionPath: (frame) => ({
				x: 0.35 + 0.2 * Math.sin(frame * 0.08),
				y: 0.35 + 0.15 * Math.cos(frame * 0.08),
				rotation: 0,
				scale: 1.0
			})
		});

		// Track forward: 0 -> 20
		const frames: GrayImage[] = [];
		for (let i = 0; i <= 20; i++) {
			frames.push(generator.generateFrame(i));
		}

		const f0 = frames[0]!;
		const p0 = extractNormalizedPatch(f0, 0.35 * 320, 0.5 * 240, 16, 16)!;
		const pyr0 = buildPyramid(f0, 3);

		let fwdX = 0.35 * 320;
		let fwdY = 0.5 * 240;
		for (let i = 1; i <= 20; i++) {
			const fi = frames[i]!;
			const pyri = buildPyramid(fi, 3);
			const ncc = matchTemplateNcc(fi, p0.patch, p0.norm, 16, 16, fwdX, fwdY, 20);
			const lk = trackLkPyramid(
				pyr0,
				pyri,
				{ x: 0.35, y: 0.5, width: 0.1, height: 0.1 },
				{ x: ncc.x, y: ncc.y, rotation: 0, scale: 1 },
				{
					trackRotation: false,
					trackScale: false,
					maxIterations: 20,
					tolerance: 1e-4,
					huberThreshold: 0.1
				}
			);
			fwdX = lk.state.x;
			fwdY = lk.state.y;
		}

		// Track backward: 20 -> 0 starting from recovered fwd position
		const f20 = frames[20]!;
		const pyr20 = buildPyramid(f20, 3);
		const p20 = extractNormalizedPatch(f20, fwdX, fwdY, 16, 16)!;

		let bwdX = fwdX;
		let bwdY = fwdY;
		for (let i = 19; i >= 0; i--) {
			const fi = frames[i]!;
			const pyri = buildPyramid(fi, 3);
			const ncc = matchTemplateNcc(fi, p20.patch, p20.norm, 16, 16, bwdX, bwdY, 20);
			const lk = trackLkPyramid(
				pyr20,
				pyri,
				{ x: fwdX / 320, y: fwdY / 240, width: 0.1, height: 0.1 },
				{ x: ncc.x, y: ncc.y, rotation: 0, scale: 1 },
				{
					trackRotation: false,
					trackScale: false,
					maxIterations: 20,
					tolerance: 1e-4,
					huberThreshold: 0.1
				}
			);
			bwdX = lk.state.x;
			bwdY = lk.state.y;
		}

		// Must return to origin within 0.5 px
		const loopClosureErr = Math.sqrt((bwdX - 0.35 * 320) ** 2 + (bwdY - 0.5 * 240) ** 2);
		console.log(
			`[Loop Closure / Forward-Backward Equivalence] error: ${loopClosureErr.toFixed(4)}px`
		);
		expect(loopClosureErr).toBeLessThan(0.5);
	});

	it('Swift encoded fixture ground-truth JSON verification', () => {
		const jsonPath = path.resolve(process.cwd(), 'tests/fixtures/track-target.json');
		expect(fs.existsSync(jsonPath)).toBe(true);

		const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBe(90);

		// Frame 0 ground truth
		expect(data[0].frame).toBe(0);
		expect(data[0].occluded).toBe(false);

		// Frame 40 should be occluded as specified in Swift generator
		expect(data[40].occluded).toBe(true);
	});
});
