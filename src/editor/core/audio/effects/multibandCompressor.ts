import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP,
	type AudioEffectContext
} from '../effects/registry';
import { LinkwitzRiley4Crossover } from '../dsp/crossover';
import { CompressorCore } from '../dsp/dynamics';
import { dbToGain, gainToDb } from '../../audioMath';

const multibandCompressorDefinition: AudioEffectDefinition = {
	id: 'multiband-compressor',
	name: 'Multiband Compressor',
	category: 'dynamics',
	version: 1,
	paramSchemas: [
		{
			id: 'lowCrossoverHz',
			name: 'Low Crossover',
			type: 'number',
			min: 40,
			max: 1000,
			step: 10,
			default: 250,
			unit: 'Hz',
			animatable: false
		},
		{
			id: 'highCrossoverHz',
			name: 'High Crossover',
			type: 'number',
			min: 1000,
			max: 12000,
			step: 50,
			default: 4000,
			unit: 'Hz',
			animatable: false
		},
		// Band 1 (Low)
		{
			id: 'lowThresholdDb',
			name: 'Low Threshold',
			type: 'number',
			min: -60,
			max: 0,
			step: 0.5,
			default: -20,
			unit: 'dB',
			animatable: true
		},
		{
			id: 'lowRatio',
			name: 'Low Ratio',
			type: 'number',
			min: 1,
			max: 20,
			step: 0.1,
			default: 3,
			unit: ':1',
			animatable: true
		},
		{
			id: 'lowGainDb',
			name: 'Low Gain',
			type: 'number',
			min: -24,
			max: 24,
			step: 0.5,
			default: 0,
			unit: 'dB',
			animatable: true
		},
		// Band 2 (Mid)
		{
			id: 'midThresholdDb',
			name: 'Mid Threshold',
			type: 'number',
			min: -60,
			max: 0,
			step: 0.5,
			default: -18,
			unit: 'dB',
			animatable: true
		},
		{
			id: 'midRatio',
			name: 'Mid Ratio',
			type: 'number',
			min: 1,
			max: 20,
			step: 0.1,
			default: 2.5,
			unit: ':1',
			animatable: true
		},
		{
			id: 'midGainDb',
			name: 'Mid Gain',
			type: 'number',
			min: -24,
			max: 24,
			step: 0.5,
			default: 0,
			unit: 'dB',
			animatable: true
		},
		// Band 3 (High)
		{
			id: 'highThresholdDb',
			name: 'High Threshold',
			type: 'number',
			min: -60,
			max: 0,
			step: 0.5,
			default: -24,
			unit: 'dB',
			animatable: true
		},
		{
			id: 'highRatio',
			name: 'High Ratio',
			type: 'number',
			min: 1,
			max: 20,
			step: 0.1,
			default: 4,
			unit: ':1',
			animatable: true
		},
		{
			id: 'highGainDb',
			name: 'High Gain',
			type: 'number',
			min: -24,
			max: 24,
			step: 0.5,
			default: 0,
			unit: 'dB',
			animatable: true
		}
	],
	latencySamples: () => 0,
	createDSP: (ctx: AudioEffectContext): AudioEffectDSP => {
		const crossoversL = {
			low: new LinkwitzRiley4Crossover(250, ctx.sampleRate),
			high: new LinkwitzRiley4Crossover(4000, ctx.sampleRate)
		};
		const crossoversR = {
			low: new LinkwitzRiley4Crossover(250, ctx.sampleRate),
			high: new LinkwitzRiley4Crossover(4000, ctx.sampleRate)
		};

		const compLow = new CompressorCore(ctx.sampleRate, {
			thresholdDb: -20,
			ratio: 3,
			attackMs: 20,
			releaseMs: 200,
			kneeDb: 6,
			makeupDb: 0
		});
		const compMid = new CompressorCore(ctx.sampleRate, {
			thresholdDb: -18,
			ratio: 2.5,
			attackMs: 15,
			releaseMs: 150,
			kneeDb: 6,
			makeupDb: 0
		});
		const compHigh = new CompressorCore(ctx.sampleRate, {
			thresholdDb: -24,
			ratio: 4,
			attackMs: 10,
			releaseMs: 100,
			kneeDb: 6,
			makeupDb: 0
		});

		return {
			reset() {
				crossoversL.low.reset();
				crossoversL.high.reset();
				crossoversR.low.reset();
				crossoversR.high.reset();
				compLow.reset();
				compMid.reset();
				compHigh.reset();
			},
			latencySamples() {
				return 0; // IIR crossover phase without lookahead
			},
			process(channels: Float32Array[], frameCount: number) {
				const chL = channels[0];
				const chR = channels[1] ?? chL;
				if (!chL) return;

				for (let i = 0; i < frameCount; i++) {
					const inL = chL[i]!;
					const inR = chR![i]!;

					// Split into 3 bands: Low, Mid, High
					const splitL1 = crossoversL.low.processSample(inL);
					const bandLowL = splitL1.low;
					const splitL2 = crossoversL.high.processSample(splitL1.high);
					const bandMidL = splitL2.low;
					const bandHighL = splitL2.high;

					const splitR1 = crossoversR.low.processSample(inR);
					const bandLowR = splitR1.low;
					const splitR2 = crossoversR.high.processSample(splitR1.high);
					const bandMidR = splitR2.low;
					const bandHighR = splitR2.high;

					// Process dynamics
					const peakLowDb = gainToDb(Math.max(Math.abs(bandLowL), Math.abs(bandLowR)));
					const peakMidDb = gainToDb(Math.max(Math.abs(bandMidL), Math.abs(bandMidR)));
					const peakHighDb = gainToDb(Math.max(Math.abs(bandHighL), Math.abs(bandHighR)));

					const gainLow = dbToGain(compLow.computeGainReductionDb(peakLowDb));
					const gainMid = dbToGain(compMid.computeGainReductionDb(peakMidDb));
					const gainHigh = dbToGain(compHigh.computeGainReductionDb(peakHighDb));

					const outL = bandLowL * gainLow + bandMidL * gainMid + bandHighL * gainHigh;
					const outR = bandLowR * gainLow + bandMidR * gainMid + bandHighR * gainHigh;

					chL[i] = outL;
					if (channels[1]) {
						channels[1][i] = outR;
					}
				}
			}
		};
	}
};

audioEffectRegistry.register(multibandCompressorDefinition);
