import { describe, expect, it } from 'vitest';
import {
	createEffectInstance,
	evaluateEffect,
	addEffectToClip,
	removeEffectFromClip,
	reorderEffectInClip,
	toggleEffectInClip,
	duplicateEffectInClip,
	copyClipEffects,
	pasteClipEffects,
	setEffectParamInClip
} from './instance';
import { EFFECT_DEFINITIONS, getEffectDefinition, listEffectDefinitions } from './registry';
import { descriptorFor, propertyCurve, readProperty } from '../properties';
import { enableAnimation, setPropertyAtTime } from '../keyframeEdit';
import type { Clip, ClipId } from '../types';

function makeClip(effects: ReturnType<typeof createEffectInstance>[] = []): Clip {
	return {
		id: 'c1' as ClipId,
		start: 0,
		duration: 1_000_000,
		sourceIn: 0,
		sourceOut: 1_000_000,
		speed: 1,
		volume: 1,
		effects
	};
}

describe('Effect Registry', () => {
	it('registers all required starter effects with valid schemas', () => {
		const required = [
			'gaussianBlur',
			'sharpen',
			'vignette',
			'mosaic',
			'filmGrain',
			'invert',
			'mirror',
			'glow',
			'chromaKey',
			'colorCorrection',
			'curves',
			'lut3d'
		];
		const defs = listEffectDefinitions();
		for (const id of required) {
			const def = getEffectDefinition(id);
			expect(def).toBeDefined();
			expect(def?.id).toBe(id);
			expect(def?.params.mix).toBeDefined();
			expect(def?.params.mix.defaultValue).toBe(1);
		}
		expect(defs.length).toBeGreaterThanOrEqual(required.length);
	});

	it('detects neutral values correctly for starter effects', () => {
		const blur = getEffectDefinition('gaussianBlur')!;
		expect(blur.isNeutral({ radius: 0, mix: 1 })).toBe(true);
		expect(blur.isNeutral({ radius: 10, mix: 0 })).toBe(true);
		expect(blur.isNeutral({ radius: 10, mix: 1 })).toBe(false);

		const cc = getEffectDefinition('colorCorrection')!;
		expect(
			cc.isNeutral({
				exposure: 0,
				contrast: 0,
				highlights: 0,
				shadows: 0,
				whites: 0,
				blacks: 0,
				temperature: 0,
				tint: 0,
				saturation: 0,
				vibrance: 0,
				mix: 1
			})
		).toBe(true);
		expect(cc.isNeutral({ exposure: 1, mix: 1 })).toBe(false);

		const vignette = getEffectDefinition('vignette')!;
		expect(vignette.isNeutral({ amount: 0, mix: 1 })).toBe(true);
		expect(vignette.isNeutral({ amount: 0.5, mix: 1 })).toBe(false);
	});
});

describe('Effect Instance & Evaluation', () => {
	it('creates instance with defaults and evaluates params', () => {
		const instance = createEffectInstance('gaussianBlur', { radius: 15 });
		expect(instance.type).toBe('gaussianBlur');
		expect(instance.enabled).toBe(true);
		expect(instance.params.radius).toBe(15);
		expect(instance.params.mix).toBe(1);

		const evaluated = evaluateEffect(instance, 0);
		expect(evaluated.type).toBe('gaussianBlur');
		expect(evaluated.enabled).toBe(true);
		expect(evaluated.params.radius).toBe(15);
		expect(evaluated.params.mix).toBe(1);
		expect(evaluated.isNeutral).toBe(false);
	});

	it('evaluates animated parameters over time', () => {
		const instance = createEffectInstance('gaussianBlur');
		instance.params.radius = {
			keyframes: [
				{ time: 0, value: 0, interpolation: 'linear' },
				{ time: 1_000_000, value: 50, interpolation: 'linear' }
			]
		};

		const t0 = evaluateEffect(instance, 0);
		expect(t0.params.radius).toBe(0);
		expect(t0.isNeutral).toBe(true);

		const tMid = evaluateEffect(instance, 500_000);
		expect(tMid.params.radius).toBe(25);
		expect(tMid.isNeutral).toBe(false);

		const tEnd = evaluateEffect(instance, 1_000_000);
		expect(tEnd.params.radius).toBe(50);
		expect(tEnd.isNeutral).toBe(false);
	});

	it('disabled effects evaluate with isNeutral = true', () => {
		const instance = createEffectInstance('gaussianBlur', { radius: 20 });
		instance.enabled = false;
		const evaled = evaluateEffect(instance, 0);
		expect(evaled.enabled).toBe(false);
		expect(evaled.isNeutral).toBe(true);
	});
});

