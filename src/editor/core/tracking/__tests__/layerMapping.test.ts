import { describe, expect, it } from 'vitest';
import { fitRect } from '../../composition';
import { applyAffine, layerAffine } from '../../layerGeometry';
import type { ActiveLayer } from '../../playback';

/**
 * Independent analytic reference oracle for source -> composition point mapping.
 * Implemented completely separately without calling layerAffine.
 */
function analyticSourceToComposition(
	layer: Pick<ActiveLayer, 'transform' | 'anchor' | 'crop' | 'fit'>,
	sourceWidth: number,
	sourceHeight: number,
	compWidth: number,
	compHeight: number,
	sourcePoint: { x: number; y: number } // Normalized source coordinates [0, 1]
): { x: number; y: number; inBounds: boolean } {
	const fit = layer.fit ?? 'contain';
	const [cropLeft, cropTop, cropRight, cropBottom] = layer.crop ?? [0, 0, 0, 0];

	// Check if source point is within uncropped region
	const isInsideCrop =
		sourcePoint.x >= cropLeft &&
		sourcePoint.x <= 1 - cropRight &&
		sourcePoint.y >= cropTop &&
		sourcePoint.y <= 1 - cropBottom;

	// Normalized coordinates within the cropped sub-rectangle [0, 1]
	const croppedWidthSpan = 1 - cropLeft - cropRight;
	const croppedHeightSpan = 1 - cropTop - cropBottom;
	const uCropped = (sourcePoint.x - cropLeft) / (croppedWidthSpan || 1e-9);
	const vCropped = (sourcePoint.y - cropTop) / (croppedHeightSpan || 1e-9);

	// Compute base unscaled/unrotated fitted rectangle in composition pixels
	let fittedX = 0;
	let fittedY = 0;
	let fittedW = 0;
	let fittedH = 0;

	if (fit === 'none') {
		fittedW = sourceWidth;
		fittedH = sourceHeight;
		fittedX = (compWidth - sourceWidth) / 2;
		fittedY = (compHeight - sourceHeight) / 2;
	} else {
		const baseFit = fitRect(sourceWidth, sourceHeight, compWidth, compHeight);
		fittedX = baseFit.x;
		fittedY = baseFit.y;
		fittedW = baseFit.width;
		fittedH = baseFit.height;
	}

	// Sub-rect corresponding to the cropped visible area
	const rectX = fittedX + cropLeft * fittedW;
	const rectY = fittedY + cropTop * fittedH;
	const rectW = fittedW * croppedWidthSpan;
	const rectH = fittedH * croppedHeightSpan;

	// Position of the point in unscaled/unrotated composition space
	const px = rectX + uCropped * rectW;
	const py = rectY + vCropped * rectH;

	// Transform parameters
	const transform = layer.transform;
	const anchor = layer.anchor ?? { x: 0, y: 0 };
	const scaleX = transform?.scaleX ?? 1;
	const scaleY = transform?.scaleY ?? 1;
	const rotDeg = transform?.rotation ?? 0;
	const rad = (rotDeg * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);

	// Pivot point in composition coordinates:
	// The pivot sits at (compCenter + anchor) in composition space
	const pivotX = compWidth / 2 + anchor.x;
	const pivotY = compHeight / 2 + anchor.y;

	// Vector from pivot to unscaled point
	const dx = px - pivotX;
	const dy = py - pivotY;

	// Scale relative to pivot
	const scaledDx = dx * scaleX;
	const scaledDy = dy * scaleY;

	// Rotate about pivot
	const rotatedDx = scaledDx * cos - scaledDy * sin;
	const rotatedDy = scaledDx * sin + scaledDy * cos;

	// Translate: pivot is translated by (transform.x, transform.y)
	const transX = transform?.x ?? 0;
	const transY = transform?.y ?? 0;

	const finalX = pivotX + transX + rotatedDx;
	const finalY = pivotY + transY + rotatedDy;

	return {
		x: finalX,
		y: finalY,
		inBounds: isInsideCrop
	};
}

