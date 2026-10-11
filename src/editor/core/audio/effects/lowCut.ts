import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP,
	type AudioEffectContext
} from '../effects/registry';
import { BiquadFilter } from '../dsp/biquad';

const lowCutDefinition: AudioEffectDefinition = {
	id: 'low-cut',
	name: 'Low-Cut / Rumble Filter',
	category: 'restoration',
	version: 1,
	paramSchemas: [
		{
			id: 'frequencyHz',
			name: 'Cutoff Frequency',
			type: 'number',
			min: 20,
			max: 400,
			step: 5,
			default: 80,
			unit: 'Hz',
			animatable: true
		},
		{
			id: 'slope',
			name: 'Slope',
			type: 'enum',
			default: '24',
			options: [
				{ label: '12 dB/oct (2nd order)', value: '12' },
				{ label: '24 dB/oct (4th order)', value: '24' },
				{ label: '48 dB/oct (8th order)', value: '48' }
			]
		}
	],
	latencySamples: () => 0,
	createDSP: (ctx: AudioEffectContext): AudioEffectDSP => {
		const q = Math.SQRT1_2;
		const stagesL = Array.from(
			{ length: 4 },
			() => new BiquadFilter(ctx.sampleRate, { type: 'highpass', frequencyHz: 80, q })
		);
		const stagesR = Array.from(
			{ length: 4 },
			() => new BiquadFilter(ctx.sampleRate, { type: 'highpass', frequencyHz: 80, q })
		);

		return {
			reset() {
				for (const s of stagesL) s.reset();
				for (const s of stagesR) s.reset();
			},
			latencySamples() {
				return 0;
			},
			process(channels: Float32Array[], frameCount: number) {
				const chL = channels[0];
				const chR = channels[1] ?? chL;
				if (!chL) return;

				for (let i = 0; i < frameCount; i++) {
					let sL = chL[i]!;
					let sR = chR![i]!;

					// 24 dB/oct default uses 2 cascaded stages
					sL = stagesL[1]!.step(stagesL[0]!.step(sL));
					sR = stagesR[1]!.step(stagesR[0]!.step(sR));

					chL[i] = sL;
					if (channels[1]) {
						channels[1][i] = sR;
					}
				}
			}
		};
	}
};

audioEffectRegistry.register(lowCutDefinition);
