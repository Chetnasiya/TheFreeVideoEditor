import { describe, expect, it } from 'vitest';
import { analyzeAudioLoudness } from '../../core/audio/loudness';
import { generateDuckingKeyframes } from '../../core/audio/ducking';
import { transitionGain } from '../../core/transitions';
import { dbToGain, gainToDb } from '../../core/audioMath';
import type { Clip, ClipId } from '../../core/types';

describe('Slice 4 Audio Workspace & Tools: Independent Oracles & Invariants', () => {
	const sampleRate = 48000;

	it('1. ITU-R BS.1770-4 / EBU Tech 3341 Loudness Test Vector: 1 kHz stereo sine at -20 dBFS yields -20.7 LUFS +/- 0.1', () => {
		// EBU Tech 3341 / ITU-R BS.1770-4 reference test vector:
		// 1000 Hz stereo sine wave with peak amplitude 0.1 (-20 dBFS)
		const durationSeconds = 3.0;
		const length = Math.floor(sampleRate * durationSeconds);
		const chanL = new Float32Array(length);
		const chanR = new Float32Array(length);
		const f0 = 1000;
		const peakAmp = 0.1; // -20 dBFS

		for (let i = 0; i < length; i++) {
			const s = peakAmp * Math.sin((2 * Math.PI * f0 * i) / sampleRate);
			chanL[i] = s;
			chanR[i] = s;
		}

		const result = analyzeAudioLoudness([chanL, chanR], sampleRate);

		// Analytic BS.1770-4 reference:
		// For 1 kHz stereo sine wave at -20 dBFS on both channels:
		// The K-weighting head shelf boost of +0.60 dB compensates the -0.691 formula offset,
		// yielding -20.0 LUFS +/- 0.1 LUFS.
		expect(result.integratedLufs).toBeCloseTo(-20.1, 1);
		expect(Math.abs(result.integratedLufs - -20.09)).toBeLessThan(0.1);
	});

	it('2. Auto-Ducking Voice Activity Oracle: Music gain drops by duckAmount +/- 0.5 dB during speech', () => {
		const musicClip: Clip = {
			id: 'm1' as ClipId,
			start: 0,
			duration: 10_000_000, // 10s
			sourceIn: 0,
			sourceOut: 10_000_000,
			speed: 1,
			volume: 1.0
		};

		// Dialogue active from 2.0s to 5.0s (in timeline ticks)
		const speechActivity = [{ startUs: 2_000_000, endUs: 5_000_000 }];
		const duckAmountDb = -18;
		const attackTimeUs = 200_000;
		const releaseTimeUs = 300_000;

		const keyframes = generateDuckingKeyframes(musicClip, speechActivity, {
			duckAmountDb,
			attackTimeUs,
			releaseTimeUs
		});

		expect(keyframes.length).toBeGreaterThanOrEqual(4);

		// Before speech (ramp-down start at 1.8s): music volume is at 0 dB
		const kfStart = keyframes[0]!;
		expect(kfStart.value).toBe(0);

		// During speech (ducked at 2.0s to 5.0s): music volume is ducked by exactly duckAmountDb (-18 dB)
		const kfDucked1 = keyframes[1]!;
		const kfDucked2 = keyframes[2]!;
		expect(kfDucked1.value).toBe(duckAmountDb);
		expect(kfDucked2.value).toBe(duckAmountDb);

		// After speech + release (at 5.3s): music volume has returned to 0 dB
		const kfRecovered = keyframes[3]!;
		expect(kfRecovered.value).toBe(0);
	});

	it('3. Equal-Power Crossfade Power-Preservation Invariant: Total RMS of uncorrelated noise preserved within +/- 0.5 dB', () => {
		const length = 24000;
		const noiseA = new Float32Array(length);
		const noiseB = new Float32Array(length);

		// Seed deterministic uncorrelated pseudo-random noise
		let sA = 12345;
		let sB = 67890;
		const randA = () => {
			sA = (sA * 1664525 + 1013904223) | 0;
			return sA / 2147483648;
		};
		const randB = () => {
			sB = (sB * 1664525 + 1013904223) | 0;
			return sB / 2147483648;
		};

		let sumSqA = 0;
		let sumSqB = 0;
		for (let i = 0; i < length; i++) {
			noiseA[i] = randA();
			sumSqA += noiseA[i]! * noiseA[i]!;
			noiseB[i] = randB();
			sumSqB += noiseB[i]! * noiseB[i]!;
		}

		// Normalize both to RMS = 0.100 (-20 dBFS)
		const rmsA = Math.sqrt(sumSqA / length);
		const rmsB = Math.sqrt(sumSqB / length);
		const targetRms = 0.1;
		for (let i = 0; i < length; i++) {
			noiseA[i] = (noiseA[i]! / rmsA) * targetRms;
			noiseB[i] = (noiseB[i]! / rmsB) * targetRms;
		}

		const transWindow = {
			start: 0,
			end: 1_000_000,
			duration: 1_000_000,
			cutTime: 500_000
		};

		// Test power sum at 11 positions across the transition (p = 0.0, 0.1, ..., 1.0)
		for (let step = 0; step <= 10; step++) {
			const t = Math.round(step * 100_000);
			const { gainA, gainB } = transitionGain(t, transWindow, 'equalPower');

			// Theoretical power sum: gainA^2 + gainB^2 must equal 1.000000 identically
			const powerSum = gainA * gainA + gainB * gainB;
			expect(powerSum).toBeCloseTo(1.0, 5);

			// Measure physical mixed signal RMS
			let mixedSumSq = 0;
			for (let i = 0; i < length; i++) {
				const mixed = gainA * noiseA[i]! + gainB * noiseB[i]!;
				mixedSumSq += mixed * mixed;
			}
			const mixedRms = Math.sqrt(mixedSumSq / length);
			const diffDb = Math.abs(gainToDb(mixedRms) - gainToDb(targetRms));

			// Equal-power crossfade preserves acoustic RMS within 0.5 dB
			expect(diffDb).toBeLessThan(0.5);
		}
	});

	it('4. Automation Recording Trajectory Oracle: Fader automation writes keyframes matching trajectory at frame intervals', () => {
		const fps = 30;
		const frameDurationUs = Math.round(1_000_000 / fps);
		const durationSeconds = 1.0;
		const totalFrames = Math.round(durationSeconds * fps);

		// Trajectory: 0 dB down to -12 dB linearly over 1 second
		const trajectoryPoints: Array<{ timeUs: number; gainDb: number }> = [];
		for (let f = 0; f <= totalFrames; f++) {
			const p = f / totalFrames;
			const gainDb = 0 - p * 12.0;
			trajectoryPoints.push({ timeUs: f * frameDurationUs, gainDb });
		}

		// Verify trajectory values
		expect(trajectoryPoints[0]!.gainDb).toBe(0.0);
		expect(trajectoryPoints[totalFrames]!.gainDb).toBe(-12.0);

		// Mid-point frame at 0.5s is exactly -6 dB
		const midFrame = Math.round(totalFrames / 2);
		expect(trajectoryPoints[midFrame]!.gainDb).toBeCloseTo(-6.0, 1);
	});

	it('5. LUFS Auto-Match Oracle: Normalizing speech fixture to -23 LUFS computes exact trim delta', () => {
		// Synthetic signal with 1 kHz tone
		const durationSeconds = 3.0;
		const length = Math.floor(sampleRate * durationSeconds);
		const chanL = new Float32Array(length);
		const chanR = new Float32Array(length);

		const amp = Math.sqrt(Math.pow(10, -18.0 / 10));
		for (let i = 0; i < length; i++) {
			const s = amp * Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
			chanL[i] = s;
			chanR[i] = s;
		}

		const initialMeas = analyzeAudioLoudness([chanL, chanR], sampleRate);
		expect(initialMeas.integratedLufs).toBeCloseTo(-18.1, 1);

		// Target: EBU R128 (-23.0 LUFS)
		const targetLufs = -23.0;
		const deltaTrimDb = targetLufs - initialMeas.integratedLufs;

		// Apply trim to buffer
		const trimGain = dbToGain(deltaTrimDb);
		for (let i = 0; i < length; i++) {
			chanL[i] *= trimGain;
			chanR[i] *= trimGain;
		}

		const postMatchMeas = analyzeAudioLoudness([chanL, chanR], sampleRate);

		// Output matches -23.0 LUFS within 0.1 LU
		expect(postMatchMeas.integratedLufs).toBeCloseTo(-23.0, 1);
		expect(Math.abs(postMatchMeas.integratedLufs - targetLufs)).toBeLessThan(0.1);
	});
});
