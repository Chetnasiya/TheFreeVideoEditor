/**
 * Evaluation and smoothing utilities for Tracker samples.
 * Evaluates tracker coordinates at arbitrary source time via interpolation,
 * applying optional Gaussian window smoothing.
 */

import type { Time, Tracker, TrackerSample, TrackerSmoothing } from '../types';

export interface EvaluatedTrackerState {
	sourceTime: Time;
	x: number;
	y: number;
	rotation: number; // radians
	scale: number;
	confidence: number;
	lost: boolean;
	inBounds: boolean;
}

/**
 * Applies temporal smoothing to an array of samples.
 * Uses a Gaussian window filter over valid / high-confidence samples.
 */
export function smoothSamples(
	samples: readonly TrackerSample[],
	smoothing?: TrackerSmoothing
): TrackerSample[] {
	if (!smoothing?.enabled || samples.length <= 1) {
		return samples.map((s) => ({ ...s }));
	}

	const halfWindow = Math.max(1, Math.floor(smoothing.windowFrames / 2));
	const posSigma = smoothing.positionSigma ?? 2.0;
	const rotSigma = smoothing.rotationSigma ?? 2.0;
	const scaleSigma = smoothing.scaleSigma ?? 2.0;

	const n = samples.length;
	const out: TrackerSample[] = [];

	for (let i = 0; i < n; i++) {
		const cur = samples[i]!;
		if (cur.lost) {
			out.push({ ...cur });
			continue;
		}

		let sumPosWeight = 0;
		let sumRotWeight = 0;
		let sumScaleWeight = 0;

		let weightedX = 0;
		let weightedY = 0;
		let weightedRotSin = 0;
		let weightedRotCos = 0;
		let weightedScale = 0;

		const startJ = Math.max(0, i - halfWindow);
		const endJ = Math.min(n - 1, i + halfWindow);

		for (let j = startJ; j <= endJ; j++) {
			const neighbor = samples[j]!;
			if (neighbor.lost) continue;

			const dist = j - i;

			// Gaussian weights
			const wPos = Math.exp(-(dist * dist) / (2 * posSigma * posSigma));
			const wRot = Math.exp(-(dist * dist) / (2 * rotSigma * rotSigma));
			const wScale = Math.exp(-(dist * dist) / (2 * scaleSigma * scaleSigma));

			sumPosWeight += wPos;
			weightedX += neighbor.x * wPos;
			weightedY += neighbor.y * wPos;

			sumRotWeight += wRot;
			weightedRotSin += Math.sin(neighbor.rotation) * wRot;
			weightedRotCos += Math.cos(neighbor.rotation) * wRot;

			sumScaleWeight += wScale;
			weightedScale += neighbor.scale * wScale;
		}

		out.push({
			...cur,
			x: sumPosWeight > 0 ? weightedX / sumPosWeight : cur.x,
			y: sumPosWeight > 0 ? weightedY / sumPosWeight : cur.y,
			rotation: sumRotWeight > 0 ? Math.atan2(weightedRotSin, weightedRotCos) : cur.rotation,
			scale: sumScaleWeight > 0 ? weightedScale / sumScaleWeight : cur.scale
		});
	}

	return out;
}

/**
 * Evaluates a tracker's position, rotation, scale, and confidence at a given source time.
 * If sourceTime falls between key samples, performs linear/spherical interpolation.
 */
export function evaluateTracker(tracker: Tracker, sourceTime: Time): EvaluatedTrackerState {
	const rawSamples = tracker.samples;
	if (!rawSamples || rawSamples.length === 0) {
		return {
			sourceTime,
			x: tracker.initialRegion.x,
			y: tracker.initialRegion.y,
			rotation: 0,
			scale: 1,
			confidence: 1.0,
			lost: false,
			inBounds: true
		};
	}

	const samples = tracker.smoothing?.enabled
		? smoothSamples(rawSamples, tracker.smoothing)
		: rawSamples;

	// Exact or clamped boundary cases
	if (sourceTime <= samples[0]!.sourceTime) {
		const s = samples[0]!;
		return {
			sourceTime,
			x: s.x,
			y: s.y,
			rotation: s.rotation,
			scale: s.scale,
			confidence: s.confidence,
			lost: !!s.lost,
			inBounds: s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1
		};
	}

	const last = samples[samples.length - 1]!;
	if (sourceTime >= last.sourceTime) {
		return {
			sourceTime,
			x: last.x,
			y: last.y,
			rotation: last.rotation,
			scale: last.scale,
			confidence: last.confidence,
			lost: !!last.lost,
			inBounds: last.x >= 0 && last.x <= 1 && last.y >= 0 && last.y <= 1
		};
	}

	// Binary search for sample interval [i, i+1]
	let low = 0;
	let high = samples.length - 1;
	while (low <= high) {
		const mid = (low + high) >> 1;
		if (samples[mid]!.sourceTime <= sourceTime) {
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	const idx0 = Math.max(0, high);
	const idx1 = Math.min(samples.length - 1, idx0 + 1);
	const s0 = samples[idx0]!;
	const s1 = samples[idx1]!;

	if (idx0 === idx1 || s1.sourceTime === s0.sourceTime) {
		return {
			sourceTime,
			x: s0.x,
			y: s0.y,
			rotation: s0.rotation,
			scale: s0.scale,
			confidence: s0.confidence,
			lost: !!s0.lost,
			inBounds: s0.x >= 0 && s0.x <= 1 && s0.y >= 0 && s0.y <= 1
		};
	}

	const alpha = (sourceTime - s0.sourceTime) / (s1.sourceTime - s0.sourceTime);

	// Interpolate position
	const x = s0.x + alpha * (s1.x - s0.x);
	const y = s0.y + alpha * (s1.y - s0.y);

	// Interpolate rotation (unwrapped shortest angular path)
	let diffAngle = s1.rotation - s0.rotation;
	while (diffAngle > Math.PI) diffAngle -= 2 * Math.PI;
	while (diffAngle < -Math.PI) diffAngle += 2 * Math.PI;
	const rotation = s0.rotation + alpha * diffAngle;

	// Interpolate scale
	const scale = s0.scale + alpha * (s1.scale - s0.scale);

	// Interpolate confidence
	const confidence = s0.confidence + alpha * (s1.confidence - s0.confidence);
	const lost = s0.lost || s1.lost || confidence < tracker.params.confidenceThreshold;

	return {
		sourceTime,
		x,
		y,
		rotation,
		scale,
		confidence,
		lost,
		inBounds: x >= 0 && x <= 1 && y >= 0 && y <= 1
	};
}

/**
 * Checks whether an existing tracker's cached samples are stale relative to current asset fingerprint.
 */
export function isTrackerStale(tracker: Tracker, currentAssetFingerprint?: string): boolean {
	if (!tracker.assetFingerprint || !currentAssetFingerprint) return false;
	return tracker.assetFingerprint !== currentAssetFingerprint;
}
