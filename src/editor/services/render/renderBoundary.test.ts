import { describe, expect, it } from 'vitest';
import { selectRenderer } from './frameRenderer';

const modules = import.meta.glob<string>(['./*.ts', '!./*.test.ts'], {
	query: '?raw',
	import: 'default',
	eager: true
});
const sources = Object.entries(modules).map(([path, text]) => ({
	name: path.replace('./', ''),
	text
}));

describe('render module boundary', () => {
	it('uses no window or unguarded document access, so it can run in the export worker', () => {
		for (const { name, text } of sources) {
			expect(text, name).not.toMatch(/\bwindow\./);
			const documentUses = text.match(/\bdocument\./g)?.length ?? 0;
			if (documentUses > 0) {
				expect(name).toBe('RenderContext.ts');
				expect(text).toContain("typeof document !== 'undefined'");
			}
		}
	});

	it('never reads pixels back on the hot path', () => {
		for (const { name, text } of sources) {
			expect(text, name).not.toMatch(/readPixels|getImageData/);
		}
	});

	it('keeps shader sources in files', () => {
		const text = sources.find((item) => item.name === 'RenderContext.ts')!.text;
		expect(text).toContain("'./shaders/layer.vert.glsl?raw'");
		expect(text).toContain("'./shaders/layer.frag.glsl?raw'");
	});
});

describe('selectRenderer', () => {
	it('honours the canvas2d override and falls back when WebGL2 is unavailable', () => {
		expect(selectRenderer(null, '?renderer=canvas2d')).toBe('canvas2d');
		expect(selectRenderer(null, '?renderer=webgl2')).toBe('canvas2d');
		expect(selectRenderer(null, '')).toBe('canvas2d');
	});
});
