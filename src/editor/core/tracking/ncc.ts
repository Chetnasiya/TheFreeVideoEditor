/**
 * Normalized Cross-Correlation (NCC) template matcher with sub-pixel peak refinement.
 * Fast, robust translation estimator invariant to linear brightness and contrast changes.
 */

import type { GrayImage } from './prepareFrame';
import { sampleBilinear } from './lk';

export interface NccMatchResult {
	/** Best integer or subpixel match position (center x, y in image coordinates) */
	x: number;
	y: number;
	/** Peak NCC score in [-1, 1] */
	score: number;
	/** Estimated scale multiplier if multi-scale search was used */
	scale?: number;
}

/**
 * Extracts a rectangular patch from GrayImage.
 * Returns mean-subtracted and normalized patch values.
 */
export function extractNormalizedPatch(
	img: GrayImage,
	cx: number,
	cy: number,
	halfW: number,
	halfH: number
): { patch: Float32Array; norm: number; mean: number } | null {
	return extractNormalizedPatchScaled(img, cx, cy, halfW, halfH, 1.0);
}

/**
 * Extracts a rectangular patch from GrayImage with arbitrary float center and scale multiplier.
 */
export function extractNormalizedPatchScaled(
	img: GrayImage,
	cx: number,
	cy: number,
	halfW: number,
	halfH: number,
	scale: number = 1.0
): { patch: Float32Array; norm: number; mean: number } | null {
	const patchW = halfW * 2 + 1;
	const patchH = halfH * 2 + 1;
	const count = patchW * patchH;

	// Check bounds with scale
	const maxExtentX = halfW * scale;
	const maxExtentY = halfH * scale;
	if (
		cx - maxExtentX < 0 ||
		cy - maxExtentY < 0 ||
		cx + maxExtentX > img.width - 1 ||
		cy + maxExtentY > img.height - 1
	) {
		return null;
	}

	const patch = new Float32Array(count);
	let sum = 0;
	let idx = 0;

	if (Math.abs(scale - 1.0) < 1e-4 && Number.isInteger(cx) && Number.isInteger(cy)) {
		const startX = cx - halfW;
		const startY = cy - halfH;
		for (let y = 0; y < patchH; y++) {
			const row = (startY + y) * img.width;
			for (let x = 0; x < patchW; x++) {
				const val = img.data[row + startX + x]!;
				patch[idx++] = val;
				sum += val;
			}
		}
	} else {
		for (let dy = -halfH; dy <= halfH; dy++) {
			const sy = cy + dy * scale;
			for (let dx = -halfW; dx <= halfW; dx++) {
				const sx = cx + dx * scale;
				const val = sampleBilinear(img, sx, sy);
				patch[idx++] = val;
				sum += val;
			}
		}
	}

	const mean = sum / count;
	let sumSq = 0;
	for (let i = 0; i < count; i++) {
		const diff = patch[i]! - mean;
		patch[i] = diff;
		sumSq += diff * diff;
	}

	const norm = Math.sqrt(sumSq);
	return { patch, norm, mean };
}

/**
 * Searches for `template` within `searchRadius` pixels around `(searchCx, searchCy)` in `targetImg`.
 * Uses sub-pixel quadratic peak interpolation for subpixel translation recovery.
 */
