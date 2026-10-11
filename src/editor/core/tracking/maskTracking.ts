/**
 * Mask Tracking Transform Math (Slice 3).
 * Transforms mask geometry (rect, ellipse, path with bezier control handles)
 * by tracker translation, rotation, and scale deltas.
 */

import type { Clip, Mask, MaskPoint, Tracker } from '../types';
import { evaluateTracker } from './evaluateTracker';
import { timelineToSource } from '../timeRemap';
import {
	pathShapeToPoints,
	pointsToPathShape,
	type EllipseShape,
	type RectShape
} from '../maskGeometry';
import { thinPositionKeyframes } from './apply';
import type { Keyframe, AnimatedValue } from '../types';

export interface MaskTransformDelta {
	/** Normalized delta x translation in source space */
	dx: number;
	/** Normalized delta y translation in source space */
	dy: number;
	/** Rotation angle in radians around seed center */
	rotationRad: number;
	/** Scale multiplier around seed center */
	scale: number;
}

/**
 * Transforms a 2D point [x, y] by a 2D similarity transform (scale, rotate, translate)
 * around an origin point [ox, oy].
 */
export function transformPoint2D(
	pt: { x: number; y: number },
	origin: { x: number; y: number },
	delta: MaskTransformDelta
): { x: number; y: number } {
	// 1. Center relative to origin
	const cx = pt.x - origin.x;
	const cy = pt.y - origin.y;

	// 2. Scale
	const sx = cx * delta.scale;
	const sy = cy * delta.scale;

	// 3. Rotate
	const cosR = Math.cos(delta.rotationRad);
	const sinR = Math.sin(delta.rotationRad);
	const rx = cosR * sx - sinR * sy;
	const ry = sinR * sx + cosR * sy;

	// 4. Translate and un-center
	return {
		x: rx + origin.x + delta.dx,
		y: ry + origin.y + delta.dy
	};
}

/**
 * Transforms a vector offset (e.g. bezier tangent relative handle) by rotation and scale only.
 */
export function transformVector2D(
	vec: { x: number; y: number },
	delta: MaskTransformDelta
): { x: number; y: number } {
	const sx = vec.x * delta.scale;
	const sy = vec.y * delta.scale;
	const cosR = Math.cos(delta.rotationRad);
	const sinR = Math.sin(delta.rotationRad);
	return {
		x: cosR * sx - sinR * sy,
		y: sinR * sx + cosR * sy
	};
}

/**
 * Computes the geometric center (centroid / bounding center) of a mask.
 */
export function computeMaskCenter(mask: Mask): { x: number; y: number } {
	if (mask.type === 'rect') {
		const s = (mask.shape ?? [0.5, 0.5, 0.4, 0.4, 0, 0]) as RectShape;
		return { x: s[0], y: s[1] };
	}
	if (mask.type === 'ellipse') {
		const s = (mask.shape ?? [0.5, 0.5, 0.2, 0.2, 0]) as EllipseShape;
		return { x: s[0], y: s[1] };
	}
	// Path mask: average of vertex coordinates
	const pts =
		mask.points && mask.points.length > 0
			? mask.points
			: mask.shape
				? pathShapeToPoints(mask.shape)
				: [];
	if (pts.length === 0) return { x: 0.5, y: 0.5 };
	let sumX = 0;
	let sumY = 0;
	for (const p of pts) {
		sumX += p.x;
		sumY += p.y;
	}
	return { x: sumX / pts.length, y: sumY / pts.length };
}

/**
 * Transforms a path mask's vertices and bezier handles (inHandle, outHandle)
 * by tracker motion delta.
 */
export function transformPathPoints(
	points: readonly MaskPoint[],
	origin: { x: number; y: number },
	delta: MaskTransformDelta
): MaskPoint[] {
	return points.map((pt) => {
		const newPos = transformPoint2D({ x: pt.x, y: pt.y }, origin, delta);

		let newInHandle: { x: number; y: number } | undefined;
		let newOutHandle: { x: number; y: number } | undefined;

		if (pt.inHandle) {
			// InHandle is absolute coordinates in source space
			newInHandle = transformPoint2D(pt.inHandle, origin, delta);
		}
		if (pt.outHandle) {
			newOutHandle = transformPoint2D(pt.outHandle, origin, delta);
		}

		return {
			x: newPos.x,
			y: newPos.y,
			...(newInHandle ? { inHandle: newInHandle } : {}),
			...(newOutHandle ? { outHandle: newOutHandle } : {})
		};
	});
}

/**
 * Transforms a RectShape [cx, cy, w, h, rotationDeg, roundness] by motion delta.
 */
