import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP,
	type AudioEffectContext
} from '../effects/registry';
import { BiquadFilter } from '../dsp/biquad';
import { dbToGain } from '../../audioMath';

export const stereoWidenerDefinition: AudioEffectDefinition = {
	id: 'stereo-widener',
	name: 'Stereo Widener / Mid-Side',
	category: 'spatial',
	version: 1,
	paramSchemas: [
		{
			id: 'width',
			name: 'Width',
			type: 'number',
			min: 0,
			max: 200,
			step: 1,
			default: 120,
			unit: '%',
			animatable: true
		},
		{
			id: 'midGainDb',
			name: 'Mid Gain',
			type: 'number',
			min: -12,
			max: 12,
			step: 0.5,
			default: 0,
			unit: 'dB',
			animatable: true
		},
		{
			id: 'sideGainDb',
			name: 'Side Gain',
			type: 'number',
			min: -12,
			max: 12,
			step: 0.5,
			default: 0,
			unit: 'dB',
			animatable: true
		},
		{
			id: 'monoBassFreq',
			name: 'Mono Bass Cutoff',
			type: 'number',
			min: 20,
			max: 300,
			step: 5,
			default: 120,
			unit: 'Hz',
			animatable: true
		}
	],
	latencySamples: () => 0,
	createDSP: (ctx: AudioEffectContext, params: Record<string, unknown>): AudioEffectDSP => {
		// Highpass filter applied to side channel to preserve mono bass
		const sideHighPass = new BiquadFilter(ctx.sampleRate);
		const monoCutoff = Number(params.monoBassFreq ?? 120);
		sideHighPass.configure('highpass', monoCutoff, 0, 0.7071);

		return {
			reset() {
				sideHighPass.reset();
			},
			latencySamples() {
				return 0;
			},
			process(channels: Float32Array[], frameCount: number) {
				if (channels.length < 2) return; // Stereo only

				const left = channels[0]!;
				const right = channels[1]!;

				const widthFactor = Math.max(0, Math.min(2.0, Number(params.width ?? 120) / 100));
				const midGain = dbToGain(Number(params.midGainDb ?? 0));
				const sideGain = dbToGain(Number(params.sideGainDb ?? 0)) * widthFactor;
				const monoCut = Number(params.monoBassFreq ?? 120);
				sideHighPass.configure('highpass', monoCut, 0, 0.7071);

				const INV_SQRT2 = 0.7071067811865475;

				for (let i = 0; i < frameCount; i++) {
					const l = left[i]!;
					const r = right[i]!;

					// Mid / Side decomposition (energy-normalized)
					const mid = (l + r) * INV_SQRT2 * midGain;
					let side = (l - r) * INV_SQRT2 * sideGain;

					// Filter out sub-bass from side channel to center low end
					side = sideHighPass.step(side);

					// Reconstruct Stereo Left / Right
					left[i] = (mid + side) * INV_SQRT2;
					right[i] = (mid - side) * INV_SQRT2;
				}
			}
		};
	}
};

audioEffectRegistry.register(stereoWidenerDefinition);