describe('Clip Effects Stack Operations', () => {
	it('adds, toggles, duplicates, reorders, and removes effects', () => {
		let clip = makeClip();
		const e1 = createEffectInstance('gaussianBlur', { radius: 10 });
		const e2 = createEffectInstance('sharpen', { amount: 20 });

		clip = addEffectToClip(clip, e1);
		clip = addEffectToClip(clip, e2);
		expect(clip.effects?.length).toBe(2);
		expect(clip.effects?.[0]?.type).toBe('gaussianBlur');
		expect(clip.effects?.[1]?.type).toBe('sharpen');

		// Reorder
		clip = reorderEffectInClip(clip, e1.id, 1);
		expect(clip.effects?.[0]?.type).toBe('sharpen');
		expect(clip.effects?.[1]?.type).toBe('gaussianBlur');

		// Toggle
		clip = toggleEffectInClip(clip, e1.id, false);
		expect(clip.effects?.[1]?.enabled).toBe(false);

		// Duplicate
		clip = duplicateEffectInClip(clip, e1.id);
		expect(clip.effects?.length).toBe(3);
		expect(clip.effects?.[2]?.type).toBe('gaussianBlur');
		expect(clip.effects?.[2]?.id).not.toBe(e1.id);

		// Remove
		clip = removeEffectFromClip(clip, e1.id);
		expect(clip.effects?.length).toBe(2);

		// Param set
		clip = setEffectParamInClip(clip, e2.id, 'amount', 75);
		expect(clip.effects?.[0]?.params.amount).toBe(75);
	});

	it('copies and pastes effects with new IDs', () => {
		const e1 = createEffectInstance('mosaic', { blockSize: 10 });
		const originalClip = makeClip([e1]);
		const copied = copyClipEffects(originalClip);

		let targetClip = makeClip();
		targetClip = pasteClipEffects(targetClip, copied);
		expect(targetClip.effects?.length).toBe(1);
		expect(targetClip.effects?.[0]?.type).toBe('mosaic');
		expect(targetClip.effects?.[0]?.params.blockSize).toBe(10);
		expect(targetClip.effects?.[0]?.id).not.toBe(e1.id);
	});
});

describe('Effect Keyframe & Property System Integration', () => {
	it('resolves dynamic property descriptors for effect parameters', () => {
		const blur = createEffectInstance('gaussianBlur');
		const propId = `effect:gaussianBlur:${blur.id}:radius`;
		const desc = descriptorFor(propId);
		expect(desc).toBeDefined();
		expect(desc?.label).toBe('Gaussian Blur Radius');
		expect(desc?.shape).toBe('number');
		expect(desc?.min).toBe(0);
		expect(desc?.max).toBe(100);
	});

	it('reads and writes keyframes on effect parameters using setPropertyAtTime', () => {
		const blur = createEffectInstance('gaussianBlur', { radius: 10 });
		let clip = makeClip([blur]);
		const propId = `effect:gaussianBlur:${blur.id}:radius`;

		// Constant read
		expect(readProperty(clip, propId, 0)).toBe(10);

		// Turn stopwatch on and set keyframes
		clip = enableAnimation(clip, propId, 0, 30);
		clip = setPropertyAtTime(clip, propId, 500_000, 40, { autoKey: true, fps: 30 });

		const curve = propertyCurve(clip, propId);
		expect(curve).toBeDefined();
		expect('keyframes' in curve!).toBe(true);

		// Evaluate at mid time
		expect(readProperty(clip, propId, 250_000)).toBeCloseTo(25, 1);
		expect(readProperty(clip, propId, 500_000)).toBe(40);
	});
});
