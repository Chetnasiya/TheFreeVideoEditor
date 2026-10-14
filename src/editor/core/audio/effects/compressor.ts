import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP,
	type AudioEffectContext
} from '../effects/registry';
import { CompressorCore } from '../dsp/dynamics';

export const compressorDefinition: AudioEffectDefinition = {
	id: 'compressor',
	name: 'Compressor',
	category: 'dynamics',
	version: 1,
	paramSchemas: [
		{
			id: 'thresholdDb',
			name: 'Threshold',
			type: 'number',
			min: -60,
			max: 0,
			step: 0.5,
			default: -24,
			unit: 'dB',
			animatable: true
		},
		{
			id: 'ratio',
			name: 'Ratio',
			type: 'number',
			min: 1,
			max: 20,
			step: 0.1,
			default: 4,
			unit: ':1',
			animatable: true
		},
		{
			id: 'attackMs',
			name: 'Attack',
			type: 'number',
			min: 0.1,
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
			min: 5,
			max: 2000,
			step: 5,
			default: 250,
			unit: 'ms',
			animatable: true
		},
		{
			id: 'kneeDb',
			name: 'Knee',
			type: 'number',
			min: 0,
			max: 12,
			step: 0.5,
			default: 6,
			unit: 'dB',
			animatable: true
		},
		{
			id: 'makeupDb',
			name: 'Makeup',
			type: 'number',
			min: 0,
			max: 24,
			step: 0.5,
			default: 0,
			unit: 'dB',
			animatable: true
		}
	],
	latencySamples: () => 0,
	createDSP: (ctx: AudioEffectContext, params: Record<string, unknown>): AudioEffectDSP => {
		const cores: CompressorCore[] = [];
		for (let c = 0; c < ctx.channels; c++) {
			cores.push(
				new CompressorCore(ctx.sampleRate, {
					thresholdDb: Number(params.thresholdDb ?? -24),
					ratio: Number(params.ratio ?? 4),
					attackMs: Number(params.attackMs ?? 20),
					releaseMs: Number(params.releaseMs ?? 250),
					kneeDb: Number(params.kneeDb ?? 6),
					makeupDb: Number(params.makeupDb ?? 0)
				})
			);
		}

		return {
			reset: () => {
				for (const c of cores) c.reset();
			},
			latencySamples: () => 0,
			process: (channels: Float32Array[], frameCount: number) => {
				for (const c of cores) {
					c.setParams({
						thresholdDb: Number(params.thresholdDb ?? -24),
						ratio: Number(params.ratio ?? 4),
						attackMs: Number(params.attackMs ?? 20),
						releaseMs: Number(params.releaseMs ?? 250),
						kneeDb: Number(params.kneeDb ?? 6),
						makeupDb: Number(params.makeupDb ?? 0)
					});
				}
				for (let c = 0; c < Math.min(channels.length, cores.length); c++) {
					cores[c]!.process(channels[c]!, frameCount);
				}
			}
		};
	}
};

audioEffectRegistry.register(compressorDefinition);