export function matchTemplateNcc(
	targetImg: GrayImage,
	templatePatch: Float32Array,
	templateNorm: number,
	halfW: number,
	halfH: number,
	searchCx: number,
	searchCy: number,
	searchRadius: number
): NccMatchResult {
	if (templateNorm < 1e-6) {
		// Low-texture / flat template
		return { x: searchCx, y: searchCy, score: 0 };
	}

	const patchW = halfW * 2 + 1;
	const patchH = halfH * 2 + 1;
	const count = patchW * patchH;
	const invCount = 1.0 / count;

	const minX = Math.max(halfW, Math.round(searchCx - searchRadius));
	const maxX = Math.min(targetImg.width - 1 - halfW, Math.round(searchCx + searchRadius));
	const minY = Math.max(halfH, Math.round(searchCy - searchRadius));
	const maxY = Math.min(targetImg.height - 1 - halfH, Math.round(searchCy + searchRadius));

	if (minX > maxX || minY > maxY) {
		return { x: searchCx, y: searchCy, score: 0 };
	}

	const imgWidth = targetImg.width;
	const imgData = targetImg.data;

	// Precompute template sum (usually ~0 due to mean subtraction)
	let templateSum = 0;
	for (let i = 0; i < count; i++) {
		templateSum += templatePatch[i]!;
	}

	// Helper to evaluate NCC at candidate center (sx, sy) in a single cache-friendly pass
	const evalNccAt = (sx: number, sy: number): number => {
		const startX = sx - halfW;
		const startY = sy - halfH;

		let winSum = 0;
		let winSumSq = 0;
		let dot = 0;
		let pIdx = 0;

		for (let py = 0; py < patchH; py++) {
			const row = (startY + py) * imgWidth + startX;
			for (let px = 0; px < patchW; px++) {
				const val = imgData[row + px]!;
				winSum += val;
				winSumSq += val * val;
				dot += templatePatch[pIdx++]! * val;
			}
		}

		// Subtract any residual template mean correlation
		dot -= templateSum * winSum * invCount;

		const varVal = winSumSq - winSum * winSum * invCount;
		if (varVal <= 1e-6) return 0;
		const winNorm = Math.sqrt(varVal);
		return dot / (templateNorm * winNorm);
	};

	// Determine if coarse-to-fine hierarchical search is beneficial
	const isLargeSearch = searchRadius > 24;
	const coarseStep = isLargeSearch ? Math.max(2, Math.floor(searchRadius / 16)) : 1;

	let coarseBestScore = -1;
	let coarseBestSx = Math.round(searchCx);
	let coarseBestSy = Math.round(searchCy);

	// Stage 1: Coarse search (or direct search if searchRadius <= 24)
	for (let sy = minY; sy <= maxY; sy += coarseStep) {
		for (let sx = minX; sx <= maxX; sx += coarseStep) {
			const ncc = evalNccAt(sx, sy);
			if (ncc > coarseBestScore) {
				coarseBestScore = ncc;
				coarseBestSx = sx;
				coarseBestSy = sy;
			}
		}
	}

	// Stage 2: Local fine refinement around peak with sub-pixel interpolation
	const fineRadius = isLargeSearch ? coarseStep : 1;
	const fineMinX = Math.max(minX, coarseBestSx - fineRadius);
	const fineMaxX = Math.min(maxX, coarseBestSx + fineRadius);
	const fineMinY = Math.max(minY, coarseBestSy - fineRadius);
	const fineMaxY = Math.min(maxY, coarseBestSy + fineRadius);

	const fineW = fineMaxX - fineMinX + 1;
	const fineH = fineMaxY - fineMinY + 1;
	const localScores = new Float32Array(fineW * fineH);

	let bestScore = -1;
	let bestFineIx = 0;
	let bestFineIy = 0;

	for (let sy = fineMinY; sy <= fineMaxY; sy++) {
		const gy = sy - fineMinY;
		for (let sx = fineMinX; sx <= fineMaxX; sx++) {
			const gx = sx - fineMinX;
			const ncc = evalNccAt(sx, sy);
			localScores[gy * fineW + gx] = ncc;
			if (ncc > bestScore) {
				bestScore = ncc;
				bestFineIx = gx;
				bestFineIy = gy;
			}
		}
	}

	let subX = fineMinX + bestFineIx;
	let subY = fineMinY + bestFineIy;

	// Sub-pixel quadratic peak interpolation:
	if (bestFineIx > 0 && bestFineIx < fineW - 1) {
		const left = localScores[bestFineIy * fineW + bestFineIx - 1]!;
		const mid = bestScore;
		const right = localScores[bestFineIy * fineW + bestFineIx + 1]!;
		const denom = left - 2 * mid + right;
		if (denom < -1e-6) {
			const dx = (left - right) / (2 * denom);
			if (Math.abs(dx) <= 1) {
				subX += dx;
			}
		}
	}

	if (bestFineIy > 0 && bestFineIy < fineH - 1) {
		const top = localScores[(bestFineIy - 1) * fineW + bestFineIx]!;
		const mid = bestScore;
		const bottom = localScores[(bestFineIy + 1) * fineW + bestFineIx]!;
		const denom = top - 2 * mid + bottom;
		if (denom < -1e-6) {
			const dy = (top - bottom) / (2 * denom);
			if (Math.abs(dy) <= 1) {
				subY += dy;
			}
		}
	}

	return {
		x: subX,
		y: subY,
		score: Math.max(-1, Math.min(1, bestScore))
	};
}

/**
 * Computes direct Normalized Cross-Correlation (NCC) between templatePatch and
 * a target window centered at (cx, cy) sampled with arbitrary scale multiplier.
 */
export function evaluatePatchNcc(
	targetImg: GrayImage,
	templatePatch: Float32Array,
	templateNorm: number,
	cx: number,
	cy: number,
	halfW: number,
	halfH: number,
	scale: number = 1.0
): number {
	if (templateNorm < 1e-6) return 0;
	const cand = extractNormalizedPatchScaled(targetImg, cx, cy, halfW, halfH, scale);
	if (!cand || cand.norm < 1e-6) return -1;
	let dot = 0;
	const count = templatePatch.length;
	for (let i = 0; i < count; i++) {
		dot += templatePatch[i]! * cand.patch[i]!;
	}
	return Math.max(-1, Math.min(1, dot / (templateNorm * cand.norm)));
}

/**
 * Multi-scale template matching across candidate scale hypotheses.
 * Evaluates candidate scales [currentScale * 0.94, currentScale, currentScale * 1.06]
 * to find the optimal scale and translation.
 */
export function matchTemplateNccMultiScale(
	targetImg: GrayImage,
	templatePatch: Float32Array,
	templateNorm: number,
	halfW: number,
	halfH: number,
	searchCx: number,
	searchCy: number,
	searchRadius: number,
	currentScale: number = 1.0,
	testScales: boolean = true
): NccMatchResult {
	const base = matchTemplateNcc(
		targetImg,
		templatePatch,
		templateNorm,
		halfW,
		halfH,
		searchCx,
		searchCy,
		searchRadius
	);

	if (!testScales || base.score <= 0) {
		return { ...base, scale: currentScale };
	}

	// Test scale candidates around current scale
	const scaleCandidates = [
		Math.max(0.05, currentScale * 0.94),
		currentScale,
		Math.min(20.0, currentScale * 1.06)
	];

	let bestScale = currentScale;
	let bestScore = base.score;

	for (const candScale of scaleCandidates) {
		if (Math.abs(candScale - currentScale) < 1e-3) continue;
		const sScore = evaluatePatchNcc(
			targetImg,
			templatePatch,
			templateNorm,
			base.x,
			base.y,
			halfW,
			halfH,
			candScale
		);
		if (sScore > bestScore) {
			bestScore = sScore;
			bestScale = candScale;
		}
	}

	return {
		...base,
		score: Math.max(base.score, bestScore),
		scale: bestScale
	};
}
