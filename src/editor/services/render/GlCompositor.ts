import { layerAffine } from '../../core/layerGeometry';
import type { ActiveLayer } from '../../core/playback';
import type { BlendMode, ClipId } from '../../core/types';
import type { ParsedLut3D } from '../../core/lut';
import {
	renderFrame,
	type CompositionSize,
	type FrameProvider,
	type FrameSource,
	type LastGoodFrames
} from '../playback/compositor';
import { RenderContext, type GlCanvas, type RenderContextOptions } from './RenderContext';
import type { RenderStats } from './stats';
import { FboPool, type PooledFbo } from './passes/FboPool';
import { ShaderPassManager } from './passes/ShaderPass';
import { captureScopeFrame, type ScopeFrameData } from './passes/scopes';
import { getParsedLut } from '../media/lutCache';
import { BLIT_MASK_MIX_FRAG } from './passes/maskShaders';
import type { EvaluatedMask } from '../../core/masks';

interface CachedTexture {
	texture: WebGLTexture;
	source: FrameSource | null;
	width: number;
	height: number;
	lastUsedFrame: number;
}

export interface FrameRenderer {
	readonly kind: 'webgl2' | 'canvas2d';
	readonly stats: RenderStats;
	/** Draws the layers; returns false when nothing could be drawn (e.g. the GL context is lost). */
	render(
		size: CompositionSize,
		layers: readonly ActiveLayer[],
		frameProvider: FrameProvider,
		lastGoodFrames?: LastGoodFrames,
		options?: { playing?: boolean }
	): boolean;
	releaseUnused(liveClipIds: ReadonlySet<ClipId>): void;
	dispose(): void;
	enableScopes?(enabled: boolean): void;
	getLastScopeFrame?(): ScopeFrameData | null;
}

const EVICT_AFTER_FRAMES = 300;

function dimensions(source: FrameSource): { width: number; height: number } {
	if ('displayWidth' in source) return { width: source.displayWidth, height: source.displayHeight };
	if ('videoWidth' in source) return { width: source.videoWidth, height: source.videoHeight };
	if ('naturalWidth' in source) return { width: source.naturalWidth, height: source.naturalHeight };
	if ('width' in source && typeof source.width === 'number') {
		return { width: source.width, height: source.height as number };
	}
	return { width: 0, height: 0 };
}

type UploadableSource = Exclude<FrameSource, SVGImageElement>;

function isUploadable(source: FrameSource): source is UploadableSource {
	return !(typeof SVGImageElement !== 'undefined' && source instanceof SVGImageElement);
}

function blendFunction(gl: WebGL2RenderingContext, mode: BlendMode): void {
	switch (mode) {
		case 'add':
			gl.blendFunc(gl.ONE, gl.ONE);
			break;
		case 'multiply':
			gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
			break;
		case 'screen':
			gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
			break;
		default:
			gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
	}
}

export class GlCompositor implements FrameRenderer {
	readonly kind = 'webgl2';
	private readonly context: RenderContext;
	private readonly textures = new Map<ClipId, CachedTexture>();
	private frameIndex = 0;
	private vao: WebGLVertexArrayObject | null;
	private fboPool: FboPool;
	private passManager: ShaderPassManager;
	private solidTexture: WebGLTexture | null = null;
	private lutProvider: ((id: string) => ParsedLut3D | null) | null = getParsedLut;
	private scopesEnabled = false;
	private lastScopeFrame: ScopeFrameData | null = null;
	private lastScopeTime = 0;

