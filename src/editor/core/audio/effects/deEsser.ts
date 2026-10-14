import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP,
	type AudioEffectContext
} from '../effects/registry';
import { BiquadFilter } from '../dsp/biquad';
import { EnvelopeFollower } from '../dsp/dynamics';
import { dbToGain } from '../../audioMath';

export const deEsserDefinition: AudioEffectDefinition = {
	id: 'de-esser',
	name: 'De-Esser',
	category: 'restoration',
	version: 1,
	paramSchemas: [
		{
			id: 'frequencyHz',
			name: 'Target Frequency',
			type: 'number',
			min: 3000,
			max: 10000,
			step: 100,
			default: 6500,
			unit: 'Hz',
			animatable: true
		},
		{
			id: 'thresholdDb',
			name: 'Threshold',
			type: 'number',
			min: -40,
			max: 0,
			step: 0.5,
			default: -22,
			unit: 'dB',
			animatable: true
		},
		{
			id: 'reductionDb',
			name: 'Max Reduction',
			type: 'number',
			min: -24,
			max: 0,
			step: 0.5,
			default: -12,
			unit: 'dB',
			animatable: true
		}
	],
	latencySamples: () => 0,
	createDSP: (ctx: AudioEffectContext): AudioEffectDSP => {
		const sidechainFilterL = new BiquadFilter(ctx.sampleRate, {
			type: 'bandpass',
			frequencyHz: 6500,
			q: 1.5
		});
		const sidechainFilterR = new BiquadFilter(ctx.sampleRate, {
			type: 'bandpass',
			frequencyHz: 6500,
			q: 1.5
		});

		const duckFilterL = new BiquadFilter(ctx.sampleRate, {
			type: 'peaking',
			frequencyHz: 6500,
			q: 2.0,
			gainDb: 0
		});
		const duckFilterR = new BiquadFilter(ctx.sampleRate, {
			type: 'peaking',
			frequencyHz: 6500,
			q: 2.0,
			gainDb: 0
		});

		const envL = new EnvelopeFollower(2, 50, ctx.sampleRate);
		const envR = new EnvelopeFollower(2, 50, ctx.sampleRate);

		return {
			reset() {
				sidechainFilterL.reset();
				sidechainFilterR.reset();
				duckFilterL.reset();
				duckFilterR.reset();
				envL.reset();
				envR.reset();
			},
			latencySamples() {
				return 0;
			},
			process(channels: Float32Array[], frameCount: number) {
				const chL = channels[0];
				const chR = channels[1] ?? chL;
				if (!chL) return;

				const threshLinear = dbToGain(-22);

				for (let i = 0; i < frameCount; i++) {
					const inL = chL[i]!;
					const inR = chR![i]!;

					const scL = Math.abs(sidechainFilterL.step(inL));
					const scR = Math.abs(sidechainFilterR.step(inR));

					const envDetL = envL.step(scL);
					const envDetR = envR.step(scR);

					let cutDbL = 0;
					if (envDetL > threshLinear) {
						cutDbL = Math.max(-12, (20 * Math.log10(envDetL) - -22) * -1.5);
					}
					let cutDbR = 0;
					if (envDetR > threshLinear) {
						cutDbR = Math.max(-12, (20 * Math.log10(envDetR) - -22) * -1.5);
					}

					duckFilterL.configure('peaking', 6500, cutDbL, 2.0);
					duckFilterR.configure('peaking', 6500, cutDbR, 2.0);

					chL[i] = duckFilterL.step(inL);
					if (channels[1]) {
						channels[1][i] = duckFilterR.step(inR);
					}
				}
			}
		};
	}
};

audioEffectRegistry.register(deEsserDefinition);
