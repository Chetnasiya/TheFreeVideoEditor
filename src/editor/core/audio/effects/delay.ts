import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP,
	type AudioEffectContext
} from '../effects/registry';
import { DelayLine } from '../dsp/delayLine';
import { BiquadFilter } from '../dsp/biquad';

export const delayDefinition: AudioEffectDefinition = {
	id: 'delay',
	name: 'Stereo Echo / Delay',
	category: 'spatial',
	version: 1,
	paramSchemas: [
		{
			id: 'delayTimeMs',
			name: 'Delay Time',
			type: 'number',
			min: 10,
			max: 1500,
			step: 5,
			default: 350,
			unit: 'ms',
			animatable: true
		},
		{
			id: 'feedback',
			name: 'Feedback',
			type: 'number',
			min: 0,
			max: 0.95,
			step: 0.01,
			default: 0.4,
			unit: '',
			animatable: true
		},
		{
			id: 'pingPong',
			name: 'Ping-Pong',
			type: 'boolean',
			default: false,
			animatable: false
		},
		{
			id: 'dampFreqHz',
			name: 'High Damp',
			type: 'number',
			min: 1000,
			max: 18000,
			step: 100,
			default: 5000,
			unit: 'Hz',
			animatable: true
		},
		{
			id: 'mix',
			name: 'Wet / Dry',
			type: 'number',
			min: 0,
			max: 1,
			step: 0.01,
			default: 0.25,
			unit: '',
			animatable: true
		}
	],
	latencySamples: () => 0,
	createDSP: (ctx: AudioEffectContext, params?: Record<string, unknown>): AudioEffectDSP => {
		const delayMs = typeof params?.delayTimeMs === 'number' ? params.delayTimeMs : 350;
		const rawFeedback = typeof params?.feedback === 'number' ? params.feedback : 0.4;
		const feedback = Math.min(0.95, Math.max(0, rawFeedback > 1 ? rawFeedback / 100 : rawFeedback));
		const rawMix = typeof params?.mix === 'number' ? params.mix : 0.25;
		const wet = Math.min(1, Math.max(0, rawMix > 1 ? rawMix / 100 : rawMix));
		const dry = 1 - wet;
		const dampFreq = typeof params?.dampFreqHz === 'number' ? params.dampFreqHz : 5000;

		const delaySamples = Math.round((delayMs / 1000) * ctx.sampleRate);
		const maxSamples = Math.max(Math.round(2.0 * ctx.sampleRate), delaySamples + 10);
		const dlL = new DelayLine(maxSamples);
		const dlR = new DelayLine(maxSamples);

		const dampL = new BiquadFilter(ctx.sampleRate, {
			type: 'lowpass',
			frequencyHz: dampFreq,
			q: Math.SQRT1_2
		});
		const dampR = new BiquadFilter(ctx.sampleRate, {
			type: 'lowpass',
			frequencyHz: dampFreq,
			q: Math.SQRT1_2
		});

		return {
			reset() {
				dlL.reset();
				dlR.reset();
				dampL.reset();
				dampR.reset();
			},
			latencySamples() {
				return 0;
			},
			process(channels: Float32Array[], frameCount: number) {
				const chL = channels[0];
				const chR = channels[1] ?? chL;
				if (!chL) return;

				const readDelay = Math.max(0, delaySamples - 1);
				for (let i = 0; i < frameCount; i++) {
					const inL = chL[i]!;
					const inR = chR![i]!;

					const delL = dlL.read(readDelay);
					const delR = dlR.read(readDelay);

					const filteredL = dampFreq >= 20000 ? delL : dampL.step(delL);
					const filteredR = dampFreq >= 20000 ? delR : dampR.step(delR);

					dlL.write(inL + filteredL * feedback);
					dlR.write(inR + filteredR * feedback);

					chL[i] = inL * dry + delL * wet;
					if (channels[1]) {
						channels[1][i] = inR * dry + delR * wet;
					}
				}
			}
		};
	}
};

audioEffectRegistry.register(delayDefinition);
