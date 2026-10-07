import type { CurvePoint } from './effects/types';
export type { CurvePoint };

/**
 * Evaluates a monotone cubic spline using the Fritsch-Carlson method.
 * Guarantees monotonicity: will not overshoot or create artificial extrema between points.
 */
export function evaluateSpline(points: readonly CurvePoint[], x: number): number {
	if (!points || points.length === 0) return x;
	if (points.length === 1) return points[0]!.y;

	// Clamp x
	const clampedX = Math.min(1, Math.max(0, x));
	const sorted = [...points].sort((a, b) => a.x - b.x);

	// Ensure boundary endpoints exist
	const pts: CurvePoint[] = [];
	if (sorted[0]!.x > 0) {
		pts.push({ x: 0, y: sorted[0]!.y });
	}
	pts.push(...sorted);
	if (sorted[sorted.length - 1]!.x < 1) {
		pts.push({ x: 1, y: sorted[sorted.length - 1]!.y });
	}

	const n = pts.length;
	if (clampedX <= pts[0]!.x) return pts[0]!.y;
	if (clampedX >= pts[n - 1]!.x) return pts[n - 1]!.y;

	// Calculate secants (slopes) between consecutive points
	const dx: number[] = new Array(n - 1);
	const dy: number[] = new Array(n - 1);
	const m: number[] = new Array(n - 1);

	for (let i = 0; i < n - 1; i += 1) {
		dx[i] = pts[i + 1]!.x - pts[i]!.x;
		dy[i] = pts[i + 1]!.y - pts[i]!.y;
		m[i] = dx[i]! === 0 ? 0 : dy[i]! / dx[i]!;
	}

	// Calculate initial tangents d_k
	const d: number[] = new Array(n);
	d[0] = m[0]!;
	for (let i = 1; i < n - 1; i += 1) {
		if (m[i - 1]! * m[i]! <= 0) {
			d[i] = 0;
		} else {
			d[i] = (m[i - 1]! + m[i]!) / 2;
		}
	}
	d[n - 1] = m[n - 2]!;

	// Fritsch & Carlson monotonicity constraints
	for (let i = 0; i < n - 1; i += 1) {
		if (Math.abs(m[i]!) < 1e-9) {
			d[i] = 0;
			d[i + 1] = 0;
		} else {
			const alpha = d[i]! / m[i]!;
			const beta = d[i + 1]! / m[i]!;
			const dist = alpha * alpha + beta * beta;
			if (dist > 9) {
				const tau = 3 / Math.sqrt(dist);
				d[i] = tau * alpha * m[i]!;
				d[i + 1] = tau * beta * m[i]!;
			}
		}
	}

	// Find interval containing clampedX
	let i = 0;
	while (i < n - 1 && clampedX > pts[i + 1]!.x) {
		i += 1;
	}

	const h = dx[i]!;
	if (h <= 0) return pts[i]!.y;

	const t = (clampedX - pts[i]!.x) / h;
	const t2 = t * t;
	const t3 = t2 * t;

	// Hermite basis functions
	const h00 = 2 * t3 - 3 * t2 + 1;
	const h10 = t3 - 2 * t2 + t;
	const h01 = -2 * t3 + 3 * t2;
	const h11 = t3 - t2;

	const result = h00 * pts[i]!.y + h10 * h * d[i]! + h01 * pts[i + 1]!.y + h11 * h * d[i + 1]!;
	return Math.min(1, Math.max(0, result));
}

/** Generates a 256-entry Float32Array lookup table for a given curve. */
export function generateCurveLut(points: readonly CurvePoint[]): Float32Array {
	const lut = new Float32Array(256);
	for (let i = 0; i < 256; i += 1) {
		const x = i / 255;
		lut[i] = evaluateSpline(points, x);
	}
	return lut;
}

/** Generates a 256x4 RGBA Float32Array combining Master (RGB), Red, Green, and Blue curves. */
export function generateCompositeCurvesLut(
	masterPoints?: readonly CurvePoint[],
	redPoints?: readonly CurvePoint[],
	greenPoints?: readonly CurvePoint[],
	bluePoints?: readonly CurvePoint[]
): Float32Array {
	const lut = new Float32Array(256 * 4);
	const master = masterPoints && masterPoints.length > 0 ? generateCurveLut(masterPoints) : null;
	const red = redPoints && redPoints.length > 0 ? generateCurveLut(redPoints) : null;
	const green = greenPoints && greenPoints.length > 0 ? generateCurveLut(greenPoints) : null;
	const blue = bluePoints && bluePoints.length > 0 ? generateCurveLut(bluePoints) : null;

	for (let i = 0; i < 256; i += 1) {
		const base = i / 255;
		const r = red ? red[i]! : base;
		const g = green ? green[i]! : base;
		const b = blue ? blue[i]! : base;

		// Master curve applies on top of per-channel curves
		const finalR = master ? evaluateSpline(masterPoints!, r) : r;
		const finalG = master ? evaluateSpline(masterPoints!, g) : g;
		const finalB = master ? evaluateSpline(masterPoints!, b) : b;

		const offset = i * 4;
		lut[offset] = finalR;
		lut[offset + 1] = finalG;
		lut[offset + 2] = finalB;
		lut[offset + 3] = 1.0;
	}

	return lut;
}
