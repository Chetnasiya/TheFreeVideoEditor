import type { AssetId, Project, ProxyInfo } from '../../core/types';
import {
	chooseProxyCodec,
	computeAssetFingerprint,
	planProxy,
	prioritizeProxyQueue
} from '../../core/proxy/planner';
import { deleteProxyFile, getMediaFile, writeProxy } from '../storage/opfs';
import type {
	ProxyWorkerInMessage,
	ProxyWorkerJobConfig,
	ProxyWorkerOutMessage
} from './proxyProtocol';

export interface ProxyServiceCallbacks {
	onStatusChange: (assetId: AssetId, proxy: Partial<ProxyInfo>) => void;
	onQueueChange?: (queuedAssetIds: AssetId[]) => void;
}

export class ProxyService {
	private worker: Worker | null = null;
	private queue: AssetId[] = [];
	private activeAssetId: AssetId | null = null;
	private activeJobId: string | null = null;
	private paused = false;
	private currentProject: Project | null = null;
	private callbacks: ProxyServiceCallbacks | null = null;
	private activeAbortController: AbortController | null = null;

	// DEV-only fault injection flags
	public devFaultInjection?: 'encoder_unsupported' | 'quota_error' | 'decode_error';

	constructor() {}

	setProject(project: Project | null, callbacks: ProxyServiceCallbacks): void {
		this.currentProject = project;
		this.callbacks = callbacks;
		if (!project) {
			this.cancelAll();
			return;
		}

		// Reload recovery: check for assets whose proxy was queued or working at open
		const pendingIds: AssetId[] = [];
		for (const asset of Object.values(project.assets)) {
			if (asset.kind === 'video' && !asset.offline) {
				if (asset.proxy?.status === 'queued' || asset.proxy?.status === 'working') {
					pendingIds.push(asset.id);
				}
			}
		}
		if (pendingIds.length > 0) {
			this.enqueue(pendingIds);
		}
	}

	private getWorker(): Worker {
		if (!this.worker) {
			this.worker = new Worker(new URL('./proxy.worker.ts', import.meta.url), {
				type: 'module'
			});
			this.worker.addEventListener('message', (e: MessageEvent<ProxyWorkerOutMessage>) => {
				this.handleWorkerMessage(e.data);
			});
			this.worker.addEventListener('error', (err) => {
				if (this.activeAssetId) {
					this.callbacks?.onStatusChange(this.activeAssetId, {
						status: 'failed',
						error: `Proxy worker failed: ${err.message}`
					});
					this.activeAssetId = null;
					this.activeJobId = null;
					this.processNext();
				}
			});
		}
		return this.worker;
	}

	enqueue(assetIds: AssetId[]): void {
		if (!this.currentProject) return;
		for (const id of assetIds) {
			if (!this.queue.includes(id) && this.activeAssetId !== id) {
				this.queue.push(id);
				this.callbacks?.onStatusChange(id, {
					status: 'queued',
					progress: 0
				});
			}
		}
		this.sortQueue();
		this.callbacks?.onQueueChange?.([...this.queue]);
		if (!this.activeAssetId && !this.paused) {
			this.processNext();
		}
	}

	prioritize(assetId: AssetId): void {
		const index = this.queue.indexOf(assetId);
		if (index > -1) {
			this.queue.splice(index, 1);
			this.queue.unshift(assetId);
			this.callbacks?.onQueueChange?.([...this.queue]);
		}
	}

	cancel(assetId: AssetId): void {
		if (this.activeAssetId === assetId) {
			if (this.activeJobId && this.worker) {
				this.worker.postMessage({
					type: 'cancel',
					jobId: this.activeJobId
				} as ProxyWorkerInMessage);
			}
			this.activeAbortController?.abort();
			const project = this.currentProject;
			if (project) {
				void deleteProxyFile(project.id, assetId);
			}
			this.callbacks?.onStatusChange(assetId, {
				status: 'none',
				progress: 0,
				error: undefined
			});
			this.activeAssetId = null;
			this.activeJobId = null;
			this.processNext();
			return;
		}

		const index = this.queue.indexOf(assetId);
		if (index > -1) {
			this.queue.splice(index, 1);
			this.callbacks?.onStatusChange(assetId, {
				status: 'none',
				progress: 0,
				error: undefined
			});
			this.callbacks?.onQueueChange?.([...this.queue]);
		}
	}

	cancelAll(): void {
		if (this.activeAssetId) {
			this.cancel(this.activeAssetId);
		}
		const toCancel = [...this.queue];
		this.queue = [];
		for (const id of toCancel) {
			this.callbacks?.onStatusChange(id, {
				status: 'none',
				progress: 0,
				error: undefined
			});
		}
		this.callbacks?.onQueueChange?.([]);
	}

