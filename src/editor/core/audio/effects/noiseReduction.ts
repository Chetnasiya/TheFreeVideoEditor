import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP
} from '../effects/registry';
import { SpectralGateCore } from '../dsp/spectralGate';

const noiseReductionDefinition: AudioEffectDefinition = {
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
	createDSP: (): AudioEffectDSP => {
		const gateL = new SpectralGateCore(512);
		const gateR = new SpectralGateCore(512);

		gateL.setParameters(-40, -15, false);
		gateR.setParameters(-40, -15, false);

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
