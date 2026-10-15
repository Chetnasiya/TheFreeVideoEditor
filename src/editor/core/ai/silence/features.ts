import type { AudioFeatures } from './types';

const FFT_SIZE = 512;
const HALF_FFT = FFT_SIZE / 2;

// Precompute Hann window of length 320 (20 ms at 16 kHz)
const WINDOW_SIZE = 320;
const HANN_WINDOW = new Float32Array(WINDOW_SIZE);
for (let i = 0; i < WINDOW_SIZE; i++) {
	HANN_WINDOW[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (WINDOW_SIZE - 1)));
}

// Precompute bit-reversal and twiddle factors for FFT_SIZE (512)
const BIT_REVERSE = new Uint16Array(FFT_SIZE);
for (let i = 0; i < FFT_SIZE; i++) {
	let rev = 0;
	let val = i;
	for (let bit = 0; bit < 9; bit++) {
		rev = (rev << 1) | (val & 1);
		val >>= 1;
	}
	BIT_REVERSE[i] = rev;
}

const SIN_TABLE = new Float32Array(FFT_SIZE);
const COS_TABLE = new Float32Array(FFT_SIZE);
for (let i = 0; i < FFT_SIZE; i++) {
	const angle = (-2 * Math.PI * i) / FFT_SIZE;
	SIN_TABLE[i] = Math.sin(angle);
	COS_TABLE[i] = Math.cos(angle);
}

// Reusable scratch buffers to avoid heap allocations
const scratchReal = new Float32Array(FFT_SIZE);
const scratchImag = new Float32Array(FFT_SIZE);
const scratchPower = new Float32Array(HALF_FFT);

/**
 * In-place Radix-2 Cooley-Tukey FFT of size 512.
 */
function runFft(real: Float32Array, imag: Float32Array): void {
	// Bit-reversal permutation
	for (let i = 0; i < FFT_SIZE; i++) {
		const target = BIT_REVERSE[i]!;
		if (i < target) {
			const tr = real[i]!;
			real[i] = real[target]!;
			real[target] = tr;
			const ti = imag[i]!;
			imag[i] = imag[target]!;
			imag[target] = ti;
		}
	}

	// Butterfly operations
	for (let halfSize = 1; halfSize < FFT_SIZE; halfSize <<= 1) {
		const step = halfSize << 1;
		const tableStep = FFT_SIZE / step;
		for (let i = 0; i < FFT_SIZE; i += step) {
			for (let j = 0; j < halfSize; j++) {
				const k = j * tableStep;
				const c = COS_TABLE[k]!;
				const s = SIN_TABLE[k]!;
				const match = i + j + halfSize;
				const tr = real[match]! * c - imag[match]! * s;
				const ti = real[match]! * s + imag[match]! * c;
				real[match] = real[i + j]! - tr;
				imag[match] = imag[i + j]! - ti;
				real[i + j] = real[i + j]! + tr;
				imag[i + j] = imag[i + j]! + ti;
			}
		}
	}
}

/**
 * Extracts 10 ms-hop acoustic features from 16 kHz mono PCM samples:
 * - RMS in dB (-100 dB to 0 dB)
 * - Zero-crossing rate (ZCR)
 * - Speech band energy ratio (300 Hz - 3400 Hz)
 * - Spectral flatness measure (Wiener entropy)
 */
export function extractAudioFeatures(
	samples: Float32Array,
	sampleRate = 16000,
	hopMs = 10,
	windowMs = 20
): AudioFeatures {
	const hopSize = Math.round((sampleRate * hopMs) / 1000); // 160 samples (10ms)
	const windowSize = Math.round((sampleRate * windowMs) / 1000); // 320 samples (20ms)

	if (samples.length === 0) {
		return {
			sampleRate,
			hopSize,
			windowSize,
			numFrames: 0,
			rmsDb: new Float32Array(0),
			speechBandRatio: new Float32Array(0),
			spectralFlatness: new Float32Array(0),
			zcr: new Float32Array(0)
		};
	}

	const numFrames = Math.max(1, Math.floor((samples.length - windowSize) / hopSize) + 1);
	const rmsDb = new Float32Array(numFrames);
	const speechBandRatio = new Float32Array(numFrames);
	const spectralFlatness = new Float32Array(numFrames);
	const zcr = new Float32Array(numFrames);

	// Frequency bin indices for 300 Hz - 3400 Hz at 512-point FFT (bin = freq / (16000/512) = freq / 31.25)
	const binWidth = sampleRate / FFT_SIZE; // 31.25 Hz
	const speechMinBin = Math.max(1, Math.floor(300 / binWidth)); // bin ~10 (312.5 Hz)
	const speechMaxBin = Math.min(HALF_FFT - 1, Math.ceil(3400 / binWidth)); // bin ~109 (3406 Hz)

	for (let f = 0; f < numFrames; f++) {
		const offset = f * hopSize;

		// 1. Compute RMS & Zero Crossings over window
		let sumSq = 0;
		let zeroCrossings = 0;
		let prevSign = samples[offset]! >= 0 ? 1 : -1;

		scratchReal.fill(0);
		scratchImag.fill(0);

		for (let i = 0; i < windowSize; i++) {
			const s = samples[offset + i] ?? 0;
			sumSq += s * s;

			const currentSign = s >= 0 ? 1 : -1;
			if (currentSign !== prevSign) {
				zeroCrossings++;
				prevSign = currentSign;
			}

			// Apply Hann window and load into FFT real buffer
			scratchReal[i] = s * (HANN_WINDOW[i] ?? 1);
		}

		const rms = Math.sqrt(sumSq / windowSize);
		// Clamp floor to 1e-5 (-100 dB)
		const frameDb = 20 * Math.log10(Math.max(1e-5, rms));
		rmsDb[f] = frameDb;
		zcr[f] = zeroCrossings / (windowSize - 1);

		// 2. Compute Spectrum via FFT
		runFft(scratchReal, scratchImag);

		let totalEnergy = 0;
		let speechBandEnergy = 0;
		let sumLog = 0;
		let activeBins = 0;

		for (let k = 1; k < HALF_FFT; k++) {
			const r = scratchReal[k]!;
			const im = scratchImag[k]!;
			const power = r * r + im * im;
			scratchPower[k] = power;
			totalEnergy += power;

			if (k >= speechMinBin && k <= speechMaxBin) {
				speechBandEnergy += power;
			}

			// For spectral flatness (exclude DC)
			const pSafe = Math.max(1e-12, power);
			sumLog += Math.log(pSafe);
			activeBins++;
		}

		speechBandRatio[f] = totalEnergy > 1e-9 ? speechBandEnergy / totalEnergy : 0;

		if (totalEnergy > 1e-9 && activeBins > 0) {
			const geometricMean = Math.exp(sumLog / activeBins);
			const arithmeticMean = totalEnergy / activeBins;
			spectralFlatness[f] =
				arithmeticMean > 1e-12 ? Math.min(1, geometricMean / arithmeticMean) : 0;
		} else {
			spectralFlatness[f] = 0;
		}
	}

	return {
		sampleRate,
		hopSize,
		windowSize,
		numFrames,
		rmsDb,
		speechBandRatio,
		spectralFlatness,
		zcr
	};
}
