import type { EvaluatedEffect } from '../../../core/effects/types';
import type { FboPool, PooledFbo } from './FboPool';
import {
	BLIT_FRAG,
	BLIT_MIX_FRAG,
	CHROMA_KEY_FRAG,
	COLOR_CORRECTION_FRAG,
	CURVES_FRAG,
	FILM_GRAIN_FRAG,
	GAUSSIAN_BLUR_FRAG,
	GLOW_FRAG,
	INVERT_FRAG,
	LUT_3D_FRAG,
	MIRROR_FRAG,
	MOSAIC_FRAG,
	PASS_VERTEX_SHADER,
	SHARPEN_FRAG,
	SOLID_FRAG,
	VIGNETTE_FRAG
} from './effectsShaders';
import { generateCompositeCurvesLut, type CurvePoint } from '../../../core/curves';
import type { ParsedLut3D } from '../../../core/lut';
import { ShaderCompileError } from '../RenderContext';

export function createShader(
	gl: WebGL2RenderingContext,
	type: number,
	source: string,
	name: string
): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new ShaderCompileError(name, 'Could not create shader');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader) ?? '';
		gl.deleteShader(shader);
		throw new ShaderCompileError(name, log);
	}
	return shader;
}

export function createProgram(
	gl: WebGL2RenderingContext,
	vsSource: string,
	fsSource: string,
	name: string
): WebGLProgram {
	const vs = createShader(gl, gl.VERTEX_SHADER, vsSource, `${name}_VS`);
	const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource, `${name}_FS`);
	const program = gl.createProgram();
	if (!program) throw new ShaderCompileError(name, 'Could not create program');
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const log = gl.getProgramInfoLog(program) ?? '';
		gl.deleteProgram(program);
		throw new ShaderCompileError(name, log);
	}
	return program;
}

export class ShaderPassManager {
	private readonly programs = new Map<string, WebGLProgram>();
	private quadVao: WebGLVertexArrayObject | null = null;
	private curveTextures = new Map<string, WebGLTexture>();
	private lut3dTextures = new Map<string, WebGLTexture>();

	constructor(private readonly gl: WebGL2RenderingContext) {
		this.quadVao = gl.createVertexArray();
	}

	get liveProgramsCount(): number {
		return this.programs.size;
	}

	get liveTexturesCount(): number {
		return this.curveTextures.size + this.lut3dTextures.size;
	}

	private getProgram(name: string, fsSource: string): WebGLProgram {
		let program = this.programs.get(name);
		if (!program) {
			program = createProgram(this.gl, PASS_VERTEX_SHADER, fsSource, name);
			this.programs.set(name, program);
		}
		return program;
	}

