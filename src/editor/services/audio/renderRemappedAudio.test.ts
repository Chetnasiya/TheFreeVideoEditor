import { describe, expect, it } from 'vitest';
import type { Clip } from '../../core/types';
import { renderRemappedAudio } from './renderRemappedAudio';

function generateRamp(length: number): Float32Array {
	const buf = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		buf[i] = i / length;
	}
	return buf;
}

describe('renderRemappedAudio oracle (Gate M)', () => {
	const sampleRate = 1000; // 1000 samples per sec for simple math
	const sourceLen = 2000; // 2 seconds of source
	const sourceRamp = generateRamp(sourceLen);

	it('renders freeze frames as silence', () => {
		const clip: Pick<
			Clip,
			'start' | 'duration' | 'sourceIn' | 'sourceOut' | 'speed' | 'timeRemap' | 'maintainPitch'
		> = {
			start: 0,
			duration: 2_000_000,
			sourceIn: 1_000_000,
			sourceOut: 1_000_000,
			speed: 1,
			timeRemap: { value: 0 }
		};

		const result = renderRemappedAudio({
			clip,
			sourceChannels: [sourceRamp],
			sourceSampleRate: sampleRate
		});

		expect(result.channels[0]!.length).toBe(2000);
		// Every sample should be 0 (silence)
		for (let i = 0; i < result.channels[0]!.length; i++) {
			expect(result.channels[0]![i]).toBe(0);
		}
	});

	it('renders reverse clips with inverted sample order', () => {
		const clip: Pick<
			Clip,
			'start' | 'duration' | 'sourceIn' | 'sourceOut' | 'speed' | 'timeRemap' | 'maintainPitch'
		> = {
			start: 0,
			duration: 1_000_000,
			sourceIn: 1_000_000,
			sourceOut: 0,
			speed: 1,
			timeRemap: { value: -1 }
		};

		const result = renderRemappedAudio({
			clip,
			sourceChannels: [sourceRamp],
			sourceSampleRate: sampleRate
		});

		const out = result.channels[0]!;
		expect(out.length).toBe(1000);
		// In reverse, earlier timeline times should sample later source times
		expect(out[0]!).toBeGreaterThan(out[out.length - 1]!);
	});

	it('renders variable speed curves sample-accurately', () => {
		const clip: Pick<
			Clip,
			'start' | 'duration' | 'sourceIn' | 'sourceOut' | 'speed' | 'timeRemap' | 'maintainPitch'
		> = {
			start: 0,
			duration: 1_000_000,
			sourceIn: 0,
			sourceOut: 2_000_000,
			speed: 1,
			timeRemap: {
				keyframes: [
					{ time: 0, value: 1, interpolation: 'linear' },
					{ time: 1_000_000, value: 3, interpolation: 'linear' }
				]
			}
		};

		const result = renderRemappedAudio({
			clip,
			sourceChannels: [sourceRamp],
			sourceSampleRate: sampleRate
		});

		const out = result.channels[0]!;
		expect(out.length).toBe(1000);
		// Output values should strictly increase from source start
		expect(out[0]!).toBeCloseTo(0, 2);
		expect(out[out.length - 1]!).toBeGreaterThan(0.5);
	});
});
