import { layout, revealCount, getGraphemes, type MeasureFunction } from '../../../core/text/layout';
import type { TextStyle, TextBox } from '../../../core/types';

export interface TextColorRun {
	startIndex: number;
	endIndex: number;
	fillColor?: { r: number; g: number; b: number; a: number };
	strokeColor?: { r: number; g: number; b: number; a: number };
}

export interface TextRasterConfig {
	text: string;
	style: TextStyle;
	box?: TextBox;
	fontSize: number;
	fillColor: { r: number; g: number; b: number; a: number };
	strokeColor?: { r: number; g: number; b: number; a: number };
	strokeWidth?: number;
	letterSpacing?: number;
	lineHeight?: number;
	reveal?: number;
	revealUnit?: 'char' | 'word' | 'line';
	shadowColor?: { r: number; g: number; b: number; a: number };
	shadowBlur?: number;
	shadowOffsetX?: number;
	shadowOffsetY?: number;
	backgroundBoxColor?: { r: number; g: number; b: number; a: number };
	backgroundBoxPadding?: number;
	backgroundBoxRadius?: number;
	colorRuns?: TextColorRun[];
	scale?: number;
}

/**
 * Checks whether the current environment supports ctx.letterSpacing.
 */
let supportsCanvasLetterSpacing: boolean | null = null;
export function hasCanvasLetterSpacing(): boolean {
	if (supportsCanvasLetterSpacing !== null) return supportsCanvasLetterSpacing;
	if (typeof OffscreenCanvas !== 'undefined') {
		try {
			const c = new OffscreenCanvas(1, 1);
			const ctx = c.getContext('2d');
			supportsCanvasLetterSpacing = Boolean(ctx && 'letterSpacing' in ctx);
			return supportsCanvasLetterSpacing;
		} catch {
			// ignore
		}
	}
	if (typeof document !== 'undefined') {
		const c = document.createElement('canvas');
		const ctx = c.getContext('2d');
		supportsCanvasLetterSpacing = Boolean(ctx && 'letterSpacing' in ctx);
		return supportsCanvasLetterSpacing;
	}
	supportsCanvasLetterSpacing = false;
	return false;
}

export function getTextDimensions(
	text: string,
	style: TextStyle,
	box: TextBox | undefined,
	fontSize: number
): { width: number; height: number } {
	const fontFamily = style.fontFamily || 'sans-serif';
	const fontWeight = style.fontWeight || 'normal';
	const fontStyle = style.fontStyle || 'normal';
	const fontString = `${fontStyle} ${fontWeight} ${Math.round(fontSize)}px ${fontFamily}`;

	let measureCanvas: OffscreenCanvas | HTMLCanvasElement;
	if (typeof OffscreenCanvas !== 'undefined') {
		measureCanvas = new OffscreenCanvas(10, 10);
	} else if (typeof document !== 'undefined') {
		measureCanvas = document.createElement('canvas');
		measureCanvas.width = 10;
		measureCanvas.height = 10;
	} else {
		// Fallback
		return { width: 300, height: 100 };
	}
	const mCtx = measureCanvas.getContext('2d') as
		CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
	if (!mCtx) return { width: 300, height: 100 };
	mCtx.font = fontString;
	if ('letterSpacing' in mCtx) {
		try {
			(mCtx as unknown as { letterSpacing: string }).letterSpacing = '0px';
		} catch {
			// ignore
		}
	}

	const measure: MeasureFunction = (str: string) => {
		mCtx.font = fontString;
		return mCtx.measureText(str).width;
	};

	const res = layout(text, style, box, measure, fontSize);
	return { width: Math.max(10, res.boxWidth), height: Math.max(10, res.boxHeight) };
}

/**
 * Rasterize text to an OffscreenCanvas (or HTMLCanvasElement).
 * Draw order: background box -> shadow -> stroke (round joins, behind fill) -> fill.
 * Works in export Web Worker and on main thread.
 */
