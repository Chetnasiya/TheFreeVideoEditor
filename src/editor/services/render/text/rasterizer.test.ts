import { describe, expect, it } from 'vitest';
import { hashTextConfig, type TextRasterConfig } from './rasterizer';

describe('hashTextConfig', () => {
	const baseConfig: TextRasterConfig = {
		text: 'Hello World',
		style: { fontFamily: 'sans-serif' },
		fontSize: 48,
		fillColor: { r: 1, g: 1, b: 1, a: 1 }
	};

	it('produces identical keys for identical configurations', () => {
		const key1 = hashTextConfig(baseConfig);
		const key2 = hashTextConfig({ ...baseConfig });
		expect(key1).toBe(key2);
	});

	it('changes hash when letterSpacing changes', () => {
		const key1 = hashTextConfig({ ...baseConfig, letterSpacing: 0 });
		const key2 = hashTextConfig({ ...baseConfig, letterSpacing: 5 });
		expect(key1).not.toBe(key2);
	});

	it('changes hash when lineHeight changes', () => {
		const key1 = hashTextConfig({ ...baseConfig, lineHeight: 1.2 });
		const key2 = hashTextConfig({ ...baseConfig, lineHeight: 1.8 });
		expect(key1).not.toBe(key2);
	});

	it('changes hash when fontSize or color changes', () => {
		const key1 = hashTextConfig({ ...baseConfig, fontSize: 48 });
		const key2 = hashTextConfig({ ...baseConfig, fontSize: 64 });
		expect(key1).not.toBe(key2);

		const key3 = hashTextConfig({
			...baseConfig,
			fillColor: { r: 1, g: 0, b: 0, a: 1 }
		});
		expect(key1).not.toBe(key3);
	});

	it('changes hash when colorRuns change', () => {
		const key1 = hashTextConfig(baseConfig);
		const key2 = hashTextConfig({
			...baseConfig,
			colorRuns: [
				{
					startIndex: 0,
					endIndex: 5,
					fillColor: { r: 1, g: 1, b: 0, a: 1 }
				}
			]
		});
		expect(key1).not.toBe(key2);
	});
});
