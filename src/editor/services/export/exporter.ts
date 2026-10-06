import {
	AudioSample,
	AudioSampleSource,
	CanvasSource,
	Mp4OutputFormat,
	Output,
	WebMOutputFormat
} from 'mediabunny';
import type { AssetId, Project } from '../../core';
import { resolveFrame } from '../../core';
import { renderFrame, type LastGoodFrames } from '../playback/compositor';
import { getMediaFile } from '../storage/opfs';
import { audioSchedulesForChunk, decodeAudioAssets, mixAudioChunk } from './audioMix';
import { ExportFrameProvider } from './frameProvider';
import { buildExportPlan, type ExportPlan, type ExportSettings } from './plan';
import { createExportSink, createExportSinkForTarget, type ExportSink } from './sink';
import { createStreamingSaveTarget } from '../storage/fileAccess';
import type { StreamingSaveTarget } from '../storage/fileAccess';
import type { ExportWorkerRequest, ExportWorkerResponse } from './workerProtocol';
import { WorkerAudioMixer } from './workerAudioMix';
import { recordExportPath, recordExportProgress, recordWorkerTermination } from './testHooks';
import type { ExportPath } from './testHooks';
import { workerExportFallbackReason, yieldToEventLoop } from './workerSupport';
export { recordExportPath } from './testHooks';

export type ExportProgressPhase =
	'preparing' | 'rendering' | 'encoding' | 'finalizing' | 'complete' | 'cancelled' | 'error';

export interface ExportProgress {
	framesDone: number;
	totalFrames: number;
	fps: number;
	etaMs: number;
	phase: ExportProgressPhase;
	percent: number;
}

export type ExportErrorCode =
	| 'EMPTY_TIMELINE'
	| 'UNSUPPORTED_CODEC'
	| 'OFFLINE_MEDIA'
	| 'DECODE_FAILED'
	| 'ENCODE_FAILED'
	| 'CANCELLED'
	| 'STORAGE_FAILED';

export class ExportError extends Error {
	constructor(
		readonly code: ExportErrorCode,
		message: string,
		options?: ErrorOptions
	) {
		super(message, options);
		this.name = 'ExportError';
	}
}

export interface ExportRunOptions {
	signal?: AbortSignal;
	onProgress?: (progress: ExportProgress) => void;
	getFile?: typeof getMediaFile;
	sink?: ExportSink;
	videoCodec?: string;
	audioCodec?: string;
	forceMainThread?: boolean;
	workerFactory?: () => Worker;
	onFallback?: (reason: string) => void;
}

export interface ExportResult {
	blob: Blob | null;
	plan: ExportPlan;
	path?: Exclude<ExportPath, 'compatibility'>;
}

function emitProgress(
	callback: ExportRunOptions['onProgress'],
	values: Omit<ExportProgress, 'percent'>
): void {
	callback?.({
		...values,
		percent:
			values.phase === 'complete'
				? 100
				: values.totalFrames > 0
					? Math.min(99, Math.round((values.framesDone / values.totalFrames) * 100))
					: 0
	});
	recordExportProgress({
		framesDone: values.framesDone,
		totalFrames: values.totalFrames,
		fps: values.fps,
		phase: values.phase
	});
}

function cancelled(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new ExportError('CANCELLED', 'Export cancelled.', {
			cause: signal.reason
		});
	}
}

