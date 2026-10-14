import { describe, expect, it } from 'vitest';

/**
 * Analytic reference color matrix formulas from ITU-R BT.709 and ITU-R BT.2020.
 */
function rgbToYuv709Limited(r: number, g: number, b: number) {
	const Ey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	const Ecb = (b - Ey) / 1.8556;
	const Ecr = (r - Ey) / 1.5748;

	const y = Math.round(16 + 219 * Ey);
	const cb = Math.round(128 + 224 * Ecb);
	const cr = Math.round(128 + 224 * Ecr);
	return { y, cb, cr };
}

function rgbToYuv2020Limited(r: number, g: number, b: number) {
	const Ey = 0.2627 * r + 0.678 * g + 0.0593 * b;
	const Ecb = (b - Ey) / 1.8814;
	const Ecr = (r - Ey) / 1.4746;

	const y = Math.round(16 + 219 * Ey);
	const cb = Math.round(128 + 224 * Ecb);
	const cr = Math.round(128 + 224 * Ecr);
	return { y, cb, cr };
}

function pcgHash(x: number, y: number, frame: number): number {
	const state =
		(Math.imul(x >>> 0, 3266489917) +
			Math.imul(y >>> 0, 668265263) +
			Math.imul(frame >>> 0, 374761393) +
			1013904223) >>>
		0;
	const word = Math.imul((state ^ (state >>> ((state >>> 28) + 4))) >>> 0, 277803737) >>> 0;
	return ((word >>> 22) ^ word) >>> 0;
}

function getDeterministicTpdfDither(x: number, y: number, frame: number, qLevels: number): number {
	const r1 = pcgHash(x, y, frame) / 4294967295.0;
	const r2 = pcgHash(x + 17, y + 23, frame + 1) / 4294967295.0;
	return (r1 + r2 - 1.0) / qLevels;
}

describe('Color Matrix and Conversion Oracles (Tier 3)', () => {
	it('validates ITU-R BT.709 Limited Range code values against standard broadcast references within ±1 code value', () => {
		// 1. Black (0, 0, 0)
		const black = rgbToYuv709Limited(0, 0, 0);
		expect(black.y).toBe(16);
		expect(black.cb).toBe(128);
		expect(black.cr).toBe(128);

		// 2. 100% White (1, 1, 1)
		const white = rgbToYuv709Limited(1, 1, 1);
		expect(white.y).toBe(235);
		expect(white.cb).toBe(128);
		expect(white.cr).toBe(128);

		// 3. 100% Red (1, 0, 0)
		const red = rgbToYuv709Limited(1, 0, 0);
		expect(Math.abs(red.y - 63)).toBeLessThanOrEqual(1);
		expect(Math.abs(red.cb - 102)).toBeLessThanOrEqual(1);
		expect(Math.abs(red.cr - 240)).toBeLessThanOrEqual(1);

		// 4. 100% Green (0, 1, 0)
		const green = rgbToYuv709Limited(0, 1, 0);
		expect(Math.abs(green.y - 173)).toBeLessThanOrEqual(1);
		expect(Math.abs(green.cb - 42)).toBeLessThanOrEqual(1);
		expect(Math.abs(green.cr - 26)).toBeLessThanOrEqual(1);

		// 5. 100% Blue (0, 0, 1)
		const blue = rgbToYuv709Limited(0, 0, 1);
		expect(Math.abs(blue.y - 32)).toBeLessThanOrEqual(1);
		expect(Math.abs(blue.cb - 240)).toBeLessThanOrEqual(1);
		expect(Math.abs(blue.cr - 118)).toBeLessThanOrEqual(1);
	});

	it('validates ITU-R BT.2020 Limited Range code values for HDR/UHD gamut', () => {
		// White matches reference
		const white = rgbToYuv2020Limited(1, 1, 1);
		expect(white.y).toBe(235);
		expect(white.cb).toBe(128);
		expect(white.cr).toBe(128);

		// BT.2020 Red has higher luma weight than 709 (0.2627 vs 0.2126)
		const red2020 = rgbToYuv2020Limited(1, 0, 0);
		expect(Math.abs(red2020.y - 74)).toBeLessThanOrEqual(1);
		expect(Math.abs(red2020.cb - 97)).toBeLessThanOrEqual(1);
		expect(Math.abs(red2020.cr - 240)).toBeLessThanOrEqual(1);
	});

	it('proves deterministic integer-hash TPDF dithering across coordinates and frames', () => {
		// Run 1 vs Run 2 with identical coordinates & frame must produce identical values
		const ditherA = getDeterministicTpdfDither(192, 108, 42, 255);
		const ditherB = getDeterministicTpdfDither(192, 108, 42, 255);
		expect(ditherA).toBe(ditherB);

		// Changing frame index produces non-zero variation
		const ditherNextFrame = getDeterministicTpdfDither(192, 108, 43, 255);
		expect(ditherNextFrame).not.toBe(ditherA);

		// TPDF amplitude must be strictly bounded in [-1.0 / qLevels, +1.0 / qLevels]
		for (let x = 0; x < 50; x++) {
			for (let y = 0; y < 50; y++) {
				const d = getDeterministicTpdfDither(x, y, 0, 255);
				expect(d).toBeGreaterThanOrEqual(-1.0 / 255.0);
				expect(d).toBeLessThanOrEqual(1.0 / 255.0);
			}
		}
	});

	it('verifies 10-bit banding resolution has at least 4x the discrete levels of 8-bit on a smooth ramp', () => {
		const steps = 4096;
		const levels8Bit = new Set<number>();
		const levels10Bit = new Set<number>();

		for (let i = 0; i < steps; i++) {
			const norm = i / (steps - 1); // [0.0, 1.0]
			const q8 = Math.round(norm * 255);
			const q10 = Math.round(norm * 1023);
			levels8Bit.add(q8);
			levels10Bit.add(q10);
		}

		expect(levels8Bit.size).toBe(256);
		expect(levels10Bit.size).toBe(1024);
		expect(levels10Bit.size).toBeGreaterThanOrEqual(levels8Bit.size * 4);
	});
});
