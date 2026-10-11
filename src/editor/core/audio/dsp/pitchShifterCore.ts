import { DelayLine } from './delayLine';

/**
 * Granular / WSOLA Pitch Shifter in pure TypeScript
 * Allows pitch shifting from -12 to +12 semitones without changing duration.
 */
export class PitchShifterCore {
	private readonly buffer: DelayLine;
	private pitchFactor = 1.0;
	private grainSize = 1024;
	private phase0 = 0;
	private phase1 = 0;

	constructor(sampleRate: number) {
		const maxDelay = Math.round(sampleRate * 0.2); // 200 ms max window
		this.buffer = new DelayLine(maxDelay);
		this.grainSize = Math.round(sampleRate * 0.04); // 40 ms grain
		this.phase0 = 0;
		this.phase1 = this.grainSize / 2;
	}

	public setPitchSemitones(semitones: number): void {
		this.pitchFactor = Math.pow(2, semitones / 12);
	}

	public reset(): void {
		this.buffer.reset();
		this.phase0 = 0;
		this.phase1 = this.grainSize / 2;
	}

	public processSample(x: number): number {
		this.buffer.write(x);

		// Two cross-fading grain taps
		const w0 = 0.5 * (1 - Math.cos((2 * Math.PI * this.phase0) / this.grainSize));
		const w1 = 0.5 * (1 - Math.cos((2 * Math.PI * this.phase1) / this.grainSize));

		const s0 = this.buffer.readInterpolated(this.phase0) * w0;
		const s1 = this.buffer.readInterpolated(this.phase1) * w1;

		const rate = 1 - this.pitchFactor;
		this.phase0 += rate;
		this.phase1 += rate;

		if (this.phase0 < 0) this.phase0 += this.grainSize;
		if (this.phase0 >= this.grainSize) this.phase0 -= this.grainSize;

		if (this.phase1 < 0) this.phase1 += this.grainSize;
		if (this.phase1 >= this.grainSize) this.phase1 -= this.grainSize;

		return s0 + s1;
	}
}