	pause(): void {
		this.paused = true;
	}

	resume(): void {
		this.paused = false;
		if (!this.activeAssetId) {
			this.processNext();
		}
	}

	private sortQueue(): void {
		if (!this.currentProject) return;
		this.queue = prioritizeProxyQueue(this.currentProject, this.queue);
	}

	private async processNext(): Promise<void> {
		if (this.paused || this.activeAssetId || this.queue.length === 0 || !this.currentProject) {
			return;
		}

		const assetId = this.queue.shift()!;
		this.callbacks?.onQueueChange?.([...this.queue]);
		const asset = this.currentProject.assets[assetId];
		if (!asset || asset.offline || asset.kind !== 'video') {
			this.processNext();
			return;
		}

		const settings = this.currentProject.proxy ?? {
			enabled: true,
			targetHeight: 540,
			auto: 'large'
		};
		const codecChoice = await chooseProxyCodec(
			asset.width ?? 1920,
			settings.targetHeight,
			asset.fps ?? 30
		);
		const plan = planProxy(asset, settings, codecChoice);

		if (!plan.needed) {
			this.callbacks?.onStatusChange(assetId, {
				status: 'none',
				progress: 0,
				error: plan.reason
			});
			this.processNext();
			return;
		}

		this.activeAssetId = assetId;
		const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
		this.activeJobId = jobId;
		this.activeAbortController = new AbortController();

		this.callbacks?.onStatusChange(assetId, {
			status: 'working',
			progress: 0.05
		});

		try {
			const file = await getMediaFile(this.currentProject.id, asset);
			const jobConfig: ProxyWorkerJobConfig = {
				jobId,
				projectId: this.currentProject.id,
				assetId,
				targetWidth: plan.targetWidth,
				targetHeight: plan.targetHeight,
				fps: plan.fps,
				bitrate: plan.bitrate,
				codec: plan.codec,
				container: plan.container,
				faultInjection: this.devFaultInjection
			};

			const worker = this.getWorker();
			worker.postMessage({
				type: 'transcode',
				job: jobConfig,
				sourceFile: file
			} as ProxyWorkerInMessage);
		} catch (err: unknown) {
			this.callbacks?.onStatusChange(assetId, {
				status: 'failed',
				error: err instanceof Error ? err.message : String(err)
			});
			this.activeAssetId = null;
			this.activeJobId = null;
			this.processNext();
		}
	}

	private async handleWorkerMessage(msg: ProxyWorkerOutMessage): Promise<void> {
		if (msg.type === 'progress') {
			if (this.activeAssetId && this.activeJobId === msg.event.jobId) {
				this.callbacks?.onStatusChange(this.activeAssetId, {
					status: 'working',
					progress: msg.event.progress
				});
			}
			return;
		}

		if (msg.type === 'error') {
			if (this.activeAssetId === msg.assetId) {
				this.callbacks?.onStatusChange(msg.assetId, {
					status: 'failed',
					error: msg.error
				});
				this.activeAssetId = null;
				this.activeJobId = null;
				this.processNext();
			}
			return;
		}

		if (msg.type === 'result') {
			if (this.activeAssetId === msg.assetId && this.currentProject) {
				const asset = this.currentProject.assets[msg.assetId];
				if (!asset) return;

				try {
					// Write to OPFS projects/<id>/proxies/<assetId>.<ext>
					const opfsPath = await writeProxy(
						this.currentProject.id,
						msg.assetId,
						msg.container,
						msg.buffer
					);

					const fingerprint = computeAssetFingerprint(asset);
					this.callbacks?.onStatusChange(msg.assetId, {
						opfsPath,
						width: msg.width,
						height: msg.height,
						fps: msg.fps,
						durationUs: msg.durationUs || asset.duration,
						bytes: msg.bytes,
						codec: msg.codec,
						container: msg.container,
						status: 'ready',
						progress: 1,
						fingerprint,
						createdAt: new Date().toISOString()
					});
				} catch (err: unknown) {
					this.callbacks?.onStatusChange(msg.assetId, {
						status: 'failed',
						error: `Failed to write proxy to storage: ${err instanceof Error ? err.message : String(err)}`
					});
				} finally {
					this.activeAssetId = null;
					this.activeJobId = null;
					this.processNext();
				}
			}
		}
	}

	dispose(): void {
		this.cancelAll();
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
	}
}

export const proxyService = new ProxyService();

if (typeof window !== 'undefined') {
	(window as unknown as { __tfveProxyService?: ProxyService }).__tfveProxyService = proxyService;
}
