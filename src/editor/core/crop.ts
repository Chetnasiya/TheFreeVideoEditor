/** Crop insets as fractions of the source: [left, top, right, bottom]. */
export type Crop = readonly [number, number, number, number];

export const DEFAULT_CROP: Crop = [0, 0, 0, 0];
/** Opposite insets always leave at least this fraction of the source visible. */
export const MIN_CROP_REMAINDER = 0.01;

export function isCrop(value: unknown): value is Crop {
	return (
		Array.isArray(value) &&
		value.length === 4 &&
		value.every((item) => typeof item === 'number' && Number.isFinite(item))
	);
}

export function isDefaultCrop(crop: Crop): boolean {
	return crop[0] === 0 && crop[1] === 0 && crop[2] === 0 && crop[3] === 0;
}

function clampAxis(near: number, far: number, edited: 'near' | 'far' | null): [number, number] {
	let a = Math.min(1, Math.max(0, near));
	let b = Math.min(1, Math.max(0, far));
	const limit = 1 - MIN_CROP_REMAINDER;
	if (a + b > limit) {
		if (edited === 'near') a = limit - b;
		else if (edited === 'far') b = limit - a;
		else {
			const scale = limit / (a + b);
			a *= scale;
			b *= scale;
		}
	}
	return [Math.max(0, a), Math.max(0, b)];
}

/**
 * Clamps each inset to [0, 1) and keeps left+right and top+bottom below 1. When one inset was just
 * edited it gives way against its opposite; otherwise both are scaled proportionally.
 */
export function clampCrop(crop: Crop, editedIndex?: number): Crop {
	const [left, right] = clampAxis(
		crop[0],
		crop[2],
		editedIndex === 0 ? 'near' : editedIndex === 2 ? 'far' : null
	);
	const [top, bottom] = clampAxis(
		crop[1],
		crop[3],
		editedIndex === 1 ? 'near' : editedIndex === 3 ? 'far' : null
	);
	return [left, top, right, bottom];
}
