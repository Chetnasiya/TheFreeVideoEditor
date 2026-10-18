import { describe, expect, it } from 'vitest';
import { GRAPHIC_TEMPLATES } from '../text/graphicsTemplates';
import {
	convertAllGraphicTemplates,
	convertGraphicTemplateToMotionTemplate
} from './templateConverter';
import { serializeTemplate, deserializeTemplate } from './templateService';

describe('convertGraphicTemplateToMotionTemplate', () => {
	it('converts all 34 existing graphic templates to valid Motion Graphic Templates (.tfvetemplate)', () => {
		const convertedList = convertAllGraphicTemplates();
		expect(convertedList.length).toBe(34);

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

	it('converts card template with background shape track and synchronized keyframes', () => {
		const original = GRAPHIC_TEMPLATES.find((t) => t.id === 'trendy-typography-card')!;
		const mogrt = convertGraphicTemplateToMotionTemplate(original);

		expect(mogrt.name).toBe('Trendy Typography Card');
		expect(mogrt.category).toBe('Badges');
		expect(mogrt.tracks.length).toBe(2); // Shape track + Text track

		const shapeTrack = mogrt.tracks.find((t) => t.name === 'Background Frame');
		expect(shapeTrack).toBeDefined();
		const shapeClip = shapeTrack?.clips[0];
		expect(shapeClip?.source?.type).toBe('shape');

		const textTrack = mogrt.tracks.find((t) => t.name === 'Title Text');
		expect(textTrack).toBeDefined();
		const textClip = textTrack?.clips[0];
		expect(textClip?.source?.type).toBe('text');

		// Checks that keyframes exist on text clip
		expect(textClip?.properties?.scale).toBeDefined();

		// Published params contains title, font, text color, and shape color
		const paramNames = mogrt.publishedParams.map((p) => p.name);
		expect(paramNames).toContain('Title Text');
		expect(paramNames).toContain('Font Family');
		expect(paramNames).toContain('Text Color');
		expect(paramNames).toContain('Accent / Background Color');
	});

	it('converts broadcast news lower third with lower-third line', () => {
		const original = GRAPHIC_TEMPLATES.find((t) => t.id === 'broadcast-news-lower-third')!;
		const mogrt = convertGraphicTemplateToMotionTemplate(original);

		expect(mogrt.name).toBe('Broadcast News Lower Third');
		expect(mogrt.category).toBe('Lower Thirds');
		expect(mogrt.tracks.length).toBe(2);

		const textTrack = mogrt.tracks.find((t) => t.name === 'Title Text');
		const textClip = textTrack?.clips[0];
		expect(textClip?.properties?.position).toBeDefined();
	});

	it('emits all 34 .tfvetemplate files into public/templates/ directory and verifies validity', async () => {
		const fs = await import('fs');
		const path = await import('path');
		const outDir = path.resolve(process.cwd(), 'public/templates');
		if (!fs.existsSync(outDir)) {
			fs.mkdirSync(outDir, { recursive: true });
		}

		const templates = convertAllGraphicTemplates();
		for (const tpl of templates) {
			const json = serializeTemplate(tpl);
			const filePath = path.join(outDir, `${tpl.id}.tfvetemplate`);
			fs.writeFileSync(filePath, json, 'utf-8');

			expect(fs.existsSync(filePath)).toBe(true);
			const readBack = fs.readFileSync(filePath, 'utf-8');
			const parsed = deserializeTemplate(readBack);
			expect(parsed.id).toBe(tpl.id);
			expect(parsed.name).toBe(tpl.name);
		}

		const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.tfvetemplate'));
		expect(files.length).toBe(34);
	});
});

