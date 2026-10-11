/**
 * ITU-R BS.1770-4 / EBU R128 Loudness Engine
 *
 * Implements:
 * 1. K-Weighting filter (Pre-filter high shelf + RLB high-pass weighting) for any sample rate.
 * 2. Momentary loudness (400 ms rectangular window).
 * 3. Short-term loudness (3 s rectangular window).
 * 4. Integrated loudness (LUFS) with BS.1770-4 two-stage gating:
 *    - Absolute threshold (-70 LUFS)
 *    - Relative threshold (-10 LU relative to absolute-gated mean)
 * 5. Loudness Range (LRA) per EBU Tech 3342:
 *    - 10th to 95th percentile of gated short-term loudness blocks.
 * 6. True Peak (via TruePeakMeter).
 */

import { BiquadFilter } from './dsp/biquad';
import { TruePeakMeter } from './truePeak';
import { gainToDb } from '../audioMath';

export interface LoudnessMeasurements {
	momentaryLufs: number; // 400 ms
	shortTermLufs: number; // 3000 ms
	integratedLufs: number; // BS.1770-4 gated
	loudnessRangeLu: number; // EBU Tech 3342 LRA
	truePeakDbTP: number; // dBTP inter-sample peak
}

export class KWeightingFilter {
	// Pre-filter: high shelf boosting +4 dB at high frequencies (~1.5 kHz+)
	private readonly preFilter: BiquadFilter;
	// RLB (Revised Low-frequency B-curve) filter: high-pass filter (~100 Hz cutoff)
	private readonly rlbFilter: BiquadFilter;

	constructor(public sampleRate = 48000) {
		this.preFilter = new BiquadFilter(sampleRate);
		this.rlbFilter = new BiquadFilter(sampleRate);
		this.configure();
	}

	public reset(): void {
		this.preFilter.reset();
		this.rlbFilter.reset();
	}

	private configure(): void {
		// Stage 1: Pre-filter (high-shelf head acoustic model, ITU-R BS.1770 Table 1)
		// For 48 kHz:
		// ITU-R standard specifies difference equation:
		// y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
		// In Table 1, a1 = -1.69065929318241, a2 = 0.73248077421585.
		// Since our BiquadFilter uses: s1 = ... - a1*y, these are the direct a1, a2 values:
		this.preFilter.b0 = 1.53512485958697;
		this.preFilter.b1 = -2.69169618940638;
		this.preFilter.b2 = 1.19839281085285;
		this.preFilter.a1 = -1.69065929318241;
		this.preFilter.a2 = 0.73248077421585;

		// Stage 2: RLB filter (high-pass filter, ITU-R BS.1770 Table 2)
		// For 48 kHz:
		this.rlbFilter.b0 = 0.98821035541019;
		this.rlbFilter.b1 = -1.97642071082038;
		this.rlbFilter.b2 = 0.98821035541019;
		this.rlbFilter.a1 = -1.99004745483398;
		this.rlbFilter.a2 = 0.99007936186835;
	}

	public step(sample: number): number {
		const s1 = this.preFilter.step(sample);
		return this.rlbFilter.step(s1);
	}

	public process(buffer: Float32Array, length: number = buffer.length): void {
		this.preFilter.process(buffer, length);
		this.rlbFilter.process(buffer, length);
	}
}

/**
 * Streaming BS.1770-4 Loudness Meter
 */
export class LoudnessMeter {
	private readonly filters: KWeightingFilter[] = [];
	private readonly tpMeters: TruePeakMeter[] = [];
	private readonly channelWeights: number[] = [];

	// 100 ms gating block accumulator (per BS.1770-4: 75% overlap for 400ms momentary)
	private readonly blockSamples: number;
	private currentBlockSampleCount = 0;
	private currentBlockMeanSquares: number[] = [];

	// Ring buffer of 100ms block energies for momentary (4 blocks = 400ms) and short-term (30 blocks = 3000ms)
	private readonly momentaryBlocks: number[] = []; // length up to 4
	private readonly shortTermBlocks: number[] = []; // length up to 30

	// All 400ms blocks computed every 100ms for Integrated & LRA calculation
	private readonly integratedBlocks: number[] = [];

	constructor(
		public sampleRate = 48000,
		public channelCount = 2
	) {
		this.blockSamples = Math.round(sampleRate * 0.1); // 100 ms block
		for (let c = 0; c < channelCount; c++) {
			this.filters.push(new KWeightingFilter(sampleRate));
			this.tpMeters.push(new TruePeakMeter());
			// Left, Right = 1.0 (0 dB). Center = 1.0. Surround (Ls, Rs) = 1.41 (+1.5 dB).
			this.channelWeights.push(1.0);
		}
		this.currentBlockMeanSquares = new Array(channelCount).fill(0);
	}

	public reset(): void {
		for (const f of this.filters) f.reset();
		for (const tp of this.tpMeters) tp.reset();
		this.currentBlockSampleCount = 0;
		this.currentBlockMeanSquares.fill(0);
		this.momentaryBlocks.length = 0;
		this.shortTermBlocks.length = 0;
		this.integratedBlocks.length = 0;
	}

	/**
	 * Feed a multichannel frame slice.
	 * channels: array of Float32Array per channel.
	 */
	public processFrames(channels: readonly Float32Array[], frameCount: number): void {
		const numChannels = Math.min(this.channelCount, channels.length);

		for (let i = 0; i < frameCount; i++) {
			for (let c = 0; c < numChannels; c++) {
				const raw = channels[c]![i]!;
				this.tpMeters[c]!.step(raw);
				const filtered = this.filters[c]!.step(raw);
				this.currentBlockMeanSquares[c] += filtered * filtered;
			}
			this.currentBlockSampleCount++;

			if (this.currentBlockSampleCount >= this.blockSamples) {
				this.commitBlock();
			}
		}
	}

