import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP,
	type AudioEffectContext
} from '../effects/registry';
import { dbToGain } from '../../audioMath';

// Channel Volume / Phase Invert / Gain Trim effect
export const gainTrimDefinition: AudioEffectDefinition = {
	id: 'gain-trim',
	name: 'Channel Volume / Phase Invert',
	category: 'utility',
	version: 2,
	paramSchemas: [
		{
			id: 'gainDb',
			name: 'Master Gain',
			type: 'number',
			min: -96,
			max: 24,
			step: 0.5,
			default: 0,
			unit: 'dB',
			animatable: true
		},
		{
			id: 'gainLeftDb',
			name: 'Left Gain',
			type: 'number',
			min: -96,
			max: 24,
			step: 0.5,
			default: 0,
			unit: 'dB',
			animatable: true
		},
		{
			id: 'gainRightDb',
			name: 'Right Gain',
			type: 'number',
			min: -96,
			max: 24,
			step: 0.5,
			default: 0,
			unit: 'dB',
			animatable: true
		},
		{
			id: 'invertPhase',
			name: 'Invert Both Phases',
			type: 'boolean',
			default: false,
			animatable: false
		},
		{
			id: 'invertLeftPhase',
			name: 'Invert Left Phase',
			type: 'boolean',
			default: false,
			animatable: false
		},
		{
			id: 'invertRightPhase',
			name: 'Invert Right Phase',
			type: 'boolean',
			default: false,
			animatable: false
		},
		{
			id: 'swapChannels',
			name: 'Swap Left & Right',
			type: 'boolean',
			default: false,
			animatable: false
		},
		{
			id: 'mute',
			name: 'Mute',
			type: 'boolean',
			default: false,
			animatable: true
		}
	],
	latencySamples: () => 0,
	createDSP: (_ctx: AudioEffectContext, params: Record<string, unknown>): AudioEffectDSP => {
		return {
			reset: () => {},
			latencySamples: () => 0,
			process: (channels: Float32Array[], frameCount: number) => {
				const masterGain = dbToGain(Number(params.gainDb ?? 0));
				const gainL = dbToGain(Number(params.gainLeftDb ?? 0)) * masterGain;
				const gainR = dbToGain(Number(params.gainRightDb ?? 0)) * masterGain;

				const isMuted = Boolean(params.mute ?? false);
				const invertMaster = Boolean(params.invertPhase ?? false);
				const invertL = Boolean(params.invertLeftPhase ?? false) !== invertMaster;
				const invertR = Boolean(params.invertRightPhase ?? false) !== invertMaster;
				const swap = Boolean(params.swapChannels ?? false);

				if (isMuted) {
					for (const ch of channels) {
						ch.fill(0, 0, frameCount);
					}
					return;
				}

				if (channels.length >= 2 && swap) {
					const left = channels[0]!;
					const right = channels[1]!;
					for (let i = 0; i < frameCount; i++) {
						const tempL = left[i]!;
						const tempR = right[i]!;
						left[i] = (invertL ? -tempR : tempR) * gainL;
						right[i] = (invertR ? -tempL : tempL) * gainR;
					}
					return;
				}

				for (let c = 0; c < channels.length; c++) {
					const ch = channels[c]!;
					const chGain = c === 1 ? gainR : gainL;
					const invert = c === 1 ? invertR : invertL;
					const effective = invert ? -chGain : chGain;
					for (let i = 0; i < frameCount; i++) {
						ch[i] = ch[i]! * effective;
					}
				}
			}
		};
	}
};

audioEffectRegistry.register(gainTrimDefinition);
