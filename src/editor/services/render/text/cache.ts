import { rasterizeText, hashTextConfig, type TextRasterConfig } from './rasterizer';

export interface CacheEntry {
	canvas: OffscreenCanvas;
	lastUsedFrame: number;
}

/**
 * Text rasterization cache.
 * Caches OffscreenCanvas outputs by hash(text, style, scale) to avoid re-rasterizing
 * when the same text configuration appears in the same frame or across frames.
 */
export class TextRasterCache {
	private cache = new Map<string, CacheEntry>();
	private frameIndex = 0;
	private canvasCount = 0;
	private textureCount = 0;
	private readonly maxCacheSize = 100; // Reasonable limit for text cache

	/**
	 * Get or create a rasterized text canvas.
	 */
	getOrRasterize(config: TextRasterConfig, frameIndex: number): OffscreenCanvas {
		const hash = hashTextConfig(config);
		const entry = this.cache.get(hash);

		if (entry) {
			entry.lastUsedFrame = frameIndex;
			return entry.canvas;
		}

		// Not in cache, rasterize now
		const canvas = rasterizeText(config);
		this.cache.set(hash, {
			canvas,
			lastUsedFrame: frameIndex
		});
		this.canvasCount++;

		// Evict oldest entries if cache is too large
		if (this.cache.size > this.maxCacheSize) {
			this.evict();
		}

		return canvas;
	}

	/**
	 * Update frame index for LRU tracking.
	 */
	updateFrame(frameIndex: number) {
		this.frameIndex = frameIndex;
	}

	/**
	 * Evict least recently used entries to stay under cache size.
	 */
	private evict() {
		const entries = Array.from(this.cache.entries())
			.sort((a, b) => a[1].lastUsedFrame - b[1].lastUsedFrame);

		const toRemove = Math.ceil(this.cache.size * 0.2); // Remove oldest 20%
		for (let i = 0; i < toRemove && i < entries.length; i++) {
			this.cache.delete(entries[i]![0]);
		}
	}

	/**
	 * Clear all cached canvases and reset counters.
	 */
	dispose() {
		this.cache.clear();
		this.canvasCount = 0;
		this.textureCount = 0;
	}

	/**
	 * Get leak counter stats for debugging.
	 */
	getStats() {
		return {
			cacheSize: this.cache.size,
			canvasCount: this.canvasCount,
			textureCount: this.textureCount
		};
	}
}

// Global singleton cache for text rasterization
let globalTextRasterCache: TextRasterCache | null = null;

export function getGlobalTextRasterCache(): TextRasterCache {
	if (!globalTextRasterCache) {
		globalTextRasterCache = new TextRasterCache();
	}
	return globalTextRasterCache;
}

export function resetGlobalTextRasterCache() {
	if (globalTextRasterCache) {
		globalTextRasterCache.dispose();
	}
	globalTextRasterCache = null;
}
