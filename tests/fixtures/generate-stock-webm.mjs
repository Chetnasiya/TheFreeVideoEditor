import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	const result = await page.evaluate(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 1920;
		canvas.height = 1080;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Canvas 2D is unavailable.');
		const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8'].find((type) =>
			MediaRecorder.isTypeSupported(type)
		);
		if (!mimeType) throw new Error('This browser cannot generate a VP9/VP8 WebM fixture.');
		const chunks = [];
		const stream = canvas.captureStream(0);
		const videoTrack = stream.getVideoTracks()[0];
		if (!(videoTrack instanceof CanvasCaptureMediaStreamTrack)) {
			throw new Error('Manual canvas frame capture is unavailable.');
		}
		const recorder = new MediaRecorder(stream, {
			mimeType,
			videoBitsPerSecond: 600_000
		});
		recorder.addEventListener('dataavailable', (event) => {
			if (event.data.size) chunks.push(event.data);
		});
		const stopped = new Promise((resolve, reject) => {
			recorder.addEventListener('stop', () => resolve(), { once: true });
			recorder.addEventListener(
				'error',
				() => reject(new Error('WebM fixture recording failed.')),
				{
					once: true
				}
			);
		});
		recorder.start();
		const startTime = performance.now();
		for (let frame = 0; frame < 150; frame += 1) {
			const targetTime = startTime + frame * 40;
			const remaining = targetTime - performance.now();
			if (remaining > 0) {
				await new Promise((resolve) => setTimeout(resolve, remaining));
			}
			const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
			gradient.addColorStop(0, `hsl(${(frame * 5) % 360} 78% 42%)`);
			gradient.addColorStop(1, `hsl(${(frame * 5 + 110) % 360} 80% 64%)`);
			context.fillStyle = gradient;
			context.fillRect(0, 0, canvas.width, canvas.height);
			context.fillStyle = '#fff';
			context.font = 'bold 96px sans-serif';
			context.fillText(`FRAME ${String(frame).padStart(3, '0')}`, 80 + frame * 8, 180);
			videoTrack.requestFrame();
		}
		recorder.stop();
		await stopped;
		stream.getTracks().forEach((track) => track.stop());
		const blob = new Blob(chunks, { type: mimeType });
		if (blob.size >= 3_000_000) {
			throw new Error(`Generated stock fixture is too large: ${blob.size} bytes.`);
		}
		const bytes = new Uint8Array(await blob.arrayBuffer());
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		return { bytes: btoa(binary), mimeType, size: blob.size };
	});
	await writeFile(
		new URL('./stock-1080p25-noaudio.webm', import.meta.url),
		Buffer.from(result.bytes, 'base64')
	);
	console.info(`Generated ${result.mimeType} fixture (${result.size} bytes).`);
} finally {
	await browser.close();
}
