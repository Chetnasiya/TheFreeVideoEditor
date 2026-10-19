import { describe, expect, it } from 'vitest';
import { resolveFrame } from '../playback';
import { getBuiltinMotionTemplate } from './builtinTemplates';
import {
	buildTemplatePreviewProject,
	templatePreviewLoopTime,
	templatePreviewSettledTime
} from './templatePreview';

describe('template preview project', () => {
	const template = getBuiltinMotionTemplate('cinematic-blockbuster')!;

	it('is sized to the template bounds so the instance fills the frame', () => {
		const project = buildTemplatePreviewProject(template);
		expect(project.settings.width).toBe(Math.max(16, Math.round(template.bounds!.width)));
		expect(project.settings.height).toBe(Math.max(16, Math.round(template.bounds!.height)));
		const clip = project.tracks.flatMap((track) => track.clips)[0]!;
		expect(clip.source).toMatchObject({ type: 'sequence', templateId: template.id });
		expect(clip.transform).toMatchObject({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
	});

	it('resolves to the same nested layers a timeline instance produces', () => {
		const project = buildTemplatePreviewProject(template);
		const frame = resolveFrame(project, templatePreviewSettledTime(template));
		expect(frame.videoLayers).toHaveLength(1);
		const [layer] = frame.videoLayers;
		expect(layer!.kind).toBe('sequence');
		expect(layer!.nested!.layers.length).toBeGreaterThan(0);
	});

	it('keeps the settled and loop times inside the template', () => {
		const settled = templatePreviewSettledTime(template);
		expect(settled).toBeGreaterThan(0);
		expect(settled).toBeLessThan(template.duration);
		expect(templatePreviewLoopTime(template, 0)).toBe(0);
		expect(templatePreviewLoopTime(template, 1)).toBeLessThan(template.duration);
		expect(templatePreviewLoopTime(template, 0.5)).toBe(Math.round(template.duration / 2));
	});
});