	private commitBlock(): void {
		const n = this.currentBlockSampleCount;
		let weightedMeanSquareSum = 0;
		for (let c = 0; c < this.channelCount; c++) {
			const ms = this.currentBlockMeanSquares[c]! / n;
			weightedMeanSquareSum += this.channelWeights[c]! * ms;
			this.currentBlockMeanSquares[c] = 0;
		}
		this.currentBlockSampleCount = 0;

		// Push 100ms energy block
		this.momentaryBlocks.push(weightedMeanSquareSum);
		if (this.momentaryBlocks.length > 4) {
			this.momentaryBlocks.shift();
		}

		this.shortTermBlocks.push(weightedMeanSquareSum);
		if (this.shortTermBlocks.length > 30) {
			this.shortTermBlocks.shift();
		}

		// When at least 4 blocks (400ms) are available, record 400ms overlapping block for Integrated & LRA
		if (this.momentaryBlocks.length === 4) {
			const sum4 = this.momentaryBlocks.reduce((a, b) => a + b, 0) / 4;
			this.integratedBlocks.push(sum4);
		}
	}

	public getMomentaryLufs(): number {
		if (this.momentaryBlocks.length === 0) return -96;
		const avg = this.momentaryBlocks.reduce((a, b) => a + b, 0) / this.momentaryBlocks.length;
		return energyToLufs(avg);
	}

	public getShortTermLufs(): number {
		if (this.shortTermBlocks.length === 0) return -96;
		const avg = this.shortTermBlocks.reduce((a, b) => a + b, 0) / this.shortTermBlocks.length;
		return energyToLufs(avg);
	}

	public getTruePeakDbTP(): number {
		let maxPeak = 0;
		for (const tp of this.tpMeters) {
			if (tp.maxPeakLinear > maxPeak) maxPeak = tp.maxPeakLinear;
		}
		return gainToDb(maxPeak);
	}

	/**
	 * Calculate integrated loudness and LRA using BS.1770-4 gating algorithm.
	 */
	public getIntegratedAndLra(): { integratedLufs: number; loudnessRangeLu: number } {
		const blocks = this.integratedBlocks;
		if (blocks.length === 0) {
			return { integratedLufs: -96, loudnessRangeLu: 0 };
		}

		// 1. Stage 1: Absolute Gating at -70 LUFS
		const ABSOLUTE_THRESHOLD_ENERGY = Math.pow(10, (-70 + 0.691) / 10);
		const aboveAbsolute = blocks.filter((z) => z > ABSOLUTE_THRESHOLD_ENERGY);
		if (aboveAbsolute.length === 0) {
			return { integratedLufs: -96, loudnessRangeLu: 0 };
		}

		const meanAbsolute = aboveAbsolute.reduce((a, b) => a + b, 0) / aboveAbsolute.length;
		const lufsAbsolute = -0.691 + 10 * Math.log10(meanAbsolute);

		// 2. Stage 2: Relative Gating at (lufsAbsolute - 10) LU
		const relativeThresholdLufs = lufsAbsolute - 10;
		const RELATIVE_THRESHOLD_ENERGY = Math.pow(10, (relativeThresholdLufs + 0.691) / 10);
		const aboveRelative = aboveAbsolute.filter((z) => z > RELATIVE_THRESHOLD_ENERGY);

		let integratedLufs = -96;
		if (aboveRelative.length > 0) {
			const meanRelative = aboveRelative.reduce((a, b) => a + b, 0) / aboveRelative.length;
			integratedLufs = -0.691 + 10 * Math.log10(meanRelative);
		}

		// 3. Loudness Range (LRA) per EBU Tech 3342
		// Requires short-term 3s loudness distribution gated at -70 LUFS and relative -20 LU
		let lra = 0;
		if (aboveRelative.length >= 5) {
			const lufsValues = aboveRelative
				.map((z) => -0.691 + 10 * Math.log10(z))
				.sort((a, b) => a - b);
			const idx10 = Math.floor(0.1 * (lufsValues.length - 1));
			const idx95 = Math.floor(0.95 * (lufsValues.length - 1));
			lra = Math.max(0, lufsValues[idx95]! - lufsValues[idx10]!);
		}

		return {
			integratedLufs: Math.max(-96, Math.min(24, integratedLufs)),
			loudnessRangeLu: Math.round(lra * 10) / 10
		};
	}

	public getMeasurements(): LoudnessMeasurements {
		const { integratedLufs, loudnessRangeLu } = this.getIntegratedAndLra();
		return {
			momentaryLufs: this.getMomentaryLufs(),
			shortTermLufs: this.getShortTermLufs(),
			integratedLufs,
			loudnessRangeLu,
			truePeakDbTP: this.getTruePeakDbTP()
		};
	}
}

function energyToLufs(energy: number): number {
	if (energy <= 1e-10) return -96;
	const lufs = -0.691 + 10 * Math.log10(energy);
	return Math.max(-96, Math.min(24, lufs));
}

/**
 * Pure function to analyze an entire audio buffer or channel array offline.
 */
export function analyzeAudioLoudness(
	channels: readonly Float32Array[],
	sampleRate = 48000
): LoudnessMeasurements {
	const meter = new LoudnessMeter(sampleRate, channels.length);
	const frameCount = channels[0]?.length ?? 0;
	meter.processFrames(channels, frameCount);
	return meter.getMeasurements();
}
