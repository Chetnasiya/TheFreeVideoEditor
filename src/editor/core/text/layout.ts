import type { TextStyle, TextBox } from '../types';

export interface LayoutWordRun {
	text: string;
	x: number;
	width: number;
	startIndex: number;
	endIndex: number;
	lineStartIndex?: number;
	lineEndIndex?: number;
}

export interface LayoutLine {
	text: string;
	x: number;
	y: number;
	width: number;
	startIndex?: number;
	endIndex?: number;
	words?: LayoutWordRun[];
}

export interface LayoutResult {
	lines: LayoutLine[];
	boxWidth: number;
	boxHeight: number;
	baseline: number;
}

export type MeasureFunction = (text: string, font: string) => number;

/**
 * Split text into graphemes using Intl.Segmenter if available, or fallback to Array.from.
 */
export function getGraphemes(text: string): string[] {
	interface SegmenterConstructor {
		new (
			locales?: string | string[],
			options?: { granularity?: string }
		): {
			segment(input: string): Iterable<{ segment: string }>;
		};
	}
	const intlAny = Intl as unknown as { Segmenter?: SegmenterConstructor };
	if (typeof intlAny.Segmenter !== 'undefined') {
		const segmenter = new intlAny.Segmenter(undefined, { granularity: 'grapheme' });
		const segments = segmenter.segment(text);
		const result: string[] = [];
		for (const segment of segments) {
			result.push(segment.segment);
		}
		return result;
	}
	return Array.from(text);
}

/**
 * Count the revealed character count based on revealUnit: 'char' | 'word' | 'line'.
 * Always counted on graphemes so emojis and combining marks are preserved.
 */
export function revealCount(
	text: string,
	unit: 'char' | 'word' | 'line',
	progress: number
): number {
	if (progress <= 0) return 0;
	if (progress >= 1) return text.length;

	if (unit === 'line') {
		const lines = text.split('\n');
		const totalLines = lines.length;
		if (totalLines <= 1) {
			const graphemes = getGraphemes(text);
			return Math.round(graphemes.length * progress);
		}
		const revealedLineCount = Math.max(1, Math.ceil(totalLines * progress));
		const visibleLines = lines.slice(0, revealedLineCount);
		return visibleLines.join('\n').length;
	}

	if (unit === 'word') {
		// Split by word boundaries
		const wordsWithDelims = text.split(/(\s+)/);
		const wordsOnly = wordsWithDelims.filter((w) => w.trim().length > 0);
		if (wordsOnly.length === 0) return text.length;
		const targetWords = Math.max(1, Math.ceil(wordsOnly.length * progress));
		let wordsSeen = 0;
		let charCount = 0;
		for (const part of wordsWithDelims) {
			if (part.trim().length > 0) {
				wordsSeen++;
			}
			charCount += part.length;
			if (wordsSeen >= targetWords) break;
		}
		return charCount;
	}

	// Default: 'char'
	const graphemes = getGraphemes(text);
	const targetCount = Math.round(graphemes.length * progress);
	return graphemes.slice(0, targetCount).join('').length;
}

/**
 * Pure text layout engine.
 * Takes (text, style, box, measure), where measure(text, font) -> width is injected.
 * Returns lines [{ text, x, y, width }], box dimensions, and baseline.
 */
