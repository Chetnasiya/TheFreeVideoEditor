import type { ActiveLayer, AssetId, ClipId, Project } from '../../core';
import { getMediaFile } from '../storage/opfs';

interface VideoEntry {
	video: HTMLVideoElement;
	url: string;
	ready: Promise<void>;
}

export class CompatibilityFrameProvider {
	private readonly videos = new Map<AssetId, VideoEntry>();
	private readonly images = new Map<AssetId, ImageBitmap>();
	private readonly prepared = new Map<ClipId, CanvasImageSource>();

	constructor(
		private readonly project: Project,
		private readonly getFile: typeof getMediaFile = getMediaFile
	) {}

	async prepare(layers: readonly ActiveLayer[], signal?: AbortSignal): Promise<void> {
		for (const item of this.prepared.values()) {
			if (item instanceof ImageBitmap) item.close();
		}
		this.prepared.clear();

		const allLayers: ActiveLayer[] = [];
		for (const layer of layers) {
			if (layer.transition) {
				allLayers.push(layer.transition.fromLayer);
				allLayers.push(layer.transition.toLayer);
			} else {
				allLayers.push(layer);
			}
		}

		for (const layer of allLayers) {
			if (signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError');
			if (!layer.assetId) continue;
			const asset = this.project.assets[layer.assetId];
			if (!asset || asset.offline) continue;
			try {
				if (asset.kind === 'image') {
					let image = this.images.get(asset.id);
					if (!image) {
						image = await createImageBitmap(await this.getFile(this.project.id, asset));
						this.images.set(asset.id, image);
					}
					this.prepared.set(layer.clipId, image);
					continue;
				}
				const entry = await this.getVideo(asset.id);
				const time = Math.max(0, layer.sourceTime / 1_000_000);
				if (Math.abs(entry.video.currentTime - time) > 0.001) {
					await new Promise<void>((resolve, reject) => {
						const onSeeked = () => {
							cleanup();
							resolve();
						};
						const onError = () => {
							cleanup();
							reject(new Error(`Could not seek media “${asset.name}”.`));
						};
						const cleanup = () => {
							entry.video.removeEventListener('seeked', onSeeked);
							entry.video.removeEventListener('error', onError);
							signal?.removeEventListener('abort', onAbort);
						};
						const onAbort = () => {
							cleanup();
							reject(new DOMException('Export cancelled.', 'AbortError'));
						};
						entry.video.addEventListener('seeked', onSeeked, { once: true });
						entry.video.addEventListener('error', onError, { once: true });
						signal?.addEventListener('abort', onAbort, { once: true });
						entry.video.currentTime = time;
					});
				}
				this.prepared.set(layer.clipId, entry.video);
			} catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') throw error;
				throw new Error(`Could not decode “${asset.name}” for compatibility export.`, {
					cause: error
				});
			}
		}
	}

	getFrame(layer: ActiveLayer): CanvasImageSource | null {
		return this.prepared.get(layer.clipId) ?? null;
	}

	dispose(): void {
		for (const { video, url } of this.videos.values()) {
			video.pause();
			video.removeAttribute('src');
			video.load();
			URL.revokeObjectURL(url);
		}
		this.videos.clear();
		for (const image of this.images.values()) image.close();
		this.images.clear();
		for (const item of this.prepared.values()) {
			if (item instanceof ImageBitmap) item.close();
		}
		this.prepared.clear();
	}

	private async getVideo(assetId: AssetId): Promise<VideoEntry> {
		const cached = this.videos.get(assetId);
		if (cached) {
			await cached.ready;
			return cached;
		}
		const asset = this.project.assets[assetId];
		if (!asset) throw new Error(`Project asset “${assetId}” is missing.`);
		const url = URL.createObjectURL(await this.getFile(this.project.id, asset));
		const video = document.createElement('video');
		video.muted = true;
		video.playsInline = true;
		video.preload = 'auto';
		video.src = url;
		const ready = new Promise<void>((resolve, reject) => {
			video.addEventListener('loadedmetadata', () => resolve(), { once: true });
			video.addEventListener(
				'error',
				() => reject(new Error(`The browser cannot decode “${asset.name}”.`)),
				{ once: true }
			);
		});
		const entry = { video, url, ready };
		this.videos.set(assetId, entry);
		try {
			await ready;
			return entry;
		} catch (error) {
			this.videos.delete(assetId);
			video.removeAttribute('src');
			video.load();
			URL.revokeObjectURL(url);
			throw error;
		}
	}
}
