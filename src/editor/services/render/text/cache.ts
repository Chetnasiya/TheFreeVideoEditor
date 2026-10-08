import { hashTextConfig, rasterizeText, type TextRasterConfig } from './rasterizer';

interface CacheEntry {
	canvas: OffscreenCanvas | HTMLCanvasElement;
	lastUsedFrame: number;
	key: string;
}

export class TextRasterCache {
	private readonly entries = new Map<string, CacheEntry>();
	private frameCount = 0;
	private liveAllocations = 0;

	getLiveCount(): number {
		return this.entries.size;
	}

	get(config: TextRasterConfig): OffscreenCanvas | HTMLCanvasElement {
		const key = hashTextConfig(config);
		const existing = this.entries.get(key);
		if (existing) {
			existing.lastUsedFrame = this.frameCount;
			return existing.canvas;
		}

		const canvas = rasterizeText(config);
		this.entries.set(key, {
			canvas,
			lastUsedFrame: this.frameCount,
			key
		});
		this.liveAllocations++;
		return canvas;
	}

	tick(): void {
		this.frameCount++;
		if (this.frameCount % 120 === 0) {
			this.evictOlderThan(120);
		}
	}

	evictOlderThan(maxAgeFrames: number): void {
		for (const [key, entry] of this.entries.entries()) {
			if (this.frameCount - entry.lastUsedFrame > maxAgeFrames) {
				this.entries.delete(key);
			}
		}
	}

	clear(): void {
		this.entries.clear();
	}

	dispose(): void {
		this.clear();
	}
}
