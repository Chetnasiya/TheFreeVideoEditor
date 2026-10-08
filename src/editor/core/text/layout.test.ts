import { describe, it, expect } from 'vitest';
import { layout, revealCount } from './layout';

// Fake monospace measure function for testing
function fakeMonospaceMeasure(text: string, font: string): number {
	// Each character is 10 units wide in monospace
	return text.length * 10;
}

describe('Text Layout Engine', () => {
	describe('basic layout', () => {
		it('lays out single line text', () => {
			const result = layout('Hello World', { fontFamily: 'monospace' }, { width: 200 }, fakeMonospaceMeasure);
			expect(result.lines).toHaveLength(1);
			expect(result.lines[0]?.text).toBe('Hello World');
			expect(result.boxWidth).toBeGreaterThan(0);
			expect(result.boxHeight).toBeGreaterThan(0);
		});

		it('wraps text to fit box width', () => {
			const style = { fontFamily: 'monospace' };
			const box = { width: 100 }; // 10 characters max
			const result = layout('Hello World Test', style, box, fakeMonospaceMeasure);
			expect(result.lines.length).toBeGreaterThan(1);
		});

		it('handles explicit newlines', () => {
			const result = layout('Line 1\nLine 2\nLine 3', { fontFamily: 'monospace' }, { width: 300 }, fakeMonospaceMeasure);
			expect(result.lines).toHaveLength(3);
			expect(result.lines[0]?.text).toBe('Line 1');
			expect(result.lines[1]?.text).toBe('Line 2');
			expect(result.lines[2]?.text).toBe('Line 3');
		});

		it('respects alignment', () => {
			const text = 'Hi';
			const box = { width: 100 };

			const left = layout(text, { fontFamily: 'monospace', alignment: 'left' }, box, fakeMonospaceMeasure);
			const center = layout(text, { fontFamily: 'monospace', alignment: 'center' }, box, fakeMonospaceMeasure);
			const right = layout(text, { fontFamily: 'monospace', alignment: 'right' }, box, fakeMonospaceMeasure);

			expect(left.lines[0]?.x).toBeLessThan(center.lines[0]?.x);
			expect(center.lines[0]?.x).toBeLessThan(right.lines[0]?.x);
		});

		it('applies line height', () => {
			const result1 = layout('Line 1\nLine 2', { fontFamily: 'monospace', lineHeight: 1.0 }, { width: 200 }, fakeMonospaceMeasure);
			const result2 = layout('Line 1\nLine 2', { fontFamily: 'monospace', lineHeight: 2.0 }, { width: 200 }, fakeMonospaceMeasure);

			const spacing1 = result1.lines[1]!.y - result1.lines[0]!.y;
			const spacing2 = result2.lines[1]!.y - result2.lines[0]!.y;
			expect(spacing2).toBeGreaterThan(spacing1);
		});

		it('applies padding', () => {
			const result = layout('Test', { fontFamily: 'monospace' }, { width: 100, paddingX: 20, paddingY: 30 }, fakeMonospaceMeasure);
			expect(result.lines[0]?.x).toBeGreaterThanOrEqual(20);
			expect(result.lines[0]?.y).toBeGreaterThanOrEqual(30);
		});

		it('handles auto-size mode', () => {
			const fixedResult = layout('Hi', { fontFamily: 'monospace' }, { width: 200, height: 200, autoSize: false }, fakeMonospaceMeasure);
			const autoResult = layout('Hi', { fontFamily: 'monospace' }, { width: 200, autoSize: true }, fakeMonospaceMeasure);

			// Auto-size should constrain width to content (not expand beyond needed)
			expect(autoResult.boxWidth).toBeLessThanOrEqual(fixedResult.boxWidth);
			expect(autoResult.boxHeight).toBeLessThan(fixedResult.boxHeight);
		});

		it('applies vertical anchor', () => {
			const topResult = layout('Test', { fontFamily: 'monospace' }, { width: 100, height: 200, verticalAnchor: 'top' }, fakeMonospaceMeasure);
			const centerResult = layout('Test', { fontFamily: 'monospace' }, { width: 100, height: 200, verticalAnchor: 'center' }, fakeMonospaceMeasure);
			const bottomResult = layout('Test', { fontFamily: 'monospace' }, { width: 100, height: 200, verticalAnchor: 'bottom' }, fakeMonospaceMeasure);

			expect(topResult.lines[0]!.y).toBeLessThan(centerResult.lines[0]!.y);
			expect(centerResult.lines[0]!.y).toBeLessThan(bottomResult.lines[0]!.y);
		});
	});

	describe('reveal counting', () => {
		it('counts characters for reveal', () => {
			const text = 'Hello';
			const count0 = revealCount(text, 'char', 0);
			const count50 = revealCount(text, 'char', 0.5);
			const count100 = revealCount(text, 'char', 1);

			expect(count0).toBe(0);
			expect(count50).toBeGreaterThan(0);
			expect(count50).toBeLessThan(count100);
			expect(count100).toBe(5);
		});

		it('counts words for reveal', () => {
			const text = 'Hello World Test';
			const count0 = revealCount(text, 'word', 0);
			const count33 = revealCount(text, 'word', 0.33);
			const count100 = revealCount(text, 'word', 1);

			expect(count0).toBe(0);
			expect(count33).toBeGreaterThan(0);
			expect(count100).toBeGreaterThan(count33);
		});

		it('counts lines for reveal', () => {
			const text = 'Line 1\nLine 2\nLine 3';
			const count0 = revealCount(text, 'line', 0);
			const count50 = revealCount(text, 'line', 0.5);
			const count100 = revealCount(text, 'line', 1);

			expect(count0).toBe(0);
			expect(count50).toBeGreaterThan(0);
			expect(count100).toBeGreaterThan(count50);
		});
	});

	describe('edge cases', () => {
		it('handles empty text', () => {
			const result = layout('', { fontFamily: 'monospace' }, { width: 100 }, fakeMonospaceMeasure);
			expect(result.lines.length).toBeGreaterThanOrEqual(0);
			expect(result.boxHeight).toBeGreaterThanOrEqual(0);
		});

		it('handles very long words', () => {
			const longWord = 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz';
			const result = layout(longWord, { fontFamily: 'monospace' }, { width: 50 }, fakeMonospaceMeasure);
			expect(result.lines.length).toBeGreaterThan(1);
		});

		it('handles only whitespace', () => {
			const result = layout('   ', { fontFamily: 'monospace' }, { width: 100 }, fakeMonospaceMeasure);
			expect(result.lines.length).toBeGreaterThanOrEqual(1);
		});

		it('handles mixed newlines and text', () => {
			const result = layout('\n\nTest\n\n', { fontFamily: 'monospace' }, { width: 100 }, fakeMonospaceMeasure);
			expect(result.lines.length).toBeGreaterThanOrEqual(3);
		});
	});
});
