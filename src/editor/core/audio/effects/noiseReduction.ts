import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP
} from '../effects/registry';
import { SpectralGateCore } from '../dsp/spectralGate';

export const noiseReductionDefinition: AudioEffectDefinition = {
	id: 'noise-reduction',
	name: 'Noise Reduction',
	category: 'restoration',
	version: 1,
	paramSchemas: [
		{
			id: 'thresholdDb',
			name: 'Threshold',
			type: 'number',
			min: -60,
			max: 0,
			step: 1,
			default: -40,
			unit: 'dB',
			animatable: true
		},
		{
			id: 'reductionDb',
			name: 'Amount',
			type: 'number',
			min: -30,
			max: 0,
			step: 1,
			default: -15,
			unit: 'dB',
			animatable: true
		},
		{
			id: 'learn',
			name: 'Learn Noise Profile',
			type: 'boolean',
			default: false,
			animatable: false
		}
	],
	latencySamples: () => 512,
	createDSP: (_ctx: unknown, params: Record<string, unknown> = {}): AudioEffectDSP => {
		const gateL = new SpectralGateCore(512);
		const gateR = new SpectralGateCore(512);

		const thresh = typeof params.thresholdDb === 'number' ? params.thresholdDb : -40;
		const red = typeof params.reductionDb === 'number' ? params.reductionDb : -15;
		const learn = typeof params.learn === 'boolean' ? params.learn : false;
		gateL.setParameters(thresh, red, learn);
		gateR.setParameters(thresh, red, learn);

		return {
			reset() {
				gateL.reset();
				gateR.reset();
			},
			latencySamples() {
				return 512;
			},
			process(channels: Float32Array[], frameCount: number) {
				const chL = channels[0];
				const chR = channels[1] ?? chL;
				if (!chL) return;

				const curThresh = typeof params.thresholdDb === 'number' ? params.thresholdDb : -40;
				const curRed = typeof params.reductionDb === 'number' ? params.reductionDb : -15;
				const curLearn = typeof params.learn === 'boolean' ? params.learn : false;
				gateL.setParameters(curThresh, curRed, curLearn);
				gateR.setParameters(curThresh, curRed, curLearn);

				for (let i = 0; i < frameCount; i++) {
					const inL = chL[i]!;
					const inR = chR![i]!;

					chL[i] = gateL.processSample(inL);
					if (channels[1]) {
						channels[1][i] = gateR.processSample(inR);
					}
				}
			}
		};
	}
};

audioEffectRegistry.register(noiseReductionDefinition);
