import type { AssetId, Project } from '../../core/types';
import { getMediaFile } from '../storage/opfs';

export class AudioDecodeCache {
	private readonly cache = new Map<AssetId, AudioBuffer>();
	private totalBytes = 0;
	// Max 256 MB audio buffer cache
	private readonly maxBytes: number;

	constructor(maxBytes = 256 * 1024 * 1024) {
		this.maxBytes = maxBytes;
	}

	async getOrDecode(
		assetId: AssetId,
		project: Project,
		ctx: Pick<AudioContext, 'decodeAudioData'>,
		getFile: typeof getMediaFile = getMediaFile
	): Promise<AudioBuffer | null> {
		if (this.cache.has(assetId)) {
			return this.cache.get(assetId)!;
		}

		const asset = project.assets[assetId];
		if (!asset || !asset.hasAudio || asset.offline || asset.audioDecodable === false) {
			return null;
		}

		try {
			const file = await getFile(project.id, asset);
			const arrayBuf = await file.arrayBuffer();
			const audioBuffer = await ctx.decodeAudioData(arrayBuf);

			const bufferBytes = audioBuffer.length * audioBuffer.numberOfChannels * 4;
			this.evictIfNeeded(bufferBytes);

			this.cache.set(assetId, audioBuffer);
			this.totalBytes += bufferBytes;
			return audioBuffer;
		} catch {
			return null;
		}
	}

	private evictIfNeeded(incomingBytes: number): void {
		if (this.totalBytes + incomingBytes <= this.maxBytes) return;

		for (const [key, buf] of this.cache.entries()) {
			const bytes = buf.length * buf.numberOfChannels * 4;
			this.cache.delete(key);
			this.totalBytes -= bytes;
			if (this.totalBytes + incomingBytes <= this.maxBytes) break;
		}
	}

	clear(): void {
		this.cache.clear();
		this.totalBytes = 0;
	}
}

export const defaultAudioDecodeCache = new AudioDecodeCache();
