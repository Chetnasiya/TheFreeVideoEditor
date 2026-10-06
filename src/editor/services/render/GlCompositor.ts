import { layerAffine } from '../../core/layerGeometry';
import type { ActiveLayer } from '../../core/playback';
import type { BlendMode, ClipId } from '../../core/types';
import {
	renderFrame,
	type CompositionSize,
	type FrameProvider,
	type FrameSource,
	type LastGoodFrames
} from '../playback/compositor';
import { RenderContext, type GlCanvas, type RenderContextOptions } from './RenderContext';
import type { RenderStats } from './stats';

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
		lastGoodFrames?: LastGoodFrames
	): boolean;
	releaseUnused(liveClipIds: ReadonlySet<ClipId>): void;
	dispose(): void;
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
	// Sources are premultiplied; each equation matches the Canvas2D composite operation over an
	// opaque backdrop.
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

	constructor(canvas: GlCanvas, options: RenderContextOptions = {}) {
		this.context = new RenderContext(canvas, {
			...options,
			onLost: () => {
				// The driver frees every GPU object with the context, so count them as released.
				this.context.stats.texturesDeleted += this.textures.size;
				this.textures.clear();
				this.vao = null;
				options.onLost?.();
			},
			onRestored: () => {
				this.vao = this.context.gl.createVertexArray();
				options.onRestored?.();
			}
		});
		this.vao = this.context.gl.createVertexArray();
	}

	get stats(): RenderStats {
		return this.context.stats;
	}

	get renderContext(): RenderContext {
		return this.context;
	}

	render(
		size: CompositionSize,
		layers: readonly ActiveLayer[],
		frameProvider: FrameProvider,
		lastGoodFrames: LastGoodFrames = new Map()
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
		// Still images are immutable, so an unchanged source needs no re-upload.
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

	dispose(): void {
		for (const [clipId, entry] of this.textures) this.deleteEntry(clipId, entry);
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
