import { describe, it, expect } from 'vitest';
import { generatePresetKeyframes, templates, type PresetName, type TemplateName } from './presets';

describe('Text Animation Presets', () => {
	describe('preset keyframe generation', () => {
		it('generates fade-in keyframes', () => {
			const kf = generatePresetKeyframes('fade-in', 5_000_000, 500_000);
			expect(kf.opacity).toBeDefined();
			expect(kf.opacity).toHaveLength(2);
			expect(kf.opacity[0]?.value).toBe(0);
			expect(kf.opacity[1]?.value).toBe(1);
			expect(kf.opacity[1]?.time).toBe(500_000);
		});

		it('generates fade-out keyframes', () => {
			const kf = generatePresetKeyframes('fade-out', 5_000_000, 500_000, 500_000);
			expect(kf.opacity).toBeDefined();
			expect(kf.opacity[0]?.value).toBe(1);
			expect(kf.opacity[1]?.value).toBe(0);
			expect(kf.opacity[0]?.time).toBe(5_000_000 - 500_000);
		});

		it('generates slide-up keyframes with position and opacity', () => {
			const kf = generatePresetKeyframes('slide-up', 5_000_000, 500_000);
			expect(kf.opacity).toBeDefined();
			expect(kf['position.y']).toBeDefined();
			expect(kf['position.y'][0]?.value).toBe(50);
			expect(kf['position.y'][1]?.value).toBe(0);
		});

		it('generates slide-down keyframes', () => {
			const kf = generatePresetKeyframes('slide-down', 5_000_000, 500_000);
			expect(kf['position.y']).toBeDefined();
			expect(kf['position.y'][0]?.value).toBe(-50);
		});

		it('generates slide-left keyframes', () => {
			const kf = generatePresetKeyframes('slide-left', 5_000_000, 500_000);
			expect(kf['position.x']).toBeDefined();
			expect(kf['position.x'][0]?.value).toBe(50);
		});

		it('generates slide-right keyframes', () => {
			const kf = generatePresetKeyframes('slide-right', 5_000_000, 500_000);
			expect(kf['position.x']).toBeDefined();
			expect(kf['position.x'][0]?.value).toBe(-50);
		});

		it('generates pop-in keyframes with scale curve', () => {
			const kf = generatePresetKeyframes('pop-in', 5_000_000, 500_000);
			expect(kf.scale).toBeDefined();
			expect(kf.scale).toHaveLength(3);
			expect(kf.scale[0]?.value).toBe(0.6);
			expect(kf.scale[1]?.value).toBeGreaterThan(1);
			expect(kf.scale[2]?.value).toBe(1);
			expect(kf.scale[0]?.interpolation).toBe('bezier');
		});

		it('generates pop-out keyframes', () => {
			const kf = generatePresetKeyframes('pop-out', 5_000_000, 500_000, 500_000);
			expect(kf.scale).toBeDefined();
			expect(kf.scale[0]?.value).toBe(1);
			expect(kf.scale[1]?.value).toBe(0.6);
			expect(kf.scale[0]?.time).toBe(5_000_000 - 500_000);
		});

		it('generates typewriter-in keyframes', () => {
			const kf = generatePresetKeyframes('typewriter-in', 5_000_000, 500_000);
			expect(kf['text.reveal']).toBeDefined();
			expect(kf['text.reveal'][0]?.value).toBe(0);
			expect(kf['text.reveal'][1]?.value).toBe(1);
		});

		it('generates typewriter-out keyframes', () => {
			const kf = generatePresetKeyframes('typewriter-out', 5_000_000, 500_000, 500_000);
			expect(kf['text.reveal']).toBeDefined();
			expect(kf['text.reveal'][0]?.value).toBe(1);
			expect(kf['text.reveal'][1]?.value).toBe(0);
		});

		it('respects custom in/out durations', () => {
			const kf1 = generatePresetKeyframes('fade-in', 5_000_000, 1_000_000);
			const kf2 = generatePresetKeyframes('fade-in', 5_000_000, 500_000);
			expect(kf1.opacity[1]?.time).toBe(1_000_000);
			expect(kf2.opacity[1]?.time).toBe(500_000);
		});
	});

	describe('templates', () => {
		it('exports all template presets', () => {
			expect(templates.title).toBeDefined();
			expect(templates.subtitle).toBeDefined();
			expect(templates['lower-third']).toBeDefined();
			expect(templates.outline).toBeDefined();
			expect(templates['neon-glow']).toBeDefined();
			expect(templates['typewriter-caption']).toBeDefined();
			expect(templates['pop-caption']).toBeDefined();
		});

		it('title template has bold Oswald font', () => {
			const template = templates.title;
			expect(template.style.fontFamily).toContain('Oswald');
			expect(template.style.fontWeight).toBe('bold');
			expect(template.style.fontSize).toBeGreaterThan(50);
		});

		it('subtitle template has larger font than lower-third', () => {
			const subtitle = templates.subtitle.style.fontSize || 0;
			const lowerThird = templates['lower-third'].style.fontSize || 0;
			expect(subtitle).toBeGreaterThan(lowerThird);
		});

		it('templates have default text', () => {
			Object.values(templates).forEach(template => {
				expect(template.defaultText).toBeTruthy();
				expect(template.defaultText.length).toBeGreaterThan(0);
			});
		});

		it('templates have style configuration', () => {
			Object.values(templates).forEach(template => {
				expect(template.style.fontFamily).toBeTruthy();
				expect(template.defaultText).toBeTruthy();
			});
		});

		it('typewriter-caption uses monospace font', () => {
			const template = templates['typewriter-caption'];
			expect(template.style.fontFamily).toContain('Mono');
		});

		it('pop-caption has large cursive font', () => {
			const template = templates['pop-caption'];
			expect(template.style.fontFamily).toContain('Caveat');
			expect(template.style.fontSize).toBeGreaterThan(40);
		});
	});

	describe('keyframe interpolation', () => {
		it('pop preset uses bezier interpolation', () => {
			const kf = generatePresetKeyframes('pop-in', 5_000_000, 500_000);
			expect(kf.scale[0]?.easeOut).toBeDefined();
			expect(kf.scale[0]?.easeIn).toBeDefined();
		});

		it('fade preset uses linear interpolation', () => {
			const kf = generatePresetKeyframes('fade-in', 5_000_000, 500_000);
			expect(kf.opacity[0]?.interpolation).toBe('linear');
			expect(kf.opacity[1]?.interpolation).toBe('linear');
		});
	});
});