	constructor(canvas: GlCanvas, options: RenderContextOptions = {}) {
		this.context = new RenderContext(canvas, {
			...options,
			onLost: () => {
				this.fboPool.dispose();
				this.passManager.dispose();
				if (this.solidTexture) {
					this.context.gl.deleteTexture(this.solidTexture);
					this.solidTexture = null;
				}
				this.context.stats.texturesDeleted += this.textures.size;
				this.textures.clear();
				this.vao = null;
				options.onLost?.();
			},
			onRestored: () => {
				this.vao = this.context.gl.createVertexArray();
				this.fboPool = new FboPool(this.context.gl);
				this.passManager = new ShaderPassManager(this.context.gl);
				options.onRestored?.();
			}
		});
		this.vao = this.context.gl.createVertexArray();
		this.fboPool = new FboPool(this.context.gl);
		this.passManager = new ShaderPassManager(this.context.gl);
	}

	get stats(): RenderStats {
		return this.context.stats;
	}

	get renderContext(): RenderContext {
		return this.context;
	}

	setLutProvider(provider: ((id: string) => ParsedLut3D | null) | null): void {
		this.lutProvider = provider;
	}

	enableScopes(enabled: boolean): void {
		this.scopesEnabled = enabled;
	}

	getLastScopeFrame(): ScopeFrameData | null {
		return this.lastScopeFrame;
	}

	render(
		size: CompositionSize,
		layers: readonly ActiveLayer[],
		frameProvider: FrameProvider,
		lastGoodFrames: LastGoodFrames = new Map(),
		options: { playing?: boolean } = {}
	): boolean {
		if (![size.width, size.height].every((value) => Number.isSafeInteger(value) && value > 0)) {
			throw new RangeError('Composition size must use positive integer dimensions.');
		}
		const { gl, program, stats } = this.context;
		if (this.context.lost || !program || !this.vao) return false;
		const started = performance.now();
		this.frameIndex += 1;
		const canvas = this.context.canvas;
		if (canvas.width !== size.width) canvas.width = size.width;
		if (canvas.height !== size.height) canvas.height = size.height;

		const hasComplexPipeline =
			this.scopesEnabled ||
			layers.some(
				(layer) =>
					Boolean(layer.transition) ||
					layer.kind === 'adjustment' ||
					layer.kind === 'solid' ||
					(layer.effects && layer.effects.some((e) => !e.isNeutral)) ||
					(layer.masks && layer.masks.some((m) => m.enabled))
			);

		if (!hasComplexPipeline) {
			// Fast path: bit-identical direct rendering onto canvas
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, size.width, size.height);
			gl.clearColor(0, 0, 0, 1);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.useProgram(program.program);
			gl.bindVertexArray(this.vao);
			gl.uniform2f(program.size, size.width, size.height);
			gl.uniform1i(program.texture, 0);
			gl.activeTexture(gl.TEXTURE0);

			for (const layer of layers) {
				const source = frameProvider(layer) ?? lastGoodFrames.get(layer.clipId) ?? null;
				if (!source || !isUploadable(source)) continue;
				const { width, height } = dimensions(source);
				if (width <= 0 || height <= 0) continue;
				lastGoodFrames.set(layer.clipId, source);
				const entry = this.upload(layer, source, width, height);
				if (!entry) continue;
				const affine = layerAffine(layer, width, height, size.width, size.height);
				gl.uniformMatrix3fv(program.affine, false, [
					affine.a,
					affine.b,
					0,
					affine.c,
					affine.d,
					0,
					affine.e,
					affine.f,
					1
				]);
				const crop = layer.crop ?? [0, 0, 0, 0];
				gl.uniform4f(program.crop, crop[0], crop[1], crop[2], crop[3]);
				gl.uniform1f(program.opacity, layer.transform?.opacity ?? 1);
				blendFunction(gl, layer.blendMode ?? 'normal');
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
				stats.drawCalls += 1;
			}

			gl.bindVertexArray(null);
			this.evict();
			const elapsed = performance.now() - started;
			stats.frames += 1;
			stats.lastFrameMs = elapsed;
			stats.maxFrameMs = Math.max(stats.maxFrameMs, elapsed);
			stats.totalFrameMs += elapsed;
			return true;
		}

