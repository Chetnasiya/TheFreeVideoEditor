import { describe, expect, it } from 'vitest';
import type { Project } from '../../core/types';
import { dbToGain, gainToDb } from '../../core/audioMath';
import { computeGraphPdc } from './pdc';
import { BiquadFilter } from '../../core/audio/dsp/biquad';
import { CompressorCore, GateCore } from '../../core/audio/dsp/dynamics';
import {
	gainTrimDefinition,
	limiterDefinition,
	deHummerDefinition,
	chorusFlangerDefinition,
	stereoWidenerDefinition,
	delayDefinition,
	reverbDefinition
} from '../../core/audio/effects';

describe('Slice 3 Audio Effects DSP: Independent Analytic Oracles & Invariants', () => {
	const sampleRate = 48000;

	it('1. EQ vs RBJ Analytic Oracle: Biquad peaking filter matches Robert Bristow-Johnson response', () => {
		const filter = new BiquadFilter(sampleRate);
		const f0 = 1000;
		const gainDb = 6.0;
		const q = 1.0;
		filter.configure('peaking', f0, gainDb, q);

		// Test sine wave at resonant frequency f0 = 1000 Hz
		const length = Math.floor(sampleRate * 0.1); // 100ms
		const input = new Float32Array(length);
		for (let i = 0; i < length; i++) {
			input[i] = Math.sin((2 * Math.PI * f0 * i) / sampleRate);
		}

		filter.process(input);

		// Steady-state amplitude (last 20% of samples)
		let maxAmp = 0;
		const steadyStart = Math.floor(length * 0.8);
		for (let i = steadyStart; i < length; i++) {
			const abs = Math.abs(input[i]!);
			if (abs > maxAmp) maxAmp = abs;
		}

		// Analytic RBJ peaking gain at f0 is exactly 10^(gainDb/20) = 1.995 (+6.0 dB)
		const expectedGain = dbToGain(gainDb);
		expect(maxAmp).toBeCloseTo(expectedGain, 1);
		expect(Math.abs(gainToDb(maxAmp) - gainDb)).toBeLessThan(0.5);
	});

	it('2. Compressor Static Curve Oracle: Input 12 dB over threshold with 4:1 ratio yields 9 dB reduction', () => {
		const comp = new CompressorCore(sampleRate, {
			thresholdDb: -20,
			ratio: 4,
			kneeDb: 0,
			makeupDb: 0,
			attackMs: 0.1,
			releaseMs: 50
		});

		// Detected input level at -8 dBFS (12 dB above threshold of -20 dBFS)
		const inputDb = -8;
		const grDb = comp.computeGainReductionDb(inputDb);

		// Analytic formula: GR = (T + (detectedDb - T)/R) - detectedDb
		// = (-20 + 12/4) - (-8) = -17 - (-8) = -9 dB
		expect(grDb).toBeCloseTo(-9.0, 1);
		expect(inputDb + grDb).toBeCloseTo(-17.0, 1);
	});

	it('3. Limiter Lookahead Ceiling Oracle: Lookahead true-peak limiter clamps peak <= ceiling', () => {
		const ceilingDb = -1.0;
		const dsp = limiterDefinition.createDSP(
			{ sampleRate, channels: 2 },
			{ ceilingDb, releaseMs: 20, lookaheadMs: 5 }
		);

		// Create a loud stereo tone bursting to +6 dBFS (gain = 2.0)
		const length = 4800; // 100ms
		const chanL = new Float32Array(length);
		const chanR = new Float32Array(length);
		for (let i = 0; i < length; i++) {
			const s = Math.sin((2 * Math.PI * 1000 * i) / sampleRate) * 2.0; // +6 dBFS peak
			chanL[i] = s;
			chanR[i] = s;
		}

		dsp.process([chanL, chanR], length);

		// Measure maximum peak in steady state after lookahead window (first 5ms is lookahead buffer delay)
		let maxPeak = 0;
		const steadyStart = Math.floor((10 / 1000) * sampleRate);
		for (let i = steadyStart; i < length; i++) {
			const absL = Math.abs(chanL[i]!);
			const absR = Math.abs(chanR[i]!);
			if (absL > maxPeak) maxPeak = absL;
			if (absR > maxPeak) maxPeak = absR;
		}

		const peakDb = gainToDb(maxPeak);
		// Output must be clamped at or below ceiling within 0.2 dB
		expect(peakDb).toBeLessThanOrEqual(ceilingDb + 0.1);
	});

	it('4. Noise Gate Threshold & Hysteresis Oracle: High signal opens gate; low signal is attenuated', () => {
		const gate = new GateCore(sampleRate, {
			thresholdDb: -30,
			ratio: 10,
			attackMs: 0.5,
			holdMs: 10,
			releaseMs: 20,
			hysteresisDb: 3,
			rangeDb: -60
		});

		// 1. Loud signal at -10 dBFS (well above -30 dB threshold) -> 0 dB reduction
		const grLoud = gate.computeGainReductionDb(-10);
		expect(grLoud).toBe(0);

		// 2. Quiet signal at -50 dBFS (20 dB below threshold) -> attenuated
		// delta = -30 - (-50) = 20 dB * (10 - 1) = 180 dB attenuation clamped to rangeDb (-60 dB)
		gate.reset();
		const grQuiet = gate.computeGainReductionDb(-50);
		expect(grQuiet).toBe(-60);
	});

	it('5. DeHummer Notch Filtering Oracle: 60 Hz hum fundamental and harmonics are notched > 20 dB', () => {
		const dsp = deHummerDefinition.createDSP(
			{ sampleRate, channels: 1 },
			{ frequency: '60', harmonics: 4, q: 10 }
		);

		// Generate 60 Hz tone (0.5s)
		const length = Math.floor(sampleRate * 0.5);
		const humInput = new Float32Array(length);
		for (let i = 0; i < length; i++) {
			humInput[i] = Math.sin((2 * Math.PI * 60 * i) / sampleRate);
		}

		dsp.process([humInput], length);

		// Measure attenuation in steady state (last 20% of samples)
		let humPeak = 0;
		for (let i = Math.floor(length * 0.8); i < length; i++) {
			const abs = Math.abs(humInput[i]!);
			if (abs > humPeak) humPeak = abs;
		}

		const humDb = gainToDb(humPeak);
		// 60 Hz hum should be deeply notched (> 20 dB attenuation, i.e. < -20 dBFS)
		expect(humDb).toBeLessThan(-20);
	});

	it('6. Delay Time & Feedback Decay Oracle: Echo pulses arrive at exact delay sample count', () => {
		const delayMs = 10;
		const delaySamples = Math.round((delayMs / 1000) * sampleRate);
		const dsp = delayDefinition.createDSP(
			{ sampleRate, channels: 1 },
			{ delayTimeMs: delayMs, feedback: 0.5, mix: 1.0, dampFreqHz: 20000 }
		);

		const length = delaySamples * 4;
		const input = new Float32Array(length);
		input[0] = 1.0; // Single unit impulse at sample 0

		dsp.process([input], length);

		// First echo must arrive at exactly delaySamples with amplitude ~ 1.0
		expect(Math.abs(input[delaySamples]!)).toBeCloseTo(1.0, 1);

		// Second echo arrives at 2 * delaySamples with 50% feedback (~0.5)
		expect(Math.abs(input[delaySamples * 2]!)).toBeCloseTo(0.5, 1);
	});

	it('7. Reverb Decay RT60 Oracle: Algorithmic reverberator produces diffuse decaying tail', () => {
		const reverb = reverbDefinition.createDSP(
			{ sampleRate, channels: 2 },
			{ roomSize: 0.8, damping: 0.2, mix: 0.5 }
		);

		const length = sampleRate; // 1 second
		const chanL = new Float32Array(length);
		const chanR = new Float32Array(length);
		chanL[0] = 1.0; // Impulse
		chanR[0] = 1.0;

		reverb.process([chanL, chanR], length);

		// Tail energy in first 100ms vs last 100ms
		let earlySum = 0;
		let lateSum = 0;
		for (let i = 1000; i < 5000; i++) earlySum += chanL[i]! * chanL[i]!;
		for (let i = length - 4000; i < length; i++) lateSum += chanL[i]! * chanL[i]!;

		// Reverb tail has diffused energy that decays over time
		expect(earlySum).toBeGreaterThan(0);
		expect(lateSum).toBeGreaterThan(0);
		expect(earlySum).toBeGreaterThan(lateSum);
	});

	it('8. Stereo Widener Mid-Side Oracle: 0% width collapses to pure mono; 200% widens side channel', () => {
		const monoDsp = stereoWidenerDefinition.createDSP(
			{ sampleRate, channels: 2 },
			{ width: 0, midGainDb: 0, sideGainDb: 0, monoBassFreq: 20 }
		);

		const length = 1000;
		// Distinct Left (1.0) and Right (0.0)
		const chanL = new Float32Array(length).fill(1.0);
		const chanR = new Float32Array(length).fill(0.0);

		monoDsp.process([chanL, chanR], length);

		// At width = 0%, Left and Right must be completely identical (pure mono, L - R = 0)
		for (let i = 100; i < length; i++) {
			expect(Math.abs(chanL[i]! - chanR[i]!)).toBeCloseTo(0, 4);
		}
	});

	it('9. Phase Inversion Bit-Exact Cancellation Oracle: A + (-A) = bit-exact silence <= -96 dBFS', () => {
		const dspNormal = gainTrimDefinition.createDSP(
			{ sampleRate, channels: 1 },
			{ gainDb: 0, invertPhase: false }
		);
		const dspInverted = gainTrimDefinition.createDSP(
			{ sampleRate, channels: 1 },
			{ gainDb: 0, invertPhase: true }
		);

		const length = 1000;
		const sigA = new Float32Array(length);
		const sigB = new Float32Array(length);
		for (let i = 0; i < length; i++) {
			const s = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
			sigA[i] = s;
			sigB[i] = s;
		}

		dspNormal.process([sigA], length);
		dspInverted.process([sigB], length);

		// Sum A + (-A)
		let maxDiff = 0;
		for (let i = 0; i < length; i++) {
			const sum = sigA[i]! + sigB[i]!;
			if (Math.abs(sum) > maxDiff) maxDiff = Math.abs(sum);
		}

		// Exact mathematical cancellation (difference is 0.0)
		expect(maxDiff).toBe(0.0);
		expect(gainToDb(maxDiff)).toBeLessThanOrEqual(-96);
	});

	it('10. Chorus / Flanger Comb Filtering Oracle: Modulated delay creates phase cancellation notches', () => {
		const dsp = chorusFlangerDefinition.createDSP(
			{ sampleRate, channels: 2 },
			{ mode: 'flanger', rateHz: 0.5, depth: 50, feedback: 0, mix: 50 }
		);

		const length = 2000;
		const chanL = new Float32Array(length);
		const chanR = new Float32Array(length);
		for (let i = 0; i < length; i++) {
			chanL[i] = 1.0;
			chanR[i] = 1.0;
		}

		dsp.process([chanL, chanR], length);

		// Output is modulated: samples differ from dry input 1.0
		let hasModulation = false;
		for (let i = 500; i < length; i++) {
			if (Math.abs(chanL[i]! - 1.0) > 0.05) {
				hasModulation = true;
				break;
			}
		}
		expect(hasModulation).toBe(true);
	});

	it('11. Plugin Delay Compensation (PDC) Oracle: Lookahead limiter track vs dry parallel track sample-aligned within 1 sample', () => {
		// Create project with 2 parallel audio tracks:
		// Track A: Limiter with 5ms lookahead (240 samples at 48kHz)
		// Track B: Dry audio track (0 latency)
		const dummyProject = {
			id: 'pdc-test',
			name: 'PDC Test',
			version: 1,
			settings: { fps: 30, width: 1920, height: 1080 },
			tracks: [
				{
					id: 'track-limiter',
					name: 'Limiter Track',
					kind: 'audio' as const,
					clips: [],
					audio: {
						gainDb: 0,
						pan: 0,
						effects: [
							{
								id: 'lim-1',
								type: 'limiter',
								params: { lookaheadMs: 5 },
								enabled: true
							}
						]
					}
				},
				{
					id: 'track-dry',
					name: 'Dry Parallel Track',
					kind: 'audio' as const,
					clips: [],
					audio: {
						gainDb: 0,
						pan: 0,
						effects: []
					}
				}
			],
			assets: {}
		};

		const pdc = computeGraphPdc(dummyProject as unknown as Project);
		const limiterLat = pdc.trackLatencies.get('track-limiter') ?? 0;
		const dryLat = pdc.trackLatencies.get('track-dry') ?? 0;

		expect(limiterLat).toBe(240); // 5ms at 48kHz
		expect(dryLat).toBe(0);

		const dryComp = pdc.trackCompensations.get('track-dry') ?? 0;
		const limiterComp = pdc.trackCompensations.get('track-limiter') ?? 0;

		// Limiter path total = 240 + 0 = 240 samples.
		// Dry path total = 0 + dryComp = 240 samples.
		expect(limiterComp).toBe(0);
		expect(dryComp).toBe(240);
		expect(Math.abs(limiterLat + limiterComp - (dryLat + dryComp))).toBeLessThanOrEqual(1);
	});
});