	/**
	 * Renders a fullscreen pass from inputTexture into targetFbo (or canvas if targetFbo is null).
	 */
	renderQuad(
		program: WebGLProgram,
		targetFbo: WebGLFramebuffer | null,
		width: number,
		height: number,
		inputTexture?: WebGLTexture
	): void {
		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
		gl.viewport(0, 0, width, height);
		gl.disable(gl.BLEND);
		gl.useProgram(program);
		if (inputTexture) {
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, inputTexture);
		}
		gl.bindVertexArray(this.quadVao);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		gl.bindVertexArray(null);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindTexture(gl.TEXTURE_3D, null);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.enable(gl.BLEND);
	}

	/** Blits a texture to target. */
	blit(
		sourceTexture: WebGLTexture,
		targetFbo: WebGLFramebuffer | null,
		width: number,
		height: number,
		opacity = 1.0
	): void {
		const gl = this.gl;
		const program = this.getProgram('blit', BLIT_FRAG);
		gl.useProgram(program);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
		gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
		gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), opacity);
		this.renderQuad(program, targetFbo, width, height, sourceTexture);
	}

	/** Mixes two textures together by mix amount into target. */
	blitMix(
		originalTexture: WebGLTexture,
		processedTexture: WebGLTexture,
		targetFbo: WebGLFramebuffer | null,
		width: number,
		height: number,
		mix = 1.0
	): void {
		const gl = this.gl;
		const program = this.getProgram('blitMix', BLIT_MIX_FRAG);
		gl.useProgram(program);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, originalTexture);
		gl.uniform1i(gl.getUniformLocation(program, 'u_original'), 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, processedTexture);
		gl.uniform1i(gl.getUniformLocation(program, 'u_processed'), 1);
		gl.uniform1f(gl.getUniformLocation(program, 'u_mix'), mix);
		this.renderQuad(program, targetFbo, width, height);
	}

	/** Blits a solid color. */
	renderSolid(
		color: { r: number; g: number; b: number; a: number },
		targetFbo: WebGLFramebuffer | null,
		width: number,
		height: number
	): void {
		const gl = this.gl;
		const program = this.getProgram('solid', SOLID_FRAG);
		gl.useProgram(program);
		gl.uniform4f(gl.getUniformLocation(program, 'u_color'), color.r, color.g, color.b, color.a);
		this.renderQuad(program, targetFbo, width, height);
	}

	/**
	 * Applies an evaluated effect to an input texture and outputs into an acquired FBO.
	 * Returns the new texture. The caller can release the previous intermediate FBO.
	 */
	applyEffect(
		effect: EvaluatedEffect,
		inputTexture: WebGLTexture,
		fboPool: FboPool,
		width: number,
		height: number,
		timeInTicks: number,
		lutGetter?: (lutId: string) => ParsedLut3D | null
	): PooledFbo {
		const gl = this.gl;
		const mix = typeof effect.params.mix === 'number' ? effect.params.mix : 1;

		switch (effect.type) {
			case 'gaussianBlur': {
				const radius = typeof effect.params.radius === 'number' ? effect.params.radius : 0;
				if (radius <= 0 || mix <= 0) {
					const outFbo = fboPool.acquire(width, height);
					this.blit(inputTexture, outFbo.framebuffer, width, height);
					return outFbo;
				}

				const program = this.getProgram('gaussianBlur', GAUSSIAN_BLUR_FRAG);
				gl.useProgram(program);
				gl.activeTexture(gl.TEXTURE0);
				gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
				gl.uniform1f(gl.getUniformLocation(program, 'u_radius'), radius);
				gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), width, height);

				// For large radius >= 24, we use a 2x downscaled pass then upsample
				const useDownscale = radius >= 24 && width > 4 && height > 4;
				const blurW = useDownscale ? Math.max(2, Math.floor(width / 2)) : width;
				const blurH = useDownscale ? Math.max(2, Math.floor(height / 2)) : height;

				let srcTex = inputTexture;
				let downFbo: PooledFbo | null = null;
				if (useDownscale) {
					downFbo = fboPool.acquire(blurW, blurH);
					this.blit(inputTexture, downFbo.framebuffer, blurW, blurH);
					srcTex = downFbo.texture;
				}

				// Horizontal blur pass
				const hFbo = fboPool.acquire(blurW, blurH);
				gl.useProgram(program);
				gl.uniform2f(gl.getUniformLocation(program, 'u_direction'), 1.0 / blurW, 0.0);
				gl.uniform1f(gl.getUniformLocation(program, 'u_mix'), 1.0); // full mix for intermediate
				this.renderQuad(program, hFbo.framebuffer, blurW, blurH, srcTex);

				if (downFbo) fboPool.release(downFbo);

				// Vertical blur pass
				const outFbo = fboPool.acquire(width, height);
				gl.useProgram(program);
				gl.uniform2f(gl.getUniformLocation(program, 'u_direction'), 0.0, 1.0 / blurH);
				gl.uniform1f(gl.getUniformLocation(program, 'u_mix'), mix);
				this.renderQuad(program, outFbo.framebuffer, width, height, hFbo.texture);

				fboPool.release(hFbo);
				return outFbo;
			}

			case 'sharpen': {
				const amount = typeof effect.params.amount === 'number' ? effect.params.amount : 0;
				const radius = typeof effect.params.radius === 'number' ? effect.params.radius : 1;
				const program = this.getProgram('sharpen', SHARPEN_FRAG);
				gl.useProgram(program);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, inputTexture);
				gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
				gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), width, height);
				gl.uniform1f(gl.getUniformLocation(program, 'u_amount'), amount);
				gl.uniform1f(gl.getUniformLocation(program, 'u_radius'), radius);
				gl.uniform1f(gl.getUniformLocation(program, 'u_mix'), mix);

				const outFbo = fboPool.acquire(width, height);
				this.renderQuad(program, outFbo.framebuffer, width, height, inputTexture);
				return outFbo;
			}

			case 'vignette': {
				const amount = typeof effect.params.amount === 'number' ? effect.params.amount : 0;
				const radius = typeof effect.params.radius === 'number' ? effect.params.radius : 0.8;
				const softness = typeof effect.params.softness === 'number' ? effect.params.softness : 0.5;
				const center = Array.isArray(effect.params.center) ? effect.params.center : [0.5, 0.5];

				const program = this.getProgram('vignette', VIGNETTE_FRAG);
				gl.useProgram(program);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, inputTexture);
				gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
				gl.uniform2f(
					gl.getUniformLocation(program, 'u_center'),
					center[0] ?? 0.5,
					center[1] ?? 0.5
				);
				gl.uniform1f(gl.getUniformLocation(program, 'u_radius'), radius);
				gl.uniform1f(gl.getUniformLocation(program, 'u_softness'), softness);
				gl.uniform1f(gl.getUniformLocation(program, 'u_amount'), amount);
				gl.uniform1f(gl.getUniformLocation(program, 'u_mix'), mix);

				const outFbo = fboPool.acquire(width, height);
				this.renderQuad(program, outFbo.framebuffer, width, height, inputTexture);
				return outFbo;
			}

			case 'mosaic': {
				const blockSize = typeof effect.params.blockSize === 'number' ? effect.params.blockSize : 1;
				const program = this.getProgram('mosaic', MOSAIC_FRAG);
				gl.useProgram(program);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, inputTexture);
				gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
				gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), width, height);
				gl.uniform1f(gl.getUniformLocation(program, 'u_blockSize'), blockSize);
				gl.uniform1f(gl.getUniformLocation(program, 'u_mix'), mix);

				const outFbo = fboPool.acquire(width, height);
				this.renderQuad(program, outFbo.framebuffer, width, height, inputTexture);
				return outFbo;
			}

			case 'filmGrain': {
				const amount = typeof effect.params.amount === 'number' ? effect.params.amount : 0;
				const speed = typeof effect.params.speed === 'number' ? effect.params.speed : 1;
				const time = (timeInTicks / 1_000_000) * speed;

				const program = this.getProgram('filmGrain', FILM_GRAIN_FRAG);
				gl.useProgram(program);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, inputTexture);
				gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
				gl.uniform1f(gl.getUniformLocation(program, 'u_amount'), amount);
				gl.uniform1f(gl.getUniformLocation(program, 'u_time'), time);
				gl.uniform1f(gl.getUniformLocation(program, 'u_mix'), mix);

				const outFbo = fboPool.acquire(width, height);
				this.renderQuad(program, outFbo.framebuffer, width, height, inputTexture);
				return outFbo;
			}

			case 'invert': {
				const amount = typeof effect.params.amount === 'number' ? effect.params.amount : 0;
				const program = this.getProgram('invert', INVERT_FRAG);
				gl.useProgram(program);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, inputTexture);
				gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
				gl.uniform1f(gl.getUniformLocation(program, 'u_amount'), amount);
				gl.uniform1f(gl.getUniformLocation(program, 'u_mix'), mix);

				const outFbo = fboPool.acquire(width, height);
				this.renderQuad(program, outFbo.framebuffer, width, height, inputTexture);
				return outFbo;
			}

			case 'mirror': {
				const modeStr = effect.params.mode;
				const mode = modeStr === 'vertical' ? 1 : modeStr === 'quad' ? 2 : 0;
				const amount = typeof effect.params.amount === 'number' ? effect.params.amount : 0;

				const program = this.getProgram('mirror', MIRROR_FRAG);
				gl.useProgram(program);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, inputTexture);
				gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
				gl.uniform1i(gl.getUniformLocation(program, 'u_mode'), mode);
				gl.uniform1f(gl.getUniformLocation(program, 'u_amount'), amount);
				gl.uniform1f(gl.getUniformLocation(program, 'u_mix'), mix);

				const outFbo = fboPool.acquire(width, height);
				this.renderQuad(program, outFbo.framebuffer, width, height, inputTexture);
				return outFbo;
			}

			case 'glow': {
				const threshold =
					typeof effect.params.threshold === 'number' ? effect.params.threshold : 0.8;
				const radius = typeof effect.params.radius === 'number' ? effect.params.radius : 0;
				const intensity = typeof effect.params.intensity === 'number' ? effect.params.intensity : 1;

				const program = this.getProgram('glow', GLOW_FRAG);
				gl.useProgram(program);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, inputTexture);
				gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
				gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), width, height);
				gl.uniform1f(gl.getUniformLocation(program, 'u_threshold'), threshold);
				gl.uniform1f(gl.getUniformLocation(program, 'u_radius'), radius);
				gl.uniform1f(gl.getUniformLocation(program, 'u_intensity'), intensity);
				gl.uniform1f(gl.getUniformLocation(program, 'u_mix'), mix);

				const outFbo = fboPool.acquire(width, height);
				this.renderQuad(program, outFbo.framebuffer, width, height, inputTexture);
				return outFbo;
			}

			case 'chromaKey': {
				let keyR = 0,
					keyG = 1,
					keyB = 0;
				if (Array.isArray(effect.params.color) && effect.params.color.length >= 3) {
					keyR = Number(effect.params.color[0]) || 0;
					keyG = Number(effect.params.color[1]) || 0;
					keyB = Number(effect.params.color[2]) || 0;
				} else if (typeof effect.params.color === 'string') {
					const hex = effect.params.color.replace('#', '');
					if (hex.length === 6) {
						keyR = parseInt(hex.slice(0, 2), 16) / 255;
						keyG = parseInt(hex.slice(2, 4), 16) / 255;
						keyB = parseInt(hex.slice(4, 6), 16) / 255;
					}
				}
				const tolerance = typeof effect.params.tolerance === 'number' ? effect.params.tolerance : 0;
				const softness = typeof effect.params.softness === 'number' ? effect.params.softness : 0.1;
				const spill = typeof effect.params.spill === 'number' ? effect.params.spill : 0.5;

				const program = this.getProgram('chromaKey', CHROMA_KEY_FRAG);
				gl.useProgram(program);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, inputTexture);
				gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
				gl.uniform3f(gl.getUniformLocation(program, 'u_keyColor'), keyR, keyG, keyB);
				gl.uniform1f(gl.getUniformLocation(program, 'u_tolerance'), tolerance);
				gl.uniform1f(gl.getUniformLocation(program, 'u_softness'), softness);
				gl.uniform1f(gl.getUniformLocation(program, 'u_spill'), spill);
				gl.uniform1f(gl.getUniformLocation(program, 'u_mix'), mix);

				const outFbo = fboPool.acquire(width, height);
				this.renderQuad(program, outFbo.framebuffer, width, height, inputTexture);
				return outFbo;
			}

			case 'colorCorrection': {
				const program = this.getProgram('colorCorrection', COLOR_CORRECTION_FRAG);
				gl.useProgram(program);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, inputTexture);
				gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
				gl.uniform1f(
					gl.getUniformLocation(program, 'u_exposure'),
					(effect.params.exposure as number) ?? 0
				);
				gl.uniform1f(
					gl.getUniformLocation(program, 'u_contrast'),
					(effect.params.contrast as number) ?? 0
				);
				gl.uniform1f(
					gl.getUniformLocation(program, 'u_highlights'),
					(effect.params.highlights as number) ?? 0
				);
				gl.uniform1f(
					gl.getUniformLocation(program, 'u_shadows'),
					(effect.params.shadows as number) ?? 0
				);
				gl.uniform1f(
					gl.getUniformLocation(program, 'u_whites'),
					(effect.params.whites as number) ?? 0
				);
				gl.uniform1f(
					gl.getUniformLocation(program, 'u_blacks'),
					(effect.params.blacks as number) ?? 0
				);
				gl.uniform1f(
					gl.getUniformLocation(program, 'u_temperature'),
					(effect.params.temperature as number) ?? 0
				);
				gl.uniform1f(gl.getUniformLocation(program, 'u_tint'), (effect.params.tint as number) ?? 0);
				gl.uniform1f(
					gl.getUniformLocation(program, 'u_saturation'),
					(effect.params.saturation as number) ?? 0
				);
				gl.uniform1f(
					gl.getUniformLocation(program, 'u_vibrance'),
					(effect.params.vibrance as number) ?? 0
				);
				gl.uniform3f(
					gl.getUniformLocation(program, 'u_lift'),
					(effect.params.liftR as number) ?? 0,
					(effect.params.liftG as number) ?? 0,
					(effect.params.liftB as number) ?? 0
				);
				gl.uniform3f(
					gl.getUniformLocation(program, 'u_gamma'),
					(effect.params.gammaR as number) ?? 0,
					(effect.params.gammaG as number) ?? 0,
					(effect.params.gammaB as number) ?? 0
				);
				gl.uniform3f(
					gl.getUniformLocation(program, 'u_gain'),
					(effect.params.gainR as number) ?? 0,
					(effect.params.gainG as number) ?? 0,
					(effect.params.gainB as number) ?? 0
				);
				gl.uniform1f(gl.getUniformLocation(program, 'u_mix'), mix);

				const outFbo = fboPool.acquire(width, height);
				this.renderQuad(program, outFbo.framebuffer, width, height, inputTexture);
				return outFbo;
			}

			case 'curves': {
				const curveLutData = generateCompositeCurvesLut(
					effect.params.rgb as CurvePoint[] | undefined,
					effect.params.red as CurvePoint[] | undefined,
					effect.params.green as CurvePoint[] | undefined,
					effect.params.blue as CurvePoint[] | undefined
				);
				let curveTex = this.curveTextures.get(effect.id);
				if (!curveTex) {
					curveTex = gl.createTexture()!;
					gl.bindTexture(gl.TEXTURE_2D, curveTex);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					this.curveTextures.set(effect.id, curveTex);
				}
				const byteLut = new Uint8Array(256 * 4);
				for (let i = 0; i < 256 * 4; i += 1) {
					byteLut[i] = Math.round(Math.min(1, Math.max(0, curveLutData[i] ?? 0)) * 255);
				}
				gl.bindTexture(gl.TEXTURE_2D, curveTex);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, byteLut);

				const program = this.getProgram('curves', CURVES_FRAG);
				gl.useProgram(program);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, inputTexture);
				gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, curveTex);
				gl.uniform1i(gl.getUniformLocation(program, 'u_curveLut'), 1);

				gl.uniform1f(gl.getUniformLocation(program, 'u_mix'), mix);

				const outFbo = fboPool.acquire(width, height);
				this.renderQuad(program, outFbo.framebuffer, width, height, inputTexture);
				return outFbo;
			}

			case 'lut3d': {
				const lutAssetId = effect.params.lutAssetId as string;
				const intensity = typeof effect.params.intensity === 'number' ? effect.params.intensity : 1;
				const lut = lutGetter ? lutGetter(lutAssetId) : null;
				if (!lut) {
					const outFbo = fboPool.acquire(width, height);
					this.blit(inputTexture, outFbo.framebuffer, width, height);
					return outFbo;
				}

				let lut3dTex = this.lut3dTextures.get(lutAssetId);
				if (!lut3dTex) {
					lut3dTex = gl.createTexture()!;
					gl.bindTexture(gl.TEXTURE_3D, lut3dTex);
					gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
					gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
					gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
					gl.texImage3D(
						gl.TEXTURE_3D,
						0,
						gl.RGBA32F,
						lut.size,
						lut.size,
						lut.size,
						0,
						gl.RGBA,
						gl.FLOAT,
						lut.data
					);
					this.lut3dTextures.set(lutAssetId, lut3dTex);
				}

				const program = this.getProgram('lut3d', LUT_3D_FRAG);
				gl.useProgram(program);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, inputTexture);
				gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_3D, lut3dTex);
				gl.uniform1i(gl.getUniformLocation(program, 'u_lut3d'), 1);

				gl.uniform1f(gl.getUniformLocation(program, 'u_intensity'), intensity);
				gl.uniform1f(gl.getUniformLocation(program, 'u_mix'), mix);

				const outFbo = fboPool.acquire(width, height);
				this.renderQuad(program, outFbo.framebuffer, width, height, inputTexture);
				return outFbo;
			}

			default: {
				const outFbo = fboPool.acquire(width, height);
				this.blit(inputTexture, outFbo.framebuffer, width, height);
				return outFbo;
			}
		}
	}

	dispose(): void {
		const gl = this.gl;
		for (const p of this.programs.values()) gl.deleteProgram(p);
		this.programs.clear();
		for (const t of this.curveTextures.values()) gl.deleteTexture(t);
		this.curveTextures.clear();
		for (const t of this.lut3dTextures.values()) gl.deleteTexture(t);
		this.lut3dTextures.clear();
		if (this.quadVao) gl.deleteVertexArray(this.quadVao);
		this.quadVao = null;
	}
}