export function layout(
	text: string,
	style: TextStyle,
	box: TextBox | undefined,
	measure: MeasureFunction,
	fontSize: number = 48
): LayoutResult {
	const fontFamily = style.fontFamily || 'sans-serif';
	const fontWeight = style.fontWeight || 'normal';
	const fontStyle = style.fontStyle || 'normal';
	const fontString = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;

	const alignment = style.alignment || 'center';
	const lineHeightMultiplier = style.lineHeight ?? 1.2;
	const lineStep = fontSize * lineHeightMultiplier;
	const letterSpacing = style.letterSpacing ?? 0;
	const paddingX = box?.paddingX ?? 0;
	const paddingY = box?.paddingY ?? 0;
	const autoSize = box?.autoSize ?? true;
	const verticalAnchor = box?.verticalAnchor ?? 'center';

	const fixedWidth = box?.width;
	const maxWidth =
		fixedWidth !== undefined && !autoSize ? Math.max(1, fixedWidth - 2 * paddingX) : Infinity;

	const measureWithSpacing = (str: string): number => {
		if (str.length === 0) return 0;
		const raw = measure(str, fontString);
		const graphemes = getGraphemes(str);
		const extra = (graphemes.length - 1) * letterSpacing;
		return Math.max(0, raw + extra);
	};

	const paragraphs = text.split('\n');
	const rawLines: string[] = [];

	for (const para of paragraphs) {
		if (para.length === 0) {
			rawLines.push('');
			continue;
		}

		if (maxWidth === Infinity) {
			rawLines.push(para);
			continue;
		}

		// Wrap words within maxWidth
		const words = para.split(/(\s+)/);
		let currentLine = '';

		for (const token of words) {
			if (token.length === 0) continue;
			const testLine = currentLine + token;
			const testWidth = measureWithSpacing(testLine);

			if (testWidth <= maxWidth) {
				currentLine = testLine;
			} else {
				if (currentLine.length > 0) {
					rawLines.push(currentLine.trimEnd());
					currentLine = '';
				}

				// If single word exceeds maxWidth, break by grapheme
				const tokenWidth = measureWithSpacing(token);
				if (tokenWidth > maxWidth) {
					const graphemes = getGraphemes(token);
					let segment = '';
					for (const g of graphemes) {
						if (measureWithSpacing(segment + g) <= maxWidth) {
							segment += g;
						} else {
							if (segment.length > 0) rawLines.push(segment);
							segment = g;
						}
					}
					currentLine = segment;
				} else {
					// Word fits on next line
					currentLine = token.trimStart();
				}
			}
		}

		if (currentLine.length > 0) {
			rawLines.push(currentLine.trimEnd());
		}
	}

	const measuredLines: { text: string; width: number }[] = rawLines.map((l) => ({
		text: l,
		width: measureWithSpacing(l)
	}));

	const maxLineWidth =
		measuredLines.length > 0 ? Math.max(...measuredLines.map((l) => l.width)) : 0;
	const contentWidth = Math.max(1, maxLineWidth);
	const contentHeight = Math.max(
		1,
		measuredLines.length > 0 ? (measuredLines.length - 1) * lineStep + fontSize : fontSize
	);

	const finalBoxWidth =
		autoSize || fixedWidth === undefined ? contentWidth + 2 * paddingX : fixedWidth;

	const finalBoxHeight =
		box?.height !== undefined && !autoSize ? box.height : contentHeight + 2 * paddingY;

	const usableWidth = Math.max(1, finalBoxWidth - 2 * paddingX);
	const usableHeight = Math.max(1, finalBoxHeight - 2 * paddingY);

	// Compute vertical offset based on verticalAnchor
	let startY = paddingY;
	if (verticalAnchor === 'center') {
		startY = paddingY + (usableHeight - contentHeight) / 2;
	} else if (verticalAnchor === 'bottom') {
		startY = paddingY + (usableHeight - contentHeight);
	}

	const lines: LayoutLine[] = [];
	let currentTextOffset = 0;

	for (let i = 0; i < measuredLines.length; i++) {
		const item = measuredLines[i]!;
		let lineX = paddingX;
		if (alignment === 'center') {
			lineX = paddingX + (usableWidth - item.width) / 2;
		} else if (alignment === 'right') {
			lineX = paddingX + (usableWidth - item.width);
		}
		const lineY = startY + i * lineStep;

		// Track line position within original text
		const lineTextIdx = text.indexOf(item.text, currentTextOffset);
		const lineStart = lineTextIdx !== -1 ? lineTextIdx : currentTextOffset;
		currentTextOffset = lineStart + item.text.length;

		// Compute word runs on this line
		const words: LayoutWordRun[] = [];
		const lineTokens = item.text.split(/(\s+)/);
		let charOffsetInLine = 0;

		for (const token of lineTokens) {
			if (token.length > 0) {
				if (token.trim().length > 0) {
					const wordX = measureWithSpacing(item.text.slice(0, charOffsetInLine));
					const wordW = measureWithSpacing(token);
					words.push({
						text: token,
						x: wordX,
						width: wordW,
						startIndex: lineStart + charOffsetInLine,
						endIndex: lineStart + charOffsetInLine + token.length,
						lineStartIndex: charOffsetInLine,
						lineEndIndex: charOffsetInLine + token.length
					});
				}
				charOffsetInLine += token.length;
			}
		}

		lines.push({
			text: item.text,
			x: lineX,
			y: lineY,
			width: item.width,
			startIndex: lineStart,
			endIndex: lineStart + item.text.length,
			words
		});
	}

	return {
		lines,
		boxWidth: Math.ceil(finalBoxWidth),
		boxHeight: Math.ceil(finalBoxHeight),
		baseline: fontSize * 0.8
	};
}
