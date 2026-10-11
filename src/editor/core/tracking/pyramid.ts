/**
 * Gaussian image pyramid for multi-scale coarse-to-fine optical flow and tracking.
 */

import { downscaleGray, gaussianBlur3x3, type GrayImage } from './prepareFrame';

export interface ImagePyramid {
	levels: GrayImage[];
	numLevels: number;
}

/**
 * Builds an image pyramid with `numLevels` layers.
 * Level 0 is the original resolution (blurred).
 * Each subsequent level is downscaled by a factor of 2 in each dimension.
 */
export function buildPyramid(baseImage: GrayImage, numLevels: number = 3): ImagePyramid {
	const levels: GrayImage[] = [];
	let current = gaussianBlur3x3(baseImage);
	levels.push(current);

	for (let i = 1; i < numLevels; i++) {
		const nextW = Math.max(8, Math.floor(current.width / 2));
		const nextH = Math.max(8, Math.floor(current.height / 2));
		if (nextW < 8 || nextH < 8 || (nextW === current.width && nextH === current.height)) {
			break;
		}
		const downscaled = downscaleGray(current, nextW, nextH);
		current = gaussianBlur3x3(downscaled);
		levels.push(current);
	}

	return {
		levels,
		numLevels: levels.length
	};
}
