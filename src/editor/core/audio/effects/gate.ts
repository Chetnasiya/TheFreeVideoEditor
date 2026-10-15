import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP,
	type AudioEffectContext
} from '../effects/registry';
import { GateCore } from '../dsp/dynamics';

export const gateDefinition: AudioEffectDefinition = {
	id: 'noise-gate',
	name: 'Noise Gate / Expander',
	category: 'dynamics',
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
			id: 'ratio',
			name: 'Ratio',
			type: 'number',
			min: 1,
			max: 20,
			step: 0.5,
			default: 10,
			unit: ':1',
			animatable: true
		},
		{
			id: 'attackMs',
			name: 'Attack',
			type: 'number',
			min: 0.1,
			max: 50,
			step: 0.1,
			default: 2,
			unit: 'ms',
			animatable: true
		},
		{
			id: 'holdMs',
			name: 'Hold',
			type: 'number',
			min: 0,
			max: 500,
			step: 1,
			default: 20,
			unit: 'ms',
			animatable: true
		},
		{
			id: 'releaseMs',
			name: 'Release',
			type: 'number',
			min: 10,
			max: 1000,
			step: 5,
			default: 100,
			unit: 'ms',
			animatable: true
		},
		{
			id: 'rangeDb',
			name: 'Range',
			type: 'number',
			min: -80,
			max: 0,
			step: 1,
			default: -60,
			unit: 'dB',
			animatable: true
		},
		{
			id: 'hysteresisDb',
			name: 'Hysteresis',
			type: 'number',
			min: 0,
			max: 12,
			step: 0.5,
			default: 3,
			unit: 'dB',
			animatable: true
		}
	],
	latencySamples: () => 0,
	createDSP: (ctx: AudioEffectContext, params: Record<string, unknown>): AudioEffectDSP => {
		const gates = Array.from({ length: ctx.channels }, () => {
			return new GateCore(ctx.sampleRate, {
				thresholdDb: Number(params.thresholdDb ?? -40),
				ratio: Number(params.ratio ?? 10),
				attackMs: Number(params.attackMs ?? 2),
				holdMs: Number(params.holdMs ?? 20),
				releaseMs: Number(params.releaseMs ?? 100),
				rangeDb: Number(params.rangeDb ?? -60),
				hysteresisDb: Number(params.hysteresisDb ?? 3)
			});
		});

		return {
			reset() {
				for (const g of gates) g.reset();
			},
			latencySamples() {
				return 0;
			},
			process(channels: Float32Array[], frameCount: number) {
				const currentParams = {
					thresholdDb: Number(params.thresholdDb ?? -40),
					ratio: Number(params.ratio ?? 10),
					attackMs: Number(params.attackMs ?? 2),
					holdMs: Number(params.holdMs ?? 20),
					releaseMs: Number(params.releaseMs ?? 100),
					rangeDb: Number(params.rangeDb ?? -60),
					hysteresisDb: Number(params.hysteresisDb ?? 3)
				};
				for (let c = 0; c < channels.length; c++) {
					const gate = gates[c];
					const chan = channels[c];
					if (!gate || !chan) continue;
					gate.setParams(currentParams);
					gate.process(chan, frameCount);
				}
			}
		};
	}
};

audioEffectRegistry.register(gateDefinition);
