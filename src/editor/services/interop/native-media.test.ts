import { strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../../core';
import type { AssetId } from '../../core';
import { getProject } from '../storage/projectDb';
import { getProjectMediaFileHandles, writeMedia } from '../storage/opfs';
import { exportTfve, importTfve } from './native';

const opfsMocks = vi.hoisted(() => ({
	handles: new Map<string, FileSystemFileHandle>(),
	writeMedia: vi.fn(),
	deleteMedia: vi.fn()
}));

vi.mock('../storage/projectDb', () => ({
	getProject: vi.fn().mockResolvedValue(null)
}));

vi.mock('../storage/opfs', () => ({
	getProjectMediaFileHandles: vi.fn(async () => opfsMocks.handles),
	isSupported: vi.fn(() => true),
	writeMedia: opfsMocks.writeMedia,
	deleteMedia: opfsMocks.deleteMedia
}));

function projectWithAsset() {
	const project = createEmptyProject({ name: 'Media archive' });
	const assetId = 'archive-asset' as AssetId;
	project.assets[assetId] = {
		id: assetId,
		kind: 'video',
		name: 'clip.mp4',
		mimeType: 'video/mp4',
		size: 5,
		duration: 1_000_000,
		hasAudio: true,
		opfsPath: `projects/${project.id}/media/${assetId}.mp4`
	};
	return { project, assetId };
}

describe('TFVE archives with media', () => {
	beforeEach(() => {
		vi.mocked(getProject).mockReset().mockResolvedValue(null);
		opfsMocks.handles.clear();
		opfsMocks.writeMedia
			.mockReset()
			.mockImplementation(
				async (projectId: string, assetId: string) => `projects/${projectId}/media/${assetId}.mp4`
			);
		opfsMocks.deleteMedia.mockReset().mockResolvedValue(undefined);
	});

	it('streams media into assets and restores it to OPFS on import', async () => {
		const { project, assetId } = projectWithAsset();
		const mediaFile = new File(['video'], `${assetId}.mp4`, { type: 'video/mp4' });
		opfsMocks.handles.set(`${assetId}.mp4`, {
			kind: 'file',
			getFile: async () => mediaFile
		} as FileSystemFileHandle);

		const archive = await exportTfve(project, { includeMedia: true });
		const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
		expect(files[`assets/${assetId}.mp4`]).toBeDefined();
		expect(JSON.parse(new TextDecoder().decode(files['manifest.json'])).includesMedia).toBe(true);
		const imported = await importTfve(archive);
		expect(imported.assets[assetId]?.offline).toBe(false);
		expect(writeMedia).toHaveBeenCalledWith(project.id, assetId, expect.any(File));
		expect(getProjectMediaFileHandles).toHaveBeenCalledWith(project.id);
	});

	it('writes imported media to the new project and asset ids on collision', async () => {
		const { project, assetId } = projectWithAsset();
		opfsMocks.handles.set(`${assetId}.mp4`, {
			kind: 'file',
			getFile: async () => new File(['video'], `${assetId}.mp4`, { type: 'video/mp4' })
		} as FileSystemFileHandle);
		vi.mocked(getProject).mockResolvedValueOnce(project);

		const imported = await importTfve(await exportTfve(project, { includeMedia: true }));
		const importedAsset = Object.values(imported.assets)[0];
		expect(imported.id).not.toBe(project.id);
		expect(importedAsset?.id).not.toBe(assetId);
		expect(importedAsset?.offline).toBe(false);
		expect(writeMedia).toHaveBeenCalledWith(imported.id, importedAsset?.id, expect.any(File));
	});

	it('rejects embedded entries that do not identify an asset in project.json', async () => {
		const { project } = projectWithAsset();
		const { strToU8: toBytes, zipSync: zip } = await import('fflate');
		const archive = zip({
			'project.json': toBytes(JSON.stringify(project)),
			'manifest.json': toBytes(
				JSON.stringify({
					format: 'tfve',
					version: 1,
					createdWith: 'thefreevideoeditor.com',
					includesMedia: true
				})
			),
			'assets/not-a-known-asset.mp4': toBytes('media')
		});
		await expect(importTfve(new Blob([archive]))).rejects.toThrow('unknown asset');
	});

	it('accepts legacy Gate B manifests that declare media absent', async () => {
		const project = createEmptyProject({ name: 'Legacy' });
		const archive = zipSync({
			'project.json': strToU8(JSON.stringify(project)),
			'manifest.json': strToU8(
				JSON.stringify({
					format: 'tfve',
					version: 1,
					createdWith: 'thefreevideoeditor.com',
					includesMedia: false
				})
			),
			'assets/': new Uint8Array()
		});
		expect(await importTfve(new Blob([archive]))).toEqual(project);
	});

	it('removes already restored media when importing a later asset fails', async () => {
		const { project, assetId } = projectWithAsset();
		const secondAssetId = 'archive-asset-two' as AssetId;
		project.assets[secondAssetId] = {
			...project.assets[assetId]!,
			id: secondAssetId,
			name: 'clip-two.mp4',
			opfsPath: `projects/${project.id}/media/${secondAssetId}.mp4`
		};
		for (const id of [assetId, secondAssetId]) {
			opfsMocks.handles.set(`${id}.mp4`, {
				kind: 'file',
				getFile: async () => new File(['video'], `${id}.mp4`, { type: 'video/mp4' })
			} as FileSystemFileHandle);
		}
		opfsMocks.writeMedia
			.mockResolvedValueOnce(`projects/${project.id}/media/${assetId}.mp4`)
			.mockRejectedValueOnce(new Error('Storage quota exceeded'));

		await expect(importTfve(await exportTfve(project, { includeMedia: true }))).rejects.toThrow(
			'Storage quota exceeded'
		);
		expect(opfsMocks.deleteMedia).toHaveBeenCalledWith(project.id, assetId);
	});
});
