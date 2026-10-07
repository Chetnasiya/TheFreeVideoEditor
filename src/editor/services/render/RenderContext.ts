import layerFragmentSource from './shaders/layer.frag.glsl?raw';
import layerVertexSource from './shaders/layer.vert.glsl?raw';
import { createRenderStats, type RenderStats } from './stats';

export type GlCanvas = HTMLCanvasElement | OffscreenCanvas;

export class ShaderCompileError extends Error {
	constructor(
		readonly shader: string,
		readonly log: string
	) {
		super(`Shader "${shader}" failed to compile: ${log}`);
		this.name = 'ShaderCompileError';
	}
}

export interface LayerProgram {
	program: WebGLProgram;
	affine: WebGLUniformLocation;
	size: WebGLUniformLocation;
	opacity: WebGLUniformLocation;
	crop: WebGLUniformLocation;
	texture: WebGLUniformLocation;
}

export interface RenderContextOptions {
	preserveDrawingBuffer?: boolean;
	onLost?: () => void;
	onRestored?: () => void;
}

export function probeWebGL2(): boolean {
	try {
		if (typeof OffscreenCanvas !== 'undefined') {
			return new OffscreenCanvas(1, 1).getContext('webgl2') !== null;
		}
		if (typeof document !== 'undefined') {
			return document.createElement('canvas').getContext('webgl2') !== null;
		}
	} catch {
		return false;
	}
	return false;
}

function compile(
	gl: WebGL2RenderingContext,
	type: number,
	source: string,
	name: string
): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new ShaderCompileError(name, 'createShader returned null.');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader) ?? 'unknown error';
		gl.deleteShader(shader);
		throw new ShaderCompileError(name, log);
	}
	return shader;
}

/** Owns the WebGL2 context, the layer program and context-loss handling. */
export class RenderContext {
	readonly gl: WebGL2RenderingContext;
	readonly stats: RenderStats = createRenderStats('webgl2');
	program: LayerProgram | null = null;
	private disposed = false;
	private readonly onLostEvent: (event: Event) => void;
	private readonly onRestoredEvent: () => void;

	constructor(
		readonly canvas: GlCanvas,
		private readonly options: RenderContextOptions = {}
	) {
		const gl = canvas.getContext('webgl2', {
			alpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			premultipliedAlpha: true,
			preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
			powerPreference: 'high-performance'
		});
		if (!gl) throw new Error('WebGL2 is unavailable.');
		this.gl = gl as WebGL2RenderingContext;
		this.gl.getExtension('OES_texture_float_linear');
		const debugInfo = this.gl.getExtension('WEBGL_debug_renderer_info');
		this.stats.gpuRenderer = debugInfo
			? String(this.gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
			: 'unknown';
		this.onLostEvent = (event) => {
			event.preventDefault();
			if (this.program) this.stats.programsDeleted += 1;
			this.program = null;
			this.stats.contextLosses += 1;
			this.options.onLost?.();
		};
		this.onRestoredEvent = () => {
			this.stats.contextRestores += 1;
			this.build();
			this.options.onRestored?.();
		};
		canvas.addEventListener('webglcontextlost', this.onLostEvent);
		canvas.addEventListener('webglcontextrestored', this.onRestoredEvent);
		this.build();
	}

	get lost(): boolean {
		return this.disposed || this.gl.isContextLost();
	}

	/** Compiles the layer program, then fixes the pipeline state shared by every draw. */
	private build(): void {
		const gl = this.gl;
		const vertex = compile(gl, gl.VERTEX_SHADER, layerVertexSource, 'layer.vert');
		const fragment = compile(gl, gl.FRAGMENT_SHADER, layerFragmentSource, 'layer.frag');
		const program = gl.createProgram();
		if (!program) throw new ShaderCompileError('layer', 'createProgram returned null.');
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		gl.deleteShader(vertex);
		gl.deleteShader(fragment);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const log = gl.getProgramInfoLog(program) ?? 'unknown error';
			gl.deleteProgram(program);
			throw new ShaderCompileError('layer', log);
		}
		const affine = gl.getUniformLocation(program, 'u_affine');
		const size = gl.getUniformLocation(program, 'u_size');
		const opacity = gl.getUniformLocation(program, 'u_opacity');
		const crop = gl.getUniformLocation(program, 'u_crop');
		const texture = gl.getUniformLocation(program, 'u_texture');
		if (!affine || !size || !opacity || !crop || !texture) {
			gl.deleteProgram(program);
			throw new ShaderCompileError('layer', 'Missing uniform location.');
		}
		this.stats.programsCreated += 1;
		this.program = { program, affine, size, opacity, crop, texture };
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
		gl.enable(gl.BLEND);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
	}

	/** Test helper: simulates a lost/restored context via WEBGL_lose_context. */
	loseContext(): (() => void) | null {
		const extension = this.gl.getExtension('WEBGL_lose_context');
		if (!extension) return null;
		extension.loseContext();
		return () => extension.restoreContext();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.canvas.removeEventListener('webglcontextlost', this.onLostEvent);
		this.canvas.removeEventListener('webglcontextrestored', this.onRestoredEvent);
		if (this.program && !this.gl.isContextLost()) {
			this.gl.deleteProgram(this.program.program);
			this.stats.programsDeleted += 1;
		}
		this.program = null;
		try {
			this.gl.getExtension('WEBGL_lose_context')?.loseContext();
		} catch {}
	}
}
