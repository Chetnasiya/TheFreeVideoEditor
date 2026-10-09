import type { CaptionSegment, CaptionWord, Time } from '../types';
import { generateCaptionSegmentId } from './operations';

export interface WordInput {
	text: string;
	start: Time;
	end: Time;
	confidence?: number;
}

export interface SegmentationOptions {
	maxLines?: number;
	maxCharsPerLine?: number;
	minDurationUs?: Time;
	maxDurationUs?: Time;
	maxGapUs?: Time;
}

const DEFAULT_OPTIONS: Required<SegmentationOptions> = {
	maxLines: 2,
	maxCharsPerLine: 42,
	minDurationUs: 1_000_000, // 1s
	maxDurationUs: 5_000_000, // 5s
	maxGapUs: 1_500_000 // 1.5s
};

/**
 * Splits words into balanced lines up to maxLines, respecting maxCharsPerLine.
 */
export function formatBalancedLines(
	words: readonly WordInput[],
	maxLines: number = 2,
	maxCharsPerLine: number = 42
): string {
	if (words.length === 0) return '';
	const rawTexts = words.map((w) => w.text.trim());
	const singleLine = rawTexts.join(' ');

	if (maxLines <= 1 || singleLine.length <= maxCharsPerLine) {
		return singleLine;
	}

	if (maxLines === 2) {
		// Find best split point that balances line lengths without exceeding maxCharsPerLine
		let bestSplitIdx = 1;
		let minScore = Infinity;

		for (let i = 1; i < rawTexts.length; i++) {
			const line1 = rawTexts.slice(0, i).join(' ');
			const line2 = rawTexts.slice(i).join(' ');

			const len1 = line1.length;
			const len2 = line2.length;

			// Penalize exceeding maxCharsPerLine heavily
			let penalty = 0;
			if (len1 > maxCharsPerLine) penalty += (len1 - maxCharsPerLine) * 100;
			if (len2 > maxCharsPerLine) penalty += (len2 - maxCharsPerLine) * 100;

			// Prefer balanced line lengths
			const diff = Math.abs(len1 - len2);
			const score = diff + penalty;

			if (score < minScore) {
				minScore = score;
				bestSplitIdx = i;
			}
		}

		const l1 = rawTexts.slice(0, bestSplitIdx).join(' ');
		const l2 = rawTexts.slice(bestSplitIdx).join(' ');
		return `${l1}\n${l2}`;
	}

	// For maxLines > 2, greedily wrap words
	const lines: string[] = [];
	let currentLine = '';

	for (const word of rawTexts) {
		if (!currentLine) {
			currentLine = word;
		} else if (`${currentLine} ${word}`.length <= maxCharsPerLine) {
			currentLine += ` ${word}`;
		} else {
			lines.push(currentLine);
			currentLine = word;
		}
	}
	if (currentLine) lines.push(currentLine);

	return lines.slice(0, maxLines).join('\n');
}

/**
 * Converts a sequence of timestamped words into punctuated, balanced, line-wrapped CaptionSegments.
 */
export function segmentWords(
	words: readonly WordInput[],
	options: SegmentationOptions = {}
): CaptionSegment[] {
	if (!words || words.length === 0) return [];

	const opts: Required<SegmentationOptions> = {
		maxLines: options.maxLines ?? DEFAULT_OPTIONS.maxLines,
		maxCharsPerLine: options.maxCharsPerLine ?? DEFAULT_OPTIONS.maxCharsPerLine,
		minDurationUs: options.minDurationUs ?? DEFAULT_OPTIONS.minDurationUs,
		maxDurationUs: options.maxDurationUs ?? DEFAULT_OPTIONS.maxDurationUs,
		maxGapUs: options.maxGapUs ?? DEFAULT_OPTIONS.maxGapUs
	};

	const sortedWords = [...words]
		.filter((w) => w.text.trim().length > 0 && w.end > w.start)
		.sort((a, b) => a.start - b.start);

	if (sortedWords.length === 0) return [];

	const segments: CaptionSegment[] = [];
	let currentGroup: WordInput[] = [];

	const finishCurrentGroup = () => {
		if (currentGroup.length === 0) return;

		const start = currentGroup[0]!.start;
		const end = currentGroup[currentGroup.length - 1]!.end;
		const text = formatBalancedLines(currentGroup, opts.maxLines, opts.maxCharsPerLine);

		const captionWords: CaptionWord[] = currentGroup.map((w) => ({
			text: w.text,
			start: w.start,
			end: w.end,
			confidence: w.confidence
		}));

		segments.push({
			id: generateCaptionSegmentId(),
			start,
			end,
			text,
			words: captionWords
		});

		currentGroup = [];
	};

	for (let i = 0; i < sortedWords.length; i++) {
		const word = sortedWords[i]!;

		if (currentGroup.length === 0) {
			currentGroup.push(word);
			continue;
		}

		const prevWord = currentGroup[currentGroup.length - 1]!;
		const groupStart = currentGroup[0]!.start;
		const projectedDuration = word.end - groupStart;
		const gap = word.start - prevWord.end;

		const hasSentencePunctuation = /[.?!]$/.test(prevWord.text.trim());
		const currentText = currentGroup.map((w) => w.text).join(' ');
		const projectedText = `${currentText} ${word.text}`;

		// Condition 1: Large pause between words
		if (gap >= opts.maxGapUs) {
			finishCurrentGroup();
			currentGroup.push(word);
			continue;
		}

		// Condition 2: Max duration exceeded
		if (projectedDuration > opts.maxDurationUs) {
			finishCurrentGroup();
			currentGroup.push(word);
			continue;
		}

		// Condition 3: Sentence ending reached with sufficient duration
		if (hasSentencePunctuation && prevWord.end - groupStart >= opts.minDurationUs) {
			finishCurrentGroup();
			currentGroup.push(word);
			continue;
		}

		// Condition 4: Max character limit for segment exceeded
		const maxTotalChars = opts.maxLines * opts.maxCharsPerLine;
		if (projectedText.length > maxTotalChars && currentGroup.length >= 2) {
			finishCurrentGroup();
			currentGroup.push(word);
			continue;
		}

		currentGroup.push(word);
	}

	finishCurrentGroup();
	return segments;
}
