/// <reference lib="webworker" />

import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	Conversion,
	Input,
	Mp4OutputFormat,
	Output,
	WebMOutputFormat
} from 'mediabunny';
import type { ProxyWorkerInMessage, ProxyWorkerOutMessage } from './proxyProtocol';

const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
let activeConversion: Conversion | null = null;
let activeJobId: string | null = null;
let cancelled = false;

function post(msg: ProxyWorkerOutMessage, transfer: Transferable[] = []) {
	scope.postMessage(msg, transfer);
}

scope.addEventListener('message', async (e: MessageEvent<ProxyWorkerInMessage>) => {
	const msg = e.data;
	if (msg.type === 'cancel') {
		if (activeJobId === msg.jobId && activeConversion) {
			cancelled = true;
			try {
				await activeConversion.cancel();
			} catch {}
			activeConversion = null;
			activeJobId = null;
		}
		return;
	}

	if (msg.type === 'transcode') {
		const { job, sourceFile } = msg;
		activeJobId = job.jobId;
		cancelled = false;

		// DEV-only fault injection check
		if (job.faultInjection) {
			if (job.faultInjection === 'encoder_unsupported') {
				post({
					type: 'error',
					jobId: job.jobId,
					assetId: job.assetId,
					error: 'VideoEncoder configuration is unsupported on this device.'
				});
				activeJobId = null;
				return;
			}
			if (job.faultInjection === 'quota_error') {
				post({
					type: 'error',
					jobId: job.jobId,
					assetId: job.assetId,
					error: 'Storage quota exceeded while writing proxy file.'
				});
				activeJobId = null;
				return;
			}
			if (job.faultInjection === 'decode_error') {
				post({
					type: 'error',
					jobId: job.jobId,
					assetId: job.assetId,
					error: 'Input video codec cannot be decoded.'
				});
				activeJobId = null;
				return;
			}
		}

		try {
			post({
				type: 'progress',
				event: {
					jobId: job.jobId,
					phase: 'decoding',
					progress: 0.05
				}
			});

			const input = new Input({
				source: new BlobSource(sourceFile),
				formats: ALL_FORMATS
			});

			const target = new BufferTarget();
			const outputFormat = job.container === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat();
			const output = new Output({
				format: outputFormat,
				target
			});

			const conversion = await Conversion.init({
				input,
				output,
				video: {
					width: job.targetWidth,
					height: job.targetHeight,
					fit: 'fill',
					codec: job.codec === 'avc' ? 'avc' : 'vp9',
					frameRate: job.fps,
					keyFrameInterval: 0.5, // 0.5s short GOP for fast scrubbing
					forceTranscode: true
				},
				audio: {
					discard: true // video only (no audio)
				},
				showWarnings: false
			});

			if (!conversion.isValid) {
				const reasons = conversion.discardedTracks.map((t) => `${t.reason}`).join(', ');
				throw new Error(
					`Video track cannot be converted to proxy: ${reasons || 'Unsupported configuration'}`
				);
			}

			activeConversion = conversion;

			conversion.onProgress = (progress) => {
				if (cancelled) return;
				post({
					type: 'progress',
					event: {
						jobId: job.jobId,
						phase: 'encoding',
						progress: Math.min(0.95, Math.max(0.05, progress))
					}
				});
			};

			await conversion.execute();

			if (cancelled) return;

			post({
				type: 'progress',
				event: {
					jobId: job.jobId,
					phase: 'writing',
					progress: 0.98
				}
			});

			const buffer = target.buffer;
			if (!buffer || buffer.byteLength === 0) {
				throw new Error('Conversion produced an empty buffer.');
			}

			// Probe generated output to get exact duration
			let durationUs = 0;
			try {
				const probeInput = new Input({
					source: new BlobSource(new Blob([buffer])),
					formats: ALL_FORMATS
				});
				const durationSec = await probeInput.computeDuration();
				durationUs = Math.round(durationSec * 1_000_000);
			} catch {
				// Fallback
				durationUs = 0;
			}

			post(
				{
					type: 'result',
					jobId: job.jobId,
					assetId: job.assetId,
					buffer,
					width: job.targetWidth,
					height: job.targetHeight,
					fps: job.fps,
					durationUs,
					bytes: buffer.byteLength,
					codec: job.codec,
					container: job.container
				},
				[buffer]
			);
		} catch (err: unknown) {
			if (cancelled) return;
			post({
				type: 'error',
				jobId: job.jobId,
				assetId: job.assetId,
				error: err instanceof Error ? err.message : String(err)
			});
		} finally {
			activeConversion = null;
			activeJobId = null;
		}
	}
});
