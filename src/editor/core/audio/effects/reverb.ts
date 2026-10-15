import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP,
	type AudioEffectContext
} from '../effects/registry';
import { ReverbCore } from '../dsp/reverbCore';

export const reverbDefinition: AudioEffectDefinition = {
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
	createDSP: (ctx: AudioEffectContext, params?: Record<string, unknown>): AudioEffectDSP => {
		const roomSize = typeof params?.roomSize === 'number' ? params.roomSize : 0.7;
		const damping = typeof params?.damping === 'number' ? params.damping : 0.25;
		const width = typeof params?.width === 'number' ? params.width : 1.0;
		const rawMix = typeof params?.mix === 'number' ? params.mix : 0.3;
		const wet = Math.min(1, Math.max(0, rawMix > 1 ? rawMix / 100 : rawMix));
		const dry = 1 - wet;

		const core = new ReverbCore(ctx.sampleRate);
		core.setParameters(roomSize, damping, width);

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
