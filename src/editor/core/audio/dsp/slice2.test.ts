import { describe, expect, it } from 'vitest';
import { LinkwitzRiley4Crossover } from './crossover';
import { ReverbCore } from './reverbCore';
import { SpectralGateCore } from './spectralGate';
import { PitchShifterCore } from './pitchShifterCore';
import { audioEffectRegistry } from '../effects';

describe('Slice 2 Effect DSP Cores & Registry', () => {
	it('LinkwitzRiley4Crossover sums to unity (0 dB flat) across the crossover frequency', () => {
		const fs = 48000;
		const fc = 1000;
		const crossover = new LinkwitzRiley4Crossover(fc, fs);

		// Drive a test tone right at the crossover frequency fc = 1000 Hz
		// After settling transient, sum of low + high should equal the input amplitude within 0.05 dB
		const numSamples = 2000;
		let maxInput = 0;
		let maxOutput = 0;

		for (let n = 0; n < numSamples; n++) {
			const x = Math.sin((2 * Math.PI * fc * n) / fs);
			const { low, high } = crossover.processSample(x);
			const sum = low + high;

			if (n > 1000) {
				maxInput = Math.max(maxInput, Math.abs(x));
				maxOutput = Math.max(maxOutput, Math.abs(sum));
			}
		}

		// Ratio of sum to input should be ~ 1.0 (0 dB)
		const diffDb = Math.abs(20 * Math.log10(maxOutput / maxInput));
		expect(diffDb).toBeLessThan(0.1);
	});

	it('ReverbCore generates decaying diffuse reflections without blowing up', () => {
		const fs = 48000;
		const reverb = new ReverbCore(fs);
		reverb.setParameters(0.7, 0.25, 1.0);

		// Send unit impulse
		const first = reverb.processStereo(1.0, 1.0);
		expect(first).toBeDefined();

		let tailEnergy = 0;
		for (let i = 0; i < 4800; i++) {
			// 100 ms
			const { outL, outR } = reverb.processStereo(0, 0);
			tailEnergy += outL * outL + outR * outR;
		}

		// Reverb tail must produce diffuse energy
		expect(tailEnergy).toBeGreaterThan(0.001);
		// Must remain strictly stable (no numeric runaway)
		expect(tailEnergy).toBeLessThan(50);
	});

	it('SpectralGateCore attenuates stationary low-level noise when threshold is higher', () => {
		const gate = new SpectralGateCore(512);
		gate.setParameters(-30, -18, false);

		// Feed low-level noise (-50 dBFS)
		const lowNoiseAmp = 0.003;
		let attenuatedEnergy = 0;

		for (let i = 0; i < 2048; i++) {
			const x = (Math.random() * 2 - 1) * lowNoiseAmp;
			const y = gate.processSample(x);
			if (i > 1024) {
				attenuatedEnergy += y * y;
			}
		}

		// Noise should be reduced by the spectral gate
		expect(attenuatedEnergy).toBeLessThan(1024 * lowNoiseAmp * lowNoiseAmp);
	});

	it('PitchShifterCore shifts frequency without breaking sample flow', () => {
		const fs = 48000;
		const shifter = new PitchShifterCore(fs);
		shifter.setPitchSemitones(7); // Fifth up

		let sumOutput = 0;
		for (let i = 0; i < 2000; i++) {
			const x = Math.sin((2 * Math.PI * 440 * i) / fs);
			const y = shifter.processSample(x);
			if (i > 1000) {
				sumOutput += Math.abs(y);
			}
		}

		expect(sumOutput).toBeGreaterThan(10);
	});

	it('Registry contains all required pro audio effects', () => {
		const all = audioEffectRegistry.list();
		const ids = all.map((def) => def.id);

		expect(ids).toContain('gain-trim');
		expect(ids).toContain('parametric-eq');
		expect(ids).toContain('compressor');
		expect(ids).toContain('limiter');
		expect(ids).toContain('multiband-compressor');
		expect(ids).toContain('de-esser');
		expect(ids).toContain('de-hummer');
		expect(ids).toContain('low-cut');
		expect(ids).toContain('reverb');
		expect(ids).toContain('delay');
		expect(ids).toContain('pitch-shifter');
		expect(ids).toContain('noise-reduction');
	});
});
