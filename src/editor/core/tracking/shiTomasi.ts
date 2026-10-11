/**
 * Shi-Tomasi (Good Features to Track) corner detector.
 * Evaluates the minimum eigenvalue of the spatial gradient auto-correlation matrix:
 * R = min(lambda1, lambda2)
 */

import type { GrayImage } from './prepareFrame';

export interface CornerPoint {
	x: number;
	y: number;
	score: number;
}

/**
 * Detects up to `maxCorners` Shi-Tomasi corners within a region of interest (ROI) or entire image.
 * Uses a minimum eigenvalue threshold and non-maximum suppression with `minDistance`.
 */
export function detectShiTomasiCorners(
	img: GrayImage,
	roi?: { x: number; y: number; width: number; height: number },
	maxCorners: number = 100,
	qualityLevel: number = 0.01,
	minDistance: number = 5
): CornerPoint[] {
	const { width, height, data } = img;

	const startX = Math.max(2, roi ? Math.floor(roi.x) : 2);
	const startY = Math.max(2, roi ? Math.floor(roi.y) : 2);
	const endX = Math.min(width - 3, roi ? Math.ceil(roi.x + roi.width) : width - 3);
	const endY = Math.min(height - 3, roi ? Math.ceil(roi.y + roi.height) : height - 3);

	if (startX >= endX || startY >= endY) return [];

	const scoreMap = new Float32Array(width * height);
	let maxScore = 0;

	// Compute spatial derivatives and 3x3 structure tensor for each pixel in ROI
	for (let y = startY; y <= endY; y++) {
		const row = y * width;
		for (let x = startX; x <= endX; x++) {
			let sumIx2 = 0;
			let sumIy2 = 0;
			let sumIxy = 0;

			// 3x3 neighborhood
			for (let dy = -1; dy <= 1; dy++) {
				const nRow = (y + dy) * width;
				for (let dx = -1; dx <= 1; dx++) {
					const px = x + dx;
					const ix = 0.5 * (data[nRow + px + 1]! - data[nRow + px - 1]!);
					const iy = 0.5 * (data[(y + dy + 1) * width + px]! - data[(y + dy - 1) * width + px]!);

					sumIx2 += ix * ix;
					sumIy2 += iy * iy;
					sumIxy += ix * iy;
				}
			}

			// Eigenvalues of [[sumIx2, sumIxy], [sumIxy, sumIy2]]:
			// lambda = ((a + c) - sqrt((a - c)^2 + 4 * b^2)) / 2
			const a = sumIx2;
			const b = sumIxy;
			const c = sumIy2;
			const trace = a + c;
			const disc = Math.sqrt((a - c) * (a - c) + 4 * b * b);
			const minEigen = 0.5 * (trace - disc);

			scoreMap[row + x] = minEigen;
			if (minEigen > maxScore) {
				maxScore = minEigen;
			}
		}
	}

	const threshold = maxScore * qualityLevel;
	if (threshold <= 1e-6) return [];

	const candidates: CornerPoint[] = [];

	// Local non-maximum suppression in 3x3 window
	for (let y = startY; y <= endY; y++) {
		const row = y * width;
		for (let x = startX; x <= endX; x++) {
			const score = scoreMap[row + x]!;
			if (score < threshold) continue;

			let isLocalMax = true;
			for (let dy = -1; dy <= 1 && isLocalMax; dy++) {
				const nRow = (y + dy) * width;
				for (let dx = -1; dx <= 1; dx++) {
					if (dx === 0 && dy === 0) continue;
					if (scoreMap[nRow + x + dx]! > score) {
						isLocalMax = false;
						break;
					}
				}
			}

			if (isLocalMax) {
				candidates.push({ x, y, score });
			}
		}
	}

	// Sort candidates by score descending
	candidates.sort((a, b) => b.score - a.score);

	// Spatial distance suppression (minDistance)
	const selected: CornerPoint[] = [];
	const minDistSq = minDistance * minDistance;

	for (const pt of candidates) {
		let tooClose = false;
		for (const kept of selected) {
			const dx = pt.x - kept.x;
			const dy = pt.y - kept.y;
			if (dx * dx + dy * dy < minDistSq) {
				tooClose = true;
				break;
			}
		}
		if (!tooClose) {
			selected.push(pt);
			if (selected.length >= maxCorners) break;
		}
	}

	return selected;
}
