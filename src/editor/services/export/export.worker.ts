/// <reference lib="webworker" />

import { ExportError, exportTimeline } from './exporter';
import type { ExportWorkerRequest, ExportWorkerResponse } from './workerProtocol';
import type { ExportSink } from './sink';
import { StreamTarget } from 'mediabunny';
import type { AssetId } from '../../core';
import type { Project } from '../../core';
import type { ExportSettings } from './plan';

const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
let activeJob:
	| {
			id: string;
			controller: AbortController;
			pending: Map<number, { resolve: () => void; reject: (error: Error) => void }>;
	  }
	| undefined;

function send(message: ExportWorkerResponse, transfer: Transferable[] = []): void {
	scope.postMessage(message, transfer);
}

async function probe(settings: ExportSettings): Promise<void> {
	try {
		if (typeof OffscreenCanvas === 'undefined') {
			send({ type: 'ready', supported: false, reason: 'OffscreenCanvas is unavailable.' });
			return;
		}
		const { getExportCapabilities } = await import('./capabilities');
		const result = await getExportCapabilities(settings);
		const supported = result.video && (!settings.audio || result.audio);
		send({
			type: 'ready',
			supported,
			...(!supported
				? {
						reason:
							result.reason ||
							'Worker WebCodecs video or audio encoding is unavailable in this browser.'
					}
				: {})
		});
	} catch (error) {
		send({
			type: 'ready',
			supported: false,
			reason: error instanceof Error ? error.message : 'Worker capability check failed.'
		});
	}
}

function makeSink(
	jobId: string,
	pending: Map<number, { resolve: () => void; reject: (error: Error) => void }>,
	onBytes: (count: number) => void
): ExportSink {
	let nextChunkId = 0;
	const writable = new WritableStream<{
		type: 'write';
		data: Uint8Array<ArrayBuffer>;
		position: number;
	}>({
		write(chunk) {
			const chunkId = nextChunkId++;
			const buffer = chunk.data.slice().buffer;
			return new Promise<void>((resolve, reject) => {
				pending.set(chunkId, { resolve, reject });
				onBytes(buffer.byteLength);
				send({ type: 'chunk', jobId, chunkId, position: chunk.position, buffer }, [buffer]);
			});
		}
	});
	return {
		target: new StreamTarget(writable, { chunked: true }),
		async finish() {
			return null;
		},
		async abort(error) {
			for (const waiter of pending.values()) {
				waiter.reject(
					error instanceof Error ? error : new DOMException('Export cancelled.', 'AbortError')
				);
			}
			pending.clear();
		}
	};
}

async function start(message: Extract<ExportWorkerRequest, { type: 'start' }>): Promise<void> {
	if (activeJob) {
		send({
			type: 'error',
			jobId: message.jobId,
			code: 'ENCODE_FAILED',
			message: 'An export is already running in this worker.'
		});
		return;
	}
	const controller = new AbortController();
	const pending = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
	let bytesWritten = 0;
	activeJob = { id: message.jobId, controller, pending };
	const files = new Map<AssetId, File>(message.files.map(({ assetId, file }) => [assetId, file]));
	const getFile = async (_projectId: Project['id'], asset: Project['assets'][AssetId]) => {
		const file = files.get(asset.id);
		if (!file)
			throw new Error(`Media file for “${asset.name}” was not transferred to the export worker.`);
		return file;
	};
	try {
		const result = await exportTimeline(message.project, message.settings, {
			forceMainThread: true,
			signal: controller.signal,
			getFile,
			sink: makeSink(message.jobId, pending, (count) => {
				bytesWritten += count;
			}),
			...(message.videoCodec ? { videoCodec: message.videoCodec } : {}),
			...(message.audioCodec ? { audioCodec: message.audioCodec } : {}),
			onProgress(progress) {
				send({
					type: 'progress',
					phase: progress.phase,
					framesDone: progress.framesDone,
					totalFrames: progress.totalFrames,
					fps: progress.fps,
					etaMs: progress.etaMs
				});
			}
		});
		send({
			type: 'done',
			jobId: message.jobId,
			bytes: bytesWritten,
			durationUs: result.plan.durationUs
		});
	} catch (error) {
		const code =
			error instanceof ExportError
				? error.code
				: error instanceof Error && error.name === 'FrameProviderError'
					? 'DECODE_FAILED'
					: 'ENCODE_FAILED';
		send({
			type: 'error',
			jobId: message.jobId,
			code,
			message: error instanceof Error ? error.message : 'Video export failed.'
		});
	} finally {
		if (activeJob?.id === message.jobId) activeJob = undefined;
	}
}

scope.addEventListener('message', (event: MessageEvent<ExportWorkerRequest>) => {
	const message = event.data;
	if (message.type === 'probe') {
		void probe(message.settings);
		return;
	}
	if (message.type === 'start') {
		void start(message);
		return;
	}
	if (message.type === 'cancel') {
		if (activeJob?.id === message.jobId) {
			activeJob.controller.abort(new DOMException('Export cancelled.', 'AbortError'));
		}
		return;
	}
	if (message.type === 'ack' && activeJob?.id === message.jobId) {
		const pending = activeJob.pending.get(message.chunkId);
		if (!pending) return;
		activeJob.pending.delete(message.chunkId);
		if (message.error) pending.reject(new Error(message.error));
		else pending.resolve();
	}
});
