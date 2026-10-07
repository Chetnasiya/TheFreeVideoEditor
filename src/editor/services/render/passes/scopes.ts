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