export function transformRectShape(
	shape: readonly number[],
	origin: { x: number; y: number },
	delta: MaskTransformDelta
): RectShape {
	const cx = shape[0] ?? 0.5;
	const cy = shape[1] ?? 0.5;
	const w = shape[2] ?? 0.4;
	const h = shape[3] ?? 0.4;
	const rot = shape[4] ?? 0;
	const roundness = shape[5] ?? 0;

	const newCenter = transformPoint2D({ x: cx, y: cy }, origin, delta);
	const deltaRotDeg = (delta.rotationRad * 180) / Math.PI;

	return [newCenter.x, newCenter.y, w * delta.scale, h * delta.scale, rot + deltaRotDeg, roundness];
}

/**
 * Transforms an EllipseShape [cx, cy, rx, ry, rotationDeg] by motion delta.
 */
export function transformEllipseShape(
	shape: readonly number[],
	origin: { x: number; y: number },
	delta: MaskTransformDelta
): EllipseShape {
	const cx = shape[0] ?? 0.5;
	const cy = shape[1] ?? 0.5;
	const rx = shape[2] ?? 0.2;
	const ry = shape[3] ?? 0.2;
	const rot = shape[4] ?? 0;

	const newCenter = transformPoint2D({ x: cx, y: cy }, origin, delta);
	const deltaRotDeg = (delta.rotationRad * 180) / Math.PI;

	return [newCenter.x, newCenter.y, rx * delta.scale, ry * delta.scale, rot + deltaRotDeg];
}

/**
 * Transforms any mask's shape array at a specific motion delta.
 */
export function transformMaskShape(
	mask: Mask,
	origin: { x: number; y: number },
	delta: MaskTransformDelta
): { shape: number[]; points?: MaskPoint[] } {
	if (mask.type === 'rect') {
		const baseShape = mask.shape ?? [0.5, 0.5, 0.4, 0.4, 0, 0];
		return { shape: transformRectShape(baseShape, origin, delta) };
	}
	if (mask.type === 'ellipse') {
		const baseShape = mask.shape ?? [0.5, 0.5, 0.2, 0.2, 0];
		return { shape: transformEllipseShape(baseShape, origin, delta) };
	}
	// Path mask
	const basePoints =
		mask.points && mask.points.length > 0
			? mask.points
			: mask.shape
				? pathShapeToPoints(mask.shape)
				: [];
	const transformedPoints = transformPathPoints(basePoints, origin, delta);
	const flatShape = pointsToPathShape(transformedPoints);
	return { shape: flatShape, points: transformedPoints };
}

/**
 * Bakes motion tracking data into shape keyframes for a mask on clip.
 * Produces keyframes on clip.properties[`mask:${maskId}:shape`].
 */
export function bakeTrackingToMask(
	clip: Clip,
	maskId: string,
	tracker: Tracker,
	fps = 30,
	thinningTolerancePx = 0.5,
	sourceWidth = 1920,
	sourceHeight = 1080
): AnimatedValue<number[]> | null {
	const mask = clip.masks?.find((m) => m.id === maskId);
	if (!mask || tracker.samples.length === 0) return null;

	const seedSourceTime = tracker.seedTime;
	const seedState = evaluateTracker(tracker, seedSourceTime);
	const maskOrigin = computeMaskCenter(mask);

	const stepUs = Math.max(10_000, Math.round(1_000_000 / fps));
	const shapeKeyframes: Keyframe<number[]>[] = [];

	for (let t = clip.start; t <= clip.start + clip.duration; t += stepUs) {
		const localTime = t - clip.start;
		const sourceTime = timelineToSource(clip, t);
		const currentState = evaluateTracker(tracker, sourceTime);

		if (currentState.lost) continue;

		// Compute delta relative to seedState
		const dx = currentState.x - seedState.x;
		const dy = currentState.y - seedState.y;
		const rotRad = currentState.rotation - seedState.rotation;
		const scaleRatio = currentState.scale / Math.max(1e-4, seedState.scale);

		const delta: MaskTransformDelta = {
			dx,
			dy,
			rotationRad: rotRad,
			scale: scaleRatio
		};

		const transformed = transformMaskShape(mask, maskOrigin, delta);
		shapeKeyframes.push({
			time: localTime,
			value: transformed.shape,
			interpolation: 'linear'
		});
	}

	if (shapeKeyframes.length === 0) return null;

	// Thin keyframes component-wise
	// If path or shape has N components, thin using center coordinate motion error
	const centerKeyframes: Keyframe<[number, number]>[] = shapeKeyframes.map((k) => ({
		time: k.time,
		value: [k.value[0] * sourceWidth, k.value[1] * sourceHeight],
		interpolation: 'linear'
	}));

	const thinnedCenters = thinPositionKeyframes(centerKeyframes, thinningTolerancePx);
	const keptTimes = new Set(thinnedCenters.map((k) => k.time));

	const finalKeyframes = shapeKeyframes.filter((k) => keptTimes.has(k.time));

	return {
		keyframes: finalKeyframes
	};
}
