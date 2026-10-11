/**
 * Pure DSP Biquad Filter implementation (Robert Bristow-Johnson Audio EQ Cookbook).
 * Allocation-free in process().
 */

export type BiquadType =
	'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'allpass' | 'peaking' | 'lowshelf' | 'highshelf';

export interface BiquadParams {
	type: BiquadType;
	frequencyHz: number;
	gainDb?: number;
	q?: number;
}

export class BiquadFilter {
	// Coefficients normalized by a0
	public b0 = 1;
	public b1 = 0;
	public b2 = 0;
	public a1 = 0;
	public a2 = 0;

	// State variables (Direct Form II Transposed)
	public s1 = 0;
	public s2 = 0;

	constructor(
		public sampleRate = 48000,
		params?: BiquadParams
	) {
		if (params) {
			this.configure(params.type, params.frequencyHz, params.gainDb ?? 0, params.q ?? 0.7071);
		}
	}

	public reset(): void {
		this.s1 = 0;
		this.s2 = 0;
	}

	public configure(type: BiquadType, f0: number, gainDb = 0, q = 0.7071): void {
		const fs = this.sampleRate;
		const nyquist = fs * 0.499;
		const freq = Math.max(10, Math.min(nyquist, f0));
		const Q = Math.max(0.001, q);
		const w0 = (2 * Math.PI * freq) / fs;
		const cos_w0 = Math.cos(w0);
		const sin_w0 = Math.sin(w0);
		const alpha = sin_w0 / (2 * Q);
		const A = Math.pow(10, gainDb / 40);

		let b0 = 1;
		let b1 = 0;
		let b2 = 0;
		let a0 = 1;
		let a1 = 0;
		let a2 = 0;

		switch (type) {
			case 'lowpass':
				b0 = (1 - cos_w0) / 2;
				b1 = 1 - cos_w0;
				b2 = (1 - cos_w0) / 2;
				a0 = 1 + alpha;
				a1 = -2 * cos_w0;
				a2 = 1 - alpha;
				break;
			case 'highpass':
				b0 = (1 + cos_w0) / 2;
				b1 = -(1 + cos_w0);
				b2 = (1 + cos_w0) / 2;
				a0 = 1 + alpha;
				a1 = -2 * cos_w0;
				a2 = 1 - alpha;
				break;
			case 'bandpass':
				b0 = alpha;
				b1 = 0;
				b2 = -alpha;
				a0 = 1 + alpha;
				a1 = -2 * cos_w0;
				a2 = 1 - alpha;
				break;
			case 'notch':
				b0 = 1;
				b1 = -2 * cos_w0;
				b2 = 1;
				a0 = 1 + alpha;
				a1 = -2 * cos_w0;
				a2 = 1 - alpha;
				break;
			case 'allpass':
				b0 = 1 - alpha;
				b1 = -2 * cos_w0;
				b2 = 1 + alpha;
				a0 = 1 + alpha;
				a1 = -2 * cos_w0;
				a2 = 1 - alpha;
				break;
			case 'peaking':
				b0 = 1 + alpha * A;
				b1 = -2 * cos_w0;
				b2 = 1 - alpha * A;
				a0 = 1 + alpha / A;
				a1 = -2 * cos_w0;
				a2 = 1 - alpha / A;
				break;
			case 'lowshelf': {
				const sqrtA = Math.sqrt(A);
				const alphaShelf = (sin_w0 / 2) * Math.sqrt((A + 1 / A) * (1 / Q - 1) + 2);
				b0 = A * (A + 1 - (A - 1) * cos_w0 + 2 * sqrtA * alphaShelf);
				b1 = 2 * A * (A - 1 - (A + 1) * cos_w0);
				b2 = A * (A + 1 - (A - 1) * cos_w0 - 2 * sqrtA * alphaShelf);
				a0 = A + 1 + (A - 1) * cos_w0 + 2 * sqrtA * alphaShelf;
				a1 = -2 * (A - 1 + (A + 1) * cos_w0);
				a2 = A + 1 + (A - 1) * cos_w0 - 2 * sqrtA * alphaShelf;
				break;
			}
			case 'highshelf': {
				const sqrtA = Math.sqrt(A);
				const alphaShelf = (sin_w0 / 2) * Math.sqrt((A + 1 / A) * (1 / Q - 1) + 2);
				b0 = A * (A + 1 + (A - 1) * cos_w0 + 2 * sqrtA * alphaShelf);
				b1 = -2 * A * (A - 1 + (A + 1) * cos_w0);
				b2 = A * (A + 1 + (A - 1) * cos_w0 - 2 * sqrtA * alphaShelf);
				a0 = A + 1 - (A - 1) * cos_w0 + 2 * sqrtA * alphaShelf;
				a1 = 2 * (A - 1 - (A + 1) * cos_w0);
				a2 = A + 1 - (A - 1) * cos_w0 - 2 * sqrtA * alphaShelf;
				break;
			}
		}

		// Normalize by a0
		this.b0 = b0 / a0;
		this.b1 = b1 / a0;
		this.b2 = b2 / a0;
		this.a1 = a1 / a0;
		this.a2 = a2 / a0;
	}

	/**
	 * Process a single sample using Direct Form II Transposed.
	 * y[n] = b0 * x[n] + s1
	 * s1   = b1 * x[n] - a1 * y[n] + s2
	 * s2   = b2 * x[n] - a2 * y[n]
	 */
	public step(x: number): number {
		const y = this.b0 * x + this.s1;
		this.s1 = this.b1 * x - this.a1 * y + this.s2;
		this.s2 = this.b2 * x - this.a2 * y;
		return y;
	}

	/**
	 * In-place processing over an input/output Float32Array slice.
	 * Allocation-free.
	 */
	public process(buffer: Float32Array, length: number = buffer.length): void {
		const b0 = this.b0;
		const b1 = this.b1;
		const b2 = this.b2;
		const a1 = this.a1;
		const a2 = this.a2;
		let s1 = this.s1;
		let s2 = this.s2;

		for (let i = 0; i < length; i++) {
			const x = buffer[i]!;
			const y = b0 * x + s1;
			s1 = b1 * x - a1 * y + s2;
			s2 = b2 * x - a2 * y;
			buffer[i] = y;
		}

		this.s1 = s1;
		this.s2 = s2;
	}
}
