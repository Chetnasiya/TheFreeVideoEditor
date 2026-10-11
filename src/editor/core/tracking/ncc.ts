/**
 * Normalized Cross-Correlation (NCC) template matcher with sub-pixel peak refinement.
 * Fast, robust translation estimator invariant to linear brightness and contrast changes.
 */

import type { GrayImage } from './prepareFrame';

export interface NccMatchResult {
	/** Best integer or subpixel match position (center x, y in image coordinates) */
	x: number;
	y: number;
	/** Peak NCC score in [-1, 1] */
	score: number;
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
	const patchW = halfW * 2 + 1;
	const patchH = halfH * 2 + 1;
	const startX = Math.round(cx - halfW);
	const startY = Math.round(cy - halfH);

	if (startX < 0 || startY < 0 || startX + patchW > img.width || startY + patchH > img.height) {
		return null;
	}

	const patch = new Float32Array(patchW * patchH);
	let sum = 0;
	let idx = 0;
	for (let y = 0; y < patchH; y++) {
		const row = (startY + y) * img.width;
		for (let x = 0; x < patchW; x++) {
			const val = img.data[row + startX + x]!;
			patch[idx++] = val;
			sum += val;
		}
	}

	const count = patchW * patchH;
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

	const minX = Math.max(halfW, Math.round(searchCx - searchRadius));
	const maxX = Math.min(targetImg.width - 1 - halfW, Math.round(searchCx + searchRadius));
	const minY = Math.max(halfH, Math.round(searchCy - searchRadius));
	const maxY = Math.min(targetImg.height - 1 - halfH, Math.round(searchCy + searchRadius));

	if (minX > maxX || minY > maxY) {
		return { x: searchCx, y: searchCy, score: 0 };
	}

	const gridW = maxX - minX + 1;
	const gridH = maxY - minY + 1;
	const scoreGrid = new Float32Array(gridW * gridH);

	let bestScore = -1;
	let bestIx = 0;
	let bestIy = 0;

	for (let sy = minY; sy <= maxY; sy++) {
		const gridY = sy - minY;
		for (let sx = minX; sx <= maxX; sx++) {
			const gridX = sx - minX;

			const startX = sx - halfW;
			const startY = sy - halfH;

			// Compute mean of candidate window
			let winSum = 0;
			for (let py = 0; py < patchH; py++) {
				const row = (startY + py) * targetImg.width;
				for (let px = 0; px < patchW; px++) {
					winSum += targetImg.data[row + startX + px]!;
				}
			}
			const winMean = winSum / count;

			// Compute dot product and candidate norm
			let dot = 0;
			let winSumSq = 0;
			let pIdx = 0;
			for (let py = 0; py < patchH; py++) {
				const row = (startY + py) * targetImg.width;
				for (let px = 0; px < patchW; px++) {
					const diff = targetImg.data[row + startX + px]! - winMean;
					winSumSq += diff * diff;
					dot += templatePatch[pIdx++]! * diff;
				}
			}

			const winNorm = Math.sqrt(winSumSq);
			let ncc = 0;
			if (winNorm > 1e-6) {
				ncc = dot / (templateNorm * winNorm);
			}

			scoreGrid[gridY * gridW + gridX] = ncc;
			if (ncc > bestScore) {
				bestScore = ncc;
				bestIx = gridX;
				bestIy = gridY;
			}
		}
	}

	let subX = minX + bestIx;
	let subY = minY + bestIy;

	// Sub-pixel quadratic peak interpolation:
	// f(x) = a x^2 + b x + c => peak offset dx = -b / (2a) = (f(x-1) - f(x+1)) / (2 * (f(x-1) - 2f(x) + f(x+1)))
	if (bestIx > 0 && bestIx < gridW - 1) {
		const left = scoreGrid[bestIy * gridW + bestIx - 1]!;
		const mid = bestScore;
		const right = scoreGrid[bestIy * gridW + bestIx + 1]!;
		const denom = left - 2 * mid + right;
		if (denom < -1e-6) {
			const dx = (left - right) / (2 * denom);
			if (Math.abs(dx) <= 1) {
				subX += dx;
			}
		}
	}

	if (bestIy > 0 && bestIy < gridH - 1) {
		const top = scoreGrid[(bestIy - 1) * gridW + bestIx]!;
		const mid = bestScore;
		const bottom = scoreGrid[(bestIy + 1) * gridW + bestIx]!;
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
