/**
 * Inverse-Compositional Lucas-Kanade (Baker-Dellaert-Matthews) optical flow
 * with robust Huber loss re-weighting and support for translation and 2D similarity (scale + rotation).
 */

import type { GrayImage } from './prepareFrame';
import type { ImagePyramid } from './pyramid';

export interface LkState {
	x: number;
	y: number;
	rotation: number; // radians
	scale: number;
}

export interface LkOptions {
	trackRotation: boolean;
	trackScale: boolean;
	maxIterations: number;
	tolerance: number;
	huberThreshold: number;
}

/**
 * Bilinear sampling of GrayImage at floating-point (x, y).
 */
export function sampleBilinear(img: GrayImage, x: number, y: number): number {
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	if (x0 < 0 || y0 < 0 || x0 >= img.width - 1 || y0 >= img.height - 1) {
		const cx = Math.max(0, Math.min(img.width - 1, Math.round(x)));
		const cy = Math.max(0, Math.min(img.height - 1, Math.round(y)));
		return img.data[cy * img.width + cx]!;
	}

	const fx = x - x0;
	const fy = y - y0;
	const w00 = (1 - fx) * (1 - fy);
	const w10 = fx * (1 - fy);
	const w01 = (1 - fx) * fy;
	const w11 = fx * fy;

	const row0 = y0 * img.width;
	const row1 = (y0 + 1) * img.width;

	return (
		w00 * img.data[row0 + x0]! +
		w10 * img.data[row0 + x0 + 1]! +
		w01 * img.data[row1 + x0]! +
		w11 * img.data[row1 + x0 + 1]!
	);
}

/**
 * Inverse-compositional LK single-scale refinement.
 * Refines `currentState` tracking template from `templateImg` into `targetImg`.
 */
export function refineLkSingleScale(
	templateImg: GrayImage,
	targetImg: GrayImage,
	templateCx: number,
	templateCy: number,
	halfW: number,
	halfH: number,
	initialState: LkState,
	options: LkOptions
): { state: LkState; errorRms: number; converged: boolean } {
	const { trackRotation, trackScale, maxIterations, tolerance, huberThreshold } = options;
	const patchW = halfW * 2 + 1;
	const patchH = halfH * 2 + 1;
	const N = patchW * patchH;

	// Number of parameters:
	// p = [dx, dy] (translation: 2)
	// or [dx, dy, dtheta, ds] (similarity: 4)
	const numParams = trackRotation || trackScale ? 4 : 2;

	// Precompute template values, gradients, and steepest descent images on template
	const T = new Float32Array(N);
	const Gx = new Float32Array(N);
	const Gy = new Float32Array(N);
	const coordsX = new Float32Array(N);
	const coordsY = new Float32Array(N);

	let idx = 0;
	for (let dy = -halfH; dy <= halfH; dy++) {
		for (let dx = -halfW; dx <= halfW; dx++) {
			const tx = templateCx + dx;
			const ty = templateCy + dy;
			coordsX[idx] = dx;
			coordsY[idx] = dy;

			T[idx] = sampleBilinear(templateImg, tx, ty);
			const gx =
				0.5 * (sampleBilinear(templateImg, tx + 1, ty) - sampleBilinear(templateImg, tx - 1, ty));
			const gy =
				0.5 * (sampleBilinear(templateImg, tx, ty + 1) - sampleBilinear(templateImg, tx, ty - 1));
			Gx[idx] = gx;
			Gy[idx] = gy;
			idx++;
		}
	}

	// Steepest descent images: J = [gx, gy, gx*(-y) + gy*x, gx*x + gy*y]
	const SD = new Float32Array(N * numParams);
	for (let i = 0; i < N; i++) {
		const gx = Gx[i]!;
		const gy = Gy[i]!;
		const x = coordsX[i]!;
		const y = coordsY[i]!;

		SD[i * numParams + 0] = gx;
		SD[i * numParams + 1] = gy;
		if (numParams === 4) {
			// Rotation derivative: W(x; p) = R * S * x
			// d/dtheta: [-y, x]^T
			SD[i * numParams + 2] = gx * -y + gy * x;
			// Scale derivative: d/ds: [x, y]^T
			SD[i * numParams + 3] = gx * x + gy * y;
		}
	}

	// Precompute Hessian matrix H = sum(SD_i * SD_i^T)
	const H = new Float64Array(numParams * numParams);
	for (let i = 0; i < N; i++) {
		const base = i * numParams;
		for (let r = 0; r < numParams; r++) {
			for (let c = 0; c < numParams; c++) {
				H[r * numParams + c] += SD[base + r]! * SD[base + c]!;
			}
		}
	}

	// Add mild Levenberg-Marquardt regularization to ensure invertible Hessian
	for (let d = 0; d < numParams; d++) {
		H[d * numParams + d] += 1e-4;
	}

	// Invert Hessian
	const Hinv = invertMatrix(H, numParams);
	if (!Hinv) {
		return { state: { ...initialState }, errorRms: 1.0, converged: false };
	}

	let curX = initialState.x;
	let curY = initialState.y;
	let curRot = initialState.rotation;
	let curScale = initialState.scale;

	let lastRms = 0;
	let iter = 0;

	for (; iter < maxIterations; iter++) {
		// Warp target into template frame: W(x; p)
		const cosR = Math.cos(curRot) * curScale;
		const sinR = Math.sin(curRot) * curScale;

		const b = new Float64Array(numParams);
		let sumSqErr = 0;

		for (let i = 0; i < N; i++) {
			const dx = coordsX[i]!;
			const dy = coordsY[i]!;

			// Target coordinate:
			const wx = curX + (cosR * dx - sinR * dy);
			const wy = curY + (sinR * dx + cosR * dy);

			const targetVal = sampleBilinear(targetImg, wx, wy);
			const error = targetVal - T[i]!;

			// Huber weighting for robustness against outliers / occlusions
			const absErr = Math.abs(error);
			const weight = absErr <= huberThreshold ? 1.0 : huberThreshold / absErr;

			sumSqErr += error * error;

			const base = i * numParams;
			for (let p = 0; p < numParams; p++) {
				b[p] += weight * SD[base + p]! * error;
			}
		}

		lastRms = Math.sqrt(sumSqErr / N);

		// Compute dp = Hinv * b
		const dp = new Float64Array(numParams);
		for (let r = 0; r < numParams; r++) {
			let s = 0;
			for (let c = 0; c < numParams; c++) {
				s += Hinv[r * numParams + c]! * b[c]!;
			}
			dp[r] = s;
		}

		// Update warp: W(x; p) <- W(x; p) \circ W(x; dp)^-1
		const dX = dp[0]!;
		const dY = dp[1]!;
		curX -= dX;
		curY -= dY;

		if (numParams === 4) {
			const dRot = dp[2]!;
			const dScale = dp[3]!;
			if (trackRotation) curRot -= dRot;
			if (trackScale) curScale /= 1.0 + dScale;
		}

		// Check convergence
		const stepMag = Math.sqrt(dX * dX + dY * dY);
		if (stepMag < tolerance) {
			break;
		}
	}

	return {
		state: {
			x: curX,
			y: curY,
			rotation: curRot,
			scale: Math.max(0.01, curScale)
		},
		errorRms: lastRms,
		converged: iter < maxIterations
	};
}

