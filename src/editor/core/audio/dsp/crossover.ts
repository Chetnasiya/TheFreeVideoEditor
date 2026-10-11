import { BiquadFilter } from './biquad';

/**
 * 4th-Order Linkwitz-Riley Crossover (LR4)
 * Formed by cascading two Butterworth 2nd-order filters (12 dB/oct each) in series.
 * Yields flat magnitude sum (0 dB gain at crossover frequency) and in-phase outputs.
 */
export class LinkwitzRiley4Crossover {
	private readonly low1: BiquadFilter;
	private readonly low2: BiquadFilter;
	private readonly high1: BiquadFilter;
	private readonly high2: BiquadFilter;

	constructor(cutoffFreq: number, sampleRate: number) {
		const q = Math.SQRT1_2;
		this.low1 = new BiquadFilter(sampleRate, { type: 'lowpass', frequencyHz: cutoffFreq, q });
		this.low2 = new BiquadFilter(sampleRate, { type: 'lowpass', frequencyHz: cutoffFreq, q });
		this.high1 = new BiquadFilter(sampleRate, { type: 'highpass', frequencyHz: cutoffFreq, q });
		this.high2 = new BiquadFilter(sampleRate, { type: 'highpass', frequencyHz: cutoffFreq, q });
	}

	public setCutoff(freq: number): void {
		this.low1.configure('lowpass', freq, 0, Math.SQRT1_2);
		this.low2.configure('lowpass', freq, 0, Math.SQRT1_2);
		this.high1.configure('highpass', freq, 0, Math.SQRT1_2);
		this.high2.configure('highpass', freq, 0, Math.SQRT1_2);
	}

	public reset(): void {
		this.low1.reset();
		this.low2.reset();
		this.high1.reset();
		this.high2.reset();
	}

	/**
	 * Splits input sample into low-pass and high-pass outputs.
	 */
	public processSample(x: number): { low: number; high: number } {
		const low = this.low2.step(this.low1.step(x));
		const high = this.high2.step(this.high1.step(x));
		return { low, high };
	}
}
