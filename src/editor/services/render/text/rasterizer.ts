import { layout } from '../../../core/text/layout';
import type { TextStyle, TextBox } from '../../../core/types';

export interface TextRasterConfig {
	text: string;
	style: TextStyle;
	box?: TextBox;
	fontSize: number;
	fillColor: { r: number; g: number; b: number; a: number };
	strokeColor?: { r: number; g: number; b: number; a: number };
	strokeWidth?: number;
	shadowColor?: { r: number; g: number; b: number; a: number };
	shadowBlur?: number;
	shadowOffsetX?: number;
	shadowOffsetY?: number;
	backgroundBoxColor?: { r: number; g: number; b: number; a: number };
	backgroundBoxPadding?: number;
	backgroundBoxRadius?: number;
	scale?: number;
}

/**
 * Rasterize text to an OffscreenCanvas.
 * Output is premultiplied RGBA suitable for compositing.
 */
export function rasterizeText(config: TextRasterConfig): OffscreenCanvas {
	const canvas = new OffscreenCanvas(1024, 512);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Failed to get 2D context from OffscreenCanvas');

	// Clear with transparent
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	const fontFamily = config.style.fontFamily || 'sans-serif';
	const fontWeight = config.style.fontWeight || 'normal';
	const fontStyle = config.style.fontStyle || 'normal';
	const fontSize = config.fontSize || 48;
	const fontString = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;

	// Measure function for layout
	const measure = (text: string): number => {
		ctx.font = fontString;
		return ctx.measureText(text).width;
	};

	// Compute layout
	const layoutResult = layout(config.text, config.style, config.box, measure);

	// Calculate total bounding box
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for (const line of layoutResult.lines) {
		minX = Math.min(minX, line.x);
		minY = Math.min(minY, line.y);
		maxX = Math.max(maxX, line.x + line.width);
		maxY = Math.max(maxY, line.y + fontSize);
	}

	if (!isFinite(minX)) {
		// No text, return empty canvas
		return canvas;
	}

	const padding = config.backgroundBoxPadding || 0;
	const boxX = minX - padding;
	const boxY = minY - padding;
	const boxWidth = maxX - minX + 2 * padding;
	const boxHeight = maxY - minY + 2 * padding;

	// Resize canvas to fit content
	canvas.width = Math.ceil(boxWidth + 10);
	canvas.height = Math.ceil(boxHeight + 10);
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	const offsetX = 5 - boxX;
	const offsetY = 5 - boxY;

	// Draw background box if specified
	if (config.backgroundBoxColor) {
		const bgColor = config.backgroundBoxColor;
		ctx.fillStyle = `rgba(${Math.round(bgColor.r * 255)}, ${Math.round(bgColor.g * 255)}, ${Math.round(bgColor.b * 255)}, ${bgColor.a})`;
		ctx.globalAlpha = bgColor.a;
		const radius = config.backgroundBoxRadius || 0;
		if (radius > 0) {
			roundRect(ctx, offsetX + boxX, offsetY + boxY, boxWidth, boxHeight, radius);
			ctx.fill();
		} else {
			ctx.fillRect(offsetX + boxX, offsetY + boxY, boxWidth, boxHeight);
		}
		ctx.globalAlpha = 1;
	}

	// Draw shadow if specified
	if (config.shadowColor && config.shadowBlur) {
		const shadowColor = config.shadowColor;
		ctx.shadowColor = `rgba(${Math.round(shadowColor.r * 255)}, ${Math.round(shadowColor.g * 255)}, ${Math.round(shadowColor.b * 255)}, ${shadowColor.a})`;
		ctx.shadowBlur = config.shadowBlur;
		ctx.shadowOffsetX = config.shadowOffsetX || 2;
		ctx.shadowOffsetY = config.shadowOffsetY || 2;

		// Draw shadow text
		ctx.font = fontString;
		const fillColor = config.fillColor;
		ctx.fillStyle = `rgba(${Math.round(fillColor.r * 255)}, ${Math.round(fillColor.g * 255)}, ${Math.round(fillColor.b * 255)}, ${fillColor.a})`;
		for (const line of layoutResult.lines) {
			ctx.fillText(line.text, offsetX + line.x, offsetY + line.y + fontSize);
		}

		ctx.shadowColor = 'transparent';
		ctx.shadowBlur = 0;
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 0;
	}

	// Draw stroke if specified
	if (config.strokeColor && config.strokeWidth && config.strokeWidth > 0) {
		const strokeColor = config.strokeColor;
		ctx.strokeStyle = `rgba(${Math.round(strokeColor.r * 255)}, ${Math.round(strokeColor.g * 255)}, ${Math.round(strokeColor.b * 255)}, ${strokeColor.a})`;
		ctx.lineWidth = config.strokeWidth;
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';

		ctx.font = fontString;
		for (const line of layoutResult.lines) {
			ctx.strokeText(line.text, offsetX + line.x, offsetY + line.y + fontSize);
		}
	}

	// Draw fill text
	const fillColor = config.fillColor;
	ctx.fillStyle = `rgba(${Math.round(fillColor.r * 255)}, ${Math.round(fillColor.g * 255)}, ${Math.round(fillColor.b * 255)}, ${fillColor.a})`;
	ctx.font = fontString;
	ctx.textBaseline = 'top';

	// Apply letter spacing if supported
	if ('letterSpacing' in ctx) {
		if (config.style.letterSpacing) {
			(ctx as any).letterSpacing = `${config.style.letterSpacing}px`;
		}
	}

	for (const line of layoutResult.lines) {
		ctx.fillText(line.text, offsetX + line.x, offsetY + line.y + fontSize);
	}

	return canvas;
}

/**
 * Helper to draw rounded rectangle.
 */
function roundRect(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
	const minDim = Math.min(w, h);
	r = Math.min(r, minDim / 2);

	if (typeof ctx.roundRect === 'function') {
		(ctx as any).roundRect(x, y, w, h, r);
	} else {
		// Fallback for older browsers
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.quadraticCurveTo(x + w, y, x + w, y + r);
		ctx.lineTo(x + w, y + h - r);
		ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
		ctx.lineTo(x + r, y + h);
		ctx.quadraticCurveTo(x, y + h, x, y + h - r);
		ctx.lineTo(x, y + r);
		ctx.quadraticCurveTo(x, y, x + r, y);
		ctx.closePath();
	}
}

/**
 * Generate a hash key for text rasterization caching.
 */
export function hashTextConfig(config: TextRasterConfig): string {
	const scale = Math.round((config.scale || 1) * 100);
	const styleKey = `${config.style.fontFamily}|${config.style.fontWeight}|${config.style.fontStyle}`;
	const colorKey = `${Math.round(config.fillColor.r * 255)},${Math.round(config.fillColor.g * 255)},${Math.round(config.fillColor.b * 255)},${Math.round(config.fillColor.a * 255)}`;
	return `${styleKey}|${config.fontSize}|${config.text}|${scale}|${colorKey}`;
}