async function exportTimelineMain(
	project: Project,
	settings: ExportSettings,
	options: ExportRunOptions = {}
): Promise<ExportResult> {
	let plan: ExportPlan;
	try {
		plan = buildExportPlan(project, settings);
	} catch (error) {
		throw new ExportError(
			'EMPTY_TIMELINE',
			error instanceof Error ? error.message : 'Timeline cannot be exported.',
			{ cause: error }
		);
	}
	const snapshot = structuredClone(project);
	const sink = options.sink ?? (await createExportSink(settings.filename, settings.format));
	if (!sink) throw new ExportError('CANCELLED', 'Export save dialog was cancelled.');
	const frameProvider = new ExportFrameProvider(snapshot, options.getFile);
	let audioContext: AudioContext | null = null;
	let output: Output | null = null;
	let audioSource: AudioSampleSource | null = null;
	let audioBuffers: Map<AssetId, AudioBuffer> | null = null;
	let workerAudioMixer: WorkerAudioMixer | null = null;
	const lastGoodFrames: LastGoodFrames = new Map();
	const startedAt = performance.now();
	let outputStarted = false;
	let completed = false;
	try {
		cancelled(options.signal);
		if (typeof OffscreenCanvas === 'undefined') {
			throw new ExportError('UNSUPPORTED_CODEC', 'OffscreenCanvas is unavailable in this browser.');
		}
		const canvas = new OffscreenCanvas(plan.width, plan.height);
		const context = canvas.getContext('2d');
		if (!context) throw new ExportError('UNSUPPORTED_CODEC', 'Canvas rendering is unavailable.');
		const format = settings.format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat();
		output = new Output({ format, target: sink.target });
		const videoCodec =
			settings.format === 'mp4'
				? 'avc'
				: options.videoCodec?.startsWith('av01')
					? 'av1'
					: options.videoCodec?.startsWith('vp8')
						? 'vp8'
						: 'vp9';
		const videoSource = new CanvasSource(canvas, {
			codec: videoCodec,
			...(options.videoCodec ? { fullCodecString: options.videoCodec } : {}),
			bitrate: settings.videoBitrate,
			keyFrameInterval: 2,
			latencyMode: 'quality'
		});
		output.addVideoTrack(videoSource);

		const hasAudioAssets = Object.values(snapshot.assets).some(
			(asset) => asset.hasAudio && !asset.offline
		);
		if (settings.audio && hasAudioAssets) {
			if (typeof AudioContext === 'undefined') {
				workerAudioMixer = new WorkerAudioMixer(snapshot, options.getFile ?? getMediaFile);
			} else {
				audioContext = new AudioContext();
				audioBuffers = await decodeAudioAssets(snapshot, audioContext, options.getFile);
			}
			if (
				[...snapshot.tracks].some(
					(track) => track.kind === 'audio' && !track.muted && track.clips.length
				)
			) {
				audioSource = new AudioSampleSource({
					codec: settings.format === 'mp4' ? 'aac' : 'opus',
					...(options.audioCodec ? { fullCodecString: options.audioCodec } : {}),
					bitrate: settings.audioBitrate
				});
				output.addAudioTrack(audioSource);
			}
		}

		emitProgress(options.onProgress, {
			framesDone: 0,
			totalFrames: plan.totalFrames,
			fps: 0,
			etaMs: 0,
			phase: 'preparing'
		});
		await output.start();
		outputStarted = true;
		for (let frame = 0; frame < plan.totalFrames; frame += 1) {
			cancelled(options.signal);
			const timestamp = plan.timestamp(frame);
			const resolved = resolveFrame(snapshot, timestamp);
			await frameProvider.prepare(resolved.videoLayers, options.signal);
			renderFrame(
				context,
				{ width: plan.width, height: plan.height },
				resolved.videoLayers,
				(layer) => frameProvider.getFrame(layer),
				lastGoodFrames
			);
			await videoSource.add(timestamp / 1_000_000, plan.frameDuration / 1_000_000, {
				keyFrame: frame % (plan.fps * 2) === 0
			});

			if (audioSource && frame === 0) {
				const chunkTicks = 10_000_000;
				for (let chunkStart = 0; chunkStart < plan.durationUs; chunkStart += chunkTicks) {
					cancelled(options.signal);
					const chunkDuration = Math.min(chunkTicks, plan.durationUs - chunkStart);
					if (workerAudioMixer) {
						const sample = await workerAudioMixer.mixChunk(
							chunkStart,
							chunkDuration,
							snapshot.settings.sampleRate,
							options.signal
						);
						if (sample) {
							try {
								await audioSource.add(sample);
							} finally {
								sample.close();
							}
						}
					} else if (
						audioBuffers &&
						audioSchedulesForChunk(snapshot, chunkStart, chunkDuration).length
					) {
						const mixed = await mixAudioChunk(
							snapshot,
							chunkStart,
							chunkDuration,
							audioBuffers,
							snapshot.settings.sampleRate
						);
						for (const sample of AudioSample.fromAudioBuffer(mixed, chunkStart / 1_000_000)) {
							try {
								await audioSource.add(sample);
							} finally {
								sample.close();
							}
						}
					}
					await yieldToEventLoop();
				}
			}
			if (frame === 0 || frame % Math.max(1, Math.floor(plan.fps / 2)) === 0) {
				const elapsed = Math.max(1, performance.now() - startedAt);
				const currentFps = ((frame + 1) * 1000) / elapsed;
				emitProgress(options.onProgress, {
					framesDone: frame + 1,
					totalFrames: plan.totalFrames,
					fps: currentFps,
					etaMs: Math.max(0, ((plan.totalFrames - frame - 1) * 1000) / currentFps),
					phase: 'rendering'
				});
			}
			await yieldToEventLoop();
		}
		cancelled(options.signal);
		emitProgress(options.onProgress, {
			framesDone: plan.totalFrames,
			totalFrames: plan.totalFrames,
			fps: plan.totalFrames / Math.max(0.001, (performance.now() - startedAt) / 1000),
			etaMs: 0,
			phase: 'finalizing'
		});
		await output.finalize();
		const blob = await sink.finish();
		completed = true;
		emitProgress(options.onProgress, {
			framesDone: plan.totalFrames,
			totalFrames: plan.totalFrames,
			fps: plan.totalFrames / Math.max(0.001, (performance.now() - startedAt) / 1000),
			etaMs: 0,
			phase: 'complete'
		});
		return { blob, plan };
	} catch (error) {
		if (outputStarted && output && output.state !== 'finalized' && output.state !== 'canceled') {
			await output.cancel();
		}
		await sink.abort(error);
		if (error instanceof ExportError) throw error;
		if (error instanceof DOMException && error.name === 'AbortError') {
			throw new ExportError('CANCELLED', 'Export cancelled.', { cause: error });
		}
		throw new ExportError(
			error instanceof Error &&
				(error.name === 'FrameProviderError' || error.name === 'AudioMixError')
				? 'DECODE_FAILED'
				: 'ENCODE_FAILED',
			error instanceof Error ? error.message : 'Video export failed.',
			{ cause: error }
		);
	} finally {
		await frameProvider.dispose();
		await workerAudioMixer?.dispose();
		if (audioContext && audioContext.state !== 'closed') await audioContext.close();
		if (!completed && output?.state === 'started') await output.cancel();
	}
}

