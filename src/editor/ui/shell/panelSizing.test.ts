import { describe, expect, it } from 'vitest';
import { clampPanelSize } from './panelSizing';

describe('clampPanelSize', () => {
	it('preserves values within the configured bounds', () => {
		expect(clampPanelSize(264, 200, 420)).toBe(264);
	});

	it('limits values below the minimum', () => {
		expect(clampPanelSize(180, 200, 420)).toBe(200);
	});

	it('limits values above the maximum', () => {
		expect(clampPanelSize(440, 200, 420)).toBe(420);
	});
});
