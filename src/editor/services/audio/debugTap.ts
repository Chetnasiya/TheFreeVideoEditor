import type { Project } from '../../core/types';
import { renderOfflineAudio } from './offlineRender';

export interface AudioMeasurement {
	rms: number;
	rmsDb: number;
	peak: number;
	peakDb: number;
	rmsL: number;
	rmsR: number;
	lRBalanceDb: number; // rmsL - rmsR in dB
	targetFreqPower?: number; // e.g., 1000 Hz magnitude
	sampleCount: number;
}

export function computeRms(samples: Float32Array): number {
	let sumSq = 0;
	for (let i = 0; i < samples.length; i++) {
		const s = samples[i] ?? 0;
		sumSq += s * s;
	}
	return Math.sqrt(sumSq / Math.max(1, samples.length));
}

export function computePeak(samples: Float32Array): number {
	let peak = 0;
	for (let i = 0; i < samples.length; i++) {
		const abs = Math.abs(samples[i] ?? 0);
		if (abs > peak) peak = abs;
	}
	return peak;
}

export function linearToDb(val: number): number {
	if (val <= 0.00001585) return -96; // -96 dB floor
	return Math.max(-96, Math.min(24, 20 * Math.log10(val)));
}

/**
 * Goertzel algorithm to compute analytic signal power at target frequency.
 */
export function goertzelMagnitude(
	samples: Float32Array,
	targetFreq: number,
	sampleRate: number
): number {
	if (samples.length === 0) return 0;
	const k = Math.round((samples.length * targetFreq) / sampleRate);
	const omega = (2 * Math.PI * k) / samples.length;
	const coeff = 2 * Math.cos(omega);
	let s0 = 0,
		s1 = 0,
		s2 = 0;
	for (let i = 0; i < samples.length; i++) {
		s0 = (samples[i] ?? 0) + coeff * s1 - s2;
		s2 = s1;
		s1 = s0;
	}
	const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
	return Math.sqrt(Math.max(0, power)) / (samples.length / 2);
}

export interface AudioDebugTap {
	captureLiveMasterSnapshot: (targetFreq?: number) => Promise<AudioMeasurement>;
	renderOfflineSnapshot: (project: Project, targetFreq?: number) => Promise<AudioMeasurement>;
	measurePcm: (
		left: Float32Array,
		right: Float32Array,
		sampleRate: number,
		targetFreq?: number
	) => AudioMeasurement;
}

declare global {
	interface Window {
		__TFVE_AUDIO_DEBUG_TAP__?: AudioDebugTap;
	}
}

export function measurePcmChannels(
	left: Float32Array,
	right: Float32Array,
	sampleRate: number,
	targetFreq?: number
): AudioMeasurement {
	const rmsL = computeRms(left);
	const rmsR = computeRms(right);
	const combined = new Float32Array(left.length);
	for (let i = 0; i < left.length; i++) {
		combined[i] = ((left[i] ?? 0) + (right[i] ?? 0)) * 0.5;
	}
	const rms = computeRms(combined);
	const peak = Math.max(computePeak(left), computePeak(right));
	const rmsDb = linearToDb(rms);
	const peakDb = linearToDb(peak);
	const rmsDbL = linearToDb(rmsL);
	const rmsDbR = linearToDb(rmsR);
	const lRBalanceDb = rmsDbL - rmsDbR;

	const targetFreqPower = targetFreq
		? goertzelMagnitude(combined, targetFreq, sampleRate)
		: undefined;

	return {
		rms,
		rmsDb,
		peak,
		peakDb,
		rmsL,
		rmsR,
		lRBalanceDb,
		targetFreqPower,
		sampleCount: left.length
	};
}

export function registerAudioDebugTap(
	getLiveMasterAnalysers: () =>
		AnalyserNode | { analyserL: AnalyserNode; analyserR: AnalyserNode } | null
): () => void {
	if (!import.meta.env.DEV || typeof window === 'undefined') return () => {};

	const tap: AudioDebugTap = {
		measurePcm: measurePcmChannels,

		captureLiveMasterSnapshot: async (targetFreq?: number) => {
			const target = getLiveMasterAnalysers();
			if (!target) {
				return {
					rms: 0,
					rmsDb: -96,
					peak: 0,
					peakDb: -96,
					rmsL: 0,
					rmsR: 0,
					lRBalanceDb: 0,
					sampleCount: 0
				};
			}

			const analyserL = 'analyserL' in target ? target.analyserL : target;
			const analyserR = 'analyserR' in target ? target.analyserR : target;

			const size = Math.max(analyserL.fftSize, 2048);
			analyserL.fftSize = size;
			analyserR.fftSize = size;
			const samplesL = new Float32Array(size);
			const samplesR = new Float32Array(size);
			analyserL.getFloatTimeDomainData(samplesL);
			analyserR.getFloatTimeDomainData(samplesR);

			return measurePcmChannels(samplesL, samplesR, analyserL.context.sampleRate, targetFreq);
		},

		renderOfflineSnapshot: async (project: Project, targetFreq?: number) => {
			const sampleRate = project.settings.sampleRate ?? 48000;
			const durationUs = Math.min(2_000_000, project.settings.fps ? 2_000_000 : 1_000_000);
			const audioBuffer = await renderOfflineAudio({
				project,
				startUs: 0,
				durationUs,
				sampleRate,
				normalizeToTargetLufs: false // We measure raw DSP without loudness auto-gain
			});

			const left = audioBuffer.getChannelData(0);
			const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;

			return measurePcmChannels(left, right, sampleRate, targetFreq);
		}
	};

	window.__TFVE_AUDIO_DEBUG_TAP__ = tap;

	return () => {
		if (window.__TFVE_AUDIO_DEBUG_TAP__ === tap) {
			delete window.__TFVE_AUDIO_DEBUG_TAP__;
		}
	};
}
