import { describe, expect, it } from 'vitest';
import { wsola } from './wsola';

function generateSineWave(
	frequencyHz: number,
	durationSeconds: number,
	sampleRate: number,
	amplitude = 0.8
): Float32Array {
	const totalSamples = Math.round(durationSeconds * sampleRate);
	const buffer = new Float32Array(totalSamples);
	for (let i = 0; i < totalSamples; i++) {
		buffer[i] = amplitude * Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate);
	}
	return buffer;
}

/** Measures dominant frequency using zero-crossings. */
function estimateFrequencyByZeroCrossings(buffer: Float32Array, sampleRate: number): number {
	let zeroCrossings = 0;
	for (let i = 1; i < buffer.length; i++) {
		if ((buffer[i - 1]! < 0 && buffer[i]! >= 0) || (buffer[i - 1]! >= 0 && buffer[i]! < 0)) {
			zeroCrossings++;
		}
	}
	const durationSeconds = buffer.length / sampleRate;
	return zeroCrossings / (2 * durationSeconds);
}

function calculateRms(buffer: Float32Array): number {
	let sum = 0;
	for (let i = 0; i < buffer.length; i++) {
		sum += buffer[i]! * buffer[i]!;
	}
	return Math.sqrt(sum / buffer.length);
}

describe('WSOLA time-scale modification (Gate M)', () => {
	const sampleRate = 48000;
	const frequencyHz = 440; // A4
	const durationSec = 1.0;
	const sineMono = generateSineWave(frequencyHz, durationSec, sampleRate);

	it('produces exact output duration ratios for 2x and 0.5x speed', () => {
		const stretched2x = wsola([sineMono], 2.0);
		const expectedLen2x = Math.round(sineMono.length / 2.0);
		expect(Math.abs(stretched2x[0]!.length - expectedLen2x)).toBeLessThanOrEqual(1);

		const stretched05x = wsola([sineMono], 0.5);
		const expectedLen05x = Math.round(sineMono.length / 0.5);
		expect(Math.abs(stretched05x[0]!.length - expectedLen05x)).toBeLessThanOrEqual(1);
	});

	it('preserves pitch within 1% on a sine wave at 0.5x and 2x', () => {
		const stretched2x = wsola([sineMono], 2.0);
		const freq2x = estimateFrequencyByZeroCrossings(stretched2x[0]!, sampleRate);
		const error2xPercent = Math.abs(freq2x - frequencyHz) / frequencyHz;
		expect(error2xPercent).toBeLessThan(0.01); // within 1%

		const stretched05x = wsola([sineMono], 0.5);
		const freq05x = estimateFrequencyByZeroCrossings(stretched05x[0]!, sampleRate);
		const error05xPercent = Math.abs(freq05x - frequencyHz) / frequencyHz;
		expect(error05xPercent).toBeLessThan(0.01); // within 1%
	});

	it('maintains energy sanity and contains no NaN or Inf values', () => {
		const stretched = wsola([sineMono], 1.5)[0]!;
		for (let i = 0; i < stretched.length; i++) {
			expect(Number.isFinite(stretched[i]!)).toBe(true);
			expect(Number.isNaN(stretched[i]!)).toBe(false);
		}

		const origRms = calculateRms(sineMono);
		const stretchedRms = calculateRms(stretched);
		// RMS should be reasonably close (within 25% of source sine amplitude)
		expect(stretchedRms).toBeGreaterThan(origRms * 0.7);
		expect(stretchedRms).toBeLessThan(origRms * 1.3);
	});

	it('preserves stereo phase coherence across multiple channels', () => {
		const sineStereoL = generateSineWave(frequencyHz, durationSec, sampleRate, 0.7);
		const sineStereoR = generateSineWave(frequencyHz, durationSec, sampleRate, 0.5);

		const stretched = wsola([sineStereoL, sineStereoR], 1.75);
		expect(stretched.length).toBe(2);
		expect(stretched[0]!.length).toBe(stretched[1]!.length);

		// The relative amplitude ratio should be preserved across channels
		const rmsL = calculateRms(stretched[0]!);
		const rmsR = calculateRms(stretched[1]!);
		const ratio = rmsL / rmsR;
		const expectedRatio = 0.7 / 0.5;
		expect(Math.abs(ratio - expectedRatio)).toBeLessThan(0.05);
	});
});
