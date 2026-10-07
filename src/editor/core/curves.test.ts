import { describe, expect, it } from 'vitest';
import { evaluateSpline, generateCompositeCurvesLut, generateCurveLut } from './curves';

describe('curves spline evaluation', () => {
	it('evaluates linear endpoints correctly', () => {
		const points = [
			{ x: 0, y: 0 },
			{ x: 1, y: 1 }
		];
		expect(evaluateSpline(points, 0)).toBeCloseTo(0, 4);
		expect(evaluateSpline(points, 0.5)).toBeCloseTo(0.5, 4);
		expect(evaluateSpline(points, 1)).toBeCloseTo(1, 4);
	});

	it('preserves monotonicity without overshooting', () => {
		// S-curve with flat ends
		const sCurve = [
			{ x: 0, y: 0 },
			{ x: 0.25, y: 0.1 },
			{ x: 0.75, y: 0.9 },
			{ x: 1, y: 1 }
		];

		let prev = -1;
		for (let i = 0; i <= 100; i += 1) {
			const x = i / 100;
			const y = evaluateSpline(sCurve, x);
			expect(y).toBeGreaterThanOrEqual(0);
			expect(y).toBeLessThanOrEqual(1);
			expect(y).toBeGreaterThanOrEqual(prev); // Monotonically non-decreasing
			prev = y;
		}
	});

	it('generates 256-entry lookup table', () => {
		const points = [
			{ x: 0, y: 0 },
			{ x: 0.5, y: 0.75 },
			{ x: 1, y: 1 }
		];
		const lut = generateCurveLut(points);
		expect(lut.length).toBe(256);
		expect(lut[0]).toBeCloseTo(0, 4);
		expect(lut[128]).toBeCloseTo(evaluateSpline(points, 128 / 255), 4);
		expect(lut[255]).toBeCloseTo(1, 4);
	});

	it('generates composite RGBA curves LUT', () => {
		const lut = generateCompositeCurvesLut(
			[
				{ x: 0, y: 0 },
				{ x: 1, y: 1 }
			],
			[
				{ x: 0, y: 0 },
				{ x: 0.5, y: 0.8 },
				{ x: 1, y: 1 }
			]
		);
		expect(lut.length).toBe(256 * 4);
		// Alpha channel must be 1.0
		expect(lut[3]).toBeCloseTo(1.0, 4);
		expect(lut[255 * 4 + 3]).toBeCloseTo(1.0, 4);
	});
});