function terminateWorker(worker: Worker): void {
	worker.terminate();
	recordWorkerTermination();
}

function workerError(code: string, message: string): ExportError {
	return new ExportError(
		code === 'CANCELLED'
			? 'CANCELLED'
			: code === 'UNSUPPORTED_CODEC'
				? 'UNSUPPORTED_CODEC'
				: code === 'DECODE_FAILED'
					? 'DECODE_FAILED'
					: 'ENCODE_FAILED',
		message
	);
}

async function tryWorkerExport(
	settings: ExportSettings,
	plan: ExportPlan,
	snapshot: Project,
	options: ExportRunOptions,
	streaming: StreamingSaveTarget | null
): Promise<ExportResult | null> {
	const unsupportedReason = workerExportFallbackReason({
		moduleWorker: typeof Worker !== 'undefined',
		offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
		workerWebCodecs: true
	});
	if (unsupportedReason || options.sink || (options.getFile && options.getFile !== getMediaFile)) {
		if (unsupportedReason) options.onFallback?.(unsupportedReason);
		return null;
	}

	let worker: Worker;
	try {
		worker =
			options.workerFactory?.() ??
			new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
	} catch {
		return null;
	}

	const memoryChunks: Uint8Array[] = [];
	let bytes = 0;
	let settled = false;
	let started = false;
	let resolveResult: ((value: ExportResult) => void) | undefined;
	let rejectResult: ((error: Error) => void) | undefined;
	let resolveReady: ((value: { supported: boolean; reason?: string }) => void) | undefined;
	let probeSettled = false;
	let cancelTimer: ReturnType<typeof setTimeout> | undefined;
	let onAbort: (() => void) | undefined;
	const resultPromise = new Promise<ExportResult>((resolve, reject) => {
		resolveResult = resolve;
		rejectResult = reject;
	});

	const finish = async (error?: Error, result?: ExportResult) => {
		if (settled) return;
		settled = true;
		if (cancelTimer !== undefined) clearTimeout(cancelTimer);
		if (onAbort && options.signal) options.signal.removeEventListener('abort', onAbort);
		if (error) {
			try {
				await streaming?.abort(error);
			} catch (abortError) {
				error = new ExportError('STORAGE_FAILED', 'Could not discard the partial export file.', {
					cause: abortError
				});
			}
			rejectResult?.(error);
		} else if (result) {
			resolveResult?.(result);
		}
		terminateWorker(worker);
	};

	const ready = new Promise<{ supported: boolean; reason?: string }>((resolve) => {
		resolveReady = resolve;
	});
	let lastReportedFps = 0;

	worker.addEventListener('message', (event: MessageEvent<ExportWorkerResponse>) => {
		const message = event.data;
		if (message.type === 'ready') {
			if (!probeSettled) {
				probeSettled = true;
				resolveReady?.({
					supported: message.supported,
					...(message.reason ? { reason: message.reason } : {})
				});
			}
			return;
		}
		if (message.type === 'progress') {
			lastReportedFps = message.fps;
			emitProgress(options.onProgress, {
				phase: message.phase as ExportProgressPhase,
				framesDone: message.framesDone,
				totalFrames: message.totalFrames,
				fps: message.fps,
				etaMs: message.etaMs
			});
			return;
		}
		if (message.type === 'chunk') {
			const chunkId = message.chunkId;
			void (async () => {
				try {
					const chunk = new Uint8Array(message.buffer);
					if (streaming) await streaming.write(chunk, message.position);
					else memoryChunks.push(chunk.slice());
					bytes += chunk.byteLength;
					const ack: ExportWorkerRequest = { type: 'ack', jobId: message.jobId, chunkId };
					worker.postMessage(ack);
				} catch (error) {
					const failure =
						error instanceof Error ? error : new Error('Could not write export output.');
					const ack: ExportWorkerRequest = {
						type: 'ack',
						jobId: message.jobId,
						chunkId,
						error: failure.message
					};
					worker.postMessage(ack);
					await finish(new ExportError('STORAGE_FAILED', failure.message, { cause: error }));
				}
			})();
			return;
		}
		if (message.type === 'done') {
			void (async () => {
				try {
					if (message.bytes !== bytes) {
						throw new Error('Export worker output byte count did not match the received chunks.');
					}
					if (streaming) await streaming.close();
					const blob = streaming
						? null
						: new Blob(
								memoryChunks.map((chunk) => {
									const copy = new Uint8Array(chunk.byteLength);
									copy.set(chunk);
									return copy.buffer;
								}),
								{ type: settings.format === 'mp4' ? 'video/mp4' : 'video/webm' }
							);
					emitProgress(options.onProgress, {
						phase: 'complete',
						framesDone: plan.totalFrames,
						totalFrames: plan.totalFrames,
						fps: lastReportedFps,
						etaMs: 0
					});
					await finish(undefined, { blob, plan, path: 'worker-webcodecs' });
				} catch (error) {
					await finish(
						error instanceof Error ? error : new Error('Could not finalize the export file.')
					);
				}
			})();
			return;
		}
		if (message.type === 'error') {
			if (!started) {
				probeSettled = true;
				resolveReady?.({ supported: false, reason: message.message });
				return;
			}
			void finish(workerError(message.code, message.message));
		}
	});
	worker.addEventListener('error', (event) => {
		if (!started) {
			probeSettled = true;
			resolveReady?.({ supported: false, reason: event.message });
			return;
		}
		void finish(new ExportError('ENCODE_FAILED', event.message || 'The export worker failed.'));
	});
	worker.addEventListener('messageerror', () => {
		if (!started) {
			probeSettled = true;
			resolveReady?.({ supported: false, reason: 'Worker message transfer is unavailable.' });
			return;
		}
		void finish(new ExportError('ENCODE_FAILED', 'Could not transfer export data to the worker.'));
	});

	try {
		const probe: ExportWorkerRequest = { type: 'probe', settings };
		worker.postMessage(probe);
		const workerResult = await Promise.race([
			ready,
			new Promise<{ supported: boolean; reason: string }>((resolve) =>
				setTimeout(
					() => resolve({ supported: false, reason: 'Worker capability check timed out.' }),
					2_000
				)
			)
		]);
		if (!workerResult.supported) {
			terminateWorker(worker);
			options.onFallback?.(
				workerExportFallbackReason({
					moduleWorker: true,
					offscreenCanvas: true,
					workerWebCodecs: false
				}) ??
					workerResult.reason ??
					'Worker WebCodecs is unavailable.'
			);
			return null;
		}

		const files: Array<{ assetId: AssetId; file: File }> = [];
		for (const asset of Object.values(snapshot.assets)) {
			if (asset.offline) continue;
			files.push({
				assetId: asset.id,
				file: await (options.getFile ?? getMediaFile)(snapshot.id, asset)
			});
		}
		const jobId = crypto.randomUUID();
		const message: ExportWorkerRequest = {
			type: 'start',
			jobId,
			project: snapshot,
			settings,
			files,
			...(options.videoCodec ? { videoCodec: options.videoCodec } : {}),
			...(options.audioCodec ? { audioCodec: options.audioCodec } : {})
		};
		started = true;
		recordExportPath('worker-webcodecs');
		worker.postMessage(message);
		onAbort = () => {
			if (!started || settled) return;
			const cancel: ExportWorkerRequest = { type: 'cancel', jobId };
			worker.postMessage(cancel);
			cancelTimer = setTimeout(() => {
				void finish(new ExportError('CANCELLED', 'Export cancelled; worker cleanup timed out.'));
			}, 2_000);
		};
		options.signal?.addEventListener('abort', onAbort, { once: true });
		if (options.signal?.aborted) onAbort();
		return await resultPromise;
	} catch (error) {
		if (started) {
			await finish(error instanceof Error ? error : new Error('Worker export failed.'));
			throw error;
		}
		terminateWorker(worker);
		options.onFallback?.('The export worker could not be initialized.');
		if (error instanceof DOMException && error.name === 'AbortError') throw error;
		return null;
	}
}

