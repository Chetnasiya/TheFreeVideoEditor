/**
 * Waveform Similarity Overlap-Add (WSOLA) pitch-preserving time-scale modification.
 * Pure TypeScript implementation without external dependencies.
 */

export interface WsolaOptions {
	/** Window size in samples (default 1024). */
	windowSize?: number;
	/** Synthesis hop size in samples (default 512). */
	hopSize?: number;
	/** Search delta in samples (default 256). */
	searchDelta?: number;
	/** Explicit output length in samples (defaults to Math.round(inputLen / speed)). */
	targetLength?: number;
}

/**
 * Stretches or compresses multi-channel audio by `speed` while preserving pitch.
 * Speed in [0.25, 4.0]. Left and right channels share search offsets for stereo phase coherence.
 */
export function wsola(
	inputChannels: readonly Float32Array[],
	speed: number,
	options?: WsolaOptions
): Float32Array[] {
	if (inputChannels.length === 0) return [];
	const inputLen = inputChannels[0]!.length;
	if (inputLen === 0) return inputChannels.map(() => new Float32Array(0));

	const safeSpeed = Math.max(0.05, Math.min(20, speed));
	const targetLen =
		options?.targetLength !== undefined
			? Math.max(0, options.targetLength)
			: Math.max(1, Math.round(inputLen / safeSpeed));

	if (targetLen === 0) return inputChannels.map(() => new Float32Array(0));

	// If speed is practically 1 and targetLen matches inputLen, pass through
	if (Math.abs(safeSpeed - 1) < 1e-4 && targetLen === inputLen) {
		return inputChannels.map((ch) => new Float32Array(ch));
	}

	const W = options?.windowSize ?? 1024;
	const Hs = options?.hopSize ?? Math.round(W / 2);
	const Ha = Hs * safeSpeed;
	const Delta = options?.searchDelta ?? Math.round(W / 4);

	// Pre-compute Hanning analysis/synthesis window
	const win = new Float32Array(W);
	for (let i = 0; i < W; i++) {
		win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * (i + 0.5)) / W));
	}

	// Compute mono downmix for phase-coherent cross-correlation search
	const numChannels = inputChannels.length;
	const mono = new Float32Array(inputLen);
	for (let c = 0; c < numChannels; c++) {
		const ch = inputChannels[c]!;
		for (let i = 0; i < inputLen; i++) {
			mono[i] += ch[i]! / numChannels;
		}
	}

	const maxOutputCapacity = targetLen + W;
	const outputChannels = inputChannels.map(() => new Float32Array(maxOutputCapacity));
	const winSum = new Float32Array(maxOutputCapacity);

	let prevChosenPos = 0;
	let synPos = 0;
	let frameIndex = 0;

	while (synPos < targetLen) {
		const targetAnaPos = Math.round(frameIndex * Ha);
		let chosenPos: number;

		if (frameIndex === 0) {
			chosenPos = Math.max(0, Math.min(inputLen - W, targetAnaPos));
		} else {
			const natContinuation = prevChosenPos + Hs;
			const minSearch = Math.max(0, targetAnaPos - Delta);
			const maxSearch = Math.min(inputLen - W, targetAnaPos + Delta);

			if (minSearch >= maxSearch || natContinuation + W > inputLen) {
				chosenPos = Math.max(0, Math.min(inputLen - W, targetAnaPos));
			} else {
				let bestScore = -Infinity;
				let bestPos = Math.max(0, Math.min(inputLen - W, targetAnaPos));

				for (let candidate = minSearch; candidate <= maxSearch; candidate++) {
					let dot = 0;
					let energyCand = 1e-8;

					for (let k = 0; k < W; k += 2) {
						const sampleCand = mono[candidate + k]!;
						const sampleNat = mono[natContinuation + k]!;
						dot += sampleCand * sampleNat;
						energyCand += sampleCand * sampleCand;
					}

					const normalizedScore = dot / Math.sqrt(energyCand);
					if (normalizedScore > bestScore) {
						bestScore = normalizedScore;
						bestPos = candidate;
					}
				}

				chosenPos = bestPos;
			}
		}

		prevChosenPos = chosenPos;

		// Overlap-add into output channels
		for (let c = 0; c < numChannels; c++) {
			const inCh = inputChannels[c]!;
			const outCh = outputChannels[c]!;
			for (let k = 0; k < W; k++) {
				const inSample = chosenPos + k < inputLen ? inCh[chosenPos + k]! : 0;
				outCh[synPos + k] += inSample * win[k]!;
			}
		}

		for (let k = 0; k < W; k++) {
			winSum[synPos + k] += win[k]!;
		}

		synPos += Hs;
		frameIndex += 1;
	}

	// Normalize by window sum and trim to exact target length
	const result: Float32Array[] = [];
	for (let c = 0; c < numChannels; c++) {
		const outCh = outputChannels[c]!;
		const trimmed = new Float32Array(targetLen);
		for (let i = 0; i < targetLen; i++) {
			const norm = winSum[i]!;
			trimmed[i] = norm > 1e-4 ? outCh[i]! / norm : outCh[i]!;
		}
		result.push(trimmed);
	}

	return result;
}
