import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP,
	type AudioEffectContext
} from '../effects/registry';
import { DelayLine } from '../dsp/delayLine';
import { CompressorCore } from '../dsp/dynamics';
import { TruePeakMeter } from '../truePeak';
import { dbToGain, gainToDb } from '../../audioMath';

const limiterDefinition: AudioEffectDefinition = {
	id: 'limiter',
	name: 'Lookahead Limiter',
	category: 'dynamics',
	version: 1,
	paramSchemas: [
		{
			id: 'ceilingDb',
			name: 'Ceiling',
			type: 'number',
			min: -24,
			max: 0,
			step: 0.1,
			default: -1.0,
			unit: 'dBTP',
			animatable: true
		},
		{
			id: 'releaseMs',
			name: 'Release',
			type: 'number',
			min: 5,
			max: 500,
			step: 1,
			default: 50,
			unit: 'ms',
			animatable: true
		},
		{
			id: 'lookaheadMs',
			name: 'Lookahead',
			type: 'number',
			min: 1,
			max: 20,
			step: 1,
			default: 5,
			unit: 'ms',
			animatable: false
		}
	],
	latencySamples: (params) => {
		const lookaheadMs = typeof params.lookaheadMs === 'number' ? params.lookaheadMs : 5;
		return Math.round((lookaheadMs / 1000) * 48000); // normalized to 48kHz context
	},
	createDSP: (ctx: AudioEffectContext): AudioEffectDSP => {
		const lookaheadSamples = Math.round((5 / 1000) * ctx.sampleRate);
		const delayLines = Array.from({ length: ctx.channels }, () => {
			return new DelayLine(lookaheadSamples + 64);
		});

		const detector = new CompressorCore(ctx.sampleRate, {
			thresholdDb: -1.0,
			ratio: 100, // Hard limiting
			attackMs: 0.5,
			releaseMs: 50,
			kneeDb: 0,
			makeupDb: 0
		});

		const tpMeters = Array.from({ length: ctx.channels }, () => new TruePeakMeter());

		return {
			reset() {
				for (const dl of delayLines) dl.reset();
				detector.reset();
				for (const m of tpMeters) m.reset();
			},
			latencySamples() {
				return lookaheadSamples;
			},
			process(channels: Float32Array[], frameCount: number) {
				const numChannels = channels.length;
				if (numChannels === 0) return;

				for (let i = 0; i < frameCount; i++) {
					// Measure input peak across channels
					let peakVal = 0;
					for (let c = 0; c < numChannels; c++) {
						const s = channels[c]![i]!;
						const abs = Math.abs(s);
						if (abs > peakVal) peakVal = abs;
					}

					// Compute gain reduction in dB and convert to linear
					const peakDb = gainToDb(peakVal);
					const grDb = detector.computeGainReductionDb(peakDb);
					const gainReductionLinear = dbToGain(grDb);

					// Read delayed audio & apply gain reduction
					for (let c = 0; c < numChannels; c++) {
						const inputSample = channels[c]![i]!;
						delayLines[c]!.write(inputSample);
						const delayed = delayLines[c]!.read(lookaheadSamples);

						let outputSample = delayed * gainReductionLinear;

						// Clamp to true peak ceiling
						const ceilingLinear = dbToGain(-1.0);
						if (outputSample > ceilingLinear) outputSample = ceilingLinear;
						else if (outputSample < -ceilingLinear) outputSample = -ceilingLinear;

						channels[c]![i] = outputSample;
						tpMeters[c]?.step(outputSample);
					}
				}
			}
		};
	}
};

audioEffectRegistry.register(limiterDefinition);
