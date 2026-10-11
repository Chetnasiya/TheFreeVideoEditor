/**
 * Video Stabilization Engine (Slice 4).
 *
 * Implements:
 * 1. Trajectory estimation & cumulative camera motion tracking:
 *    Calculates frame-by-frame global displacement (dx, dy), rotation (dtheta), and scale (ds).
 * 2. Trajectory smoothing:
 *    Applies Gaussian convolution / running window filtering over the cumulative motion path
 *    to separate intentional camera pan/zoom from unwanted high-frequency shake/jitter.
 * 3. Counter-motion compensation:
 *    Computes exact inverse transforms:
 *    - offsetPosition = -jitter(x, y) in composition pixels
 *    - offsetRotation = -jitter(rotation) in degrees
 *    - offsetScale = compensation scale factor
 * 4. Auto-crop & zoom margin calculation:
 *    Determines the minimum scale factor s >= 1.0 such that counter-motion translation
 *    and rotation bounds never reveal transparent / black borders beyond footage edges.
 * 5. Keyframe baking & thinning:
 *    Bakes smoothed counter-motion into standard clip position, rotation, and scale keyframe lanes.
 */

import { thinPositionKeyframes } from './apply';
import type { AnimatedValue, Clip, Keyframe, Time, TrackerSample } from '../types';

export interface StabilizationOptions {
	/** Smoothing filter window size in frames (odd integer, e.g., 15 or 31) */
	windowSize?: number;
	/** Gaussian standard deviation (sigma) for smoothing window */
	smoothness?: number;
	/** Whether to stabilize 2D translation (x, y) */
	stabilizeTranslation?: boolean;
	/** Whether to stabilize camera rotation */
	stabilizeRotation?: boolean;
	/** Whether to stabilize camera scale / zoom */
	stabilizeScale?: boolean;
	/** Whether to automatically zoom/scale footage to prevent black borders */
	autoCrop?: boolean;
	/** Extra zoom safety margin factor (default: 1.0) */
	cropMargin?: number;
	/** Maximum zoom percentage permitted (e.g. 150%) */
	maxZoomPercent?: number;
	/** Keyframe thinning tolerance in composition pixels */
	thinningTolerancePx?: number;
}

export interface StabilizationResult {
	/** Computed auto-zoom scale factor (e.g., 1.08 = 8% zoom) */
	autoZoomScale: number;
	/** Position keyframes (composition pixel offsets relative to center) */
	positionKeyframes: Keyframe<[number, number]>[];
	/** Rotation keyframes (degrees) */
	rotationKeyframes: Keyframe<number>[];
	/** Scale keyframes (percentages, where 100 is original scale) */
	scaleKeyframes: Keyframe<[number, number]>[];
	/** Maximum shake displacement in pixels */
	maxShakeDisplacementPx: number;
	/** Root-mean-square residual jitter error */
	residualJitterRms: number;
}

export interface MotionSample {
	sourceTime: Time;
	/** Cumulative x position in pixels */
	x: number;
	/** Cumulative y position in pixels */
	y: number;
	/** Cumulative rotation in radians */
	rotation: number;
	/** Cumulative scale factor */
	scale: number;
}

/**
 * Builds cumulative camera motion trajectory from a Tracker or array of TrackerSamples.
 */
export function buildCumulativeMotion(
	samples: readonly TrackerSample[],
	width: number,
	height: number
): MotionSample[] {
	if (samples.length === 0) return [];

	const sorted = [...samples].sort((a, b) => a.sourceTime - b.sourceTime);
	const seed = sorted[0]!;

	return sorted.map((s) => ({
		sourceTime: s.sourceTime,
		// Pixel offset relative to seed frame
		x: (s.x - seed.x) * width,
		y: (s.y - seed.y) * height,
		rotation: s.rotation,
		scale: s.scale
	}));
}

/**
 * Gaussian kernel generator for smoothing filter.
 */
export function generateGaussianKernel(radius: number, sigma: number): number[] {
	const size = 2 * radius + 1;
	const kernel: number[] = new Array(size);
	let sum = 0;
	const s2 = 2 * sigma * sigma;

	for (let i = -radius; i <= radius; i++) {
		const w = Math.exp(-(i * i) / s2);
		kernel[i + radius] = w;
		sum += w;
	}

	for (let i = 0; i < size; i++) {
		kernel[i] /= sum;
	}

	return kernel;
}

/**
 * Filters cumulative motion trajectory using a Gaussian window with edge clamping.
 */
