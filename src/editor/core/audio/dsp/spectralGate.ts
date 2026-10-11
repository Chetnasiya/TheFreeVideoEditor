/**
 * Spectral Gate / Noise Reduction Core using Fast Fourier Transform & Spectral Subtraction.
 * Zero-allocation in process() once initialized.
 */
export class SpectralGateCore {
	private readonly fftSize: number;
	private readonly halfFft: number;
	private readonly hopSize: number;

	// Circular input/output FIFO buffers
	private readonly inRing: Float32Array;
	private readonly outRing: Float32Array;
	private inWritePos = 0;
	private outReadPos = 0;
	private sampleCounter = 0;

	// Processing buffers
	private readonly window: Float32Array;
	private readonly real: Float32Array;
	private readonly imag: Float32Array;
	private readonly magnitude: Float32Array;
	private readonly noiseProfile: Float32Array;
	private readonly gainBins: Float32Array;

	private thresholdDb = -45;
	private reductionDb = -18;
	private isLearning = false;
	private learnFrames = 0;

	constructor(fftSize = 512) {
		this.fftSize = fftSize;
		this.halfFft = fftSize / 2;
		this.hopSize = fftSize / 4; // 75% overlap

		this.inRing = new Float32Array(fftSize * 2);
		this.outRing = new Float32Array(fftSize * 2);

		this.window = new Float32Array(fftSize);
		this.real = new Float32Array(fftSize);
		this.imag = new Float32Array(fftSize);
		this.magnitude = new Float32Array(this.halfFft + 1);
		this.noiseProfile = new Float32Array(this.halfFft + 1);
		this.gainBins = new Float32Array(this.halfFft + 1);

		// Hann window
		for (let i = 0; i < fftSize; i++) {
			this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
		}

		// Initialize default noise floor profile (-60 dB across spectrum)
		const initFloor = Math.pow(10, -60 / 20);
		for (let i = 0; i <= this.halfFft; i++) {
			this.noiseProfile[i] = initFloor;
			this.gainBins[i] = 1.0;
		}
	}

	public setParameters(thresholdDb: number, reductionDb: number, learn: boolean): void {
		this.thresholdDb = thresholdDb;
		this.reductionDb = reductionDb;
		if (learn && !this.isLearning) {
			this.isLearning = true;
			this.learnFrames = 0;
			this.noiseProfile.fill(0);
		} else if (!learn && this.isLearning) {
			this.isLearning = false;
		}
	}

	public reset(): void {
		this.inRing.fill(0);
		this.outRing.fill(0);
		this.inWritePos = 0;
		this.outReadPos = 0;
		this.sampleCounter = 0;
	}

	public getLatencySamples(): number {
		return this.fftSize;
	}

	public processSample(sample: number): number {
		this.inRing[this.inWritePos] = sample;
		this.inWritePos = (this.inWritePos + 1) % this.inRing.length;
		this.sampleCounter++;

		if (this.sampleCounter >= this.hopSize) {
			this.sampleCounter = 0;
			this.processHop();
		}

		const out = this.outRing[this.outReadPos] ?? 0;
		this.outRing[this.outReadPos] = 0;
		this.outReadPos = (this.outReadPos + 1) % this.outRing.length;

		return out;
	}

