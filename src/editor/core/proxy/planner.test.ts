import { describe, expect, it } from 'vitest';
import type { Asset, AssetId, ClipId, Project, ProjectId, TrackId } from '../types';
import {
	chooseProxyCodec,
	computeAssetFingerprint,
	computeProxyDimensions,
	isProxyStale,
	planProxy,
	prioritizeProxyQueue,
	shouldAutoGenerateProxy,
	shouldSuggestProxy
} from './planner';

describe('core/proxy planner & logic', () => {
	const baseAsset: Asset = {
		id: 'asset-1' as AssetId,
		kind: 'video',
		name: '4K Footage.mp4',
		mimeType: 'video/mp4',
		size: 50_000_000,
		duration: 10_000_000,
		width: 3840,
		height: 2160,
		fps: 30,
		hasAudio: true,
		opfsPath: 'projects/p1/media/asset-1.mp4'
	};

	it('computes even dimensions preserving aspect ratio', () => {
		// 16:9 4K -> 540p: 540 * (16/9) = 960 (both even)
		const dims1 = computeProxyDimensions(3840, 2160, 540);
		expect(dims1).toEqual({ width: 960, height: 540 });

		// Non-standard aspect ratio odd numbers: e.g. 1920x1081
		const dims2 = computeProxyDimensions(1920, 1081, 540);
		expect(dims2.width % 2).toBe(0);
		expect(dims2.height % 2).toBe(0);
	});

	it('enforces no-upscale rule when source height <= target height', () => {
		const smallAsset: Asset = {
			...baseAsset,
			width: 640,
			height: 360
		};
		const plan = planProxy(smallAsset, { enabled: true, targetHeight: 540, auto: 'large' });
		expect(plan.needed).toBe(false);
		expect(plan.reason).toContain(
			'Source height (360p) is less than or equal to target height (540p)'
		);
	});

	it('plans proxy for 4K video correctly with short GOP', () => {
		const plan = planProxy(baseAsset, { enabled: true, targetHeight: 540, auto: 'large' });
		expect(plan.needed).toBe(true);
		expect(plan.targetWidth).toBe(960);
		expect(plan.targetHeight).toBe(540);
		expect(plan.fps).toBe(30);
		expect(plan.bitrate).toBeGreaterThanOrEqual(400_000);
		expect(plan.bitrate).toBeLessThanOrEqual(3_500_000);
	});

	it('caps proxy bitrate relative to source bitrate', () => {
		const lowBitrateSource: Asset = {
			...baseAsset,
			size: 500_000, // 500 KB over 10s = 400 kbps
			duration: 10_000_000
		};
		const plan = planProxy(lowBitrateSource, { enabled: true, targetHeight: 540, auto: 'large' });
		// 75% of 400 kbps = 300 kbps, capped at floor 350 kbps
		expect(plan.bitrate).toBe(350_000);
	});

	it('skips proxy with "not beneficial" when estimated proxy size >= source size', () => {
		const tinySource: Asset = {
			...baseAsset,
			size: 100_000, // 100 KB over 10s = 80 kbps
			duration: 10_000_000
		};
		const plan = planProxy(tinySource, { enabled: true, targetHeight: 540, auto: 'large' });
		expect(plan.needed).toBe(false);
		expect(plan.reason).toContain('Proxy not beneficial');
	});

	it('suggests proxy for large assets (> 1080p, > 60fps, HEVC)', () => {
		expect(shouldSuggestProxy(baseAsset)).toBe(true);

		const std1080p: Asset = { ...baseAsset, width: 1920, height: 1080, fps: 30 };
		expect(shouldSuggestProxy(std1080p)).toBe(false);

		const highFps1080p: Asset = { ...baseAsset, width: 1920, height: 1080, fps: 120 };
		expect(shouldSuggestProxy(highFps1080p)).toBe(true);

		const hevcAsset: Asset = {
			...baseAsset,
			width: 1920,
			height: 1080,
			videoCodec: 'hev1.1.6.L93.B0'
		};
		expect(shouldSuggestProxy(hevcAsset)).toBe(true);
	});

	it('respects auto mode rules (off, large, all)', () => {
		expect(shouldAutoGenerateProxy(baseAsset, 'off')).toBe(false);
		expect(shouldAutoGenerateProxy(baseAsset, 'large')).toBe(true); // 4k is > 1080p
		expect(shouldAutoGenerateProxy(baseAsset, 'all')).toBe(true);

		const smallAsset: Asset = { ...baseAsset, width: 1280, height: 720, fps: 30 };
		expect(shouldAutoGenerateProxy(smallAsset, 'large')).toBe(false);
		expect(shouldAutoGenerateProxy(smallAsset, 'all')).toBe(true);
	});

	it('detects staleness when asset size or dimensions change', () => {
		const fp = computeAssetFingerprint(baseAsset);
		const assetWithProxy: Asset = {
			...baseAsset,
			proxy: {
				opfsPath: 'projects/p1/proxies/asset-1.mp4',
				width: 960,
				height: 540,
				status: 'ready',
				fingerprint: fp
			}
		};
		expect(isProxyStale(assetWithProxy)).toBe(false);

		// Modified source file
		const modifiedAsset: Asset = {
			...assetWithProxy,
			size: 55_000_000
		};
		expect(isProxyStale(modifiedAsset)).toBe(true);
	});

	it('prioritizes assets on timeline over library-only assets', () => {
		const project: Project = {
			id: 'p1' as ProjectId,
			schemaVersion: 2,
			name: 'Test',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			settings: { width: 1920, height: 1080, fps: 30, sampleRate: 48000 },
			assets: {},
			tracks: [
				{
					id: 't1' as TrackId,
					kind: 'video',
					name: 'V1',
					muted: false,
					locked: false,
					hidden: false,
					clips: [
						{
							id: 'c1' as ClipId,
							assetId: 'asset-2' as AssetId,
							start: 5_000_000,
							duration: 2_000_000,
							sourceIn: 0,
							sourceOut: 2_000_000,
							speed: 1,
							volume: 1
						},
						{
							id: 'c2' as ClipId,
							assetId: 'asset-1' as AssetId,
							start: 1_000_000,
							duration: 2_000_000,
							sourceIn: 0,
							sourceOut: 2_000_000,
							speed: 1,
							volume: 1
						}
					]
				}
			],
			markers: []
		};

		const queue: AssetId[] = ['asset-3' as AssetId, 'asset-2' as AssetId, 'asset-1' as AssetId];
		const prioritized = prioritizeProxyQueue(project, queue);
		// asset-1 starts at 1s, asset-2 starts at 5s, asset-3 not on timeline
		expect(prioritized).toEqual(['asset-1', 'asset-2', 'asset-3']);
	});

	it('chooses AVC if supported, falling back to VP9', async () => {
		const fakeProbe = {
			isVideoConfigSupported: async (cfg: VideoEncoderConfig) => {
				return cfg.codec.startsWith('avc');
			}
		};
		const codec = await chooseProxyCodec(960, 540, 30, fakeProbe);
		expect(codec).toBe('avc');

		const vp9OnlyProbe = {
			isVideoConfigSupported: async (cfg: VideoEncoderConfig) => {
				return cfg.codec.startsWith('vp09');
			}
		};
		const codecVp9 = await chooseProxyCodec(960, 540, 30, vp9OnlyProbe);
		expect(codecVp9).toBe('vp9');
	});
});
