import { describe, expect, it } from 'vitest';
import { GRAPHIC_TEMPLATES } from '../text/graphicsTemplates';
import {
	convertAllGraphicTemplates,
	convertGraphicTemplateToMotionTemplate
} from './templateConverter';
import { serializeTemplate, deserializeTemplate } from './templateService';

describe('convertGraphicTemplateToMotionTemplate', () => {
	it('converts all existing graphic templates to valid Motion Graphic Templates (.tfvetemplate)', () => {
		const convertedList = convertAllGraphicTemplates();
		expect(convertedList.length).toBe(13);

		for (const tpl of convertedList) {
			expect(tpl.version).toBe(1);
			expect(tpl.id).toBeTruthy();
			expect(tpl.name).toBeTruthy();
			expect(tpl.tracks.length).toBeGreaterThanOrEqual(1);
			expect(tpl.duration).toBeGreaterThan(0);
			expect(tpl.publishedParams.length).toBeGreaterThanOrEqual(2);
			expect(tpl.bounds).toBeDefined();
			expect(tpl.bounds?.width).toBeGreaterThan(0);
			expect(tpl.bounds?.height).toBeGreaterThan(0);
			expect(tpl.responsiveTiming?.introDuration).toBeGreaterThan(0);
			expect(tpl.responsiveTiming?.outroDuration).toBeGreaterThan(0);

			// Test round-trip serialization to .tfvetemplate format
			const json = serializeTemplate(tpl);
			const deserialized = deserializeTemplate(json);
			expect(deserialized.id).toBe(tpl.id);
			expect(deserialized.name).toBe(tpl.name);
			expect(deserialized.category).toBe(tpl.category);
			expect(deserialized.tracks.length).toBe(tpl.tracks.length);
		}
	});

	it('converts mixkit-minimal-wipe-lower-third with multi-track layout and published parameters', () => {
		const original = GRAPHIC_TEMPLATES.find((t) => t.id === 'mixkit-minimal-wipe-lower-third')!;
		expect(original).toBeDefined();
		const mogrt = convertGraphicTemplateToMotionTemplate(original);

		expect(mogrt.id).toBe('mixkit-minimal-wipe-lower-third');
		expect(mogrt.name).toBe('Clean Minimal Wipe Lower Third');
		expect(mogrt.category).toBe('Lower Thirds');
		expect(mogrt.tracks.length).toBe(4); // Accent lead bar, Title, Wipe block, Subtitle
		expect(mogrt.duration).toBe(5_900_000);
		expect(mogrt.responsiveTiming?.introDuration).toBe(1_400_000);
		expect(mogrt.responsiveTiming?.outroDuration).toBe(1_200_000);

		const accentTrack = mogrt.tracks.find((t) => t.name === 'Accent Lead Bar');
		expect(accentTrack).toBeDefined();
		expect(accentTrack?.clips[0].source?.type).toBe('shape');

		const titleTrack = mogrt.tracks.find((t) => t.name === 'Title Text');
		expect(titleTrack).toBeDefined();
		expect(titleTrack?.clips[0].source?.type).toBe('text');

		const wipeTrack = mogrt.tracks.find((t) => t.name === 'Wipe Block');
		expect(wipeTrack).toBeDefined();
		expect(wipeTrack?.clips[0].source?.type).toBe('shape');

		const subtitleTrack = mogrt.tracks.find((t) => t.name === 'Subtitle Text');
		expect(subtitleTrack).toBeDefined();
		expect(subtitleTrack?.clips[0].source?.type).toBe('text');

		const paramIds = mogrt.publishedParams.map((p) => p.id);
		expect(paramIds).toContain('param_title_text');
		expect(paramIds).toContain('param_subtitle_text');
		expect(paramIds).toContain('param_accent_color');
		expect(paramIds).toContain('param_wipe_color');
	});

	it('matches the shipped .tfvetemplate files (run `npm run templates:generate` if not)', async () => {
		const fs = await import('fs');
		const path = await import('path');
		const dir = path.resolve(process.cwd(), 'public/templates');
		const templates = convertAllGraphicTemplates();
		for (const tpl of templates) {
			const file = path.join(dir, `${tpl.id}.tfvetemplate`);
			expect(fs.existsSync(file), `${tpl.id}.tfvetemplate is missing`).toBe(true);
			const shipped = deserializeTemplate(fs.readFileSync(file, 'utf-8'));
			// createdAt is the moment of generation, not part of the design.
			expect({ ...shipped, createdAt: 0 }, tpl.id).toEqual({ ...tpl, createdAt: 0 });
		}
		const files = fs
			.readdirSync(dir)
			.filter((f) => f.endsWith('.tfvetemplate') && f !== 'example.tfvetemplate');
		expect(files.length).toBe(templates.length);
	});
});