		// Accumulation path for effects and adjustment layers
		let accumFbo = this.fboPool.acquire(size.width, size.height);
		gl.bindFramebuffer(gl.FRAMEBUFFER, accumFbo.framebuffer);
		gl.viewport(0, 0, size.width, size.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		for (const layer of layers) {
			if (layer.kind === 'adjustment') {
				const activeEffects = (layer.effects ?? []).filter((e) => !e.isNeutral);
				if (activeEffects.length === 0) continue;
				const origFbo = accumFbo;
				let currTex = accumFbo.texture;
				const fbosToRelease: PooledFbo[] = [];
				for (const eff of activeEffects) {
					const nextFbo = this.passManager.applyEffect(
						eff,
						currTex,
						this.fboPool,
						size.width,
						size.height,
						layer.sourceTime,
						this.lutProvider ?? undefined
					);
					fbosToRelease.push(nextFbo);
					currTex = nextFbo.texture;
				}
				const opacity = layer.transform?.opacity ?? 1;
				const activeMasks = (layer.masks ?? []).filter((m) => m.enabled && !m.effectId);
				if (activeMasks.length > 0) {
					const matteFbo = this.passManager.accumulateMasks(
						activeMasks,
						this.fboPool,
						size.width,
						size.height
					);
					fbosToRelease.push(matteFbo);
					const blendedFbo = this.fboPool.acquire(size.width, size.height);
					const mixProg = this.passManager['getProgram']('blitMaskMix', BLIT_MASK_MIX_FRAG);
					gl.useProgram(mixProg);
					gl.activeTexture(gl.TEXTURE0);
					gl.bindTexture(gl.TEXTURE_2D, origFbo.texture);
					gl.uniform1i(gl.getUniformLocation(mixProg, 'u_original'), 0);
					gl.activeTexture(gl.TEXTURE1);
					gl.bindTexture(gl.TEXTURE_2D, currTex);
					gl.uniform1i(gl.getUniformLocation(mixProg, 'u_processed'), 1);
					gl.activeTexture(gl.TEXTURE2);
					gl.bindTexture(gl.TEXTURE_2D, matteFbo.texture);
					gl.uniform1i(gl.getUniformLocation(mixProg, 'u_maskMatte'), 2);
					gl.uniform1f(gl.getUniformLocation(mixProg, 'u_mix'), opacity);
					this.passManager.renderQuad(mixProg, blendedFbo.framebuffer, size.width, size.height);
					this.fboPool.release(origFbo);
					accumFbo = blendedFbo;
				} else if (opacity < 1) {
					const blendedFbo = this.fboPool.acquire(size.width, size.height);
					this.passManager.blitMix(
						origFbo.texture,
						currTex,
						blendedFbo.framebuffer,
						size.width,
						size.height,
						opacity
					);
					this.fboPool.release(origFbo);
					accumFbo = blendedFbo;
				} else {
					const lastFbo = fbosToRelease.pop()!;
					this.fboPool.release(origFbo);
					accumFbo = lastFbo;
				}
				for (const f of fbosToRelease) this.fboPool.release(f);
				continue;
			}

			if (layer.transition) {
				const tr = layer.transition;
				// Render fromLayer to FBO
				const fromFbo = this.fboPool.acquire(size.width, size.height);
				gl.bindFramebuffer(gl.FRAMEBUFFER, fromFbo.framebuffer);
				gl.viewport(0, 0, size.width, size.height);
				gl.clearColor(0, 0, 0, 0);
				gl.clear(gl.COLOR_BUFFER_BIT);

				// Render fromLayer into fromFbo
				this.renderSingleLayer(tr.fromLayer, fromFbo, size, frameProvider, lastGoodFrames);

				// Render toLayer to FBO
				const toFbo = this.fboPool.acquire(size.width, size.height);
				gl.bindFramebuffer(gl.FRAMEBUFFER, toFbo.framebuffer);
				gl.viewport(0, 0, size.width, size.height);
				gl.clearColor(0, 0, 0, 0);
				gl.clear(gl.COLOR_BUFFER_BIT);

				this.renderSingleLayer(tr.toLayer, toFbo, size, frameProvider, lastGoodFrames);

				// Transition shader pass: blends fromFbo and toFbo into transitionFbo
				const transitionFbo = this.fboPool.acquire(size.width, size.height);
				this.passManager.applyTransition(
					tr.type,
					fromFbo.texture,
					toFbo.texture,
					tr.progress,
					tr.params,
					transitionFbo.framebuffer,
					size.width,
					size.height
				);

				this.fboPool.release(fromFbo);
				this.fboPool.release(toFbo);

				// Composite transition result onto accumFbo
				gl.bindFramebuffer(gl.FRAMEBUFFER, accumFbo.framebuffer);
				gl.viewport(0, 0, size.width, size.height);
				gl.useProgram(program.program);
				gl.bindVertexArray(this.vao);
				gl.uniform2f(program.size, size.width, size.height);
				gl.uniform1i(program.texture, 0);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, transitionFbo.texture);

				// Full-screen affine for the transitioned result
				gl.uniformMatrix3fv(program.affine, false, [size.width, 0, 0, 0, size.height, 0, 0, 0, 1]);
				gl.uniform4f(program.crop, 0, 0, 0, 0);
				gl.uniform1f(program.opacity, layer.transform?.opacity ?? 1.0);
				blendFunction(gl, layer.blendMode ?? 'normal');
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
				stats.drawCalls += 1;
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, null);

				this.fboPool.release(transitionFbo);
				continue;
			}

