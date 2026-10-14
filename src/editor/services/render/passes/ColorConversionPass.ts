/**
 * ColorConversionPass manages GPU RGB -> Y'CbCr 4:2:0 conversion,
 * deterministic dithering, and PBO-based async pixel readback.
 * Supports ITU-R BT.709 and BT.2020 in limited and full quantization ranges,
 * with true 10-bit packing/unpacking and planar VideoFrame generation.
 */

import { PASS_VERTEX_SHADER } from './effectsShaders';
import { YUV_CONVERSION_FRAG } from './colorConversionShaders';

export interface ColorConversionOptions {
	matrix: 'bt709' | 'bt2020';
	range: 'limited' | 'full';
	bitDepth: 8 | 10;
	dither?: boolean;
	frameIndex?: number;
}

export interface PlanarYuv420 {
	width: number;
	height: number;
	bitDepth: 8 | 10;
	yPlane: Uint8Array | Uint16Array;
	uPlane: Uint8Array | Uint16Array;
	vPlane: Uint8Array | Uint16Array;
	alphaPlane?: Uint8Array | Uint16Array;
}

export class ColorConversionPass {
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram | null = null;
	private pbo: WebGLBuffer | null = null;
	private pboCapacity = 0;
	private fbo: WebGLFramebuffer | null = null;
	private intermediateTexture: WebGLTexture | null = null;
	private quadVao: WebGLVertexArrayObject | null = null;

	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		this.initProgram();
	}

	private initProgram(): void {
		const gl = this.gl;
		const vs = gl.createShader(gl.VERTEX_SHADER);
		if (!vs) return;
		gl.shaderSource(vs, PASS_VERTEX_SHADER);
		gl.compileShader(vs);

		const fs = gl.createShader(gl.FRAGMENT_SHADER);
		if (!fs) return;
		gl.shaderSource(fs, YUV_CONVERSION_FRAG);
		gl.compileShader(fs);

		const prog = gl.createProgram();
		if (!prog) return;
		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.linkProgram(prog);

		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			console.warn('ColorConversionPass link failed:', gl.getProgramInfoLog(prog));
			gl.deleteProgram(prog);
			return;
		}

		this.program = prog;
		this.fbo = gl.createFramebuffer();
		this.intermediateTexture = gl.createTexture();
		this.pbo = gl.createBuffer();
		this.quadVao = gl.createVertexArray();
	}

	private ensurePbo(bytesNeeded: number): void {
		const gl = this.gl;
		if (!this.pbo) this.pbo = gl.createBuffer();
		if (this.pboCapacity < bytesNeeded) {
			gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
			gl.bufferData(gl.PIXEL_PACK_BUFFER, bytesNeeded, gl.STREAM_READ);
			gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
			this.pboCapacity = bytesNeeded;
		}
	}

	/**
	 * Converts an RGB texture to planar Y, Cb, Cr 4:2:0 arrays on the GPU.
	 */
	convertRgbToYuv420(
		sourceTexture: WebGLTexture,
		width: number,
		height: number,
		options: ColorConversionOptions
	): PlanarYuv420 {
		const gl = this.gl;
		if (!this.program || !this.fbo || !this.intermediateTexture) {
			throw new Error('ColorConversionPass is not initialized.');
		}

		const chromaW = Math.max(1, Math.floor(width / 2));
		const chromaH = Math.max(1, Math.floor(height / 2));
		const is10Bit = options.bitDepth === 10;
		const yBytes = width * height * 4;
		const chromaBytes = chromaW * chromaH * 4;
		const maxPlaneBytes = Math.max(yBytes, chromaBytes);

		this.ensurePbo(maxPlaneBytes);

		gl.useProgram(this.program);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
		gl.uniform1i(gl.getUniformLocation(this.program, 'u_rgbTexture'), 0);
		gl.uniform2f(gl.getUniformLocation(this.program, 'u_resolution'), width, height);
		gl.uniform1i(
			gl.getUniformLocation(this.program, 'u_matrix'),
			options.matrix === 'bt2020' ? 1 : 0
		);
		gl.uniform1i(gl.getUniformLocation(this.program, 'u_range'), options.range === 'full' ? 1 : 0);
		gl.uniform1i(gl.getUniformLocation(this.program, 'u_bitDepth'), options.bitDepth);
		gl.uniform1i(gl.getUniformLocation(this.program, 'u_dither'), options.dither ? 1 : 0);
		gl.uniform1ui(
			gl.getUniformLocation(this.program, 'u_frameIndex'),
			(options.frameIndex ?? 0) >>> 0
		);

		const uPlaneLoc = gl.getUniformLocation(this.program, 'u_plane');

		// Helper to render plane and read pixels via PBO
		const renderAndReadPlane = (
			planeIdx: number,
			planeW: number,
			planeH: number
		): Uint8Array | Uint16Array => {
			gl.uniform1i(uPlaneLoc, planeIdx);

			// Setup intermediate texture target on TEXTURE1
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, this.intermediateTexture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, planeW, planeH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.COLOR_ATTACHMENT0,
				gl.TEXTURE_2D,
				this.intermediateTexture,
				0
			);

			// Ensure sourceTexture remains bound to TEXTURE0 for sampler uniform
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, sourceTexture);

			gl.viewport(0, 0, planeW, planeH);
			gl.bindVertexArray(this.quadVao);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			gl.bindVertexArray(null);

			// Read via PBO
			const bytes = planeW * planeH * 4;
			gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
			gl.readPixels(0, 0, planeW, planeH, gl.RGBA, gl.UNSIGNED_BYTE, 0);

			const rawRgba = new Uint8Array(bytes);
			gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rawRgba);
			gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

			if (is10Bit) {
				const plane10 = new Uint16Array(planeW * planeH);
				for (let i = 0, j = 0; i < bytes; i += 4, j++) {
					const hi8 = rawRgba[i];
					const low2 = rawRgba[i + 1] >> 6;
					plane10[j] = (hi8 << 2) | low2;
				}
				return plane10;
			} else {
				const plane8 = new Uint8Array(planeW * planeH);
				for (let i = 0, j = 0; i < bytes; i += 4, j++) {
					plane8[j] = rawRgba[i];
				}
				return plane8;
			}
		};

		// 1. Render Y Plane
		const yPlane = renderAndReadPlane(0, width, height);

		// 2. Render U/Cb Plane
		const uPlane = renderAndReadPlane(1, chromaW, chromaH);

		// 3. Render V/Cr Plane
		const vPlane = renderAndReadPlane(2, chromaW, chromaH);

		// Clean up state
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		return {
			width,
			height,
			bitDepth: options.bitDepth,
			yPlane,
			uPlane,
			vPlane
		};
	}

	/**
	 * Creates a WebCodecs VideoFrame from planar Y, Cb, Cr arrays.
	 */
	createPlanarVideoFrame(planar: PlanarYuv420, timestampUs: number): VideoFrame {
		const { width, height, bitDepth, yPlane, uPlane, vPlane } = planar;

		if (bitDepth === 10) {
			const y16 = yPlane as Uint16Array;
			const u16 = uPlane as Uint16Array;
			const v16 = vPlane as Uint16Array;
			const totalPixels = y16.length + u16.length + v16.length;
			const combined = new Uint16Array(totalPixels);
			combined.set(y16, 0);
			combined.set(u16, y16.length);
			combined.set(v16, y16.length + u16.length);

			return new VideoFrame(combined, {
				format: 'I420P10' as unknown as VideoPixelFormat,
				codedWidth: width,
				codedHeight: height,
				timestamp: timestampUs
			});
		} else {
			const y8 = yPlane as Uint8Array;
			const u8 = uPlane as Uint8Array;
			const v8 = vPlane as Uint8Array;
			const totalBytes = y8.length + u8.length + v8.length;
			const combined = new Uint8Array(totalBytes);
			combined.set(y8, 0);
			combined.set(u8, y8.length);
			combined.set(v8, y8.length + u8.length);

			return new VideoFrame(combined, {
				format: 'I420',
				codedWidth: width,
				codedHeight: height,
				timestamp: timestampUs
			});
		}
	}

	/**
	 * Converts an RGB texture to an Alpha plane on the GPU.
	 */
	convertRgbToAlpha(
		sourceTexture: WebGLTexture,
		width: number,
		height: number,
		options: { dither?: boolean; frameIndex?: number } = {}
	): Uint8Array {
		const gl = this.gl;
		if (!this.program || !this.fbo || !this.intermediateTexture) {
			throw new Error('ColorConversionPass is not initialized.');
		}

		this.ensurePbo(width * height * 4);

		gl.useProgram(this.program);
		gl.uniform1i(gl.getUniformLocation(this.program, 'u_rgbTexture'), 0);
		gl.uniform2f(gl.getUniformLocation(this.program, 'u_resolution'), width, height);
		gl.uniform1i(gl.getUniformLocation(this.program, 'u_plane'), 3); // Alpha
		gl.uniform1i(gl.getUniformLocation(this.program, 'u_bitDepth'), 8);
		gl.uniform1i(gl.getUniformLocation(this.program, 'u_dither'), options.dither ? 1 : 0);
		gl.uniform1ui(
			gl.getUniformLocation(this.program, 'u_frameIndex'),
			(options.frameIndex ?? 0) >>> 0
		);

		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.intermediateTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			this.intermediateTexture,
			0
		);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, sourceTexture);

		gl.viewport(0, 0, width, height);
		gl.bindVertexArray(this.quadVao);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		gl.bindVertexArray(null);

		const bytes = width * height * 4;
		gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
		gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);

		const rawRgba = new Uint8Array(bytes);
		gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rawRgba);
		gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		const alphaPlane = new Uint8Array(width * height);
		for (let i = 0, j = 0; i < bytes; i += 4, j++) {
			alphaPlane[j] = rawRgba[i];
		}
		return alphaPlane;
	}

	dispose(): void {
		const gl = this.gl;
		if (this.program) gl.deleteProgram(this.program);
		if (this.fbo) gl.deleteFramebuffer(this.fbo);
		if (this.intermediateTexture) gl.deleteTexture(this.intermediateTexture);
		if (this.pbo) gl.deleteBuffer(this.pbo);
		if (this.quadVao) gl.deleteVertexArray(this.quadVao);
		this.program = null;
		this.fbo = null;
		this.intermediateTexture = null;
		this.pbo = null;
		this.quadVao = null;
		this.pboCapacity = 0;
	}
}
