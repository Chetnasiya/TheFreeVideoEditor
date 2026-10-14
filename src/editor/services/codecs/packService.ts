import type {
	CodecPackHardwareSupport,
	CodecPackMetadata,
	CodecPackProgress,
	CodecPackWorkerInMessage,
	CodecPackWorkerOutMessage
} from './packProtocol';

export const CODEC_PACK_METADATA: CodecPackMetadata = {
	id: 'tfve-codec-pack-pro',
	name: 'Advanced Codec Pack (ProRes / DNxHR / Ingest)',
	version: '1.0.0',
	sizeLabel: '~12 MB',
	license: 'LGPL-2.1-or-later',
	formats: ['QuickTime MOV', 'Material eXchange Format (MXF)', 'MPEG-TS', 'WAV'],
	decoders: [
		'Apple ProRes (Proxy, LT, 422, 422 HQ, 4444)',
		'Avid DNxHD / DNxHR (SMPTE VC-3)',
		'MPEG-2 Video 4:2:2 (XDCAM)',
		'FFV1 Lossless Archival',
		'PCM 16/24/32f'
	],
	encoders: [
		'Apple ProRes-compatible (Proxy, LT, 422, 422 HQ, 4444)',
		'Avid DNxHD / DNxHR',
		'PCM 24-bit / 32f'
	]
};

export class CodecPackService {
	private worker: Worker | null = null;
	private supportPromise: Promise<CodecPackHardwareSupport> | null = null;

	private getWorker(): Worker {
		if (!this.worker) {
			this.worker = new Worker(new URL('./pack.worker.ts', import.meta.url), {
				type: 'module'
			});
		}
		return this.worker;
	}

	async checkHardwareSupport(): Promise<CodecPackHardwareSupport> {
		if (this.supportPromise) return this.supportPromise;
		const worker = this.getWorker();

		this.supportPromise = new Promise((resolve) => {
			const handler = (e: MessageEvent<CodecPackWorkerOutMessage>) => {
				if (e.data.type === 'support_result') {
					worker.removeEventListener('message', handler);
					resolve(e.data.support);
				}
			};
			worker.addEventListener('message', handler);
			worker.postMessage({ type: 'check_support' } as CodecPackWorkerInMessage);
		});

		return this.supportPromise;
	}

	async getStatus(): Promise<{ isInstalled: boolean; isAvailable: boolean; sizeBytes?: number }> {
		const worker = this.getWorker();
		return new Promise((resolve) => {
			const handler = (e: MessageEvent<CodecPackWorkerOutMessage>) => {
				if (e.data.type === 'status_result') {
					worker.removeEventListener('message', handler);
					resolve({
						isInstalled: e.data.isInstalled,
						isAvailable: e.data.isAvailable,
						sizeBytes: e.data.sizeBytes
					});
				}
			};
			worker.addEventListener('message', handler);
			worker.postMessage({ type: 'get_status' } as CodecPackWorkerInMessage);
		});
	}

	async downloadPack(onProgress?: (progress: CodecPackProgress) => void): Promise<void> {
		const worker = this.getWorker();
		return new Promise((resolve, reject) => {
			const handler = (e: MessageEvent<CodecPackWorkerOutMessage>) => {
				if (e.data.type === 'progress') {
					onProgress?.(e.data.progress);
				} else if (e.data.type === 'download_success') {
					worker.removeEventListener('message', handler);
					resolve();
				} else if (e.data.type === 'error') {
					worker.removeEventListener('message', handler);
					reject(new Error(e.data.message));
				}
			};
			worker.addEventListener('message', handler);
			worker.postMessage({ type: 'download_pack' } as CodecPackWorkerInMessage);
		});
	}

	async deletePack(): Promise<void> {
		const worker = this.getWorker();
		return new Promise((resolve) => {
			const handler = (e: MessageEvent<CodecPackWorkerOutMessage>) => {
				if (e.data.type === 'delete_success') {
					worker.removeEventListener('message', handler);
					resolve();
				}
			};
			worker.addEventListener('message', handler);
			worker.postMessage({ type: 'delete_pack' } as CodecPackWorkerInMessage);
		});
	}

	dispose(): void {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		this.supportPromise = null;
	}
}

export const codecPackService = new CodecPackService();