export function smoothTrajectory(
	trajectory: readonly MotionSample[],
	windowSize: number = 21,
	sigma?: number
): MotionSample[] {
	const n = trajectory.length;
	if (n <= 1) return trajectory.map((p) => ({ ...p }));

	const half = Math.max(1, Math.floor(windowSize / 2));
	const sig = sigma ?? Math.max(1, half / 2.5);
	const kernel = generateGaussianKernel(half, sig);

	const smoothed: MotionSample[] = [];

	for (let i = 0; i < n; i++) {
		let sumX = 0;
		let sumY = 0;
		let sumRot = 0;
		let sumScale = 0;

		for (let k = -half; k <= half; k++) {
			const idx = Math.min(n - 1, Math.max(0, i + k));
			const weight = kernel[k + half]!;
			const sample = trajectory[idx]!;

			sumX += sample.x * weight;
			sumY += sample.y * weight;
			sumRot += sample.rotation * weight;
			sumScale += sample.scale * weight;
		}

		smoothed.push({
			sourceTime: trajectory[i]!.sourceTime,
			x: sumX,
			y: sumY,
			rotation: sumRot,
			scale: sumScale
		});
	}

	return smoothed;
}

/**
 * Calculates optimal auto-zoom scale factor to eliminate edge borders created by counter-motion.
 *
 * For translation (dx, dy) and rotation dtheta, bounding box expansion requires:
 * scale >= (1 + 2 * max(|dx|)/width) and (1 + 2 * max(|dy|)/height) * (|cos| + |sin|)
 */
export function calculateAutoZoomScale(
	jitterX: readonly number[],
	jitterY: readonly number[],
	jitterRot: readonly number[],
	width: number,
	height: number,
	options: { cropMargin?: number; maxZoomPercent?: number } = {}
): number {
	const margin = options.cropMargin ?? 1.0;
	const maxScale = (options.maxZoomPercent ?? 150) / 100;

	let maxScaleNeeded = 1.0;

	for (let i = 0; i < jitterX.length; i++) {
		const jx = Math.abs(jitterX[i]!);
		const jy = Math.abs(jitterY[i]!);
		const rot = Math.abs(jitterRot[i]!);

		// Translation scale requirement: 2 * offset must remain within (scale - 1) * dimension
		const scaleX = 1 + (2 * jx * margin) / width;
		const scaleY = 1 + (2 * jy * margin) / height;

		// Rotation expansion factor
		const rotFactor = Math.cos(rot) + (width / height) * Math.sin(rot);

		const needed = Math.max(scaleX, scaleY) * Math.max(1.0, rotFactor);
		if (needed > maxScaleNeeded) {
			maxScaleNeeded = needed;
		}
	}

	return Math.min(maxScale, Math.max(1.0, maxScaleNeeded));
}

/**
 * Computes complete stabilization compensation curves and keyframes from motion samples.
 */
