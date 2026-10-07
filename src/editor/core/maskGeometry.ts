import type { MaskPoint } from './types';

export interface Point2D {
	x: number;
	y: number;
}

/** [cx, cy, w, h, rotationDeg, roundness] */
export type RectShape = [number, number, number, number, number, number];

/** [cx, cy, rx, ry, rotationDeg] */
export type EllipseShape = [number, number, number, number, number];

/** Flat array: [x0, y0, inX0, inY0, outX0, outY0, x1, y1, ...] */
export type PathShape = number[];

export const DEFAULT_RECT_SHAPE: RectShape = [0.5, 0.5, 0.4, 0.4, 0, 0];
export const DEFAULT_ELLIPSE_SHAPE: EllipseShape = [0.5, 0.5, 0.2, 0.2, 0];

export function pointsToPathShape(points: readonly MaskPoint[]): PathShape {
	const result: number[] = [];
	for (const pt of points) {
		result.push(
			pt.x,
			pt.y,
			pt.inHandle ? pt.inHandle.x : 0,
			pt.inHandle ? pt.inHandle.y : 0,
			pt.outHandle ? pt.outHandle.x : 0,
			pt.outHandle ? pt.outHandle.y : 0
		);
	}
	return result;
}

export function pathShapeToPoints(shape: readonly number[]): MaskPoint[] {
	const points: MaskPoint[] = [];
	for (let i = 0; i + 5 < shape.length; i += 6) {
		const x = shape[i]!;
		const y = shape[i + 1]!;
		const inX = shape[i + 2]!;
		const inY = shape[i + 3]!;
		const outX = shape[i + 4]!;
		const outY = shape[i + 5]!;
		points.push({
			x,
			y,
			...(inX !== 0 || inY !== 0 ? { inHandle: { x: inX, y: inY } } : {}),
			...(outX !== 0 || outY !== 0 ? { outHandle: { x: outX, y: outY } } : {})
		});
	}
	return points;
}

export function assertSamePointCount(shapeA: readonly number[], shapeB: readonly number[]): void {
	if (shapeA.length !== shapeB.length) {
		const countA = Math.floor(shapeA.length / 6);
		const countB = Math.floor(shapeB.length / 6);
		throw new RangeError(
			`Path mask keyframe point counts must match: got ${countA} and ${countB} points.`
		);
	}
}

/** Rotates a 2D point (x, y) around the origin by angle in radians */
export function rotatePoint(x: number, y: number, rad: number): Point2D {
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	return {
		x: x * cos - y * sin,
		y: x * sin + y * cos
	};
}

/** Evaluates cubic bezier point at t in [0, 1] */
export function cubicBezier(
	p0: Point2D,
	cp0: Point2D,
	cp1: Point2D,
	p1: Point2D,
	t: number
): Point2D {
	const u = 1 - t;
	const tt = t * t;
	const uu = u * u;
	const uuu = uu * u;
	const ttt = tt * t;

	return {
		x: uuu * p0.x + 3 * uu * t * cp0.x + 3 * u * tt * cp1.x + ttt * p1.x,
		y: uuu * p0.y + 3 * uu * t * cp0.y + 3 * u * tt * cp1.y + ttt * p1.y
	};
}

/** Subdivides cubic bezier into line segments for flattening and hit-testing */
export function flattenBezier(
	p0: Point2D,
	cp0: Point2D,
	cp1: Point2D,
	p1: Point2D,
	steps = 16
): Point2D[] {
	const result: Point2D[] = [];
	for (let i = 0; i <= steps; i++) {
		result.push(cubicBezier(p0, cp0, cp1, p1, i / steps));
	}
	return result;
}

/** Distance from point p to segment [a, b] */
export function distanceToSegment(p: Point2D, a: Point2D, b: Point2D): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len2 = dx * dx + dy * dy;
	if (len2 === 0) {
		const px = p.x - a.x;
		const py = p.y - a.y;
		return Math.hypot(px, py);
	}
	let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
	t = Math.max(0, Math.min(1, t));
	const projX = a.x + t * dx;
	const projY = a.y + t * dy;
	return Math.hypot(p.x - projX, p.y - projY);
}

/** Evaluates whether point (px, py) is inside a polygon using ray casting */
export function pointInPolygon(px: number, py: number, polygon: readonly Point2D[]): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i]!.x;
		const yi = polygon[i]!.y;
		const xj = polygon[j]!.x;
		const yj = polygon[j]!.y;

		const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

