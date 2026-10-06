import { previewScale } from '../../core/composition';

export interface PreviewDimensions {
	width: number;
	height: number;
}

export function observePreviewScale(
	element: HTMLElement,
	source: PreviewDimensions,
	onScale: (scale: number) => void
): () => void {
	const update = () => {
		const { width, height } = element.getBoundingClientRect();
		if (width <= 0 || height <= 0) return;
		onScale(previewScale(source.width, source.height, width, height));
	};
	const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
	observer?.observe(element);
	update();
	return () => observer?.disconnect();
}
