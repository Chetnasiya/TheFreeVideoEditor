import { describe, expect, it } from 'vitest';
import { layout, revealCount, getGraphemes, type MeasureFunction } from './layout';

// Monospace measurement: 10px per character
const monoMeasure: MeasureFunction = (text: string) => text.length * 10;

describe('text layout engine', () => {
	it('handles explicit newlines and line positioning', () => {
		const res = layout('Hello\nWorld', { fontFamily: 'monospace' }, undefined, monoMeasure, 20);
		expect(res.lines.length).toBe(2);
		expect(res.lines[0]?.text).toBe('Hello');
		expect(res.lines[1]?.text).toBe('World');
		expect(res.lines[0]?.width).toBe(50);
		expect(res.lines[1]?.width).toBe(50);
		expect(res.lines[1]?.y).toBeGreaterThan(res.lines[0]?.y ?? 0);
	});

	it('computes alignment (left, center, right)', () => {
		const box = { width: 200, autoSize: false };
		const left = layout('Hi', { fontFamily: 'mono', alignment: 'left' }, box, monoMeasure, 20);
		expect(left.lines[0]?.x).toBe(0);

		const center = layout('Hi', { fontFamily: 'mono', alignment: 'center' }, box, monoMeasure, 20);
		// width 200, text 20 -> (200 - 20) / 2 = 90
		expect(center.lines[0]?.x).toBe(90);

		const right = layout('Hi', { fontFamily: 'mono', alignment: 'right' }, box, monoMeasure, 20);
		// width 200, text 20 -> 200 - 20 = 180
		expect(right.lines[0]?.x).toBe(180);
	});

	it('wraps words to a fixed box width', () => {
		// Box width 60 -> max 6 chars at 10px each, so 'quick', 'brown', 'fox' wrap to 3 lines
		const box = { width: 60, autoSize: false };
		const res = layout('quick brown fox', { fontFamily: 'mono' }, box, monoMeasure, 20);
		expect(res.lines.length).toBe(3);
		expect(res.lines[0]?.text).toBe('quick');
		expect(res.lines[1]?.text).toBe('brown');
		expect(res.lines[2]?.text).toBe('fox');
	});

	it('auto-sizes box to fit content', () => {
		const res = layout(
			'Short\nMuch longer text line here',
			{ fontFamily: 'mono' },
			undefined,
			monoMeasure,
			20
		);
		// Longest line is 26 chars = 260px
		expect(res.boxWidth).toBe(260);
		expect(res.boxHeight).toBeGreaterThan(20);
	});

	it('computes reveal count for char, word, line', () => {
		const text = 'One two three\nFour five';
		expect(revealCount(text, 'char', 0)).toBe(0);
		expect(revealCount(text, 'char', 1)).toBe(text.length);
		expect(revealCount(text, 'word', 0.5)).toBeGreaterThan(0);
		expect(revealCount(text, 'line', 0.5)).toBe('One two three'.length);
		expect(revealCount(text, 'line', 1)).toBe(text.length);
	});

	it('handles graphemes for emojis and combining marks', () => {
		const emojiText = '👋🏼 Hello 🚀';
		const graphemes = getGraphemes(emojiText);
		expect(graphemes.length).toBeLessThan(emojiText.length);
	});
});
