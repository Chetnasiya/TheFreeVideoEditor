/**
 * Pure DSP Circular Delay Line.
 * Allocation-free in process().
 */

export class DelayLine {
	private readonly buffer: Float32Array;
	private writeIndex = 0;
	private readonly maxDelaySamples: number;

	constructor(maxDelaySamples: number) {
		this.maxDelaySamples = Math.max(1, Math.floor(maxDelaySamples));
		this.buffer = new Float32Array(this.maxDelaySamples + 1);
	}

	public reset(): void {
		this.buffer.fill(0);
		this.writeIndex = 0;
	}

	public write(sample: number): void {
		this.buffer[this.writeIndex] = sample;
		this.writeIndex++;
		if (this.writeIndex >= this.buffer.length) {
			this.writeIndex = 0;
		}
	}

	/**
	 * Read with integer sample delay.
	 */
	public read(delaySamples: number): number {
		const d = Math.max(0, Math.min(this.maxDelaySamples, Math.floor(delaySamples)));
		let readIndex = this.writeIndex - 1 - d;
		while (readIndex < 0) {
			readIndex += this.buffer.length;
		}
		return this.buffer[readIndex] ?? 0;
	}

	/**
	 * Read with fractional sample delay using linear interpolation.
	 */
	public readInterpolated(delaySamples: number): number {
		const d = Math.max(0, Math.min(this.maxDelaySamples - 1, delaySamples));
		const dInt = Math.floor(d);
		const frac = d - dInt;

		let idx0 = this.writeIndex - 1 - dInt;
		while (idx0 < 0) idx0 += this.buffer.length;

		let idx1 = idx0 - 1;
		while (idx1 < 0) idx1 += this.buffer.length;

		const s0 = this.buffer[idx0] ?? 0;
		const s1 = this.buffer[idx1] ?? 0;
		return s0 + frac * (s1 - s0);
	}

	/**
	 * Read with fractional sample delay using linear interpolation (alias).
	 */
	public readLinear(delaySamples: number): number {
		return this.readInterpolated(delaySamples);
	}

	/**
	 * Process a sample: write input, read delayed output.
	 */
	public step(sample: number, delaySamples: number): number {
		this.write(sample);
		return this.read(delaySamples);
	}

	/**
	 * In-place delay for buffer (exact integer delay).
	 */
	public process(inOut: Float32Array, delaySamples: number, length: number = inOut.length): void {
		for (let i = 0; i < length; i++) {
			const x = inOut[i]!;
			this.write(x);
			inOut[i] = this.read(delaySamples);
		}
	}
}
