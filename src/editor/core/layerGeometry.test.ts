import { describe, expect, it } from 'vitest';
import { applyAffine, layerAffine } from './layerGeometry';

describe('layerAffine', () => {
	it('is the identity fit when the source matches the composition', () => {
		const affine = layerAffine({}, 1920, 1080, 1920, 1080);
		expect(applyAffine(affine, 0, 0)).toEqual({ x: 0, y: 0 });
		expect(applyAffine(affine, 1, 1)).toEqual({ x: 1920, y: 1080 });
	});

	it('letterboxes with contain fit', () => {
		const affine = layerAffine({}, 400, 300, 640, 360);
		const topLeft = applyAffine(affine, 0, 0);
		const bottomRight = applyAffine(affine, 1, 1);
		expect(topLeft.x).toBeCloseTo(80);
		expect(topLeft.y).toBeCloseTo(0);
		expect(bottomRight.x).toBeCloseTo(560);
		expect(bottomRight.y).toBeCloseTo(360);
	});

	it('rotates about the composition centre', () => {
		const affine = layerAffine(
			{ transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 90, opacity: 1 } },
			100,
			100,
			100,
			100
		);
		const point = applyAffine(affine, 1, 0.5);
		expect(point.x).toBeCloseTo(50);
		expect(point.y).toBeCloseTo(100);
	});

	it('rotates about an anchor offset and keeps the anchor fixed', () => {
		const layer = {
			transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 45, opacity: 1 },
			anchor: { x: 20, y: 10 }
		};
		const affine = layerAffine(layer, 200, 100, 200, 100);
		// The anchor sits at centre + anchor in the unrotated image; after rotation about
		// that point it must not move.
		const fixed = applyAffine(affine, (100 + 20) / 200, (50 + 10) / 100);
		expect(fixed.x).toBeCloseTo(120);
		expect(fixed.y).toBeCloseTo(60);
	});

	it('applies translation and scale', () => {
		const affine = layerAffine(
			{ transform: { x: 10, y: -5, scaleX: 0.5, scaleY: 2, rotation: 0, opacity: 1 } },
			100,
			100,
			100,
			100
		);
		expect(applyAffine(affine, 0.5, 0.5)).toEqual({ x: 60, y: 45 });
		expect(applyAffine(affine, 1, 1)).toEqual({ x: 85, y: 145 });
	});

	it('supports fit: none without letterboxing or scaling', () => {
		const affine = layerAffine({ fit: 'none' }, 400, 200, 1920, 1080);
		// Centers unscaled 400x200 box in 1920x1080 composition
		// Top-left: (1920 - 400)/2 = 760, (1080 - 200)/2 = 440
		const topLeft = applyAffine(affine, 0, 0);
		const bottomRight = applyAffine(affine, 1, 1);
		expect(topLeft.x).toBeCloseTo(760);
		expect(topLeft.y).toBeCloseTo(440);
		expect(bottomRight.x).toBeCloseTo(1160);
		expect(bottomRight.y).toBeCloseTo(640);
	});
});
