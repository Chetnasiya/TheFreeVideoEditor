import { describe, expect, it } from 'vitest';
import { formatBalancedLines, segmentWords, type WordInput } from './segmentation';

describe('caption segmentation', () => {
	it('balances two lines evenly when text exceeds maxCharsPerLine', () => {
		const words: WordInput[] = [
			{ text: 'The', start: 0, end: 200_000 },
			{ text: 'quick', start: 200_000, end: 400_000 },
			{ text: 'brown', start: 400_000, end: 600_000 },
			{ text: 'fox', start: 600_000, end: 800_000 },
			{ text: 'jumps', start: 800_000, end: 1_000_000 },
			{ text: 'over', start: 1_000_000, end: 1_200_000 },
			{ text: 'the', start: 1_200_000, end: 1_400_000 },
			{ text: 'lazy', start: 1_400_000, end: 1_600_000 },
			{ text: 'dog.', start: 1_600_000, end: 1_800_000 }
		];

		const formatted = formatBalancedLines(words, 2, 25);
		const lines = formatted.split('\n');
		expect(lines).toHaveLength(2);
		expect(lines[0]!.length).toBeLessThanOrEqual(25);
		expect(lines[1]!.length).toBeLessThanOrEqual(25);
		// Difference in line length should be small (balanced)
		expect(Math.abs(lines[0]!.length - lines[1]!.length)).toBeLessThanOrEqual(10);
	});

	it('splits segments on sentence endings when minDuration is met', () => {
		const words: WordInput[] = [
			{ text: 'Hello', start: 0, end: 500_000 },
			{ text: 'there.', start: 500_000, end: 1_200_000 },
			{ text: 'How', start: 1_300_000, end: 1_800_000 },
			{ text: 'are', start: 1_800_000, end: 2_200_000 },
			{ text: 'you?', start: 2_200_000, end: 2_800_000 }
		];

		const segments = segmentWords(words, { minDurationUs: 1_000_000 });
		expect(segments).toHaveLength(2);
		expect(segments[0]!.text).toBe('Hello there.');
		expect(segments[0]!.start).toBe(0);
		expect(segments[0]!.end).toBe(1_200_000);
		expect(segments[1]!.text).toBe('How are you?');
		expect(segments[1]!.start).toBe(1_300_000);
		expect(segments[1]!.end).toBe(2_800_000);
	});

	it('splits segments on speech pause gaps', () => {
		const words: WordInput[] = [
			{ text: 'Speech', start: 0, end: 500_000 },
			{ text: 'phrase', start: 500_000, end: 1_000_000 },
			// 2s pause here
			{ text: 'after', start: 3_000_000, end: 3_500_000 },
			{ text: 'pause', start: 3_500_000, end: 4_000_000 }
		];

		const segments = segmentWords(words, { maxGapUs: 1_500_000 });
		expect(segments).toHaveLength(2);
		expect(segments[0]!.text).toBe('Speech phrase');
		expect(segments[1]!.text).toBe('after pause');
	});

	it('splits segments when maxDuration is exceeded', () => {
		const words: WordInput[] = [
			{ text: 'One', start: 0, end: 1_000_000 },
			{ text: 'Two', start: 1_000_000, end: 2_500_000 },
			{ text: 'Three', start: 2_500_000, end: 4_500_000 },
			{ text: 'Four', start: 4_500_000, end: 6_000_000 }
		];

		const segments = segmentWords(words, { maxDurationUs: 4_000_000 });
		expect(segments.length).toBeGreaterThanOrEqual(2);
		for (const seg of segments) {
			expect(seg.end - seg.start).toBeLessThanOrEqual(4_500_000);
		}
	});
});
