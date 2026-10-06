import { ALL_FORMATS, AudioSampleSink, BlobSource, Input, VideoSampleSink } from 'mediabunny';

export interface VerifiedExportFile {
	duration: number;
	width: number;
	height: number;
	timestamps: number[];
	black: number[];
	internalGap: number[];
	red: number[];
	secondClipRed: number[];
	green: number[];
	blue: number[];
	yellow: number[];
	magenta: number[];
	cyan: number[];
}

export async function verifyExportFile(file: File, clipStartSeconds: number) {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track) throw new Error('Exported WebM has no video track.');
		const sampleSink = new VideoSampleSink(track);
		const timestamps: number[] = [];
		for await (const sample of sampleSink.samples()) {
			timestamps.push(sample.timestamp);
			sample.close();
		}
		const duration = await input.computeDuration([track]);
		const video = document.createElement('video');
		video.muted = true;
		video.src = URL.createObjectURL(file);
		await new Promise<void>((resolve, reject) => {
			video.onloadedmetadata = () => resolve();
			video.onerror = () => reject(new Error('Could not decode exported video in Chromium.'));
		});
		const canvas = document.createElement('canvas');
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) throw new Error('Canvas is unavailable for export pixel validation.');
		const sampleAt = async (time: number) => {
			const seeked = new Promise<void>((resolve) => {
				video.onseeked = () => resolve();
			});
			video.currentTime = time;
			await seeked;
			context.drawImage(video, 0, 0);
			return Array.from(context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data);
		};
		return {
			duration,
			width: video.videoWidth,
			height: video.videoHeight,
			timestamps,
			black: await sampleAt(0.5),
			internalGap: await sampleAt(clipStartSeconds + 7),
			red: await sampleAt(clipStartSeconds + 0.5),
			secondClipRed: await sampleAt(clipStartSeconds + 8.5),
			green: await sampleAt(clipStartSeconds + 1.5),
			blue: await sampleAt(clipStartSeconds + 2.5),
			yellow: await sampleAt(clipStartSeconds + 3.5),
			magenta: await sampleAt(clipStartSeconds + 4.5),
			cyan: await sampleAt(clipStartSeconds + 5.5)
		};
	} finally {
		input.dispose();
	}
}

export async function verifyExportAudio(file: File) {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const track = await input.getPrimaryAudioTrack();
		if (!track) return { hasTrack: false, rms: 0 };
		const sink = new AudioSampleSink(track);
		let sumSquares = 0;
		let sampleCount = 0;
		for await (const sample of sink.samples()) {
			try {
				for (let channel = 0; channel < sample.numberOfChannels; channel += 1) {
					const plane = new Float32Array(sample.numberOfFrames);
					sample.copyTo(plane, { planeIndex: channel, format: 'f32-planar' });
					for (const value of plane) {
						sumSquares += value * value;
						sampleCount += 1;
					}
				}
			} finally {
				sample.close();
			}
		}
		return {
			hasTrack: true,
			rms: sampleCount ? Math.sqrt(sumSquares / sampleCount) : 0
		};
	} finally {
		input.dispose();
	}
}
