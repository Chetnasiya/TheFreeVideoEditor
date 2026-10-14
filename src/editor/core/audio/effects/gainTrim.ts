import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP,
	type AudioEffectContext
} from '../effects/registry';
import { dbToGain } from '../../audioMath';

// 1. Gain / Trim effect
export const gainTrimDefinition: AudioEffectDefinition = {
	id: 'gain-trim',
	name: 'Gain / Trim',
	category: 'utility',
	version: 1,
	paramSchemas: [
		{
			id: 'gainDb',
			name: 'Gain',
			type: 'number',
			min: -96,
			max: 24,
			step: 0.5,
			default: 0,
			unit: 'dB',
			animatable: true
		},
		{
			id: 'mute',
			name: 'Mute',
			type: 'boolean',
			default: false,
			animatable: true
		},
		{
			id: 'invertPhase',
			name: 'Invert Phase',
			type: 'boolean',
			default: false,
			animatable: false
		}
	],
	latencySamples: () => 0,
	createDSP: (_ctx: AudioEffectContext, params: Record<string, unknown>): AudioEffectDSP => {
		let gain = dbToGain(Number(params.gainDb ?? 0));
		let mute = Boolean(params.mute ?? false);
		let invert = Boolean(params.invertPhase ?? false);

		return {
			reset: () => {},
			latencySamples: () => 0,
			process: (channels: Float32Array[], frameCount: number) => {
				gain = dbToGain(Number(params.gainDb ?? 0));
				mute = Boolean(params.mute ?? false);
				invert = Boolean(params.invertPhase ?? false);

				const effectiveGain = mute ? 0 : invert ? -gain : gain;
				for (const ch of channels) {
					for (let i = 0; i < frameCount; i++) {
						ch[i] = ch[i]! * effectiveGain;
					}
				}
			}
		};
	}
};

audioEffectRegistry.register(gainTrimDefinition);
