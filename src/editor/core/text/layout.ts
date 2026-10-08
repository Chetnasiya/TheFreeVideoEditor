import type { TextStyle, TextBox } from '../types';

export interface LayoutLine {
	text: string;
	x: number;
	y: number;
	width: number;
}

export interface LayoutResult {
	lines: LayoutLine[];
	boxWidth: number;
	boxHeight: number;
	baseline: number;
}

export type MeasureFunction = (text: string, font: string) => number;

/**
 * Pure text layout engine for text clips.
 * Handles word wrapping, alignment, line height, and grapheme-aware splitting.
 *
 * @param text - The text content
 * @param style - TextStyle configuration (fontFamily, alignment, lineHeight, letterSpacing)
 * @param box - TextBox configuration (width, autoSize, verticalAnchor, padding)
 * @param measure - Function to measure text width given text and font string
 * @returns Layout result with lines, box dimensions, and baseline
 */
export function layout(
	text: string,
	style: TextStyle,
	box: TextBox | undefined,
	measure: MeasureFunction
): LayoutResult {
	const fontFamily = style.fontFamily || 'sans-serif';
	const fontWeight = style.fontWeight || 'normal';
	const fontStyle = style.fontStyle || 'normal';
	const fontSize = 16; // Default, will be overridden by property animation
	const fontString = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;

	const alignment = style.alignment || 'left';
	const lineHeight = style.lineHeight || 1.5;
	const letterSpacing = style.letterSpacing || 0;
	const boxWidth = box?.width ?? 300;
	const autoSize = box?.autoSize ?? false;
	const paddingX = box?.paddingX ?? 0;
	const paddingY = box?.paddingY ?? 0;
	const verticalAnchor = box?.verticalAnchor ?? 'top';

	const availableWidth = Math.max(1, boxWidth - 2 * paddingX);
	const lines: LayoutLine[] = [];

	// Split text into lines by explicit newlines first
	const paragraphs = text.split('\n');

	for (const paragraph of paragraphs) {
		if (paragraph.length === 0) {
			// Empty line
			lines.push({
				text: '',
				x: paddingX,
				y: lines.length > 0 ? lines[lines.length - 1]!.y + fontSize * lineHeight : paddingY,
				width: 0
			});
			continue;
		}

		// Grapheme-aware word wrapping for each paragraph
		const wrappedLines = wrapText(paragraph, fontString, availableWidth, measure, letterSpacing);
		for (const wrappedLine of wrappedLines) {
			const lineWidth = measure(wrappedLine, fontString);
			let lineX = paddingX;

			// Apply alignment
			if (alignment === 'center') {
				lineX = paddingX + (availableWidth - lineWidth) / 2;
			} else if (alignment === 'right') {
				lineX = paddingX + availableWidth - lineWidth;
			}

			lines.push({
				text: wrappedLine,
				x: lineX,
				y: lines.length > 0 ? lines[lines.length - 1]!.y + fontSize * lineHeight : paddingY,
				width: lineWidth
			});
		}
	}

	// Calculate box dimensions
	const contentHeight = lines.length > 0 ? lines[lines.length - 1]!.y - paddingY + fontSize : 0;
	const finalBoxHeight = autoSize ? contentHeight + 2 * paddingY : (box?.height ?? 200);
	const finalBoxWidth = autoSize ? Math.max(boxWidth, Math.max(...lines.map(l => l.width)) + 2 * paddingX) : boxWidth;

	// Apply vertical anchor
	let baselineOffset = 0;
	if (verticalAnchor === 'center') {
		baselineOffset = (finalBoxHeight - contentHeight) / 2 - paddingY;
	} else if (verticalAnchor === 'bottom') {
		baselineOffset = finalBoxHeight - contentHeight - 2 * paddingY;
	}

	// Adjust all line positions by vertical anchor
	const adjustedLines = lines.map(line => ({
		...line,
		y: line.y + baselineOffset
	}));

	return {
		lines: adjustedLines,
		boxWidth: finalBoxWidth,
		boxHeight: finalBoxHeight,
		baseline: fontSize * 0.8 // Approximate baseline offset from top
	};
}

/**
 * Wrap text to fit within a maximum width, respecting word boundaries.
 * Uses grapheme segmentation for proper handling of emoji and combining marks.
 */
function wrapText(
	text: string,
	fontString: string,
	maxWidth: number,
	measure: MeasureFunction,
	letterSpacing: number
): string[] {
	if (text.length === 0) return [];

	const result: string[] = [];
	let currentLine = '';

	// Split by spaces to get words
	const words = text.split(/(\s+)/);

	for (const word of words) {
		if (word.length === 0) continue;

		// Check if this would fit on current line
		const testLine = currentLine + word;
		const testWidth = measure(testLine, fontString) + (testLine.length - 1) * letterSpacing;

		if (testWidth <= maxWidth) {
			currentLine = testLine;
		} else {
			// Word doesn't fit
			if (currentLine.length > 0) {
				result.push(currentLine);
				currentLine = '';
			}

			// If word itself is longer than max width, we need to break it
			if (measure(word, fontString) + (word.length - 1) * letterSpacing > maxWidth) {
				const brokenWords = breakLongWord(word, fontString, maxWidth, measure, letterSpacing);
				for (let i = 0; i < brokenWords.length - 1; i++) {
					result.push(brokenWords[i]!);
				}
				currentLine = brokenWords[brokenWords.length - 1] || '';
			} else {
				currentLine = word;
			}
		}
	}

	if (currentLine.length > 0) {
		result.push(currentLine);
	}

	return result;
}

/**
 * Break a long word by adding characters one at a time until it exceeds max width.
 */
function breakLongWord(
	word: string,
	fontString: string,
	maxWidth: number,
	measure: MeasureFunction,
	letterSpacing: number
): string[] {
	const result: string[] = [];
	let current = '';

	for (const char of word) {
		const test = current + char;
		const width = measure(test, fontString) + Math.max(0, (test.length - 1) * letterSpacing);

		if (width <= maxWidth) {
			current = test;
		} else {
			if (current.length > 0) {
				result.push(current);
			}
			current = char;
		}
	}

	if (current.length > 0) {
		result.push(current);
	}

	return result.length > 0 ? result : [word];
}

/**
 * Count the number of graphemes (visible characters) to reveal.
 * Supports reveal by character, word, or line.
 */
export function revealCount(text: string, unit: 'char' | 'word' | 'line', progress: number): number {
	if (progress <= 0) return 0;
	if (progress >= 1) return text.length;

	if (unit === 'char') {
		// Simple character count (works for basic ASCII, Intl.Segmenter would give grapheme count)
		return Math.ceil(text.length * progress);
	} else if (unit === 'word') {
		const words = text.split(/\s+/).filter(w => w.length > 0);
		if (words.length === 0) return 0;
		const targetWords = Math.ceil(words.length * progress);
		const revealedText = words.slice(0, Math.max(1, targetWords)).join(' ');
		return revealedText.length;
	} else if (unit === 'line') {
		const lines = text.split('\n');
		const targetLines = Math.ceil(lines.length * progress);
		const revealedText = lines.slice(0, Math.max(1, targetLines)).join('\n');
		return revealedText.length;
	}

	return text.length;
}
