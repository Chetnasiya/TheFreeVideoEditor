/**
 * ITU-R BS.1770-4 Annex 2 True-Peak 4x Oversampling and Peak Metering.
 *
 * Implements 4x polyphase interpolation:
 * Phase 0: t = 0 (exact sample)
 * Phase 1: t = 0.25
 * Phase 2: t = 0.50 (halfway between samples)
 * Phase 3: t = 0.75
 *
 * For a symmetric windowed sinc filter with 48 taps (12 taps per phase).
 */

import { gainToDb } from '../audioMath';

// Generate 48-tap windowed-sinc coefficients dynamically (12 taps per phase)
// Kaiser-windowed sinc with cut-off at Nyquist/4 (relative to 4x oversampled rate) = 0.25
function generatePolyphaseTaps(): number[][] {
	const numPhases = 4;
	const tapsPerPhase = 12;
	const halfTotal = (numPhases * tapsPerPhase) / 2; // 24
	const phases: number[][] = Array.from({ length: numPhases }, () => []);

	// Kaiser window parameter beta = 7.04
	const beta = 7.04;
	const besselI0 = (x: number) => {
		let sum = 1.0;
		let term = 1.0;
		let m = 1;
		while (term > 1e-12 && m < 50) {
			const num = (x / 2) ** m;
			let fact = 1;
			for (let i = 1; i <= m; i++) fact *= i;
			term = (num / fact) ** 2;
			sum += term;
			m++;
		}
		return sum;
	};
	const denom = besselI0(beta);

	for (let p = 0; p < numPhases; p++) {
		for (let i = 0; i < tapsPerPhase; i++) {
			// Subsample index in total 48-tap continuous grid:
			// Continuous time t in units of input samples from center:
			const n = i * numPhases + p; // 0 .. 47
			const t = (n - halfTotal + 0.5) / numPhases;

			// Sinc function: sin(pi * t) / (pi * t)
			const sinc = t === 0 ? 1.0 : Math.sin(Math.PI * t) / (Math.PI * t);

			// Kaiser window:
			const wArg = 2 * (n / (numPhases * tapsPerPhase - 1)) - 1; // -1 .. 1
			const win = besselI0(beta * Math.sqrt(Math.max(0, 1 - wArg * wArg))) / denom;

			phases[p]!.push(sinc * win);
		}
	}

	// Normalize DC gain across each phase so a constant 1.0 input preserves 1.0
	for (let p = 0; p < numPhases; p++) {
		const sum = phases[p]!.reduce((a, b) => a + b, 0);
		if (sum > 0) {
			for (let i = 0; i < tapsPerPhase; i++) {
				phases[p]![i] /= sum;
			}
		}
	}

	return phases;
}

const POLY_TAPS = generatePolyphaseTaps();

export class TruePeakMeter {
	private readonly history = new Float32Array(16);
	private historyIndex = 0;
	private peakLinear = 0;

	constructor() {}

	public reset(): void {
		this.history.fill(0);
		this.historyIndex = 0;
		this.peakLinear = 0;
	}

	public get maxPeakLinear(): number {
		return this.peakLinear;
	}

	public get maxPeakDbTP(): number {
		return gainToDb(this.peakLinear);
	}

	/**
	 * Feed a sample and compute 4x interpolated inter-sample peaks.
	 */
	public step(sample: number): number {
		const absSample = Math.abs(sample);
		if (absSample > this.peakLinear) {
			this.peakLinear = absSample;
		}

		// Store in circular history buffer of length 16
		this.history[this.historyIndex] = sample;
		this.historyIndex = (this.historyIndex + 1) & 15;

		// 4x polyphase evaluation
		let maxInter = absSample;
		for (let phase = 0; phase < 4; phase++) {
			const taps = POLY_TAPS[phase]!;
			let sum = 0;
			for (let i = 0; i < 12; i++) {
				const idx = (this.historyIndex - 1 - i + 16) & 15;
				sum += (this.history[idx] ?? 0) * taps[i]!;
			}
			const absInter = Math.abs(sum);
			if (absInter > maxInter) maxInter = absInter;
		}

		if (maxInter > this.peakLinear) {
			this.peakLinear = maxInter;
		}

		return maxInter;
	}

	/**
	 * Process a block of samples and return the block's true peak (linear).
	 */
	public processBlock(samples: Float32Array, length: number = samples.length): number {
		let blockMax = 0;
		for (let i = 0; i < length; i++) {
			const tp = this.step(samples[i]!);
			if (tp > blockMax) blockMax = tp;
		}
		return blockMax;
	}
}

/**
 * Measure true peak for multi-channel audio buffer.
 */
export function measureTruePeak(channels: readonly Float32Array[]): {
	maxLinear: number;
	maxDbTP: number;
} {
	let overallMax = 0;
	for (const channel of channels) {
		const meter = new TruePeakMeter();
		const pk = meter.processBlock(channel);
		if (pk > overallMax) overallMax = pk;
	}
	return {
		maxLinear: overallMax,
		maxDbTP: gainToDb(overallMax)
	};
}