/** Checks whether a point is inside a rectangle mask shape */
export function isPointInRect(
	px: number,
	py: number,
	shape: RectShape,
	expansion = 0,
	aspect = 1
): boolean {
	const [cx, cy, w, h, rotDeg, roundness] = shape;
	const rad = (-rotDeg * Math.PI) / 180;
	// Offset from center, taking aspect ratio into account for rotation
	const dx = (px - cx) * aspect;
	const dy = py - cy;
	const local = rotatePoint(dx, dy, rad);
	const lx = local.x / aspect;
	const ly = local.y;

	const halfW = Math.max(0.001, w / 2 + expansion);
	const halfH = Math.max(0.001, h / 2 + expansion);
	const maxR = Math.min(halfW, halfH);
	const r = Math.max(0, Math.min(maxR, roundness * maxR));

	const ax = Math.abs(lx);
	const ay = Math.abs(ly);

	if (ax > halfW || ay > halfH) return false;
	if (ax <= halfW - r || ay <= halfH - r) return true;

	const qx = ax - (halfW - r);
	const qy = ay - (halfH - r);
	return qx * qx + qy * qy <= r * r;
}

/** Checks whether a point is inside an ellipse mask shape */
export function isPointInEllipse(
	px: number,
	py: number,
	shape: EllipseShape,
	expansion = 0,
	aspect = 1
): boolean {
	const [cx, cy, rx, ry, rotDeg] = shape;
	const rad = (-rotDeg * Math.PI) / 180;
	const dx = (px - cx) * aspect;
	const dy = py - cy;
	const local = rotatePoint(dx, dy, rad);
	const lx = local.x / aspect;
	const ly = local.y;

	const effRx = Math.max(0.001, rx + expansion);
	const effRy = Math.max(0.001, ry + expansion);

	const nx = lx / effRx;
	const ny = ly / effRy;
	return nx * nx + ny * ny <= 1.0;
}

/** Hit-tests anchor points of a path mask */
export function hitTestAnchor(
	points: readonly MaskPoint[],
	pos: Point2D,
	threshold = 0.02
): number | null {
	for (let i = 0; i < points.length; i++) {
		const pt = points[i]!;
		if (Math.hypot(pt.x - pos.x, pt.y - pos.y) <= threshold) {
			return i;
		}
	}
	return null;
}

/** Hit-tests tangent handles of a path mask */
export function hitTestHandle(
	points: readonly MaskPoint[],
	pos: Point2D,
	threshold = 0.02
): { pointIndex: number; handle: 'in' | 'out' } | null {
	for (let i = 0; i < points.length; i++) {
		const pt = points[i]!;
		if (pt.inHandle) {
			const hx = pt.x + pt.inHandle.x;
			const hy = pt.y + pt.inHandle.y;
			if (Math.hypot(hx - pos.x, hy - pos.y) <= threshold) {
				return { pointIndex: i, handle: 'in' };
			}
		}
		if (pt.outHandle) {
			const hx = pt.x + pt.outHandle.x;
			const hy = pt.y + pt.outHandle.y;
			if (Math.hypot(hx - pos.x, hy - pos.y) <= threshold) {
				return { pointIndex: i, handle: 'out' };
			}
		}
	}
	return null;
}

/** Hit-tests path edges to insert a new vertex */
export function hitTestEdge(
	points: readonly MaskPoint[],
	closed: boolean,
	pos: Point2D,
	threshold = 0.02
): { segmentIndex: number; t: number; point: Point2D } | null {
	if (points.length < 2) return null;
	const count = closed ? points.length : points.length - 1;

	let bestDist = threshold;
	let match: { segmentIndex: number; t: number; point: Point2D } | null = null;

	for (let i = 0; i < count; i++) {
		const p0 = points[i]!;
		const p1 = points[(i + 1) % points.length]!;

		const cp0: Point2D = p0.outHandle
			? { x: p0.x + p0.outHandle.x, y: p0.y + p0.outHandle.y }
			: { x: p0.x, y: p0.y };
		const cp1: Point2D = p1.inHandle
			? { x: p1.x + p1.inHandle.x, y: p1.y + p1.inHandle.y }
			: { x: p1.x, y: p1.y };

		const samples = flattenBezier(p0, cp0, cp1, p1, 16);
		for (let s = 0; s < samples.length - 1; s++) {
			const a = samples[s]!;
			const b = samples[s + 1]!;
			const d = distanceToSegment(pos, a, b);
			if (d < bestDist) {
				bestDist = d;
				const segT = (s + 0.5) / 16;
				match = {
					segmentIndex: i,
					t: segT,
					point: cubicBezier(p0, cp0, cp1, p1, segT)
				};
			}
		}
	}
	return match;
}