describe('Step 0: sourceToComposition layer mapping vs independent oracle', () => {
	it('matches identity mapping when source equals composition', () => {
		const layer: Pick<ActiveLayer, 'transform' | 'anchor' | 'crop' | 'fit'> = {};
		const compW = 1920;
		const compH = 1080;
		const srcPt = { x: 0.25, y: 0.75 };

		const oracle = analyticSourceToComposition(layer, compW, compH, compW, compH, srcPt);
		const affine = layerAffine(layer, compW, compH, compW, compH);
		const mapped = applyAffine(affine, srcPt.x, srcPt.y);

		expect(mapped.x).toBeCloseTo(oracle.x, 4);
		expect(mapped.y).toBeCloseTo(oracle.y, 4);
		expect(mapped.x).toBeCloseTo(1920 * 0.25, 4);
		expect(mapped.y).toBeCloseTo(1080 * 0.75, 4);
	});

	it('matches with complex scale, rotation, anchor, and contain letterboxing', () => {
		const layer: Pick<ActiveLayer, 'transform' | 'anchor' | 'crop' | 'fit'> = {
			transform: {
				x: 45,
				y: -30,
				scaleX: 1.5,
				scaleY: 0.8,
				rotation: 37,
				opacity: 1
			},
			anchor: { x: 25, y: -15 },
			fit: 'contain'
		};
		const srcW = 1280;
		const srcH = 720;
		const compW = 1920;
		const compH = 1080;

		const points = [
			{ x: 0, y: 0 },
			{ x: 0.5, y: 0.5 },
			{ x: 1, y: 1 },
			{ x: 0.314, y: 0.829 }
		];

		const affine = layerAffine(layer, srcW, srcH, compW, compH);

		for (const pt of points) {
			const oracle = analyticSourceToComposition(layer, srcW, srcH, compW, compH, pt);
			const mapped = applyAffine(affine, pt.x, pt.y);
			expect(mapped.x).toBeCloseTo(oracle.x, 4);
			expect(mapped.y).toBeCloseTo(oracle.y, 4);
		}
	});

	it('matches with crop insets and verifies crop normalization', () => {
		const crop: [number, number, number, number] = [0.1, 0.2, 0.15, 0.25];
		const layer: Pick<ActiveLayer, 'transform' | 'anchor' | 'crop' | 'fit'> = {
			transform: {
				x: -12,
				y: 84,
				scaleX: 1.25,
				scaleY: 1.25,
				rotation: -42,
				opacity: 1
			},
			anchor: { x: 10, y: 10 },
			crop,
			fit: 'contain'
		};

		const srcW = 1920;
		const srcH = 1080;
		const compW = 1280;
		const compH = 720;

		// Test a point inside the crop window: source (0.5, 0.5)
		const srcPt = { x: 0.5, y: 0.5 };
		const oracle = analyticSourceToComposition(layer, srcW, srcH, compW, compH, srcPt);
		expect(oracle.inBounds).toBe(true);

		const uCropped = (srcPt.x - crop[0]) / (1 - crop[0] - crop[2]);
		const vCropped = (srcPt.y - crop[1]) / (1 - crop[1] - crop[3]);

		const affine = layerAffine(layer, srcW, srcH, compW, compH);
		const mapped = applyAffine(affine, uCropped, vCropped);

		expect(mapped.x).toBeCloseTo(oracle.x, 4);
		expect(mapped.y).toBeCloseTo(oracle.y, 4);
	});

	it('matches for fit: none (text / unscaled overlay path)', () => {
		const layer: Pick<ActiveLayer, 'transform' | 'anchor' | 'crop' | 'fit'> = {
			transform: {
				x: 50,
				y: 20,
				scaleX: 1,
				scaleY: 1,
				rotation: 15,
				opacity: 1
			},
			anchor: { x: 0, y: 0 },
			fit: 'none'
		};
		const srcW = 400;
		const srcH = 200;
		const compW = 1920;
		const compH = 1080;

		const srcPt = { x: 0.5, y: 0.5 };
		const oracle = analyticSourceToComposition(layer, srcW, srcH, compW, compH, srcPt);
		const affine = layerAffine(layer, srcW, srcH, compW, compH);
		const mapped = applyAffine(affine, srcPt.x, srcPt.y);

		expect(mapped.x).toBeCloseTo(oracle.x, 4);
		expect(mapped.y).toBeCloseTo(oracle.y, 4);
	});
});