export async function exportTimeline(
	project: Project,
	settings: ExportSettings,
	options: ExportRunOptions = {}
): Promise<ExportResult> {
	if (options.forceMainThread || options.sink) {
		recordExportPath('main-webcodecs');
		return { ...(await exportTimelineMain(project, settings, options)), path: 'main-webcodecs' };
	}
	const plan = buildExportPlan(project, settings);
	const snapshot = structuredClone(project);
	let streaming: StreamingSaveTarget | null = null;
	try {
		streaming = await createStreamingSaveTarget(settings.filename, [
			{
				description: settings.format === 'mp4' ? 'MP4 video' : 'WebM video',
				accept: {
					[settings.format === 'mp4' ? 'video/mp4' : 'video/webm']: [`.${settings.format}`]
				}
			}
		]);
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') {
			throw new ExportError('CANCELLED', 'Export save dialog was cancelled.', { cause: error });
		}
		throw error;
	}
	try {
		const workerResult = await tryWorkerExport(settings, plan, snapshot, options, streaming);
		if (workerResult) return workerResult;
		recordExportPath('main-webcodecs');
		options.onFallback?.(
			'Worker WebCodecs is unavailable; using the yielding main-thread encoder.'
		);
		const sink = createExportSinkForTarget(settings.format, streaming);
		return {
			...(await exportTimelineMain(project, settings, { ...options, sink })),
			path: 'main-webcodecs'
		};
	} catch (error) {
		if (error instanceof ExportError && error.code === 'CANCELLED') throw error;
		throw error;
	}
}