			if (layer.kind === 'solid') {
				// Solid clip: create 1x1 solid texture
				const color = layer.solidColor ?? { r: 0, g: 0, b: 0, a: 1 };
				const solidTex = this.getSolidTexture(color);
				let currentTex = solidTex;
				const fbosToRelease: PooledFbo[] = [];

				const activeMasks = (layer.masks ?? []).filter((m) => m.enabled && !m.effectId);
				const effectMasks = new Map<string, EvaluatedMask>();
				for (const m of layer.masks ?? []) {
					if (m.enabled && m.effectId) effectMasks.set(m.effectId, m);
				}

				if (activeMasks.length > 0) {
					const matteFbo = this.passManager.accumulateMasks(
						activeMasks,
						this.fboPool,
						size.width,
						size.height
					);
					fbosToRelease.push(matteFbo);
					const maskedFbo = this.passManager.applyMatteToTexture(
						currentTex,
						matteFbo.texture,
						this.fboPool,
						size.width,
						size.height
					);
					fbosToRelease.push(maskedFbo);
					currentTex = maskedFbo.texture;
				}

				const activeEffects = (layer.effects ?? []).filter((e) => !e.isNeutral);
				if (activeEffects.length > 0) {
					let currFbo: PooledFbo | null = null;
					for (const eff of activeEffects) {
						let maskTex: WebGLTexture | null = null;
						const effMask = effectMasks.get(eff.id);
						if (effMask) {
							const effMatteFbo = this.passManager.generateMaskMatte(
								effMask,
								this.fboPool,
								size.width,
								size.height
							);
							fbosToRelease.push(effMatteFbo);
							maskTex = effMatteFbo.texture;
						}
						const nextFbo = this.passManager.applyEffect(
							eff,
							currFbo ? currFbo.texture : currentTex,
							this.fboPool,
							size.width,
							size.height,
							layer.sourceTime,
							this.lutProvider ?? undefined,
							maskTex
						);
						if (currFbo) fbosToRelease.push(currFbo);
						currFbo = nextFbo;
					}
					if (currFbo) {
						currentTex = currFbo.texture;
						fbosToRelease.push(currFbo);
					}
				}

				// Composite solid layer onto accumFbo
				gl.bindFramebuffer(gl.FRAMEBUFFER, accumFbo.framebuffer);
				gl.viewport(0, 0, size.width, size.height);
				gl.useProgram(program.program);
				gl.bindVertexArray(this.vao);
				gl.uniform2f(program.size, size.width, size.height);
				gl.uniform1i(program.texture, 0);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, currentTex);

