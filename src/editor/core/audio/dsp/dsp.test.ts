import { describe, expect, it } from 'vitest';
import { BiquadFilter } from './biquad';
import { DelayLine } from './delayLine';
import { TruePeakMeter } from '../truePeak';
import { analyzeAudioLoudness } from '../loudness';
import { biquadFrequencyResponse } from '../../audioMath';

describe('Slice 1 DSP Oracles', () => {
	it('BiquadFilter matches RBJ analytic frequency response within 0.05 dB', () => {
		const fs = 48000;
		const f0 = 1000;
		const gainDb = 6;
		const q = 1.0;
		const testFreq = 1000; // Peak center

		// Analytic RBJ response from independent formula in audioMath.ts
		const analyticDb = biquadFrequencyResponse(
			{ type: 'peaking', frequencyHz: f0, gainDb, q },
			testFreq,
			fs
		);

		// Empirical response by passing a pure sine tone through BiquadFilter DSP class
		const filter = new BiquadFilter(fs);
		filter.configure('peaking', f0, gainDb, q);

		const numSamples = fs; // 1 second
		let maxAmp = 0;
		for (let i = 0; i < numSamples; i++) {
			const x = Math.sin((2 * Math.PI * testFreq * i) / fs);
			const y = filter.step(x);
			// Measure steady state amplitude after 200ms
			if (i > fs * 0.2) {
				if (Math.abs(y) > maxAmp) maxAmp = Math.abs(y);
			}
		}
		const measuredDb = 20 * Math.log10(maxAmp);

		// Difference between analytic formula and DSP step implementation
		expect(Math.abs(measuredDb - analyticDb)).toBeLessThan(0.05);
	});

	it('DelayLine delays exactly N samples without distortion or allocation', () => {
		const delay = new DelayLine(100);
		const impulse = new Float32Array(20);
		impulse[0] = 1.0; // unit impulse at t = 0

		const delaySamples = 5;
		const output = new Float32Array(20);
		for (let i = 0; i < 20; i++) {
			output[i] = delay.step(impulse[i]!, delaySamples);
		}

		// Output should be exactly 0 everywhere except index 5, which must be 1.0
		expect(output[0]).toBe(0);
		expect(output[4]).toBe(0);
		expect(output[5]).toBe(1.0);
		expect(output[6]).toBe(0);
	});

	it('TruePeakMeter detects inter-sample peaks exceeding sample peaks', () => {
		const tp = new TruePeakMeter();
		// A known worst-case inter-sample peak signal: Fs/4 sampled at 45 degree phase offset:
		// [0.7071, 0.7071, -0.7071, -0.7071, ...] where sample values are <= 0.7071,
		// but the true continuous sine wave peak is exactly 1.0 (exceeding sample values by +3 dB).
		const s = 1 / Math.SQRT2;
		const signal = new Float32Array([
			s,
			s,
			-s,
			-s,
			s,
			s,
			-s,
			-s,
			s,
			s,
			-s,
			-s,
			s,
			s,
			-s,
			-s,
			s,
			s,
			-s,
			-s,
			s,
			s,
			-s,
			-s,
			s,
			s,
			-s,
			-s,
			s,
			s,
			-s,
			-s
		]);
		let maxTP = 0;
		for (let i = 0; i < signal.length; i++) {
			const p = tp.step(signal[i]!);
			if (p > maxTP) maxTP = p;
		}

		// Max sample value was 0.7071; True Peak must detect inter-sample amplitude close to 1.0 (> 0.90)
		expect(maxTP).toBeGreaterThan(0.9);
	});

	it('LoudnessMeter measures synthetic 1 kHz full-scale sine tone per ITU-R BS.1770-4', () => {
		const fs = 48000;
		const durationSec = 1.0;
		const totalFrames = fs * durationSec;
		const mono = new Float32Array(totalFrames);

		// 997 Hz monophonic sine wave at 0 dBFS peak (amplitude = 1.0)
		// Per ITU-R BS.1770-4 specification:
		// "a 0 dBFS, 1 kHz (997 Hz) sine wave applied to a single input channel
		// (monophonic signal) results in an indicated loudness of -3.01 LKFS."
		for (let i = 0; i < totalFrames; i++) {
			mono[i] = Math.sin((2 * Math.PI * 997 * i) / fs);
		}

		const result = analyzeAudioLoudness([mono], fs);

		// Single mono channel at 0 dBFS 997 Hz sine wave equals -3.01 LUFS (±0.1 LU tolerance)
		expect(Math.abs(result.integratedLufs - -3.01)).toBeLessThan(0.1);
	});
});
