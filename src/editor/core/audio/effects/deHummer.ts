import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP,
	type AudioEffectContext
} from '../effects/registry';
import { BiquadFilter } from '../dsp/biquad';

export const deHummerDefinition: AudioEffectDefinition = {
	id: 'de-hummer',
	name: 'DeHummer',
	category: 'restoration',
	version: 1,
	paramSchemas: [
		{
			id: 'baseFrequencyHz',
			name: 'Base Frequency',
			type: 'enum',
			default: '60',
			options: [
				{ label: '50 Hz (Europe / Asia)', value: '50' },
				{ label: '60 Hz (US / Americas)', value: '60' }
			]
		},
		{
			id: 'harmonicsCount',
			name: 'Harmonics',
			type: 'number',
			min: 1,
			max: 8,
			step: 1,
			default: 4,
			animatable: false
		},
		{
			id: 'reductionDb',
			name: 'Reduction',
			type: 'number',
			min: -40,
			max: -6,
			step: 1,
			default: -24,
			unit: 'dB',
			animatable: true
		}
	],
	latencySamples: () => 0,
	createDSP: (ctx: AudioEffectContext, params?: Record<string, unknown>): AudioEffectDSP => {
		const baseFreq = params?.baseFrequencyHz === '50' || params?.frequency === '50' ? 50 : 60;
		const maxHarmonics =
			typeof params?.harmonics === 'number'
				? params.harmonics
				: typeof params?.harmonicsCount === 'number'
					? params.harmonicsCount
					: 4;
		const q = typeof params?.q === 'number' ? params.q : 10.0;
		const notchesL: BiquadFilter[] = [];
		const notchesR: BiquadFilter[] = [];

		for (let h = 1; h <= maxHarmonics; h++) {
			const freq = baseFreq * h;
			if (freq < ctx.sampleRate / 2) {
				notchesL.push(
					new BiquadFilter(ctx.sampleRate, {
						type: 'notch',
						frequencyHz: freq,
						q
					})
				);
				notchesR.push(
					new BiquadFilter(ctx.sampleRate, {
						type: 'notch',
						frequencyHz: freq,
						q
					})
				);
			}
		}

		return {
			reset() {
				for (const f of notchesL) f.reset();
				for (const f of notchesR) f.reset();
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

					for (let n = 0; n < notchesL.length; n++) {
						sL = notchesL[n]!.step(sL);
						sR = notchesR[n]!.step(sR);
					}

					chL[i] = sL;
					if (channels[1]) {
						channels[1][i] = sR;
					}
				}
			}
		};
	}
};

audioEffectRegistry.register(deHummerDefinition);
