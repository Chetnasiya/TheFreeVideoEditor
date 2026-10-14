import { projectNeedsGpu } from '../../core/gpuFeatures';
import type { Project } from '../../core/types';
import { Canvas2DRenderer, GlCompositor, type FrameRenderer } from './GlCompositor';
import { probeWebGL2, type GlCanvas } from './RenderContext';
import { createRenderStats } from './stats';

export interface FrameRendererOptions {
	/** Use the Canvas2D reference renderer even when WebGL2 is available. */
	forceCanvas2d?: boolean;
	preserveDrawingBuffer?: boolean;
	alpha?: boolean;
	colorSpace?: PredefinedColorSpace;
	highBitDepth?: boolean;
	onContextLost?: () => void;
	onContextRestored?: () => void;
}

/**
 * Creates the compositor for a canvas. WebGL2 is preferred; the Canvas2D reference renderer is the
 * fallback. A canvas can only ever hold one context type, so the choice is made once per canvas.
 */
export function createFrameRenderer(
	canvas: GlCanvas,
	options: FrameRendererOptions = {}
): FrameRenderer | null {
	if (!options.forceCanvas2d) {
		try {
			return new GlCompositor(canvas, {
				...(options.preserveDrawingBuffer !== undefined
					? { preserveDrawingBuffer: options.preserveDrawingBuffer }
					: {}),
				...(options.alpha !== undefined ? { alpha: options.alpha } : {}),
				...(options.colorSpace !== undefined ? { colorSpace: options.colorSpace } : {}),
				...(options.highBitDepth !== undefined ? { highBitDepth: options.highBitDepth } : {}),
				...(options.onContextLost ? { onLost: options.onContextLost } : {}),
				...(options.onContextRestored ? { onRestored: options.onContextRestored } : {})
			});
		} catch (error) {
			console.warn('WebGL2 compositor unavailable, using Canvas2D.', error);
		}
	}
	const context = (canvas as OffscreenCanvas).getContext('2d') as
		CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
	if (!context) return null;
	return new Canvas2DRenderer(context, createRenderStats('canvas2d'));
}

export type RendererKind = 'webgl2' | 'canvas2d';

/** Chooses the renderer for a project. `?renderer=webgl2|canvas2d` overrides the automatic choice. */
export function selectRenderer(
	project: Project | null,
	search: string = globalThis.location?.search ?? ''
): RendererKind {
	const override = new URLSearchParams(search).get('renderer');
	if (override === 'canvas2d') return 'canvas2d';
	if (override === 'webgl2') return probeWebGL2() ? 'webgl2' : 'canvas2d';
	return project && projectNeedsGpu(project) && probeWebGL2() ? 'webgl2' : 'canvas2d';
}

export { probeWebGL2 };
export type { FrameRenderer };
