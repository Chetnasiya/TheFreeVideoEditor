/**
 * Deterministic RANSAC 2D similarity solver (translation, rotation, uniform scale).
 * Uses a seeded pseudo-random number generator (Mulberry32) to ensure strict determinism across test runs.
 */

export interface PointCorrespondence {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface SimilarityTransform {
	tx: number;
	ty: number;
	rotation: number; // radians
	scale: number;
	inliers: number[];
}

/**
 * Deterministic Mulberry32 32-bit PRNG.
 */
export function createSeededRandom(seed: number = 42): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Computes exact 2D similarity transform from 2 pairs of correspondences:
 * [x2, y2]^T = s * R * [x1, y1]^T + [tx, ty]^T
 */
export function estimateSimilarity2Points(
	p1: PointCorrespondence,
	p2: PointCorrespondence
): { tx: number; ty: number; rotation: number; scale: number } | null {
	const dx1 = p2.x1 - p1.x1;
	const dy1 = p2.y1 - p1.y1;
	const dx2 = p2.x2 - p1.x2;
	const dy2 = p2.y2 - p1.y2;

	const d1Sq = dx1 * dx1 + dy1 * dy1;
	if (d1Sq < 1e-8) return null; // Degenerate / coincident points

	const d2Sq = dx2 * dx2 + dy2 * dy2;
	const scale = Math.sqrt(d2Sq / d1Sq);

	const theta1 = Math.atan2(dy1, dx1);
	const theta2 = Math.atan2(dy2, dx2);
	const rotation = theta2 - theta1;

	const cosR = Math.cos(rotation) * scale;
	const sinR = Math.sin(rotation) * scale;

	const tx = p1.x2 - (cosR * p1.x1 - sinR * p1.y1);
	const ty = p1.y2 - (sinR * p1.x1 + cosR * p1.y1);

	return { tx, ty, rotation, scale };
}

/**
 * Least-squares similarity fit given all inlier pairs.
 * Solves: [x2, y2] = [a, -b; b, a] * [x1, y1] + [tx, ty]
 * where a = s * cos(theta), b = s * sin(theta)
 */
export function fitSimilarityLeastSquares(
	pairs: readonly PointCorrespondence[],
	inlierIndices: readonly number[]
): { tx: number; ty: number; rotation: number; scale: number } {
	if (inlierIndices.length < 2) {
		return { tx: 0, ty: 0, rotation: 0, scale: 1 };
	}

	let meanX1 = 0;
	let meanY1 = 0;
	let meanX2 = 0;
	let meanY2 = 0;
	const N = inlierIndices.length;

	for (const idx of inlierIndices) {
		const p = pairs[idx]!;
		meanX1 += p.x1;
		meanY1 += p.y1;
		meanX2 += p.x2;
		meanY2 += p.y2;
	}
	meanX1 /= N;
	meanY1 /= N;
	meanX2 /= N;
	meanY2 /= N;

	let num = 0;
	let den = 0;
	let cross = 0;

	for (const idx of inlierIndices) {
		const p = pairs[idx]!;
		const u1 = p.x1 - meanX1;
		const v1 = p.y1 - meanY1;
		const u2 = p.x2 - meanX2;
		const v2 = p.y2 - meanY2;

		den += u1 * u1 + v1 * v1;
		num += u1 * u2 + v1 * v2;
		cross += u1 * v2 - v1 * u2;
	}

	if (den < 1e-8) {
		return { tx: meanX2 - meanX1, ty: meanY2 - meanY1, rotation: 0, scale: 1 };
	}

	const a = num / den;
	const b = cross / den;
	const scale = Math.sqrt(a * a + b * b);
	const rotation = Math.atan2(b, a);

	const cosR = Math.cos(rotation) * scale;
	const sinR = Math.sin(rotation) * scale;

	const tx = meanX2 - (cosR * meanX1 - sinR * meanY1);
	const ty = meanY2 - (sinR * meanX1 + cosR * meanY1);

	return { tx, ty, rotation, scale };
}

/**
 * Deterministic RANSAC for 2D similarity estimation.
 */
export function ransacSimilarity(
	pairs: readonly PointCorrespondence[],
	maxIterations: number = 100,
	inlierThresholdPx: number = 3.0,
	seed: number = 42
): SimilarityTransform {
	if (pairs.length < 2) {
		return { tx: 0, ty: 0, rotation: 0, scale: 1, inliers: [] };
	}

	const rng = createSeededRandom(seed);
	let bestInliers: number[] = [];
	const threshSq = inlierThresholdPx * inlierThresholdPx;
	const N = pairs.length;

	for (let iter = 0; iter < maxIterations; iter++) {
		// Pick 2 distinct random points
		const i1 = Math.floor(rng() * N);
		let i2 = Math.floor(rng() * (N - 1));
		if (i2 >= i1) i2++;

		const model = estimateSimilarity2Points(pairs[i1]!, pairs[i2]!);
		if (!model) continue;

		const cosR = Math.cos(model.rotation) * model.scale;
		const sinR = Math.sin(model.rotation) * model.scale;

		const currentInliers: number[] = [];
		for (let i = 0; i < N; i++) {
			const p = pairs[i]!;
			const predX = cosR * p.x1 - sinR * p.y1 + model.tx;
			const predY = sinR * p.x1 + cosR * p.y1 + model.ty;
			const errSq = (predX - p.x2) * (predX - p.x2) + (predY - p.y2) * (predY - p.y2);

			if (errSq <= threshSq) {
				currentInliers.push(i);
			}
		}

		if (currentInliers.length > bestInliers.length) {
			bestInliers = currentInliers;
			// Early exit if 90% inliers achieved
			if (bestInliers.length >= 0.9 * N) break;
		}
	}

	// Refine model on all inliers
	const refined = fitSimilarityLeastSquares(pairs, bestInliers);
	return {
		tx: refined.tx,
		ty: refined.ty,
		rotation: refined.rotation,
		scale: refined.scale,
		inliers: bestInliers
	};
}
