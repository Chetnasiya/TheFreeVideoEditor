import type { Asset, Clip, ProjectId, Tracker, TrackerSample } from '../../core/types';
import { getMediaFile } from '../storage/opfs';
import type {
	TrackingJobConfig,
	TrackingWorkerInMessage,
	TrackingWorkerOutMessage
} from './trackingProtocol';

export interface TrackingProgressCallback {
	(progress: { processedFrames: number; totalFrames: number; currentSample?: TrackerSample }): void;
}

export class TrackingService {
	private worker: Worker | null = null;
	private activeJobId: string | null = null;

	constructor(private readonly getFile?: typeof getMediaFile) {}

	private async resolveFile(projectId: ProjectId, asset: Asset): Promise<Blob> {
		if (this.getFile) {
			return this.getFile(projectId, asset);
		}
		const opfs = await import('../storage/opfs');
		return opfs.getMediaFile(projectId, asset);
	}

	private getWorker(): Worker {
		if (!this.worker) {
			this.worker = new Worker(new URL('./tracking.worker.ts', import.meta.url), {
				type: 'module'
			});
		}
		return this.worker;
	}

	async track(
		projectId: ProjectId,
		asset: Asset,
		clip: Clip,
		tracker: Tracker,
		direction: 'forward' | 'backward',
		onProgress?: TrackingProgressCallback
	): Promise<TrackerSample[]> {
		if (this.activeJobId) {
			await this.cancel();
		}

		const worker = this.getWorker();
		const jobId = `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
		this.activeJobId = jobId;

		// Use proxy file if ready, otherwise original
		let fileBlob: Blob;
		const opfs = await import('../storage/opfs');
		if (asset.proxy?.status === 'ready') {
			try {
				const ext = asset.proxy.container ?? 'mp4';
				fileBlob = await opfs.getProxyFile(projectId, asset.id, ext);
			} catch {
				fileBlob = await this.resolveFile(projectId, asset);
			}
		} else {
			fileBlob = await this.resolveFile(projectId, asset);
		}

		const seedTimeUs = tracker.seedTime;
		const startTimeUs = clip.sourceIn;
		const endTimeUs = clip.sourceOut;
		const fps = asset.fps ?? 30;

		const jobConfig: TrackingJobConfig = {
			jobId,
			assetId: asset.id,
			clipId: clip.id,
			trackerId: tracker.id,
			type: tracker.type,
			direction,
			seedTimeUs,
			startTimeUs,
			endTimeUs,
			fps,
			initialRegion: tracker.initialRegion,
			params: tracker.params,
			assetFingerprint: `${asset.id}:${asset.size}:${asset.duration}`
		};

		return new Promise<TrackerSample[]>((resolve, reject) => {
			let cleanup = () => {};
			const messageHandler = (e: MessageEvent<TrackingWorkerOutMessage>) => {
				const msg = e.data;
				if (msg.jobId !== jobId) return;

				if (msg.type === 'progress') {
					onProgress?.({
						processedFrames: msg.processedFrames,
						totalFrames: msg.totalFrames,
						currentSample: msg.currentSample
					});
				} else if (msg.type === 'complete') {
					cleanup();
					resolve(msg.samples);
				} else if (msg.type === 'error') {
					cleanup();
					if (msg.reason === 'user_cancel') {
						resolve(msg.samples ?? []);
					} else {
						reject(new Error(msg.error));
					}
				}
			};

			const errorHandler = (err: ErrorEvent) => {
				cleanup();
				reject(new Error(`Tracking worker error: ${err.message}`));
			};

			cleanup = () => {
				worker.removeEventListener('message', messageHandler);
				worker.removeEventListener('error', errorHandler);
				if (this.activeJobId === jobId) {
					this.activeJobId = null;
				}
			};

			worker.addEventListener('message', messageHandler);
			worker.addEventListener('error', errorHandler);

			worker.postMessage({
				type: 'start',
				job: jobConfig,
				file: fileBlob
			} as TrackingWorkerInMessage);
		});
	}

	async cancel(): Promise<void> {
		if (!this.activeJobId || !this.worker) return;
		this.worker.postMessage({
			type: 'cancel',
			jobId: this.activeJobId
		} as TrackingWorkerInMessage);
	}

	dispose(): void {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		this.activeJobId = null;
	}
}

export const trackingService = new TrackingService();