export function rasterizeText(
	config: TextRasterConfig,
	maxDim: number = 4096
): OffscreenCanvas | HTMLCanvasElement {
	const text = config.text ?? '';
	const style = config.style ?? { fontFamily: 'sans-serif' };
	const fontSize = Math.max(1, config.fontSize || 48);
	const scale = Math.min(2, Math.max(0.1, config.scale || 1));
	const effectiveFontSize = fontSize * scale;

	const fontFamily = style.fontFamily || 'sans-serif';
	const fontWeight = style.fontWeight || 'normal';
	const fontStyle = style.fontStyle || 'normal';
	const fontString = `${fontStyle} ${fontWeight} ${Math.round(effectiveFontSize)}px ${fontFamily}`;

	// Helper measurement canvas
	let measureCanvas: OffscreenCanvas | HTMLCanvasElement;
	if (typeof OffscreenCanvas !== 'undefined') {
		measureCanvas = new OffscreenCanvas(10, 10);
	} else {
		measureCanvas = document.createElement('canvas');
		measureCanvas.width = 10;
		measureCanvas.height = 10;
	}
	const mCtx = measureCanvas.getContext('2d') as
		CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	mCtx.font = fontString;
	if ('letterSpacing' in mCtx) {
		try {
			(mCtx as unknown as { letterSpacing: string }).letterSpacing = '0px';
		} catch {
			// ignore
		}
	}

	const measure: MeasureFunction = (str: string) => {
		mCtx.font = fontString;
		return mCtx.measureText(str).width;
	};

	const effectiveLineHeight = config.lineHeight ?? style.lineHeight ?? 1.2;
	const effectiveLetterSpacing = (config.letterSpacing ?? style.letterSpacing ?? 0) * scale;

	// 1. Layout full text to determine stable layout box dimensions
	const fullLayout = layout(
		text,
		{
			...style,
			lineHeight: effectiveLineHeight,
			letterSpacing: effectiveLetterSpacing
		},
		config.box
			? {
					...config.box,
					width: config.box.width !== undefined ? config.box.width * scale : undefined,
					height: config.box.height !== undefined ? config.box.height * scale : undefined,
					paddingX: (config.box.paddingX ?? 0) * scale,
					paddingY: (config.box.paddingY ?? 0) * scale
				}
			: undefined,
		measure,
		effectiveFontSize
	);

	const boxW = Math.min(maxDim, Math.max(2, fullLayout.boxWidth));
	const boxH = Math.min(maxDim, Math.max(2, fullLayout.boxHeight));

	let canvas: OffscreenCanvas | HTMLCanvasElement;
	if (typeof OffscreenCanvas !== 'undefined') {
		canvas = new OffscreenCanvas(boxW, boxH);
	} else {
		canvas = document.createElement('canvas');
		canvas.width = boxW;
		canvas.height = boxH;
	}

	const ctx = canvas.getContext('2d') as
		CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
	if (!ctx) throw new Error('Could not get 2D context for text rasterization.');

	ctx.clearRect(0, 0, boxW, boxH);

	// 2. Draw background box if configured
	if (config.backgroundBoxColor && config.backgroundBoxColor.a > 0) {
		const bg = config.backgroundBoxColor;
		ctx.fillStyle = `rgba(${Math.round(bg.r * 255)}, ${Math.round(bg.g * 255)}, ${Math.round(bg.b * 255)}, ${bg.a})`;
		const radius = (config.backgroundBoxRadius ?? 0) * scale;
		if (radius > 0 && typeof ctx.roundRect === 'function') {
			ctx.beginPath();
			ctx.roundRect(0, 0, boxW, boxH, radius);
			ctx.fill();
		} else {
			ctx.fillRect(0, 0, boxW, boxH);
		}
	}

	// 3. Compute revealed prefix if reveal < 1
	const revealProgress = config.reveal !== undefined ? Math.max(0, Math.min(1, config.reveal)) : 1;
	const visibleCharCount = revealCount(text, config.revealUnit ?? 'char', revealProgress);

	// Setup font styling
	ctx.font = fontString;
	ctx.textBaseline = 'top';

	const supportsSpacing = hasCanvasLetterSpacing();
	if (supportsSpacing && effectiveLetterSpacing !== 0) {
		try {
			(ctx as unknown as { letterSpacing: string }).letterSpacing = `${effectiveLetterSpacing}px`;
		} catch {
			// ignore
		}
	}

	const strokeWidth = (config.strokeWidth ?? 0) * scale;
	const strokeColor = config.strokeColor;
	const hasStroke = Boolean(strokeColor && strokeWidth > 0 && strokeColor.a > 0);

	const fillColor = config.fillColor ?? { r: 1, g: 1, b: 1, a: 1 };
	const fillStyleStr = `rgba(${Math.round(fillColor.r * 255)}, ${Math.round(fillColor.g * 255)}, ${Math.round(fillColor.b * 255)}, ${fillColor.a})`;

	const renderString = (str: string, x: number, y: number, isStroke: boolean) => {
		if (supportsSpacing || effectiveLetterSpacing === 0) {
			if (isStroke) {
				ctx.strokeText(str, x, y);
			} else {
				ctx.fillText(str, x, y);
			}
		} else {
			// Fallback for canvas contexts without ctx.letterSpacing support
			const graphemes = getGraphemes(str);
			let curX = x;
			for (const g of graphemes) {
				if (isStroke) {
					ctx.strokeText(g, curX, y);
				} else {
					ctx.fillText(g, curX, y);
				}
				curX += measure(g, fontString) + effectiveLetterSpacing;
			}
		}
	};

	// Walk lines and draw text characters up to visibleCharCount
	let charsDrawn = 0;

	for (const line of fullLayout.lines) {
		if (charsDrawn >= visibleCharCount) break;

		const lineChars = Array.from(line.text);
		const charsToTake = Math.min(lineChars.length, visibleCharCount - charsDrawn);
		const lineSubstring = lineChars.slice(0, charsToTake).join('');
		charsDrawn += lineChars.length;

		if (lineSubstring.length === 0) continue;

		// If color runs are specified (e.g. caption word highlighting), draw each word run individually
		if (config.colorRuns && config.colorRuns.length > 0 && line.words && line.words.length > 0) {
			for (const word of line.words) {
				if (word.lineStartIndex !== undefined && word.lineStartIndex >= charsToTake) continue;

				let wordText = word.text;
				if (word.lineEndIndex !== undefined && word.lineEndIndex > charsToTake) {
					const avail = Math.max(0, charsToTake - (word.lineStartIndex ?? 0));
					wordText = word.text.slice(0, avail);
				}
				if (!wordText) continue;

				const run = config.colorRuns.find(
					(r) => r.startIndex < word.endIndex && r.endIndex > word.startIndex
				);

				const curFill = run?.fillColor ?? fillColor;
				const curFillStr = `rgba(${Math.round(curFill.r * 255)}, ${Math.round(curFill.g * 255)}, ${Math.round(curFill.b * 255)}, ${curFill.a})`;
				const curStroke = run?.strokeColor ?? strokeColor;
				const curHasStroke = Boolean(curStroke && strokeWidth > 0 && curStroke.a > 0);

				const wordX = line.x + word.x;

				// Shadow
				if (
					config.shadowColor &&
					(config.shadowBlur || config.shadowOffsetX || config.shadowOffsetY)
				) {
					ctx.save();
					const sColor = config.shadowColor;
					ctx.shadowColor = `rgba(${Math.round(sColor.r * 255)}, ${Math.round(sColor.g * 255)}, ${Math.round(sColor.b * 255)}, ${sColor.a})`;
					ctx.shadowBlur = (config.shadowBlur ?? 4) * scale;
					ctx.shadowOffsetX = (config.shadowOffsetX ?? 2) * scale;
					ctx.shadowOffsetY = (config.shadowOffsetY ?? 2) * scale;
					ctx.fillStyle = curFillStr;
					renderString(wordText, wordX, line.y, false);
					ctx.restore();
				}

				// Stroke
				if (curHasStroke && curStroke) {
					ctx.save();
					ctx.strokeStyle = `rgba(${Math.round(curStroke.r * 255)}, ${Math.round(curStroke.g * 255)}, ${Math.round(curStroke.b * 255)}, ${curStroke.a})`;
					ctx.lineWidth = strokeWidth * 2;
					ctx.lineJoin = 'round';
					ctx.lineCap = 'round';
					renderString(wordText, wordX, line.y, true);
					ctx.restore();
				}

				// Fill
				ctx.fillStyle = curFillStr;
				renderString(wordText, wordX, line.y, false);
			}
			continue;
		}

		// 4. Shadow
		if (config.shadowColor && (config.shadowBlur || config.shadowOffsetX || config.shadowOffsetY)) {
			ctx.save();
			const sColor = config.shadowColor;
			ctx.shadowColor = `rgba(${Math.round(sColor.r * 255)}, ${Math.round(sColor.g * 255)}, ${Math.round(sColor.b * 255)}, ${sColor.a})`;
			ctx.shadowBlur = (config.shadowBlur ?? 4) * scale;
			ctx.shadowOffsetX = (config.shadowOffsetX ?? 2) * scale;
			ctx.shadowOffsetY = (config.shadowOffsetY ?? 2) * scale;
			ctx.fillStyle = fillStyleStr;
			renderString(lineSubstring, line.x, line.y, false);
			ctx.restore();
		}

		// 5. Stroke (behind fill)
		if (hasStroke && strokeColor) {
			ctx.save();
			ctx.strokeStyle = `rgba(${Math.round(strokeColor.r * 255)}, ${Math.round(strokeColor.g * 255)}, ${Math.round(strokeColor.b * 255)}, ${strokeColor.a})`;
			ctx.lineWidth = strokeWidth * 2; // doubled since half is covered by fill
			ctx.lineJoin = 'round';
			ctx.lineCap = 'round';
			renderString(lineSubstring, line.x, line.y, true);
			ctx.restore();
		}

		// 6. Fill
		ctx.fillStyle = fillStyleStr;
		renderString(lineSubstring, line.x, line.y, false);
	}

	return canvas;
}