				const affine = layerAffine(layer, size.width, size.height, size.width, size.height);
				gl.uniformMatrix3fv(program.affine, false, [
					affine.a,
					affine.b,
					0,
					affine.c,
					affine.d,
					0,
					affine.e,
					affine.f,
					1
				]);
				const crop = layer.crop ?? [0, 0, 0, 0];
				gl.uniform4f(program.crop, crop[0], crop[1], crop[2], crop[3]);
				gl.uniform1f(program.opacity, layer.transform?.opacity ?? 1);
				blendFunction(gl, layer.blendMode ?? 'normal');
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
				stats.drawCalls += 1;

				for (const f of fbosToRelease) this.fboPool.release(f);
				continue;
			}

			// Standard video or image layer
			const source = frameProvider(layer) ?? lastGoodFrames.get(layer.clipId) ?? null;
			if (!source || !isUploadable(source)) continue;
			const { width, height } = dimensions(source);
			if (width <= 0 || height <= 0) continue;
			lastGoodFrames.set(layer.clipId, source);
			const entry = this.upload(layer, source, width, height);
			if (!entry) continue;

			// Check for masks and effects on layer
			let layerTex = entry.texture;
			const fbosToRelease: PooledFbo[] = [];

			const activeMasks = (layer.masks ?? []).filter((m) => m.enabled && !m.effectId);
			const effectMasks = new Map<string, EvaluatedMask>();
			for (const m of layer.masks ?? []) {
				if (m.enabled && m.effectId) effectMasks.set(m.effectId, m);
			}

			const effW = Math.min(width, size.width * 2);
			const effH = Math.min(height, size.height * 2);

			if (activeMasks.length > 0) {
				const matteFbo = this.passManager.accumulateMasks(activeMasks, this.fboPool, effW, effH);
				fbosToRelease.push(matteFbo);
				const maskedFbo = this.passManager.applyMatteToTexture(
					layerTex,
					matteFbo.texture,
					this.fboPool,
					effW,
					effH
				);
				fbosToRelease.push(maskedFbo);
				layerTex = maskedFbo.texture;
			}

			const activeEffects = (layer.effects ?? []).filter((e) => !e.isNeutral);
			if (activeEffects.length > 0) {
				let currFbo: PooledFbo | null = null;
				for (const eff of activeEffects) {
					let maskTex: WebGLTexture | null = null;
					const effMask = effectMasks.get(eff.id);
					if (effMask) {
						const effMatteFbo = this.passManager.generateMaskMatte(
							effMask,
							this.fboPool,
							effW,
							effH
						);
						fbosToRelease.push(effMatteFbo);
						maskTex = effMatteFbo.texture;
					}
					const nextFbo = this.passManager.applyEffect(
						eff,
						currFbo ? currFbo.texture : layerTex,
						this.fboPool,
						effW,
						effH,
						layer.sourceTime,
						this.lutProvider ?? undefined,
						maskTex
					);
					if (currFbo) fbosToRelease.push(currFbo);
					currFbo = nextFbo;
				}
				if (currFbo) {
					layerTex = currFbo.texture;
					fbosToRelease.push(currFbo);
				}
			}

			// Composite layer onto accumulation FBO
			gl.bindFramebuffer(gl.FRAMEBUFFER, accumFbo.framebuffer);
			gl.viewport(0, 0, size.width, size.height);
			gl.useProgram(program.program);
			gl.bindVertexArray(this.vao);
			gl.uniform2f(program.size, size.width, size.height);
			gl.uniform1i(program.texture, 0);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, layerTex);

			const affine = layerAffine(layer, width, height, size.width, size.height);
			gl.uniformMatrix3fv(program.affine, false, [
				affine.a,
				affine.b,
				0,
				affine.c,
				affine.d,
				0,
				affine.e,
				affine.f,
				1
			]);
			const crop = layer.crop ?? [0, 0, 0, 0];
			gl.uniform4f(program.crop, crop[0], crop[1], crop[2], crop[3]);
			gl.uniform1f(program.opacity, layer.transform?.opacity ?? 1);
			blendFunction(gl, layer.blendMode ?? 'normal');
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			stats.drawCalls += 1;
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, null);

			for (const f of fbosToRelease) this.fboPool.release(f);
		}

		// Optional scope capture
		if (this.scopesEnabled) {
			const now = performance.now();
			const shouldCapture = !options.playing || now - this.lastScopeTime >= 100;
			if (shouldCapture) {
				this.lastScopeFrame = captureScopeFrame(
					gl,
					accumFbo.texture,
					size.width,
					size.height,
					this.fboPool,
					this.passManager
				);
				this.lastScopeTime = now;
			}
		}

		// Blit accumulated composite to canvas
		this.passManager.blit(accumFbo.texture, null, size.width, size.height, 1.0);
		this.fboPool.release(accumFbo);

		gl.bindVertexArray(null);
		this.evict();
		const elapsed = performance.now() - started;
		stats.frames += 1;
		stats.lastFrameMs = elapsed;
		stats.maxFrameMs = Math.max(stats.maxFrameMs, elapsed);
		stats.totalFrameMs += elapsed;
		return true;
	}

	private getSolidTexture(color: { r: number; g: number; b: number; a: number }): WebGLTexture {
		const gl = this.context.gl;
		if (!this.solidTexture) {
			this.solidTexture = gl.createTexture()!;
			gl.bindTexture(gl.TEXTURE_2D, this.solidTexture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		}
		gl.bindTexture(gl.TEXTURE_2D, this.solidTexture);
		const pixel = new Uint8Array([
			Math.round(color.r * 255),
			Math.round(color.g * 255),
			Math.round(color.b * 255),
			Math.round(color.a * 255)
		]);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
		return this.solidTexture;
	}

	private upload(
		layer: ActiveLayer,
		source: UploadableSource,
		width: number,
		height: number
	): CachedTexture | null {
		const { gl, stats } = this.context;
		let entry = this.textures.get(layer.clipId);
		if (!entry) {
			const texture = gl.createTexture();
			if (!texture) return null;
			stats.texturesCreated += 1;
			entry = { texture, source: null, width: 0, height: 0, lastUsedFrame: 0 };
			this.textures.set(layer.clipId, entry);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		}
		entry.lastUsedFrame = this.frameIndex;
		gl.bindTexture(gl.TEXTURE_2D, entry.texture);
		const unchanged = layer.kind === 'image' && entry.source === source;
		if (!unchanged) {
			if (entry.width === width && entry.height === height) {
				gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
			} else {
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
				entry.width = width;
				entry.height = height;
			}
			entry.source = source;
			stats.textureUploads += 1;
		}
		return entry;
	}

	private evict(): void {
		for (const [clipId, entry] of this.textures) {
			if (this.frameIndex - entry.lastUsedFrame > EVICT_AFTER_FRAMES)
				this.deleteEntry(clipId, entry);
		}
	}

	private deleteEntry(clipId: ClipId, entry: CachedTexture): void {
		if (!this.context.lost) this.context.gl.deleteTexture(entry.texture);
		this.context.stats.texturesDeleted += 1;
		this.textures.delete(clipId);
	}

	releaseUnused(liveClipIds: ReadonlySet<ClipId>): void {
		for (const [clipId, entry] of this.textures) {
			if (!liveClipIds.has(clipId)) this.deleteEntry(clipId, entry);
		}
	}

	private renderSingleLayer(
		layer: ActiveLayer,
		targetFbo: PooledFbo,
		size: CompositionSize,
		frameProvider: FrameProvider,
		lastGoodFrames: LastGoodFrames
	): void {
		const { gl, program, stats } = this.context;
		if (!program || !this.vao) return;

		if (layer.kind === 'solid') {
			const color = layer.solidColor ?? { r: 0, g: 0, b: 0, a: 1 };
			const solidTex = this.getSolidTexture(color);
			let currentTex = solidTex;
			const fbosToRelease: PooledFbo[] = [];

			const activeMasks = (layer.masks ?? []).filter((m) => m.enabled && !m.effectId);
			const effectMasks = new Map<string, EvaluatedMask>();
			for (const m of layer.masks ?? []) {
				if (m.enabled && m.effectId) effectMasks.set(m.effectId, m);
			}

			if (activeMasks.length > 0) {
				const matteFbo = this.passManager.accumulateMasks(
					activeMasks,
					this.fboPool,
					size.width,
					size.height
				);
				fbosToRelease.push(matteFbo);
				const maskedFbo = this.passManager.applyMatteToTexture(
					currentTex,
					matteFbo.texture,
					this.fboPool,
					size.width,
					size.height
				);
				fbosToRelease.push(maskedFbo);
				currentTex = maskedFbo.texture;
			}

			const activeEffects = (layer.effects ?? []).filter((e) => !e.isNeutral);
			if (activeEffects.length > 0) {
				let currFbo: PooledFbo | null = null;
				for (const eff of activeEffects) {
					let maskTex: WebGLTexture | null = null;
					const effMask = effectMasks.get(eff.id);
					if (effMask) {
						const effMatteFbo = this.passManager.generateMaskMatte(
							effMask,
							this.fboPool,
							size.width,
							size.height
						);
						fbosToRelease.push(effMatteFbo);
						maskTex = effMatteFbo.texture;
					}
					const nextFbo = this.passManager.applyEffect(
						eff,
						currFbo ? currFbo.texture : currentTex,
						this.fboPool,
						size.width,
						size.height,
						layer.sourceTime,
						this.lutProvider ?? undefined,
						maskTex
					);
					if (currFbo) fbosToRelease.push(currFbo);
					currFbo = nextFbo;
				}
				if (currFbo) {
					currentTex = currFbo.texture;
					fbosToRelease.push(currFbo);
				}
			}

			gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo.framebuffer);
			gl.viewport(0, 0, size.width, size.height);
			gl.useProgram(program.program);
			gl.bindVertexArray(this.vao);
			gl.uniform2f(program.size, size.width, size.height);
			gl.uniform1i(program.texture, 0);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, currentTex);

			const affine = layerAffine(layer, size.width, size.height, size.width, size.height);
			gl.uniformMatrix3fv(program.affine, false, [
				affine.a,
				affine.b,
				0,
				affine.c,
				affine.d,
				0,
				affine.e,
				affine.f,
				1
			]);
			const crop = layer.crop ?? [0, 0, 0, 0];
			gl.uniform4f(program.crop, crop[0], crop[1], crop[2], crop[3]);
			gl.uniform1f(program.opacity, layer.transform?.opacity ?? 1);
			blendFunction(gl, layer.blendMode ?? 'normal');
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			stats.drawCalls += 1;

			for (const f of fbosToRelease) this.fboPool.release(f);
			return;
		}

		const source = frameProvider(layer) ?? lastGoodFrames.get(layer.clipId) ?? null;
		if (!source || !isUploadable(source)) return;
		const { width, height } = dimensions(source);
		if (width <= 0 || height <= 0) return;
		lastGoodFrames.set(layer.clipId, source);
		const entry = this.upload(layer, source, width, height);
		if (!entry) return;

		let layerTex = entry.texture;
		const fbosToRelease: PooledFbo[] = [];

		const activeMasks = (layer.masks ?? []).filter((m) => m.enabled && !m.effectId);
		const effectMasks = new Map<string, EvaluatedMask>();
		for (const m of layer.masks ?? []) {
			if (m.enabled && m.effectId) effectMasks.set(m.effectId, m);
		}

		const effW = Math.min(width, size.width * 2);
		const effH = Math.min(height, size.height * 2);

		if (activeMasks.length > 0) {
			const matteFbo = this.passManager.accumulateMasks(activeMasks, this.fboPool, effW, effH);
			fbosToRelease.push(matteFbo);
			const maskedFbo = this.passManager.applyMatteToTexture(
				layerTex,
				matteFbo.texture,
				this.fboPool,
				effW,
				effH
			);
			fbosToRelease.push(maskedFbo);
			layerTex = maskedFbo.texture;
		}

		const activeEffects = (layer.effects ?? []).filter((e) => !e.isNeutral);
		if (activeEffects.length > 0) {
			let currFbo: PooledFbo | null = null;
			for (const eff of activeEffects) {
				let maskTex: WebGLTexture | null = null;
				const effMask = effectMasks.get(eff.id);
				if (effMask) {
					const effMatteFbo = this.passManager.generateMaskMatte(effMask, this.fboPool, effW, effH);
					fbosToRelease.push(effMatteFbo);
					maskTex = effMatteFbo.texture;
				}
				const nextFbo = this.passManager.applyEffect(
					eff,
					currFbo ? currFbo.texture : layerTex,
					this.fboPool,
					effW,
					effH,
					layer.sourceTime,
					this.lutProvider ?? undefined,
					maskTex
				);
				if (currFbo) fbosToRelease.push(currFbo);
				currFbo = nextFbo;
			}
			if (currFbo) {
				layerTex = currFbo.texture;
				fbosToRelease.push(currFbo);
			}
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo.framebuffer);
		gl.viewport(0, 0, size.width, size.height);
		gl.useProgram(program.program);
		gl.bindVertexArray(this.vao);
		gl.uniform2f(program.size, size.width, size.height);
		gl.uniform1i(program.texture, 0);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, layerTex);

		const affine = layerAffine(layer, width, height, size.width, size.height);
		gl.uniformMatrix3fv(program.affine, false, [
			affine.a,
			affine.b,
			0,
			affine.c,
			affine.d,
			0,
			affine.e,
			affine.f,
			1
		]);
		const crop = layer.crop ?? [0, 0, 0, 0];
		gl.uniform4f(program.crop, crop[0], crop[1], crop[2], crop[3]);
		gl.uniform1f(program.opacity, layer.transform?.opacity ?? 1);
		blendFunction(gl, layer.blendMode ?? 'normal');
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		stats.drawCalls += 1;
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, null);

		for (const f of fbosToRelease) this.fboPool.release(f);
	}

	dispose(): void {
		for (const [clipId, entry] of this.textures) this.deleteEntry(clipId, entry);
		if (this.solidTexture && !this.context.lost) {
			this.context.gl.deleteTexture(this.solidTexture);
			this.solidTexture = null;
		}
		this.fboPool.dispose();
		this.passManager.dispose();
		if (this.vao && !this.context.lost) this.context.gl.deleteVertexArray(this.vao);
		this.vao = null;
		this.context.dispose();
	}
}

export class Canvas2DRenderer implements FrameRenderer {
	readonly kind = 'canvas2d';
	readonly stats: RenderStats;

	constructor(
		private readonly context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
		stats: RenderStats
	) {
		this.stats = stats;
	}

	render(
		size: CompositionSize,
		layers: readonly ActiveLayer[],
		frameProvider: FrameProvider,
		lastGoodFrames: LastGoodFrames = new Map()
	): boolean {
		const started = performance.now();
		renderFrame(this.context, size, layers, frameProvider, lastGoodFrames);
		const elapsed = performance.now() - started;
		this.stats.frames += 1;
		this.stats.lastFrameMs = elapsed;
		this.stats.maxFrameMs = Math.max(this.stats.maxFrameMs, elapsed);
		this.stats.totalFrameMs += elapsed;
		return true;
	}

	releaseUnused(): void {}
	dispose(): void {}
}
