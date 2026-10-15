import { describe, expect, it } from 'vitest';
import {
	GRAPHIC_TEMPLATES,
	GRAPHIC_ANIMATION_PRESETS,
	getGraphicTemplate,
	createGraphicClip,
	applyGraphicTemplateToClip,
	computeColorRuns
} from './graphicsTemplates';
import { evaluate } from '../animation';
import { createEditorStore } from '../../state/store';
import { createEmptyProject } from '../factory';

describe('Graphic Motion Templates & Kinetic Typography', () => {
	it('defines 16 curated graphic templates with valid metadata and colors', () => {
		expect(GRAPHIC_TEMPLATES.length).toBe(16);

		const categories = new Set(GRAPHIC_TEMPLATES.map((t) => t.category));
		expect(categories.has('kinetic')).toBe(true);
		expect(categories.has('minimal')).toBe(true);
		expect(categories.has('badge')).toBe(true);
		expect(categories.has('neon')).toBe(true);
		expect(categories.has('social')).toBe(true);

		for (const tpl of GRAPHIC_TEMPLATES) {
			expect(tpl.id).toBeTruthy();
			expect(tpl.name).toBeTruthy();
			expect(tpl.defaultText).toBeTruthy();
			expect(tpl.style.fontFamily).toBeTruthy();
			expect(tpl.animationPresetId).toBeTruthy();
			expect(tpl.accentColor).toBeDefined();
			expect(tpl.previewColors.background).toBeTruthy();
		}
	});

	it('defines extended kinetic motion animation presets', () => {
		const animIds = GRAPHIC_ANIMATION_PRESETS.map((a) => a.id);
		expect(animIds).toContain('kinetic-zoom');
		expect(animIds).toContain('bounce-in');
		expect(animIds).toContain('split-slide');
		expect(animIds).toContain('glitch-snap');
		expect(animIds).toContain('smooth-drift');
		expect(animIds).toContain('pop-out');
	});

	it('creates a motion graphic clip with template styles and animated properties', () => {
		const tpl = getGraphicTemplate('dream-big');
		expect(tpl).toBeDefined();
		if (!tpl) return;

		const clip = createGraphicClip('dream-big', 1_000_000, 4_000_000);
		expect(clip.start).toBe(1_000_000);
		expect(clip.duration).toBe(4_000_000);
		expect(clip.source?.type).toBe('text');

		if (clip.source?.type === 'text') {
			expect(clip.source.text).toBe(tpl.defaultText);
			expect(clip.source.graphicTemplateId).toBe('dream-big');
			expect(clip.source.colorRuns?.length).toBeGreaterThan(0);
		}

		// Check animated position from slide-in-up preset
		const posProp = clip.properties?.['position'];
		expect(posProp).toBeDefined();
		expect('keyframes' in posProp!).toBe(true);

		if (posProp && 'keyframes' in posProp) {
			const startPos = evaluate(posProp, 0) as [number, number];
			expect(startPos[1]).toBeCloseTo(150, 1);
		}

		// Also check kinetic-zoom on imagine-real
		const zoomClip = createGraphicClip('imagine-real', 0, 4_000_000);
		const scaleProp = zoomClip.properties?.['scale'];
		expect(scaleProp).toBeDefined();
		if (scaleProp && 'keyframes' in scaleProp) {
			const startScale = evaluate(scaleProp, 0) as [number, number];
			expect(startScale[0]).toBeCloseTo(0.3, 1);
		}
	});

	it('computes color runs for highlighted accent words', () => {
		const tpl = getGraphicTemplate('dream-big');
		expect(tpl).toBeDefined();
		if (!tpl) return;

		const runs = computeColorRuns(tpl.defaultText, tpl);
		expect(runs.length).toBe(1);
		expect(runs[0]?.startIndex).toBeGreaterThan(0);
		expect(runs[0]?.endIndex).toBe(tpl.defaultText.length);
		expect(runs[0]?.fillColor).toEqual(tpl.accentColor);
	});

	it('applies a new graphic template onto an existing clip', () => {
		const originalClip = createGraphicClip('dream-big', 0, 3_000_000, 'CUSTOM HEADLINE');
		const updated = applyGraphicTemplateToClip(originalClip, 'cyber-nights');

		expect(updated.source?.type).toBe('text');
		if (updated.source?.type === 'text') {
			// Preserves custom text
			expect(updated.source.text).toBe('CUSTOM HEADLINE');
			expect(updated.source.graphicTemplateId).toBe('cyber-nights');
		}

		// Verifies shadow effect properties were applied for neon style
		const shadowColor = updated.properties?.['text.shadowColor'];
		expect(shadowColor).toBeDefined();
	});

	it('integrates store methods: addGraphicClip, applyGraphicTemplate, and setGraphicAccentColor', () => {
		const store = createEditorStore();
		const project = createEmptyProject({ name: 'Graphics Test' });
		store.setState({ project });

		// Add graphic clip to track via store
		const clipId = store.getState().addGraphicClip('modern-clean');
		expect(clipId).toBeTruthy();

		const projectAfter = store.getState().project;
		const addedClip = projectAfter?.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
		expect(addedClip).toBeDefined();
		expect(addedClip?.source?.type).toBe('text');

		// Apply another template
		store.getState().applyGraphicTemplate(clipId!, 'ae-motion-title');
		const modifiedClip = store
			.getState()
			.project?.tracks.flatMap((t) => t.clips)
			.find((c) => c.id === clipId);
		if (modifiedClip?.source?.type === 'text') {
			expect(modifiedClip.source.graphicTemplateId).toBe('ae-motion-title');
		}

		// Update accent color
		store.getState().setGraphicAccentColor(clipId!, { r: 1, g: 0, b: 0.5, a: 1 });
		const accentClip = store
			.getState()
			.project?.tracks.flatMap((t) => t.clips)
			.find((c) => c.id === clipId);
		if (accentClip?.source?.type === 'text') {
			expect(accentClip.source.colorRuns?.[0]?.fillColor?.r).toBe(1);
			expect(accentClip.source.colorRuns?.[0]?.fillColor?.b).toBe(0.5);
		}
	});

	it('reliably undoes and redoes all graphic operations: add, text edit, template switch, animation, color', () => {
		const store = createEditorStore();
		const project = createEmptyProject({ name: 'Undo Redo Graphics Test' });
		store.setState({ project, isProjectManagerOpen: false });

		// 1. Add graphic clip
		const clipId = store.getState().addGraphicClip('dream-big')!;
		expect(clipId).toBeTruthy();
		expect(store.getState().history.canUndo).toBe(true);
		expect(store.getState().timeline.selection.clipIds).toEqual([clipId]);

		// Undo adding clip
		expect(store.getState().undo()).toBe(true);
		expect(
			store
				.getState()
				.project?.tracks.flatMap((t) => t.clips)
				.find((c) => c.id === clipId)
		).toBeUndefined();
		expect(store.getState().timeline.selection.clipIds).toEqual([]);

		// Redo adding clip
		expect(store.getState().redo()).toBe(true);
		expect(
			store
				.getState()
				.project?.tracks.flatMap((t) => t.clips)
				.find((c) => c.id === clipId)
		).toBeDefined();
		expect(store.getState().timeline.selection.clipIds).toEqual([clipId]);

		// 2. Edit text content
		store.getState().setTextContent(clipId, 'NEW HEADLINE\nAND LINE TWO');
		let currentClip = store
			.getState()
			.project?.tracks.flatMap((t) => t.clips)
			.find((c) => c.id === clipId);
		expect(currentClip?.source?.type === 'text' && currentClip.source.text).toBe(
			'NEW HEADLINE\nAND LINE TWO'
		);

		// Undo text edit
		expect(store.getState().undo()).toBe(true);
		currentClip = store
			.getState()
			.project?.tracks.flatMap((t) => t.clips)
			.find((c) => c.id === clipId);
		expect(currentClip?.source?.type === 'text' && currentClip.source.text).toBe(
			'DREAM BIG\nAND DARE\nTO FAIL'
		);

		// Redo text edit
		expect(store.getState().redo()).toBe(true);
		currentClip = store
			.getState()
			.project?.tracks.flatMap((t) => t.clips)
			.find((c) => c.id === clipId);
		expect(currentClip?.source?.type === 'text' && currentClip.source.text).toBe(
			'NEW HEADLINE\nAND LINE TWO'
		);

		// 3. Switch template
		store.getState().applyGraphicTemplate(clipId, 'ae-motion-title');
		currentClip = store
			.getState()
			.project?.tracks.flatMap((t) => t.clips)
			.find((c) => c.id === clipId);
		expect(currentClip?.source?.type === 'text' && currentClip.source.graphicTemplateId).toBe(
			'ae-motion-title'
		);

		// Undo template switch
		expect(store.getState().undo()).toBe(true);
		currentClip = store
			.getState()
			.project?.tracks.flatMap((t) => t.clips)
			.find((c) => c.id === clipId);
		expect(currentClip?.source?.type === 'text' && currentClip.source.graphicTemplateId).toBe(
			'dream-big'
		);

		// Redo template switch
		expect(store.getState().redo()).toBe(true);
		currentClip = store
			.getState()
			.project?.tracks.flatMap((t) => t.clips)
			.find((c) => c.id === clipId);
		expect(currentClip?.source?.type === 'text' && currentClip.source.graphicTemplateId).toBe(
			'ae-motion-title'
		);

		// 4. Apply animation preset
		store.getState().applyTextAnimation(clipId, 'bounce-in');
		currentClip = store
			.getState()
			.project?.tracks.flatMap((t) => t.clips)
			.find((c) => c.id === clipId);
		expect(currentClip?.properties?.['scale']).toBeDefined();

		// Undo animation preset
		expect(store.getState().undo()).toBe(true);

		// Redo animation preset
		expect(store.getState().redo()).toBe(true);

		// 5. Update accent color
		store.getState().setGraphicAccentColor(clipId, { r: 0.1, g: 0.8, b: 0.9, a: 1 });
		currentClip = store
			.getState()
			.project?.tracks.flatMap((t) => t.clips)
			.find((c) => c.id === clipId);
		if (currentClip?.source?.type === 'text') {
			expect(currentClip.source.colorRuns?.[0]?.fillColor?.r).toBeCloseTo(0.1, 2);
		}

		// Undo color
		expect(store.getState().undo()).toBe(true);

		// Redo color
		expect(store.getState().redo()).toBe(true);
		currentClip = store
			.getState()
			.project?.tracks.flatMap((t) => t.clips)
			.find((c) => c.id === clipId);
		if (currentClip?.source?.type === 'text') {
			expect(currentClip.source.colorRuns?.[0]?.fillColor?.r).toBeCloseTo(0.1, 2);
		}
	});
});