/**
 * Creates a unique cache key for a rasterized text configuration.
 */
export function hashTextConfig(config: TextRasterConfig): string {
	const scale = Math.round((config.scale || 1) * 100);
	const text = config.text || '';
	const style = config.style;
	const effLetterSpacing = Math.round((config.letterSpacing ?? style.letterSpacing ?? 0) * 100);
	const effLineHeight = Math.round((config.lineHeight ?? style.lineHeight ?? 1.2) * 100);
	const styleKey = `${style.fontFamily}|${style.fontWeight || ''}|${style.fontStyle || ''}|${style.alignment || ''}|${effLetterSpacing}|${effLineHeight}`;
	const boxKey = config.box
		? `${config.box.width || 0}|${config.box.height || 0}|${config.box.autoSize !== false}|${config.box.verticalAnchor || ''}|${config.box.paddingX || 0}|${config.box.paddingY || 0}`
		: '';
	const col = config.fillColor;
	const colorKey = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${Math.round(col.a * 255)}`;
	const stroke = config.strokeColor
		? `${Math.round(config.strokeColor.r * 255)},${Math.round(config.strokeColor.g * 255)},${Math.round(config.strokeColor.b * 255)},${Math.round(config.strokeColor.a * 255)},${config.strokeWidth || 0}`
		: '0';
	const reveal = config.reveal !== undefined ? Math.round(config.reveal * 1000) : 1000;
	const revealUnit = config.revealUnit || 'char';
	const shadow = config.shadowColor
		? `${Math.round(config.shadowColor.r * 255)},${Math.round(config.shadowColor.g * 255)},${Math.round(config.shadowColor.b * 255)},${Math.round(config.shadowColor.a * 255)},${config.shadowBlur || 0},${config.shadowOffsetX || 0},${config.shadowOffsetY || 0}`
		: '0';
	const bg = config.backgroundBoxColor
		? `${Math.round(config.backgroundBoxColor.r * 255)},${Math.round(config.backgroundBoxColor.g * 255)},${Math.round(config.backgroundBoxColor.b * 255)},${Math.round(config.backgroundBoxColor.a * 255)},${config.backgroundBoxRadius || 0}`
		: '0';
	const runsKey = (config.colorRuns ?? [])
		.map(
			(r) =>
				`${r.startIndex}-${r.endIndex}:${r.fillColor ? `${Math.round(r.fillColor.r * 255)},${Math.round(r.fillColor.g * 255)},${Math.round(r.fillColor.b * 255)},${r.fillColor.a}` : ''}`
		)
		.join(';');
	return `${styleKey}#${boxKey}#${Math.round(config.fontSize)}#${scale}#${colorKey}#${stroke}#${reveal}#${revealUnit}#${shadow}#${bg}#${runsKey}#${text}`;
}
