import fs from 'node:fs';
import path from 'node:path';

function writeWavFile(filePath, numChannels, sampleRate, samplesL, samplesR) {
	const numSamples = samplesL.length;
	const bytesPerSample = 2; // 16-bit PCM
	const blockAlign = numChannels * bytesPerSample;
	const byteRate = sampleRate * blockAlign;
	const dataSize = numSamples * blockAlign;
	const buffer = Buffer.alloc(44 + dataSize);

	// RIFF header
	buffer.write('RIFF', 0);
	buffer.writeUInt32LE(36 + dataSize, 4);
	buffer.write('WAVE', 8);

	// fmt chunk
	buffer.write('fmt ', 12);
	buffer.writeUInt32LE(16, 16); // subchunk1 size (16 for PCM)
	buffer.writeUInt16LE(1, 20); // audio format (1 = PCM)
	buffer.writeUInt16LE(numChannels, 22);
	buffer.writeUInt32LE(sampleRate, 24);
	buffer.writeUInt32LE(byteRate, 28);
	buffer.writeUInt16LE(blockAlign, 32);
	buffer.writeUInt16LE(16, 34); // bits per sample

	// data chunk
	buffer.write('data', 36);
	buffer.writeUInt32LE(dataSize, 40);

	let offset = 44;
	for (let i = 0; i < numSamples; i++) {
		const sL = Math.max(-1, Math.min(1, samplesL[i]));
		const valL = sL < 0 ? Math.floor(sL * 32768) : Math.floor(sL * 32767);
		buffer.writeInt16LE(valL, offset);
		offset += 2;

		if (numChannels === 2) {
			const sR = Math.max(-1, Math.min(1, samplesR ? samplesR[i] : samplesL[i]));
			const valR = sR < 0 ? Math.floor(sR * 32768) : Math.floor(sR * 32767);
			buffer.writeInt16LE(valR, offset);
			offset += 2;
		}
	}

	fs.writeFileSync(filePath, buffer);
}

const sampleRate = 48000;
const durationSeconds = 3;
const totalSamples = sampleRate * durationSeconds;
const outDir = path.resolve(process.cwd(), 'tests/fixtures/audio');

if (!fs.existsSync(outDir)) {
	fs.mkdirSync(outDir, { recursive: true });
}

// 1. 1 kHz Sine (-6 dBFS = 0.5 amplitude)
{
	const samplesL = new Float32Array(totalSamples);
	const samplesR = new Float32Array(totalSamples);
	const freq = 1000;
	const amp = 0.5; // -6.02 dBFS
	for (let i = 0; i < totalSamples; i++) {
		const val = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
		samplesL[i] = val;
		samplesR[i] = val;
	}
	writeWavFile(path.join(outDir, 'sine-1khz.wav'), 2, sampleRate, samplesL, samplesR);
}

// 2. Stereo Distinct L/R: 440 Hz Left, 880 Hz Right
{
	const samplesL = new Float32Array(totalSamples);
	const samplesR = new Float32Array(totalSamples);
	const amp = 0.5;
	for (let i = 0; i < totalSamples; i++) {
		samplesL[i] = amp * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
		samplesR[i] = amp * Math.sin((2 * Math.PI * 880 * i) / sampleRate);
	}
	writeWavFile(path.join(outDir, 'stereo-440-880.wav'), 2, sampleRate, samplesL, samplesR);
}

// 3. White Noise (Deterministic PRNG)
{
	const samplesL = new Float32Array(totalSamples);
	const samplesR = new Float32Array(totalSamples);
	let seed = 123456789;
	function rnd() {
		seed = (1103515245 * seed + 12345) & 0x7fffffff;
		return (seed / 0x7fffffff) * 2 - 1;
	}
	for (let i = 0; i < totalSamples; i++) {
		const valL = rnd() * 0.3; // -10 dBFS peak approx
		const valR = rnd() * 0.3;
		samplesL[i] = valL;
		samplesR[i] = valR;
	}
	writeWavFile(path.join(outDir, 'white-noise.wav'), 2, sampleRate, samplesL, samplesR);
}

// 4. Pink Noise (Paul Kellet's filter, deterministic)
{
	const samplesL = new Float32Array(totalSamples);
	const samplesR = new Float32Array(totalSamples);
	let seed = 987654321;
	function rnd() {
		seed = (1103515245 * seed + 12345) & 0x7fffffff;
		return (seed / 0x7fffffff) * 2 - 1;
	}
	let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
	for (let i = 0; i < totalSamples; i++) {
		const white = rnd();
		b0 = 0.99886 * b0 + white * 0.0555179;
		b1 = 0.99332 * b1 + white * 0.0750759;
		b2 = 0.96900 * b2 + white * 0.1538520;
		b3 = 0.86650 * b3 + white * 0.3104856;
		b4 = 0.55000 * b4 + white * 0.5329522;
		b5 = -0.7616 * b5 - white * 0.0168980;
		const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
		b6 = white * 0.115926;
		samplesL[i] = pink;
		samplesR[i] = pink;
	}
	writeWavFile(path.join(outDir, 'pink-noise.wav'), 2, sampleRate, samplesL, samplesR);
}

// 5. Logarithmic Frequency Sweep (20 Hz to 20,000 Hz)
{
	const samplesL = new Float32Array(totalSamples);
	const samplesR = new Float32Array(totalSamples);
	const f0 = 20;
	const f1 = 20000;
	const T = durationSeconds;
	const amp = 0.5;
	for (let i = 0; i < totalSamples; i++) {
		const t = i / sampleRate;
		// Instantaneous phase for log sweep: phi(t) = 2*pi * f0 * ( (f1/f0)^(t/T) - 1 ) / ln(f1/f0)
		const phase = (2 * Math.PI * f0 * (Math.pow(f1 / f0, t / T) - 1)) / Math.log(f1 / f0);
		const val = amp * Math.sin(phase);
		samplesL[i] = val;
		samplesR[i] = val;
	}
	writeWavFile(path.join(outDir, 'log-sweep.wav'), 2, sampleRate, samplesL, samplesR);
}

// 6. Sibilance Tone Burst (500 Hz carrier + 6 kHz burst for de-esser)
{
	const samplesL = new Float32Array(totalSamples);
	const samplesR = new Float32Array(totalSamples);
	for (let i = 0; i < totalSamples; i++) {
		const t = i / sampleRate;
		// Base tone: 500 Hz at -12 dBFS (amp = 0.25)
		let val = 0.25 * Math.sin(2 * Math.PI * 500 * t);
		// Add 6 kHz sibilance burst between 1.0s and 1.8s at 0 dBFS (amp = 0.75)
		if (t >= 1.0 && t <= 1.8) {
			val += 0.75 * Math.sin(2 * Math.PI * 6000 * t);
		}
		samplesL[i] = val;
		samplesR[i] = val;
	}
	writeWavFile(path.join(outDir, 'sibilance-burst.wav'), 2, sampleRate, samplesL, samplesR);
}

