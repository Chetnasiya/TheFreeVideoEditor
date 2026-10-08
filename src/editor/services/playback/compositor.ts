import { fitRect } from '../../core/composition';
import type { ActiveLayer } from '../../core/playback';
import type { BlendMode, ClipId } from '../../core/types';

const CANVAS_BLEND: Record<BlendMode, GlobalCompositeOperation> = {
	normal: 'source-over',
	add: 'lighter',
	multiply: 'multiply',
	screen: 'screen'
};

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
	globalCompositeOperation?: GlobalCompositeOperation;
	clearRect(x: number, y: number, width: number, height: number): void;
	fillRect(x: number, y: number, width: number, height: number): void;
	drawImage(
		image: CanvasImageSource | VideoFrame,
		x: number,
		y: number,
		width: number,
		height: number
	): void;
	drawImage(
		image: CanvasImageSource | VideoFrame,
		sx: number,
		sy: number,
		sw: number,
		sh: number,
		dx: number,
		dy: number,
		dw: number,
		dh: number
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
		if (layer.transition) {
			const tr = layer.transition;
			const renderSubLayer = (sub: ActiveLayer, alphaMultiplier: number) => {
				if (sub.kind === 'solid') {
					const c = sub.solidColor ?? { r: 0, g: 0, b: 0, a: 1 };
					context.save();
					context.globalAlpha = (sub.transform?.opacity ?? 1) * alphaMultiplier;
					context.fillStyle = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`;
					context.fillRect(0, 0, size.width, size.height);
					context.restore();
					return;
				}
				const src = frameProvider(sub) ?? lastGoodFrames.get(sub.clipId) ?? null;
				if (!src) return;
				const dims = sourceDimensions(src);
				if (dims.width <= 0 || dims.height <= 0) return;
				lastGoodFrames.set(sub.clipId, src);
				const rect = fitRect(dims.width, dims.height, size.width, size.height);
				const transform = sub.transform;
				const blendMode = sub.blendMode ?? 'normal';
				const [cropLeft, cropTop, cropRight, cropBottom] = sub.crop ?? [0, 0, 0, 0];
				const cropped = Boolean(sub.crop);
				const drawRect = {
					x: rect.x + cropLeft * rect.width,
					y: rect.y + cropTop * rect.height,
					width: rect.width * (1 - cropLeft - cropRight),
					height: rect.height * (1 - cropTop - cropBottom)
				};
				const sourceRect = {
					x: cropLeft * dims.width,
					y: cropTop * dims.height,
					width: dims.width * (1 - cropLeft - cropRight),
					height: dims.height * (1 - cropTop - cropBottom)
				};
				const draw = (offsetX: number, offsetY: number): void => {
					if (cropped) {
						context.drawImage(
							src,
							sourceRect.x,
							sourceRect.y,
							sourceRect.width,
							sourceRect.height,
							drawRect.x - offsetX,
							drawRect.y - offsetY,
							drawRect.width,
							drawRect.height
						);
					} else {
						context.drawImage(src, rect.x - offsetX, rect.y - offsetY, rect.width, rect.height);
					}
				};

				context.save();
				context.globalAlpha = (transform?.opacity ?? 1) * alphaMultiplier;
				context.globalCompositeOperation = CANVAS_BLEND[blendMode];
				if (!transform) {
					draw(0, 0);
				} else {
					const anchor = sub.anchor ?? { x: 0, y: 0 };
					context.translate(
						size.width / 2 + (transform.x ?? 0) + anchor.x,
						size.height / 2 + (transform.y ?? 0) + anchor.y
					);
					if (transform.rotation) {
						context.rotate((transform.rotation * Math.PI) / 180);
					}
					context.scale(transform.scaleX ?? 1, transform.scaleY ?? 1);
					draw(size.width / 2 + anchor.x, size.height / 2 + anchor.y);
				}
				context.restore();
			};

			renderSubLayer(tr.fromLayer, 1 - tr.progress);
			renderSubLayer(tr.toLayer, tr.progress);
			continue;
		}

		if (layer.kind === 'solid') {
			const c = layer.solidColor ?? { r: 0, g: 0, b: 0, a: 1 };
			context.save();
			context.globalAlpha = layer.transform?.opacity ?? 1;
			context.fillStyle = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`;
			context.fillRect(0, 0, size.width, size.height);
			context.restore();
			continue;
		}

		if (layer.kind === 'text') {
			// Text layers use frameProvider to get rasterized canvas
			const source = frameProvider(layer) ?? lastGoodFrames.get(layer.clipId) ?? null;
			if (!source) continue;
			const dimensions = sourceDimensions(source);
			if (dimensions.width <= 0 || dimensions.height <= 0) continue;
			lastGoodFrames.set(layer.clipId, source);

			const transform = layer.transform;
			const blendMode = layer.blendMode ?? 'normal';
			const [cropLeft, cropTop, cropRight, cropBottom] = layer.crop ?? [0, 0, 0, 0];
			const cropped = Boolean(layer.crop);
			const drawRect = {
				x: cropLeft * dimensions.width,
				y: cropTop * dimensions.height,
				width: dimensions.width * (1 - cropLeft - cropRight),
				height: dimensions.height * (1 - cropTop - cropBottom)
			};
			const sourceRect = {
				x: cropLeft * dimensions.width,
				y: cropTop * dimensions.height,
				width: dimensions.width * (1 - cropLeft - cropRight),
				height: dimensions.height * (1 - cropTop - cropBottom)
			};

			context.save();
			context.globalAlpha = transform?.opacity ?? 1;
			context.globalCompositeOperation = CANVAS_BLEND[blendMode];
			const anchor = layer.anchor ?? { x: 0, y: 0 };
			context.translate(
				size.width / 2 + (transform?.x ?? 0) + anchor.x,
				size.height / 2 + (transform?.y ?? 0) + anchor.y
			);
			context.rotate(((transform?.rotation ?? 0) * Math.PI) / 180);
			context.scale(transform?.scaleX ?? 1, transform?.scaleY ?? 1);

			if (cropped) {
				context.drawImage(
					source,
					sourceRect.x,
					sourceRect.y,
					sourceRect.width,
					sourceRect.height,
					drawRect.x - (size.width / 2 + anchor.x),
					drawRect.y - (size.height / 2 + anchor.y),
					drawRect.width,
					drawRect.height
				);
			} else {
				context.drawImage(
					source,
					-dimensions.width / 2,
					-dimensions.height / 2,
					dimensions.width,
					dimensions.height
				);
			}
			context.restore();
			continue;
		}

		const source = frameProvider(layer) ?? lastGoodFrames.get(layer.clipId) ?? null;
		if (!source) continue;
		const dimensions = sourceDimensions(source);
		if (dimensions.width <= 0 || dimensions.height <= 0) continue;
		lastGoodFrames.set(layer.clipId, source);
		const rect = fitRect(dimensions.width, dimensions.height, size.width, size.height);
		const transform = layer.transform;
		const blendMode = layer.blendMode ?? 'normal';
		const [cropLeft, cropTop, cropRight, cropBottom] = layer.crop ?? [0, 0, 0, 0];
		const cropped = Boolean(layer.crop);
		const drawRect = {
			x: rect.x + cropLeft * rect.width,
			y: rect.y + cropTop * rect.height,
			width: rect.width * (1 - cropLeft - cropRight),
			height: rect.height * (1 - cropTop - cropBottom)
		};
		const sourceRect = {
			x: cropLeft * dimensions.width,
			y: cropTop * dimensions.height,
			width: dimensions.width * (1 - cropLeft - cropRight),
			height: dimensions.height * (1 - cropTop - cropBottom)
		};
		const draw = (offsetX: number, offsetY: number): void => {
			if (cropped) {
				context.drawImage(
					source,
					sourceRect.x,
					sourceRect.y,
					sourceRect.width,
					sourceRect.height,
					drawRect.x - offsetX,
					drawRect.y - offsetY,
					drawRect.width,
					drawRect.height
				);
			} else {
				context.drawImage(source, rect.x - offsetX, rect.y - offsetY, rect.width, rect.height);
			}
		};
		if (!transform && blendMode === 'normal') {
			draw(0, 0);
			continue;
		}

		context.save();
		context.globalAlpha = transform?.opacity ?? 1;
		context.globalCompositeOperation = CANVAS_BLEND[blendMode];
		const anchor = layer.anchor ?? { x: 0, y: 0 };
		context.translate(
			size.width / 2 + (transform?.x ?? 0) + anchor.x,
			size.height / 2 + (transform?.y ?? 0) + anchor.y
		);
		context.rotate(((transform?.rotation ?? 0) * Math.PI) / 180);
		context.scale(transform?.scaleX ?? 1, transform?.scaleY ?? 1);
		draw(size.width / 2 + anchor.x, size.height / 2 + anchor.y);
		context.restore();
	}
}
