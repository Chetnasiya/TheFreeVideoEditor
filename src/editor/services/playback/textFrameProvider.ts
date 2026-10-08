import type { ActiveLayer } from '../../core/playback';
import type { Project, Time } from '../../core/types';
import { rasterizeText, hashTextConfig, type TextRasterConfig } from '../render/text/rasterizer';
import { evaluateOr } from '../../core/animation';
import type { FrameSource } from './compositor';

interface CachedTextFrame {
	canvas: OffscreenCanvas;
	configHash: string;
	lastUsed: number;
}

const MAX_TEXT_CACHE_ENTRIES = 100;
const TEXT_CACHE_EVICT_THRESHOLD = 0.2;
const TEXT_CACHE_EVICT_TIME_MS = 60000;

export class TextFrameProvider {
	private cache = new Map<string, CachedTextFrame>();
	private frameIndex = 0;
	private readonly cacheStats = {
		hits: 0,
		misses: 0,
		canvases: 0,
		evictions: 0
	};

	constructor(private project: Project) {}

	getFrameSource(layer: ActiveLayer, time: Time): FrameSource | null {
		if (layer.kind !== 'text') return null;

		const clip = this.project.tracks
			.flatMap((t) => t.clips)
			.find((c) => c.id === layer.clipId);
		if (!clip || clip.source?.type !== 'text') return null;

		const textSource = clip.source;
		const localTime = time - clip.start;

		// Evaluate animated text properties
		const properties = clip.properties;
		const readProperty = (id: string): unknown => {
			const animated = properties?.[id] as any;
			return animated ? evaluateOr(animated, localTime, undefined) : undefined;
		};

		// Evaluate fontSize with default 48
		let fontSize = 48;
		const fontSizeValue = readProperty('text.fontSize');
		if (typeof fontSizeValue === 'number') {
			fontSize = Math.max(1, Math.min(1000, fontSizeValue));
		}

		// Evaluate fillColor with default white
		let fillColor = { r: 1, g: 1, b: 1, a: 1 };
		const fillColorValue = readProperty('text.fillColor');
		if (Array.isArray(fillColorValue) && fillColorValue.length === 4) {
			fillColor = {
				r: Math.max(0, Math.min(1, fillColorValue[0] as number)),
				g: Math.max(0, Math.min(1, fillColorValue[1] as number)),
				b: Math.max(0, Math.min(1, fillColorValue[2] as number)),
				a: Math.max(0, Math.min(1, fillColorValue[3] as number))
			};
		}

		// Evaluate strokeColor with default black
		let strokeColor = { r: 0, g: 0, b: 0, a: 1 };
		const strokeColorValue = readProperty('text.strokeColor');
		if (Array.isArray(strokeColorValue) && strokeColorValue.length === 4) {
			strokeColor = {
				r: Math.max(0, Math.min(1, strokeColorValue[0] as number)),
				g: Math.max(0, Math.min(1, strokeColorValue[1] as number)),
				b: Math.max(0, Math.min(1, strokeColorValue[2] as number)),
				a: Math.max(0, Math.min(1, strokeColorValue[3] as number))
			};
		}

		// Evaluate strokeWidth with default 0
		let strokeWidth = 0;
		const strokeWidthValue = readProperty('text.strokeWidth');
		if (typeof strokeWidthValue === 'number') {
			strokeWidth = Math.max(0, Math.min(50, strokeWidthValue));
		}

		// Evaluate reveal progress (0-1)
		let revealProgress = 1;
		const revealValue = readProperty('text.reveal');
		if (typeof revealValue === 'number') {
			revealProgress = Math.max(0, Math.min(1, revealValue));
		}

		// For now, render full text; typewriter effect handled in Inspector
		const revealedText = textSource.text || 'Text';

		// Build config from clip source + evaluated properties
		const config: TextRasterConfig = {
			text: revealedText,
			style: textSource.style || { fontFamily: 'sans-serif' },
			box: textSource.box,
			fontSize,
			fillColor,
			strokeColor,
			strokeWidth,
			scale: 1
		};

		// Generate cache key
		const configHash = hashTextConfig(config);
		const cacheKey = `${layer.clipId}:${configHash}`;

		// Check cache
		const cached = this.cache.get(cacheKey);
		if (cached) {
			cached.lastUsed = performance.now();
			this.cacheStats.hits++;
			return cached.canvas;
		}

		// Rasterize
		this.cacheStats.misses++;
		const canvas = rasterizeText(config);
		this.cacheStats.canvases++;

		// Store in cache
		const entry: CachedTextFrame = {
			canvas,
			configHash,
			lastUsed: performance.now()
		};
		this.cache.set(cacheKey, entry);

		// Enforce cache limit
		if (this.cache.size > MAX_TEXT_CACHE_ENTRIES) {
			const toEvict = Math.ceil(MAX_TEXT_CACHE_ENTRIES * TEXT_CACHE_EVICT_THRESHOLD);
			const sorted = [...this.cache.entries()].sort(
				(a, b) => a[1].lastUsed - b[1].lastUsed
			);
			for (let i = 0; i < toEvict; i++) {
				const [key] = sorted[i];
				this.cache.delete(key);
				this.cacheStats.evictions++;
			}
		}

		return canvas;
	}

	releaseUnused(): void {
		const now = performance.now();
		const toDelete: string[] = [];
		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.lastUsed > TEXT_CACHE_EVICT_TIME_MS) {
				toDelete.push(key);
			}
		}
		for (const key of toDelete) {
			this.cache.delete(key);
		}
	}

	dispose(): void {
		this.cache.clear();
		this.cacheStats.canvases = 0;
		this.cacheStats.hits = 0;
		this.cacheStats.misses = 0;
		this.cacheStats.evictions = 0;
	}

	getStats() {
		return {
			...this.cacheStats,
			cacheSize: this.cache.size
		};
	}
}

