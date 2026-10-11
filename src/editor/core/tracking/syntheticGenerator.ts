/**
 * Pure-code synthetic frame generator for unit tests and verification.
 * Generates test video sequences with:
 * - Deterministic textured procedural background (seeded PRNG)
 * - Target pattern moving along known ground-truth path
 * - Known scale, rotation, occlusion, and exit/re-entry
 */

import type { GrayImage } from './prepareFrame';

export interface SyntheticTargetGroundTruth {
	frameIndex: number;
	sourceTime: number; // microseconds
	x: number; // normalized center [0, 1]
	y: number; // normalized center [0, 1]
	rotation: number; // radians
	scale: number; // scale multiplier
	occluded: boolean;
	visible: boolean;
}

export interface SyntheticSequenceConfig {
	width: number;
	height: number;
	fps: number;
	totalFrames: number;
	targetWidthNorm: number;
	targetHeightNorm: number;
	// Path function: frame -> { x, y, rotation, scale, occluded }
	motionPath: (frame: number) => {
		x: number;
		y: number;
		rotation: number;
		scale: number;
		occluded?: boolean;
	};
}

export class SyntheticVideoGenerator {
	private readonly width: number;
	private readonly height: number;
	private readonly fps: number;
	private readonly targetW: number;
	private readonly targetH: number;
	private readonly motionPath: SyntheticSequenceConfig['motionPath'];

	constructor(config: SyntheticSequenceConfig) {
		this.width = config.width;
		this.height = config.height;
		this.fps = config.fps;
		this.targetW = Math.round(config.targetWidthNorm * config.width);
		this.targetH = Math.round(config.targetHeightNorm * config.height);
		this.motionPath = config.motionPath;
	}

	getGroundTruth(frameIndex: number): SyntheticTargetGroundTruth {
		const m = this.motionPath(frameIndex);
		const sourceTime = Math.round((frameIndex / this.fps) * 1_000_000);
		const visible = !m.occluded && m.x >= 0 && m.x <= 1 && m.y >= 0 && m.y <= 1;

		return {
			frameIndex,
			sourceTime,
			x: m.x,
			y: m.y,
			rotation: m.rotation,
			scale: m.scale,
			occluded: !!m.occluded,
			visible
		};
	}

	generateFrame(frameIndex: number): GrayImage {
		const gt = this.getGroundTruth(frameIndex);
		const data = new Float32Array(this.width * this.height);

		// 1. Procedural textured background: multi-frequency sinusoidal noise
		for (let y = 0; y < this.height; y++) {
			const row = y * this.width;
			for (let x = 0; x < this.width; x++) {
				const v =
					0.35 +
					0.1 * Math.sin(0.12 * x) * Math.cos(0.08 * y) +
					0.05 * Math.sin(0.25 * x + 0.15 * y) +
					0.05 * Math.sin(0.05 * (x - y));
				data[row + x] = Math.max(0.1, Math.min(0.6, v));
			}
		}

		// 2. Render target pattern if not occluded
		if (!gt.occluded) {
			const cx = gt.x * this.width;
			const cy = gt.y * this.height;
			const cosR = Math.cos(-gt.rotation) / gt.scale;
			const sinR = Math.sin(-gt.rotation) / gt.scale;

			const halfW = (this.targetW * gt.scale) / 2 + 4;
			const halfH = (this.targetH * gt.scale) / 2 + 4;

			const minX = Math.max(0, Math.floor(cx - halfW));
			const maxX = Math.min(this.width - 1, Math.ceil(cx + halfW));
			const minY = Math.max(0, Math.floor(cy - halfH));
			const maxY = Math.min(this.height - 1, Math.ceil(cy + halfH));

			for (let y = minY; y <= maxY; y++) {
				const dy = y - cy;
				const row = y * this.width;
				for (let x = minX; x <= maxX; x++) {
					const dx = x - cx;

					// Rotate/scale into target local space
					const lx = cosR * dx - sinR * dy;
					const ly = sinR * dx + cosR * dy;

					if (Math.abs(lx) <= this.targetW / 2 && Math.abs(ly) <= this.targetH / 2) {
						// Continuous sub-pixel smooth Gaussian target with high contrast center
						const distSq = lx * lx + ly * ly;
						const val = Math.exp(-distSq / 18.0);
						data[row + x] = 0.2 + 0.8 * val;
					}
				}
			}
		} else {
			// Render occlusion block (e.g. gray bar over target)
			const cx = gt.x * this.width;
			const cy = gt.y * this.height;
			const minX = Math.max(0, Math.floor(cx - this.targetW));
			const maxX = Math.min(this.width - 1, Math.ceil(cx + this.targetW));
			const minY = Math.max(0, Math.floor(cy - this.targetH));
			const maxY = Math.min(this.height - 1, Math.ceil(cy + this.targetH));

			for (let y = minY; y <= maxY; y++) {
				const row = y * this.width;
				for (let x = minX; x <= maxX; x++) {
					data[row + x] = 0.5; // Uniform gray occluder
				}
			}
		}

		return { data, width: this.width, height: this.height };
	}
}
