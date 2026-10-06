import { fitRect } from '../../core/composition';
import type { ActiveLayer } from '../../core/playback';
import type { ClipId } from '../../core/types';

export type FrameSource = CanvasImageSource | VideoFrame;
export type FrameProvider = (layer: ActiveLayer) => FrameSource | null;
export type LastGoodFrames = Map<ClipId, FrameSource>;

export interface CompositionSize {
	width: number;
	height: number;
}

export interface CompositionContext {
	canvas?: { width: number; height: number } | OffscreenCanvasRenderingContext2D['canvas'];
	fillStyle: string | CanvasGradient | CanvasPattern;
	globalAlpha: number;
	clearRect(x: number, y: number, width: number, height: number): void;
	fillRect(x: number, y: number, width: number, height: number): void;
	drawImage(
		image: CanvasImageSource | VideoFrame,
		x: number,
		y: number,
		width: number,
		height: number
	): void;
	save(): void;
	restore(): void;
	translate(x: number, y: number): void;
	rotate(angle: number): void;
	scale(x: number, y: number): void;
}

function sourceDimensions(source: FrameSource): { width: number; height: number } {
	if ('displayWidth' in source && 'displayHeight' in source) {
		return { width: source.displayWidth, height: source.displayHeight };
	}
	if ('videoWidth' in source && 'videoHeight' in source) {
		return { width: source.videoWidth, height: source.videoHeight };
	}
	if ('naturalWidth' in source && 'naturalHeight' in source) {
		return { width: source.naturalWidth, height: source.naturalHeight };
	}
	if ('width' in source && 'height' in source) {
		const { width, height } = source;
		if (typeof width === 'number' && typeof height === 'number') return { width, height };
	}
	return { width: 0, height: 0 };
}

export function renderFrame(
	context: CompositionContext,
	size: CompositionSize,
	layers: readonly ActiveLayer[],
	frameProvider: FrameProvider,
	lastGoodFrames: LastGoodFrames = new Map()
): void {
	if (![size.width, size.height].every((value) => Number.isSafeInteger(value) && value > 0)) {
		throw new RangeError('Composition size must use positive integer dimensions.');
	}

	context.clearRect(0, 0, size.width, size.height);
	context.fillStyle = '#000';
	context.fillRect(0, 0, size.width, size.height);

	for (const layer of layers) {
		const source = frameProvider(layer) ?? lastGoodFrames.get(layer.clipId) ?? null;
		if (!source) continue;
		const dimensions = sourceDimensions(source);
		if (dimensions.width <= 0 || dimensions.height <= 0) continue;
		lastGoodFrames.set(layer.clipId, source);
		const rect = fitRect(dimensions.width, dimensions.height, size.width, size.height);
		const transform = layer.transform;
		if (!transform) {
			context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
			continue;
		}

		context.save();
		context.globalAlpha = transform.opacity;
		context.translate(size.width / 2 + transform.x, size.height / 2 + transform.y);
		context.rotate((transform.rotation * Math.PI) / 180);
		context.scale(transform.scaleX, transform.scaleY);
		context.drawImage(
			source,
			rect.x - size.width / 2,
			rect.y - size.height / 2,
			rect.width,
			rect.height
		);
		context.restore();
	}
}
