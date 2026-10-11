import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP,
	type AudioEffectContext
} from '../effects/registry';
import { ReverbCore } from '../dsp/reverbCore';

const reverbDefinition: AudioEffectDefinition = {
	id: 'reverb',
	name: 'Studio Reverb',
	category: 'spatial',
	version: 1,
	paramSchemas: [
		{
			id: 'roomSize',
			name: 'Room Size',
			type: 'number',
			min: 0,
			max: 1,
			step: 0.01,
			default: 0.7,
			unit: '',
			animatable: true
		},
		{
			id: 'damping',
			name: 'Damping',
			type: 'number',
			min: 0,
			max: 1,
			step: 0.01,
			default: 0.25,
			unit: '',
			animatable: true
		},
		{
			id: 'width',
			name: 'Stereo Width',
			type: 'number',
			min: 0,
			max: 1,
			step: 0.01,
			default: 1.0,
			unit: '',
			animatable: true
		},
		{
			id: 'mix',
			name: 'Wet / Dry',
			type: 'number',
			min: 0,
			max: 1,
			step: 0.01,
			default: 0.3,
			unit: '',
			animatable: true
		}
	],
	latencySamples: () => 0,
	createDSP: (ctx: AudioEffectContext): AudioEffectDSP => {
		const core = new ReverbCore(ctx.sampleRate);
		core.setParameters(0.7, 0.25, 1.0);

		return {
			reset() {
				core.reset();
			},
			latencySamples() {
				return 0;
			},
			process(channels: Float32Array[], frameCount: number) {
				const chL = channels[0];
				const chR = channels[1] ?? chL;
				if (!chL) return;

				const wet = 0.3;
				const dry = 1 - wet;

				for (let i = 0; i < frameCount; i++) {
					const inL = chL[i]!;
					const inR = chR![i]!;

					const { outL, outR } = core.processStereo(inL, inR);

					chL[i] = inL * dry + outL * wet;
					if (channels[1]) {
						channels[1][i] = inR * dry + outR * wet;
					}
				}
			}
		};
	}
};

audioEffectRegistry.register(reverbDefinition);
