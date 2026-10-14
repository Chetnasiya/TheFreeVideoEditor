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
	// Decouple rotation and scale so Hessian is well-conditioned
	let numParams = 2;
	let rotIdx = -1;
	let scaleIdx = -1;
	if (trackRotation) {
		rotIdx = numParams++;
	}
	if (trackScale) {
		scaleIdx = numParams++;
	}

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
		if (rotIdx >= 0) {
			// Rotation derivative: W(x; p) = R * S * x => d/dtheta: [-y, x]^T
			SD[i * numParams + rotIdx] = gx * -y + gy * x;
		}
		if (scaleIdx >= 0) {
			// Scale derivative: d/ds: [x, y]^T
			SD[i * numParams + scaleIdx] = gx * x + gy * y;
		}
	}

	// Precompute spatial window (2D Hann window): 1.0 at center, smoothly decays to 0 at border
	// This suppresses background clutter, aperture edge artifacts, and non-rigid background noise
	const spatialWeights = new Float32Array(N);
	let sumSpatialWeight = 0;
	idx = 0;
	for (let dy = -halfH; dy <= halfH; dy++) {
		const wy = 0.5 * (1 + Math.cos((Math.PI * dy) / (halfH + 1)));
		for (let dx = -halfW; dx <= halfW; dx++) {
			const wx = 0.5 * (1 + Math.cos((Math.PI * dx) / (halfW + 1)));
			const w = wx * wy;
			spatialWeights[idx++] = w;
			sumSpatialWeight += w;
		}
	}

	// Precompute Hessian matrix H = sum(w_i * SD_i * SD_i^T)
	const H = new Float64Array(numParams * numParams);
	for (let i = 0; i < N; i++) {
		const w = spatialWeights[i]!;
		const base = i * numParams;
		for (let r = 0; r < numParams; r++) {
			for (let c = 0; c < numParams; c++) {
				H[r * numParams + c] += w * SD[base + r]! * SD[base + c]!;
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
			const huberW = absErr <= huberThreshold ? 1.0 : huberThreshold / absErr;
			const totalW = huberW * spatialWeights[i]!;

			sumSqErr += spatialWeights[i]! * error * error;

			const base = i * numParams;
			for (let p = 0; p < numParams; p++) {
				b[p] += totalW * SD[base + p]! * error;
			}
		}

		lastRms = Math.sqrt(sumSqErr / Math.max(1e-6, sumSpatialWeight));

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
		const dX = cosR * dp[0]! - sinR * dp[1]!;
		const dY = sinR * dp[0]! + cosR * dp[1]!;
		curX -= dX;
		curY -= dY;

		let dRot = 0;
		if (rotIdx >= 0) {
			dRot = dp[rotIdx]!;
			curRot -= dRot;
		}
		let dScale = 0;
		if (scaleIdx >= 0) {
			dScale = dp[scaleIdx]!;
			// Damped update to prevent overshoot and maintain scale stability
			const clampedDScale = Math.max(-0.4, Math.min(0.4, dScale));
			curScale /= 1.0 + clampedDScale;
			curScale = Math.max(0.02, Math.min(50.0, curScale));
		}

		// Check convergence
		const stepMag = Math.hypot(dX, dY);
		if (stepMag < tolerance && Math.abs(dScale) < tolerance && Math.abs(dRot) < tolerance) {
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

		const patchWidthAtLvl = templateNormRegion.width * tImg.width;
		// Skip overly coarse levels where the feature is smaller than 8 pixels
		// to avoid locking onto background ripples instead of the object
		if (patchWidthAtLvl < 8) {
			continue;
		}

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

		// Only refine scale and rotation on levels where the patch is large enough to contain gradient texture
		const lvlOptions: LkOptions = {
			...options,
			trackScale: Boolean(options.trackScale && halfW >= 8 && halfH >= 8),
			trackRotation: Boolean(options.trackRotation && halfW >= 8 && halfH >= 8)
		};

		const res = refineLkSingleScale(
			tImg,
			tgtImg,
			tCx,
			tCy,
			halfW,
			halfH,
			lvlInitialState,
			lvlOptions
		);

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
