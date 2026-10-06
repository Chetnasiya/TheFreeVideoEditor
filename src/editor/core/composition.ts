export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type FitMode = 'contain' | 'cover';

function validateDimensions(width: number, height: number): void {
	if (![width, height].every((value) => Number.isFinite(value) && value > 0)) {
		throw new RangeError('Composition dimensions must be positive finite numbers.');
	}
}

export function previewScale(
	sourceWidth: number,
	sourceHeight: number,
	width: number,
	height: number
): number {
	validateDimensions(sourceWidth, sourceHeight);
	validateDimensions(width, height);
	return Math.min(width / sourceWidth, height / sourceHeight);
}

export function fitRect(
	sourceWidth: number,
	sourceHeight: number,
	width: number,
	height: number,
	mode: FitMode = 'contain'
): Rect {
	validateDimensions(sourceWidth, sourceHeight);
	validateDimensions(width, height);
	const scale =
		mode === 'contain'
			? Math.min(width / sourceWidth, height / sourceHeight)
			: Math.max(width / sourceWidth, height / sourceHeight);
	const fittedWidth = sourceWidth * scale;
	const fittedHeight = sourceHeight * scale;
	return {
		x: (width - fittedWidth) / 2,
		y: (height - fittedHeight) / 2,
		width: fittedWidth,
		height: fittedHeight
	};
}
