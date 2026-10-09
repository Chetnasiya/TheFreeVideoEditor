import type { Project, Time } from '../../core/types';
import { prepareProjectAudioForStt } from './audioPreparation';
import {
	STT_MODELS,
	type SttProgressEvent,
	type SttWordOutput,
	type SttWorkerInMessage,
	type SttWorkerOutMessage
} from './sttProtocol';

export interface AutoCaptionOptions {
	trackId?: string;
	clipIds?: string[];
	range?: { start: Time; end: Time };
	modelId?: string;
	language?: string;
	task?: 'transcribe' | 'translate';
	useWebGpu?: boolean;
	useFake?: boolean;
	onProgress?: (event: SttProgressEvent) => void;
	signal?: AbortSignal;
}

export interface SttHardwareSupport {
	hasWebGpu: boolean;
	hasWasm: boolean;
}

export class LocalSttService {
	private worker: Worker | null = null;
	private supportPromise: Promise<SttHardwareSupport> | null = null;

	private getWorker(): Worker {
		if (!this.worker) {
			this.worker = new Worker(new URL('./stt.worker.ts', import.meta.url), {
				type: 'module'
			});
		}
		return this.worker;
	}

	async checkHardwareSupport(): Promise<SttHardwareSupport> {
		if (this.supportPromise) return this.supportPromise;
		const worker = this.getWorker();

		this.supportPromise = new Promise((resolve) => {
			const handler = (e: MessageEvent<SttWorkerOutMessage>) => {
				if (e.data.type === 'support_result') {
					worker.removeEventListener('message', handler);
					resolve({
						hasWebGpu: e.data.hasWebGpu ?? false,
						hasWasm: e.data.hasWasm ?? true
					});
				}
			};
			worker.addEventListener('message', handler);
			worker.postMessage({ type: 'check_support' } as SttWorkerInMessage);
		});

		return this.supportPromise;
	}

	async listInstalledModels(): Promise<string[]> {
		const worker = this.getWorker();
		return new Promise((resolve) => {
			const handler = (e: MessageEvent<SttWorkerOutMessage>) => {
				if (e.data.type === 'installed_list') {
					worker.removeEventListener('message', handler);
					resolve(e.data.installedModels ?? []);
				}
			};
			worker.addEventListener('message', handler);
			worker.postMessage({ type: 'list_installed' } as SttWorkerInMessage);
		});
	}

	async deleteModel(modelId: string): Promise<string[]> {
		const worker = this.getWorker();
		return new Promise((resolve) => {
			const handler = (e: MessageEvent<SttWorkerOutMessage>) => {
				if (e.data.type === 'installed_list') {
					worker.removeEventListener('message', handler);
					resolve(e.data.installedModels ?? []);
				}
			};
			worker.addEventListener('message', handler);
			worker.postMessage({ type: 'delete_model', modelId } as SttWorkerInMessage);
		});
	}

	async transcribeProject(
		project: Project,
		options: AutoCaptionOptions = {}
	): Promise<SttWordOutput[]> {
		options.onProgress?.({
			phase: 'loading',
			progress: 0.05,
			message: 'Extracting and mixing timeline audio…'
		});

		// 1. Prepare 16kHz mono audio from project
		const audio = await prepareProjectAudioForStt(project, {
			trackId: options.trackId,
			clipIds: options.clipIds,
			range: options.range,
			onProgress(subRatio) {
				options.onProgress?.({
					phase: 'loading',
					progress: subRatio * 0.15,
					message: `Mixing project audio (${Math.round(subRatio * 100)}%)…`
				});
			}
		});

		if (options.signal?.aborted) {
			throw new DOMException('Operation aborted', 'AbortError');
		}

		if (audio.samples.length === 0) {
			return [];
		}

		// 2. Transcribe via Web Worker
		const worker = this.getWorker();

		// Check if DEV fake engine is forced
		const isFake =
			options.useFake ??
			(typeof window !== 'undefined' &&
				(Boolean((window as unknown as { __TFVE_DEV_FAKE_STT?: boolean }).__TFVE_DEV_FAKE_STT) ||
					new URLSearchParams(window.location.search).get('stt') === 'fake'));

		const modelMeta = options.modelId ? STT_MODELS[options.modelId] : undefined;
		const actualModelId =
			modelMeta?.hfModelId ?? options.modelId ?? 'onnx-community/whisper-tiny.en';

		return new Promise<SttWordOutput[]>((resolve, reject) => {
			const onAbort = () => {
				worker.postMessage({ type: 'cancel' } as SttWorkerInMessage);
				cleanup();
				reject(new DOMException('Operation aborted', 'AbortError'));
			};

			const handleMessage = (e: MessageEvent<SttWorkerOutMessage>) => {
				const data = e.data;
				if (data.type === 'progress' && data.event) {
					options.onProgress?.(data.event);
				} else if (data.type === 'result' && data.event) {
					cleanup();
					const rawWords = data.event.words ?? [];
					const offsetWords =
						audio.startOffsetUs > 0
							? rawWords.map((w) => ({
									...w,
									start: w.start + audio.startOffsetUs,
									end: w.end + audio.startOffsetUs
								}))
							: rawWords;
					resolve(offsetWords);
				} else if (data.type === 'error' && data.event) {
					cleanup();
					reject(new Error(data.event.error ?? 'STT Worker transcription error'));
				}
			};

			const handleError = (err: ErrorEvent) => {
				cleanup();
				reject(new Error(`Worker error: ${err.message}`));
			};

			const cleanup = () => {
				worker.removeEventListener('message', handleMessage);
				worker.removeEventListener('error', handleError);
				options.signal?.removeEventListener('abort', onAbort);
			};

			worker.addEventListener('message', handleMessage);
			worker.addEventListener('error', handleError);
			options.signal?.addEventListener('abort', onAbort, { once: true });

			worker.postMessage(
				{
					type: 'transcribe',
					samples: audio.samples,
					sampleRate: audio.sampleRate,
					modelId: actualModelId,
					useWebGpu: options.useWebGpu ?? true,
					useFake: isFake,
					language: options.language,
					task: options.task
				} as SttWorkerInMessage,
				[audio.samples.buffer]
			);
		});
	}
}

export const localSttService = new LocalSttService();
