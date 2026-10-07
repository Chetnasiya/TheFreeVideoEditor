import { describe, expect, it } from 'vitest';
import {
	applyColorCorrection,
	applyContrast,
	applyExposure,
	applyLiftGammaGain,
	applySaturation,
	applyTemperatureTint,
	applyTone,
	applyVibrance,
	clamp01,
	hslToRgb,
	rec709Luma,
	rgbToHsl,
	rgbToYcbcr,
	sample3dLut,
	ycbcrToRgb
} from './colorMath';

describe('colorMath', () => {
	it('calculates Rec.709 luma accurately', () => {
		expect(rec709Luma(1, 1, 1)).toBeCloseTo(1.0, 4);
		expect(rec709Luma(0, 0, 0)).toBe(0);
		// Pure green contributes 0.7152
		expect(rec709Luma(0, 1, 0)).toBeCloseTo(0.7152, 4);
		// Pure red contributes 0.2126
		expect(rec709Luma(1, 0, 0)).toBeCloseTo(0.2126, 4);
		// Pure blue contributes 0.0722
		expect(rec709Luma(0, 0, 1)).toBeCloseTo(0.0722, 4);
	});

	it('converts RGB to HSL and back with minimal error', () => {
		const testColors: [number, number, number][] = [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
			[0.5, 0.5, 0.5],
			[0.2, 0.7, 0.4]
		];

		for (const [r, g, b] of testColors) {
			const [h, s, l] = rgbToHsl(r, g, b);
			const [r2, g2, b2] = hslToRgb(h, s, l);
			expect(r2).toBeCloseTo(r, 3);
			expect(g2).toBeCloseTo(g, 3);
			expect(b2).toBeCloseTo(b, 3);
		}
	});

	it('converts RGB to YCbCr and back with minimal error', () => {
		const testColors: [number, number, number][] = [
			[0.8, 0.4, 0.2],
			[0.1, 0.9, 0.3],
			[0.5, 0.5, 0.5]
		];

		for (const [r, g, b] of testColors) {
			const [y, cb, cr] = rgbToYcbcr(r, g, b);
			const [r2, g2, b2] = ycbcrToRgb(y, cb, cr);
			expect(r2).toBeCloseTo(r, 3);
			expect(g2).toBeCloseTo(g, 3);
			expect(b2).toBeCloseTo(b, 3);
		}
	});

	it('applies exposure stops (+1 EV doubles, -1 EV halves)', () => {
		const [r, g, b] = applyExposure(0.25, 0.5, 0.1, 1);
		expect(r).toBeCloseTo(0.5, 4);
		expect(g).toBeCloseTo(1.0, 4);
		expect(b).toBeCloseTo(0.2, 4);

		const [rDown] = applyExposure(0.8, 0.8, 0.8, -1);
		expect(rDown).toBeCloseTo(0.4, 4);
	});

	it('applies contrast pivoted at 0.5', () => {
		// Midpoint 0.5 is unchanged by contrast
		const [rMid] = applyContrast(0.5, 0.5, 0.5, 0.5);
		expect(rMid).toBeCloseTo(0.5, 4);

		// Higher values expand upwards, lower values contract downwards
		const [rHigh] = applyContrast(0.75, 0.5, 0.5, 0.5);
		expect(rHigh).toBeGreaterThan(0.75);

		const [rLow] = applyContrast(0.25, 0.5, 0.5, 0.5);
		expect(rLow).toBeLessThan(0.25);
	});

	it('applies saturation correctly', () => {
		// Saturation = -1 results in grayscale (Rec.709 luma)
		const [r, g, b] = applySaturation(1, 0, 0, -1);
		const luma = rec709Luma(1, 0, 0);
		expect(r).toBeCloseTo(luma, 4);
		expect(g).toBeCloseTo(luma, 4);
		expect(b).toBeCloseTo(luma, 4);
	});

	it('samples 3D LUT trilinearly with vertex exactness', () => {
		// Simple 2x2x2 cube LUT (size = 2, total 8 entries)
		// Vertices: [r, g, b] -> inverted [1-r, 1-g, 1-b]
		const size = 2;
		const data = new Float32Array(size * size * size * 4);
		for (let b = 0; b < size; b += 1) {
			for (let g = 0; g < size; g += 1) {
				for (let r = 0; r < size; r += 1) {
					const idx = (r + g * size + b * size * size) * 4;
					data[idx] = 1 - r;
					data[idx + 1] = 1 - g;
					data[idx + 2] = 1 - b;
					data[idx + 3] = 1;
				}
			}
		}

		// Exact corner vertices
		expect(sample3dLut(data, size, 0, 0, 0)).toEqual([1, 1, 1]);
		expect(sample3dLut(data, size, 1, 1, 1)).toEqual([0, 0, 0]);

		// Center interpolation
		const mid = sample3dLut(data, size, 0.5, 0.5, 0.5);
		expect(mid[0]).toBeCloseTo(0.5, 4);
		expect(mid[1]).toBeCloseTo(0.5, 4);
		expect(mid[2]).toBeCloseTo(0.5, 4);
	});
});
