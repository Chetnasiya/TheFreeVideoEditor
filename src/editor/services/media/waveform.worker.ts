interface PeaksRequest {
	samples: Float32Array;
	sampleRate: number;
	bucketsPerSecond: number;
}

interface PeaksResponse {
	sampleRate: number;
	bucketsPerSecond: number;
	min: Int8Array;
	max: Int8Array;
}

self.addEventListener('message', (event: MessageEvent<PeaksRequest>) => {
	const { samples, sampleRate, bucketsPerSecond } = event.data;
	const bucketSize = Math.max(1, Math.round(sampleRate / bucketsPerSecond));
	const count = Math.ceil(samples.length / bucketSize);
	const min = new Int8Array(count);
	const max = new Int8Array(count);
	for (let bucket = 0; bucket < count; bucket += 1) {
		const start = bucket * bucketSize;
		const end = Math.min(samples.length, start + bucketSize);
		let minimum = 1;
		let maximum = -1;
		for (let index = start; index < end; index += 1) {
			const value = samples[index] ?? 0;
			minimum = Math.min(minimum, value);
			maximum = Math.max(maximum, value);
		}
		min[bucket] = Math.round(minimum * 127);
		max[bucket] = Math.round(maximum * 127);
	}
	const result: PeaksResponse = { sampleRate, bucketsPerSecond, min, max };
	self.postMessage(result, { transfer: [min.buffer, max.buffer] });
});
