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

	it('emits .tfvetemplate files into public/templates/ directory and verifies validity', async () => {
		const fs = await import('fs');
		const path = await import('path');
		const outDir = path.resolve(process.cwd(), 'public/templates');
		if (!fs.existsSync(outDir)) {
			fs.mkdirSync(outDir, { recursive: true });
		}

		const templates = convertAllGraphicTemplates();
		for (const tpl of templates) {
			const filePath = path.join(outDir, `${tpl.id}.tfvetemplate`);
			if (fs.existsSync(filePath)) {
				try {
					const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
					if (existing.createdAt) {
						tpl.createdAt = existing.createdAt;
					}
				} catch {
					// ignore
				}
			}
			const json = serializeTemplate(tpl);
			fs.writeFileSync(filePath, json, 'utf-8');

			expect(fs.existsSync(filePath)).toBe(true);
			const readBack = fs.readFileSync(filePath, 'utf-8');
			const parsed = deserializeTemplate(readBack);
			expect(parsed.id).toBe(tpl.id);
			expect(parsed.name).toBe(tpl.name);
		}

		const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.tfvetemplate'));
		expect(files.length).toBe(13);
	});
});

