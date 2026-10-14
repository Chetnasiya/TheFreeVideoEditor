import { describe, expect, it } from 'vitest';
import {
	BUNDLED_FONTS,
	ensureFontLoaded,
	isFontLoaded,
	registerCustomFont,
	unregisterCustomFont,
	getCustomFonts,
	saveCustomFont,
	deleteCustomFont,
	type CustomFont
} from './fontLoader';

describe('fontLoader', () => {
	it('preserves bundled fonts list', () => {
		expect(BUNDLED_FONTS.length).toBeGreaterThanOrEqual(6);
		const families = BUNDLED_FONTS.map((f) => f.family);
		expect(families).toContain('Inter');
		expect(families).toContain('Montserrat');
		expect(families).toContain('Playfair Display');
		expect(families).toContain('Roboto Mono');
		expect(families).toContain('Caveat');
		expect(families).toContain('Bebas Neue');
	});

	it('returns true for common system fallback fonts synchronously', () => {
		expect(isFontLoaded('sans-serif')).toBe(true);
		expect(isFontLoaded('monospace')).toBe(true);
		expect(isFontLoaded('serif')).toBe(true);
		expect(isFontLoaded('system-ui')).toBe(true);
	});

	it('registers, queries, and unregisters custom fonts in memory', async () => {
		const mockFont: CustomFont = {
			family: 'TestCustomScript',
			displayName: 'Test Custom Script',
			fileName: 'test-script.ttf',
			data: new Uint8Array([0, 1, 2, 3]).buffer
		};

		const ok = await registerCustomFont(mockFont);
		expect(ok).toBe(true);
		expect(isFontLoaded('TestCustomScript')).toBe(true);

		const fonts = getCustomFonts();
		const found = fonts.find((f) => f.family === 'TestCustomScript');
		expect(found).toBeDefined();
		expect(found?.displayName).toBe('Test Custom Script');

		// ensureFontLoaded finds custom fonts
		const loaded = await ensureFontLoaded('TestCustomScript');
		expect(loaded).toBe(true);

		unregisterCustomFont('TestCustomScript');
		expect(isFontLoaded('TestCustomScript')).toBe(false);
		expect(getCustomFonts().find((f) => f.family === 'TestCustomScript')).toBeUndefined();
	});

	it('saves and deletes custom fonts through persistence API', async () => {
		const custom = await saveCustomFont({
			family: 'SavedCustomFont',
			displayName: 'Saved Custom Font',
			fileName: 'saved.woff2',
			data: new Uint8Array([10, 20, 30]).buffer
		});

		expect(custom.family).toBe('SavedCustomFont');
		expect(isFontLoaded('SavedCustomFont')).toBe(true);

		await deleteCustomFont('SavedCustomFont');
		expect(isFontLoaded('SavedCustomFont')).toBe(false);
	});
});