	private processHop(): void {
		const N = this.fftSize;
		const ringLen = this.inRing.length;

		// Read latest N samples with Hann window
		let readIdx = (this.inWritePos - N + ringLen) % ringLen;
		for (let i = 0; i < N; i++) {
			this.real[i] = (this.inRing[readIdx] ?? 0) * (this.window[i] ?? 0);
			this.imag[i] = 0;
			readIdx = (readIdx + 1) % ringLen;
		}

		// Radix-2 FFT
		this.fft(this.real, this.imag, false);

		// Magnitudes
		for (let k = 0; k <= this.halfFft; k++) {
			const r = this.real[k] ?? 0;
			const im = this.imag[k] ?? 0;
			this.magnitude[k] = Math.sqrt(r * r + im * im);
		}

		if (this.isLearning) {
			this.learnFrames++;
			const alpha = 1 / Math.min(this.learnFrames, 64);
			for (let k = 0; k <= this.halfFft; k++) {
				const mag = this.magnitude[k] ?? 0;
				this.noiseProfile[k] = (this.noiseProfile[k] ?? 0) * (1 - alpha) + mag * alpha;
			}
		}

		// Spectral subtraction / Wiener suppression gain calculation
		const minGain = Math.pow(10, this.reductionDb / 20);
		const threshScale = Math.pow(10, this.thresholdDb / 20);

		for (let k = 0; k <= this.halfFft; k++) {
			const mag = this.magnitude[k] ?? 0;
			const noiseEst = (this.noiseProfile[k] ?? 0) * threshScale;

			let targetGain = 1.0;
			if (mag <= noiseEst) {
				targetGain = minGain;
			} else if (noiseEst > 0) {
				const snr = (mag - noiseEst) / mag;
				targetGain = Math.max(minGain, Math.min(1.0, snr));
			}

			// Smooth bin gain to avoid musical noise
			this.gainBins[k] = (this.gainBins[k] ?? 1) * 0.7 + targetGain * 0.3;

			// Apply to real & imag
			const g = this.gainBins[k] ?? 1;
			this.real[k] = (this.real[k] ?? 0) * g;
			this.imag[k] = (this.imag[k] ?? 0) * g;

			// Mirror symmetric bins for real IFFT
			if (k > 0 && k < this.halfFft) {
				this.real[N - k] = this.real[k] ?? 0;
				this.imag[N - k] = -(this.imag[k] ?? 0);
			}
		}

		// Inverse FFT
		this.fft(this.real, this.imag, true);

		// Overlap-add into output ring buffer with normalization (hop = N/4, Hann sum is 1.5)
		const norm = (1 / 1.5) * (1 / N);
		let writeIdx = (this.outReadPos + (N - this.hopSize)) % this.outRing.length;
		for (let i = 0; i < N; i++) {
			const synth = (this.real[i] ?? 0) * (this.window[i] ?? 0) * norm;
			this.outRing[writeIdx] = (this.outRing[writeIdx] ?? 0) + synth;
			writeIdx = (writeIdx + 1) % this.outRing.length;
		}
	}

	/**
	 * In-place Cooley-Tukey Radix-2 FFT
	 */
	private fft(real: Float32Array, imag: Float32Array, inverse: boolean): void {
		const n = real.length;
		let j = 0;
		for (let i = 0; i < n - 1; i++) {
			if (i < j) {
				const tr = real[i] ?? 0;
				real[i] = real[j] ?? 0;
				real[j] = tr;
				const ti = imag[i] ?? 0;
				imag[i] = imag[j] ?? 0;
				imag[j] = ti;
			}
			let k = n >> 1;
			while (k <= j) {
				j -= k;
				k >>= 1;
			}
			j += k;
		}

		for (let len = 2; len <= n; len <<= 1) {
			const half = len >> 1;
			const angle = ((2 * Math.PI) / len) * (inverse ? 1 : -1);
			const wStepR = Math.cos(angle);
			const wStepI = Math.sin(angle);

			for (let i = 0; i < n; i += len) {
				let wr = 1.0;
				let wi = 0.0;
				for (let m = 0; m < half; m++) {
					const idx1 = i + m;
					const idx2 = idx1 + half;
					const r2 = real[idx2] ?? 0;
					const i2 = imag[idx2] ?? 0;

					const tr = wr * r2 - wi * i2;
					const ti = wr * i2 + wi * r2;

					real[idx2] = (real[idx1] ?? 0) - tr;
					imag[idx2] = (imag[idx1] ?? 0) - ti;
					real[idx1] = (real[idx1] ?? 0) + tr;
					imag[idx1] = (imag[idx1] ?? 0) + ti;

					const nextWr = wr * wStepR - wi * wStepI;
					wi = wr * wStepI + wi * wStepR;
					wr = nextWr;
				}
			}
		}
	}
}
