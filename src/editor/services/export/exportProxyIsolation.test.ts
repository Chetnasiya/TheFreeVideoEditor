import { describe, expect, it } from 'vitest';
import type { Asset, AssetId, Clip, Project, TrackId } from '../../core/types';
import { createEmptyProject } from '../../core';
import { ExportFrameProvider } from './frameProvider';
import { CompatibilityFrameProvider } from './compatibilityFrameProvider';

function makeVideoAsset(id: string): Asset {
	return {
		id: id as AssetId,
		kind: 'video',
		name: `${id}.mp4`,
		mimeType: 'video/mp4',
		size: 1024 * 1024,
		duration: 3_000_000,
		width: 3840,
		height: 2160,
		fps: 30,
		hasAudio: true,
		opfsPath: `projects/p1/media/${id}.mp4`,
		proxy: {
			opfsPath: `projects/p1/proxies/${id}.mp4`,
			width: 960,
			height: 540,
			status: 'ready'
		}
	};
}

describe('Export pipeline asset resolution', () => {
	it('ExportFrameProvider always requests original media path and never uses proxy path', async () => {
		const base = createEmptyProject({ name: 'Export Proxy Isolation Test' });
		const videoAsset = makeVideoAsset('asset-4k');
		const project: Project = {
			...base,
			proxy: {
				enabled: true,
				targetHeight: 540,
				auto: 'all'
			},
			assets: {
				[videoAsset.id]: videoAsset
			}
		};

		const fetchedPaths: string[] = [];
		const getFileMock = async (_projectId: string, asset: Asset): Promise<File> => {
			fetchedPaths.push(asset.opfsPath);
			// Return a minimal fake file
			return new File([new ArrayBuffer(100)], asset.name, { type: asset.mimeType });
		};

		const provider = new ExportFrameProvider(project, getFileMock);

		// Trigger prepare for the layer referencing this asset
		try {
			await provider.prepare([
				{
					clipId: 'clip-1' as Clip['id'],
					trackId: 'track-1' as TrackId,
					trackOrder: 0,
					assetId: videoAsset.id,
					sourceTime: 500_000,
					opacity: 1,
					kind: 'video'
				}
			]);
		} catch {
			// Decoding fake file might fail in mediabunny getPrimaryVideoTrack, but getFileMock will have been invoked!
		} finally {
			await provider.dispose();
		}

		expect(fetchedPaths).toHaveLength(1);
		expect(fetchedPaths[0]).toBe('projects/p1/media/asset-4k.mp4');
		expect(fetchedPaths[0]).not.toContain('proxies');
	});

	it('CompatibilityFrameProvider always requests original media path and never uses proxy path', async () => {
		const base = createEmptyProject({ name: 'Compat Export Proxy Isolation Test' });
		const videoAsset = makeVideoAsset('asset-4k-compat');
		const project: Project = {
			...base,
			proxy: {
				enabled: true,
				targetHeight: 540,
				auto: 'all'
			},
			assets: {
				[videoAsset.id]: videoAsset
			}
		};

		const fetchedPaths: string[] = [];
		const getFileMock = async (_projectId: string, asset: Asset): Promise<File> => {
			fetchedPaths.push(asset.opfsPath);
			return new File([new ArrayBuffer(100)], asset.name, { type: asset.mimeType });
		};

		const provider = new CompatibilityFrameProvider(project, getFileMock);

		try {
			await provider.prepare([
				{
					clipId: 'clip-compat' as Clip['id'],
					trackId: 'track-1' as TrackId,
					trackOrder: 0,
					assetId: videoAsset.id,
					sourceTime: 500_000,
					opacity: 1,
					kind: 'video'
				}
			]);
		} catch {
			// Video element loading in jsdom / test environment
		} finally {
			provider.dispose();
		}

		expect(fetchedPaths).toHaveLength(1);
		expect(fetchedPaths[0]).toBe('projects/p1/media/asset-4k-compat.mp4');
		expect(fetchedPaths[0]).not.toContain('proxies');
	});
});