/**
 * Multi-scale (pyramidal) Inverse-Compositional LK refinement.
 */
export function trackLkPyramid(
	templatePyramid: ImagePyramid,
	targetPyramid: ImagePyramid,
	templateNormRegion: { x: number; y: number; width: number; height: number },
	initialState: LkState,
	options: LkOptions
): { state: LkState; errorRms: number; confidence: number } {
	let state = { ...initialState };
	const numLevels = Math.min(templatePyramid.numLevels, targetPyramid.numLevels);

	let lastRms = 0;

	// Coarse-to-fine loop
	for (let lvl = numLevels - 1; lvl >= 0; lvl--) {
		const tImg = templatePyramid.levels[lvl]!;
		const tgtImg = targetPyramid.levels[lvl]!;

		const scaleFactor = tImg.width / templatePyramid.levels[0]!.width;

		const tCx = templateNormRegion.x * tImg.width;
		const tCy = templateNormRegion.y * tImg.height;
		const halfW = Math.max(4, Math.round((templateNormRegion.width * tImg.width) / 2));
		const halfH = Math.max(4, Math.round((templateNormRegion.height * tImg.height) / 2));

		const lvlInitialState: LkState = {
			x: state.x * scaleFactor,
			y: state.y * scaleFactor,
			rotation: state.rotation,
			scale: state.scale
		};

		const res = refineLkSingleScale(tImg, tgtImg, tCx, tCy, halfW, halfH, lvlInitialState, options);

		state = {
			x: res.state.x / scaleFactor,
			y: res.state.y / scaleFactor,
			rotation: res.state.rotation,
			scale: res.state.scale
		};
		lastRms = res.errorRms;
	}

	// Normalized confidence heuristic based on RMS intensity error
	const confidence = Math.max(0, Math.min(1, 1.0 - lastRms * 2.5));

	return {
		state,
		errorRms: lastRms,
		confidence
	};
}

/**
 * Gaussian-Jordan elimination matrix inversion for small matrices (2x2 or 4x4).
 */
function invertMatrix(mat: Float64Array, n: number): Float64Array | null {
	const a = new Float64Array(n * 2 * n);
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			a[i * 2 * n + j] = mat[i * n + j]!;
		}
		a[i * 2 * n + n + i] = 1.0;
	}

	for (let i = 0; i < n; i++) {
		// Find pivot
		let maxVal = Math.abs(a[i * 2 * n + i]!);
		let maxRow = i;
		for (let k = i + 1; k < n; k++) {
			const val = Math.abs(a[k * 2 * n + i]!);
			if (val > maxVal) {
				maxVal = val;
				maxRow = k;
			}
		}

		if (maxVal < 1e-12) return null; // Singular

		// Swap rows
		if (maxRow !== i) {
			for (let k = 0; k < 2 * n; k++) {
				const tmp = a[i * 2 * n + k]!;
				a[i * 2 * n + k] = a[maxRow * 2 * n + k]!;
				a[maxRow * 2 * n + k] = tmp;
			}
		}

		// Normalize pivot row
		const pivot = a[i * 2 * n + i]!;
		for (let k = 0; k < 2 * n; k++) {
			a[i * 2 * n + k] /= pivot;
		}

		// Eliminate
		for (let row = 0; row < n; row++) {
			if (row !== i) {
				const factor = a[row * 2 * n + i]!;
				for (let k = 0; k < 2 * n; k++) {
					a[row * 2 * n + k] -= factor * a[i * 2 * n + k]!;
				}
			}
		}
	}

	const inv = new Float64Array(n * n);
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			inv[i * n + j] = a[i * 2 * n + n + j]!;
		}
	}

	return inv;
}
