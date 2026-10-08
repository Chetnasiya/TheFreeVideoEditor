import type { FboPool } from './FboPool';
import type { ShaderPassManager } from './ShaderPass';

export interface ScopeFrameData {
	width: number;
	height: number;
	data: Uint8Array;
}

const MAX_SCOPE_WIDTH = 256;
const MAX_SCOPE_HEIGHT = 144;

/**
 * Downsamples the current composite texture to <= 256x144 and reads pixels into a Uint8Array
 * for CPU-side scope visualization.
 */
export function captureScopeFrame(
	gl: WebGL2RenderingContext,
	sourceTexture: WebGLTexture,
	sourceWidth: number,
	sourceHeight: number,
	fboPool: FboPool,
	passManager: ShaderPassManager
): ScopeFrameData {
	const aspect = sourceWidth / Math.max(1, sourceHeight);
	let targetWidth = MAX_SCOPE_WIDTH;
	let targetHeight = Math.round(targetWidth / aspect);

	if (targetHeight > MAX_SCOPE_HEIGHT) {
		targetHeight = MAX_SCOPE_HEIGHT;
		targetWidth = Math.round(targetHeight * aspect);
	}

	targetWidth = Math.max(2, targetWidth);
	targetHeight = Math.max(2, targetHeight);

	const fbo = fboPool.acquire(targetWidth, targetHeight);
	passManager.blit(sourceTexture, fbo.framebuffer, targetWidth, targetHeight);

	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.framebuffer);
	const buffer = new Uint8Array(targetWidth * targetHeight * 4);
	gl.readPixels(0, 0, targetWidth, targetHeight, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	fboPool.release(fbo);

	return {
		width: targetWidth,
		height: targetHeight,
		data: buffer
	};
}

let helperCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

export function extractCanvasScopeFrame(
	sourceCanvas: HTMLCanvasElement | OffscreenCanvas
): ScopeFrameData | null {
	try {
		const sw = sourceCanvas.width;
		const sh = sourceCanvas.height;
		if (sw <= 0 || sh <= 0) return null;
		const aspect = sw / Math.max(1, sh);
		let targetWidth = MAX_SCOPE_WIDTH;
		let targetHeight = Math.round(targetWidth / aspect);
		if (targetHeight > MAX_SCOPE_HEIGHT) {
			targetHeight = MAX_SCOPE_HEIGHT;
			targetWidth = Math.round(targetHeight * aspect);
		}
		targetWidth = Math.max(2, targetWidth);
		targetHeight = Math.max(2, targetHeight);

		if (!helperCanvas) {
			helperCanvas =
				typeof document !== 'undefined'
					? document.createElement('canvas')
					: new OffscreenCanvas(targetWidth, targetHeight);
		}
		helperCanvas.width = targetWidth;
		helperCanvas.height = targetHeight;
		const ctx = helperCanvas.getContext('2d', { willReadFrequently: true }) as
			CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
		if (!ctx) return null;
		ctx.clearRect(0, 0, targetWidth, targetHeight);
		ctx.drawImage(sourceCanvas as CanvasImageSource, 0, 0, targetWidth, targetHeight);
		const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
		return {
			width: targetWidth,
			height: targetHeight,
			data: new Uint8Array(imgData.data.buffer)
		};
	} catch {
		return null;
	}
}
