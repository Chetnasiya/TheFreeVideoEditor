import { dbToGain, gainToDb } from '../../audioMath';

export type DetectorMode = 'peak' | 'rms';

export class EnvelopeFollower {
	private envelope = 0;
	private attackCoeff = 0;
	private releaseCoeff = 0;

	constructor(
		public sampleRate = 48000,
		attackMs = 10,
		releaseMs = 100
	) {
		this.setTimeConstants(attackMs, releaseMs);
	}

	public reset(): void {
		this.envelope = 0;
	}

	public setTimeConstants(attackMs: number, releaseMs: number): void {
		const fs = this.sampleRate;
		const attSec = Math.max(0.0001, attackMs / 1000);
		const relSec = Math.max(0.0001, releaseMs / 1000);
		this.attackCoeff = Math.exp(-1 / (fs * attSec));
		this.releaseCoeff = Math.exp(-1 / (fs * relSec));
	}

	public step(inputSample: number): number {
		const absInput = Math.abs(inputSample);
		if (absInput > this.envelope) {
			this.envelope = this.attackCoeff * this.envelope + (1 - this.attackCoeff) * absInput;
		} else {
			this.envelope = this.releaseCoeff * this.envelope + (1 - this.releaseCoeff) * absInput;
		}
		return this.envelope;
	}

	public get currentLevel(): number {
		return this.envelope;
	}

	public get currentDb(): number {
		return gainToDb(this.envelope);
	}
}

export interface CompressorCoreParams {
	thresholdDb: number;
	ratio: number;
	attackMs: number;
	releaseMs: number;
	kneeDb: number;
	makeupDb: number;
}

export class CompressorCore {
	private readonly follower: EnvelopeFollower;
	public thresholdDb: number;
	public ratio: number;
	public kneeDb: number;
	public makeupDb: number;

	constructor(
		public sampleRate = 48000,
		params?: Partial<CompressorCoreParams>
	) {
		this.thresholdDb = params?.thresholdDb ?? -24;
		this.ratio = params?.ratio ?? 4;
		this.kneeDb = params?.kneeDb ?? 6;
		this.makeupDb = params?.makeupDb ?? 0;
		this.follower = new EnvelopeFollower(
			sampleRate,
			params?.attackMs ?? 20,
			params?.releaseMs ?? 250
		);
	}

	public reset(): void {
		this.follower.reset();
	}

	public setParams(params: Partial<CompressorCoreParams>): void {
		if (params.thresholdDb !== undefined) this.thresholdDb = params.thresholdDb;
		if (params.ratio !== undefined) this.ratio = Math.max(1, params.ratio);
		if (params.kneeDb !== undefined) this.kneeDb = Math.max(0, params.kneeDb);
		if (params.makeupDb !== undefined) this.makeupDb = params.makeupDb;
		if (params.attackMs !== undefined || params.releaseMs !== undefined) {
			this.follower.setTimeConstants(params.attackMs ?? 20, params.releaseMs ?? 250);
		}
	}

	/**
	 * Compute gain reduction in dB for input level in dB.
	 */
	public computeGainReductionDb(detectedDb: number): number {
		const T = this.thresholdDb;
		const R = this.ratio;
		const W = this.kneeDb;

		let targetDb: number;
		if (W <= 0) {
			if (detectedDb <= T) {
				targetDb = detectedDb;
			} else {
				targetDb = T + (detectedDb - T) / R;
			}
		} else {
			const halfW = W / 2;
			if (detectedDb <= T - halfW) {
				targetDb = detectedDb;
			} else if (detectedDb > T + halfW) {
				targetDb = T + (detectedDb - T) / R;
			} else {
				const x = detectedDb - T + halfW;
				targetDb = detectedDb + ((1 / R - 1) * (x * x)) / (2 * W);
			}
		}

		// Gain reduction is targetDb - detectedDb (negative or zero)
		return targetDb - detectedDb;
	}

	/**
	 * Process a single sample (mono), returns compressed sample.
	 */
	public step(sample: number): number {
		const env = this.follower.step(sample);
		const envDb = gainToDb(env);
		const grDb = this.computeGainReductionDb(envDb);
		const gain = dbToGain(grDb + this.makeupDb);
		return sample * gain;
	}

	/**
	 * In-place processing over Float32Array channel. Allocation-free.
	 */
	public process(buffer: Float32Array, length: number = buffer.length): void {
		for (let i = 0; i < length; i++) {
			buffer[i] = this.step(buffer[i]!);
		}
	}
}