export function computeStabilization(
	samples: readonly TrackerSample[],
	sourceWidth: number,
	sourceHeight: number,
	clipStartUs: Time,
	options: StabilizationOptions = {}
): StabilizationResult {
	if (samples.length === 0) {
		return {
			autoZoomScale: 1.0,
			positionKeyframes: [],
			rotationKeyframes: [],
			scaleKeyframes: [],
			maxShakeDisplacementPx: 0,
			residualJitterRms: 0
		};
	}

	const windowSize = options.windowSize ?? 21;
	const smoothness = options.smoothness;
	const stabilizeTranslation = options.stabilizeTranslation !== false;
	const stabilizeRotation = options.stabilizeRotation !== false;
	const stabilizeScale = options.stabilizeScale !== false;
	const autoCrop = options.autoCrop !== false;
	const thinningTolerance = options.thinningTolerancePx ?? 0.25;

	// 1. Build cumulative trajectory
	const rawTrajectory = buildCumulativeMotion(samples, sourceWidth, sourceHeight);

	// 2. Smooth trajectory
	const smoothed = smoothTrajectory(rawTrajectory, windowSize, smoothness);

	// 3. Compute counter-motion jitter
	const jitterX: number[] = [];
	const jitterY: number[] = [];
	const jitterRot: number[] = [];
	let maxDisplacement = 0;
	let sumSquaredResiduals = 0;

	for (let i = 0; i < rawTrajectory.length; i++) {
		const raw = rawTrajectory[i]!;
		const smooth = smoothed[i]!;

		const jx = stabilizeTranslation ? raw.x - smooth.x : 0;
		const jy = stabilizeTranslation ? raw.y - smooth.y : 0;
		const jrot = stabilizeRotation ? raw.rotation - smooth.rotation : 0;

		jitterX.push(jx);
		jitterY.push(jy);
		jitterRot.push(jrot);

		const disp = Math.sqrt(jx * jx + jy * jy);
		if (disp > maxDisplacement) {
			maxDisplacement = disp;
		}
		sumSquaredResiduals += jx * jx + jy * jy;
	}

	const residualJitterRms = Math.sqrt(sumSquaredResiduals / Math.max(1, rawTrajectory.length));

	// 4. Calculate auto-zoom scale
	const autoZoom = autoCrop
		? calculateAutoZoomScale(jitterX, jitterY, jitterRot, sourceWidth, sourceHeight, {
				cropMargin: options.cropMargin,
				maxZoomPercent: options.maxZoomPercent
			})
		: 1.0;

	// 5. Generate raw keyframes
	const rawPosKeys: Keyframe<[number, number]>[] = [];
	const rawRotKeys: Keyframe<number>[] = [];
	const rawScaleKeys: Keyframe<[number, number]>[] = [];

	for (let i = 0; i < rawTrajectory.length; i++) {
		const sample = rawTrajectory[i]!;
		const clipLocalTime = Math.max(0, sample.sourceTime - clipStartUs);

		// Compensation translation opposes the jitter
		const compX = -jitterX[i]!;
		const compY = -jitterY[i]!;

		// Compensation rotation opposes jitter angle (converted to degrees)
		const compRotDeg = (-jitterRot[i]! * 180) / Math.PI;

		// Compensation scale multiplies auto-zoom
		const rawScale = rawTrajectory[i]!.scale;
		const smoothScale = smoothed[i]!.scale;
		const compScaleFactor = stabilizeScale
			? autoZoom / Math.max(1e-4, rawScale / Math.max(1e-4, smoothScale))
			: autoZoom;

		rawPosKeys.push({
			time: clipLocalTime,
			value: [compX, compY],
			interpolation: 'linear'
		});

		rawRotKeys.push({
			time: clipLocalTime,
			value: compRotDeg,
			interpolation: 'linear'
		});

		rawScaleKeys.push({
			time: clipLocalTime,
			value: [compScaleFactor * 100, compScaleFactor * 100],
			interpolation: 'linear'
		});
	}

	// 6. Thin keyframes
	const thinnedPosKeys = thinPositionKeyframes(rawPosKeys, thinningTolerance);

	// Thin rotation keyframes with scalar collinear check
	const thinnedRotKeys = thinScalarKeyframes(rawRotKeys, 0.05);

	// Thin scale keyframes
	const thinnedScaleKeys = thinPositionKeyframes(rawScaleKeys, 0.1);

	return {
		autoZoomScale: autoZoom,
		positionKeyframes: thinnedPosKeys,
		rotationKeyframes: thinnedRotKeys,
		scaleKeyframes: thinnedScaleKeys,
		maxShakeDisplacementPx: maxDisplacement,
		residualJitterRms
	};
}

/**
 * 1D scalar keyframe thinning for rotation curves.
 */
function thinScalarKeyframes(
	keyframes: readonly Keyframe<number>[],
	tolerance: number = 0.05
): Keyframe<number>[] {
	if (keyframes.length <= 2) return [...keyframes];

	const n = keyframes.length;
	const keep = new Uint8Array(n);
	keep[0] = 1;
	keep[n - 1] = 1;

	function simplify(start: number, end: number) {
		if (end <= start + 1) return;

		let maxDist = 0;
		let maxIdx = start;

		const t0 = keyframes[start]!.time;
		const v0 = keyframes[start]!.value;
		const t1 = keyframes[end]!.time;
		const v1 = keyframes[end]!.value;
		const dt = t1 - t0;

		for (let i = start + 1; i < end; i++) {
			const t = keyframes[i]!.time;
			const v = keyframes[i]!.value;
			const alpha = dt > 0 ? (t - t0) / dt : 0;
			const expected = v0 + (v1 - v0) * alpha;
			const dist = Math.abs(v - expected);

			if (dist > maxDist) {
				maxDist = dist;
				maxIdx = i;
			}
		}

		if (maxDist > tolerance) {
			keep[maxIdx] = 1;
			simplify(start, maxIdx);
			simplify(maxIdx, end);
		}
	}

	simplify(0, n - 1);

	return keyframes.filter((_, i) => keep[i] === 1);
}

/**
 * Bakes stabilization compensation curves directly into clip properties.
 */
export function bakeStabilizationToClip(
	clip: Clip,
	stabilization: StabilizationResult
): Record<string, AnimatedValue<unknown>> {
	const props = { ...(clip.properties ?? {}) };

	if (stabilization.positionKeyframes.length > 0) {
		props['position'] = { keyframes: stabilization.positionKeyframes };
	}

	if (stabilization.rotationKeyframes.length > 0) {
		props['rotation'] = { keyframes: stabilization.rotationKeyframes };
	}

	if (stabilization.scaleKeyframes.length > 0) {
		props['scale'] = { keyframes: stabilization.scaleKeyframes };
	}

	return props;
}
