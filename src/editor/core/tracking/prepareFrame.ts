/**
 * Image preparation utilities for motion tracking.
 * Converts RGBA image buffers into single-channel Float32Array luminance planes [0, 1]
 * with optional downscaling and box/gaussian blurring.
 */

export interface GrayImage {
	data: Float32Array;
	width: number;
	height: number;
}

/**
 * Converts an RGBA ImageData or Uint8ClampedArray to single-channel Float32 luminance.
 * Uses standard Rec.709 coefficients: Y = 0.2126 R + 0.7152 G + 0.0722 B, normalized to [0, 1].
 */
export function toGrayscale(
	rgba: Uint8ClampedArray | Uint8Array,
	width: number,
	height: number
): GrayImage {
	const count = width * height;
	const out = new Float32Array(count);
	let srcIdx = 0;
	for (let i = 0; i < count; i++) {
		const r = rgba[srcIdx]!;
		const g = rgba[srcIdx + 1]!;
		const b = rgba[srcIdx + 2]!;
		out[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0;
		srcIdx += 4;
	}
	return { data: out, width, height };
}

/**
 * Bilinear downscale of a grayscale image to a target width and height.
 */
export function downscaleGray(
	img: GrayImage,
	targetWidth: number,
	targetHeight: number
): GrayImage {
	if (img.width === targetWidth && img.height === targetHeight) {
		return { data: new Float32Array(img.data), width: targetWidth, height: targetHeight };
	}

	const out = new Float32Array(targetWidth * targetHeight);
	const scaleX = img.width / targetWidth;
	const scaleY = img.height / targetHeight;

	for (let y = 0; y < targetHeight; y++) {
		const srcY = (y + 0.5) * scaleY - 0.5;
		const y0 = Math.max(0, Math.min(img.height - 1, Math.floor(srcY)));
		const y1 = Math.max(0, Math.min(img.height - 1, y0 + 1));
		const wy1 = Math.max(0, Math.min(1, srcY - y0));
		const wy0 = 1 - wy1;

		const row0 = y0 * img.width;
		const row1 = y1 * img.width;
		const outRow = y * targetWidth;

		for (let x = 0; x < targetWidth; x++) {
			const srcX = (x + 0.5) * scaleX - 0.5;
			const x0 = Math.max(0, Math.min(img.width - 1, Math.floor(srcX)));
			const x1 = Math.max(0, Math.min(img.width - 1, x0 + 1));
			const wx1 = Math.max(0, Math.min(1, srcX - x0));
			const wx0 = 1 - wx1;

			const v00 = img.data[row0 + x0]!;
			const v10 = img.data[row0 + x1]!;
			const v01 = img.data[row1 + x0]!;
			const v11 = img.data[row1 + x1]!;

			out[outRow + x] = wy0 * (wx0 * v00 + wx1 * v10) + wy1 * (wx0 * v01 + wx1 * v11);
		}
	}

	return { data: out, width: targetWidth, height: targetHeight };
}

/**
 * 3x3 Gaussian smoothing kernel (sigma ~ 0.85)
 * [1, 2, 1] / 4 separable filter
 */
export function gaussianBlur3x3(img: GrayImage): GrayImage {
	const { width, height, data } = img;
	const temp = new Float32Array(width * height);
	const out = new Float32Array(width * height);

	// Horizontal pass
	for (let y = 0; y < height; y++) {
		const row = y * width;
		for (let x = 0; x < width; x++) {
			const xL = Math.max(0, x - 1);
			const xR = Math.min(width - 1, x + 1);
			temp[row + x] = 0.25 * data[row + xL]! + 0.5 * data[row + x]! + 0.25 * data[row + xR]!;
		}
	}

	// Vertical pass
	for (let y = 0; y < height; y++) {
		const yU = Math.max(0, y - 1);
		const yD = Math.min(height - 1, y + 1);
		const rowU = yU * width;
		const rowC = y * width;
		const rowD = yD * width;
		for (let x = 0; x < width; x++) {
			out[rowC + x] = 0.25 * temp[rowU + x]! + 0.5 * temp[rowC + x]! + 0.25 * temp[rowD + x]!;
		}
	}

	return { data: out, width, height };
}
