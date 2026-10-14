import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP,
	type AudioEffectContext
} from '../effects/registry';
import { PitchShifterCore } from '../dsp/pitchShifterCore';

export const pitchShifterDefinition: AudioEffectDefinition = {
	id: 'pitch-shifter',
	name: 'Pitch Shifter',
	category: 'spatial',
	version: 1,
	paramSchemas: [
		{
			id: 'semitones',
			name: 'Semitones',
			type: 'number',
			min: -12,
			max: 12,
			step: 1,
			default: 0,
			unit: 'st',
			animatable: true
		},
		{
			id: 'cents',
			name: 'Fine Detune',
			type: 'number',
			min: -50,
			max: 50,
			step: 1,
			default: 0,
			unit: 'cents',
			animatable: true
		}
	],
	latencySamples: () => 0,
	createDSP: (ctx: AudioEffectContext): AudioEffectDSP => {
		const coreL = new PitchShifterCore(ctx.sampleRate);
		const coreR = new PitchShifterCore(ctx.sampleRate);

		return {
			reset() {
				coreL.reset();
				coreR.reset();
			},
			latencySamples() {
				return 0;
			},
			process(channels: Float32Array[], frameCount: number) {
				const chL = channels[0];
				const chR = channels[1] ?? chL;
				if (!chL) return;

				for (let i = 0; i < frameCount; i++) {
					const inL = chL[i]!;
					const inR = chR![i]!;

					chL[i] = coreL.processSample(inL);
					if (channels[1]) {
						channels[1][i] = coreR.processSample(inR);
					}
				}
			}
		};
	}
};

audioEffectRegistry.register(pitchShifterDefinition);
