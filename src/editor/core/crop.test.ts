import { describe, expect, it } from 'vitest';
import {
	clampCrop,
	DEFAULT_CROP,
	isCrop,
	isDefaultCrop,
	MIN_CROP_REMAINDER,
	type Crop
} from './crop';

describe('crop property', () => {
	it('identifies crop tuples and default crop state', () => {
		expect(isCrop([0, 0, 0, 0])).toBe(true);
		expect(isCrop([0.1, 0.2, 0.3, 0.4])).toBe(true);
		expect(isCrop([0, 0, 0])).toBe(false);
		expect(isCrop([0, 0, 0, 0, 0])).toBe(false);
		expect(isCrop('not-a-crop')).toBe(false);
		expect(isCrop([0, 0, NaN, 0])).toBe(false);

		expect(isDefaultCrop(DEFAULT_CROP)).toBe(true);
		expect(isDefaultCrop([0, 0, 0, 0])).toBe(true);
		expect(isDefaultCrop([0.01, 0, 0, 0])).toBe(false);
	});

	it('clamps negative and out-of-range insets to [0, 1]', () => {
		const clamped = clampCrop([-0.5, 1.5, -0.2, 2.0]);
		expect(clamped[0]).toBeGreaterThanOrEqual(0);
		expect(clamped[1]).toBeLessThanOrEqual(1);
		expect(clamped[2]).toBeGreaterThanOrEqual(0);
		expect(clamped[3]).toBeLessThanOrEqual(1);
	});

	it('preserves at least MIN_CROP_REMAINDER between opposing edges', () => {
		const clamped = clampCrop([0.7, 0.1, 0.7, 0.1]);
		expect(clamped[0] + clamped[2]).toBeLessThanOrEqual(1 - MIN_CROP_REMAINDER + 1e-6);
	});

	it('allows the edited edge to give way against its opposite edge', () => {
		// When left (index 0) is edited and left+right > limit, left gives way
		const crop: Crop = [0.8, 0, 0.5, 0];
		const clamped = clampCrop(crop, 0);
		expect(clamped[0]).toBeCloseTo(1 - MIN_CROP_REMAINDER - 0.5, 4);
		expect(clamped[2]).toBe(0.5);

		// When right (index 2) is edited, right gives way
		const clampedRight = clampCrop(crop, 2);
		expect(clampedRight[2]).toBeCloseTo(1 - MIN_CROP_REMAINDER - 0.8, 4);
		expect(clampedRight[0]).toBe(0.8);

		// When top (index 1) is edited, top gives way
		const vCrop: Crop = [0, 0.85, 0, 0.4];
		const clampedTop = clampCrop(vCrop, 1);
		expect(clampedTop[1]).toBeCloseTo(1 - MIN_CROP_REMAINDER - 0.4, 4);
		expect(clampedTop[3]).toBe(0.4);
	});
});
