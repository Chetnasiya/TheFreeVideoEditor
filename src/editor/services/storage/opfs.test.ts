import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAssetId, createEmptyProject } from '../../core';
import type { Asset, AssetId, ProjectId } from '../../core';
import {
	deleteMedia,
	collectMediaGarbage,
	getMediaFile,
	getMediaObjectUrl,
	projectMediaSize,
	reconcileProjectMedia,
	writeMedia
} from './opfs';

interface FakeFile {
	file: File;
}

class FakeDirectory {
	readonly directories = new Map<string, FakeDirectory>();
	readonly files = new Map<string, FakeFile>();

	async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDirectory> {
		let child = this.directories.get(name);
		if (!child && options?.create) {
			child = new FakeDirectory();
			this.directories.set(name, child);
		}
		if (!child) throw new DOMException('Missing directory', 'NotFoundError');
		return child;
	}

	async getFileHandle(name: string, options?: { create?: boolean }) {
		let record = this.files.get(name);
		if (!record && options?.create) {
			record = { file: new File([], name) };
			this.files.set(name, record);
		}
		if (!record) throw new DOMException('Missing file', 'NotFoundError');
		const files = this.files;
		const current = record;
		return {
			kind: 'file' as const,
			getFile: async () => current.file,
			createWritable: async () => {
				const chunks: BlobPart[] = [];
				return {
					write: async (chunk: BufferSource | Blob) => {
						chunks.push(
							chunk instanceof Blob
								? chunk
								: Uint8Array.from(new Uint8Array(chunk as ArrayBuffer)).buffer
						);
					},
					close: async () => {
						current.file = new File(chunks, name);
						files.set(name, current);
					},
					abort: async () => {
						files.delete(name);
					}
				};
			}
		};
	}

	async removeEntry(name: string): Promise<void> {
		if (this.files.delete(name) || this.directories.delete(name)) return;
		throw new DOMException('Missing entry', 'NotFoundError');
	}

	async *entries(): AsyncGenerator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]> {
		for (const [name] of this.directories) {
			yield [name, { kind: 'directory' } as FileSystemDirectoryHandle];
		}
		for (const [name, record] of this.files) {
			yield [
				name,
				{
					kind: 'file',
					getFile: async () => record.file
				} as FileSystemFileHandle
			];
		}
	}
}

const projectId = 'opfs-project' as ProjectId;
const assetId = 'opfs-asset' as AssetId;
let rootDirectory: FakeDirectory;

function mediaAsset(): Asset {
	return {
		id: assetId,
		kind: 'video',
		name: 'original.mp4',
		mimeType: 'video/mp4',
		size: 7,
		duration: 1_000_000,
		hasAudio: true,
		opfsPath: `projects/${projectId}/media/${assetId}.mp4`
	};
}

function stubStorage(): void {
	rootDirectory = new FakeDirectory();
	vi.stubGlobal('navigator', {
		storage: {
			getDirectory: async () => rootDirectory,
			persist: async () => true,
			estimate: async () => ({ quota: 1000, usage: 0 })
		}
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('OPFS media storage', () => {
	it('streams media under an id-based path and reports progress', async () => {
		stubStorage();
		const progress: number[] = [];
		const file = new File(['content'], 'user-private-name.mp4', { type: 'video/mp4' });
		const path = await writeMedia(projectId, assetId, file, (loaded) => progress.push(loaded));

		expect(path).toBe(`projects/${projectId}/media/${assetId}.mp4`);
		expect(progress.at(-1)).toBe(file.size);
		expect(await projectMediaSize(projectId)).toBe(file.size);
		const restored = await getMediaFile(projectId, mediaAsset());
		expect(await restored.text()).toBe('content');
	});

	it('reports missing media and revokes object URLs after all references release', async () => {
		stubStorage();
		const asset = mediaAsset();
		await expect(getMediaFile(projectId, asset)).rejects.toThrow('missing');
		await writeMedia(projectId, assetId, new File(['data'], 'source.mp4'));
		const revoke = vi.spyOn(URL, 'revokeObjectURL');
		const first = await getMediaObjectUrl(projectId, asset);
		const second = await getMediaObjectUrl(projectId, asset);
		expect(first.url).toBe(second.url);
		first.release();
		expect(revoke).not.toHaveBeenCalled();
		second.release();
		expect(revoke).toHaveBeenCalledWith(first.url);
	});

	it('reconciles media files without deleting untracked entries', async () => {
		stubStorage();
		await writeMedia(projectId, assetId, new File(['data'], 'clip.mp4'));
		const project = createEmptyProject({ name: 'Reconcile' });
		project.id = projectId;
		project.assets[assetId] = mediaAsset();
		const result = await reconcileProjectMedia(project);
		expect(result.assets[assetId]?.offline).toBeUndefined();
		expect(result.unknownFiles).toEqual([]);
		await deleteMedia(projectId, assetId);
		expect(await projectMediaSize(projectId)).toBe(0);
	});

	it('collects only unreferenced UUID-named media and reports foreign files', async () => {
		stubStorage();
		const project = createEmptyProject({ name: 'Garbage collection' });
		project.id = projectId;
		const retainedId = createAssetId();
		const orphanId = createAssetId();
		project.assets[retainedId] = {
			...mediaAsset(),
			id: retainedId,
			opfsPath: `projects/${projectId}/media/${retainedId}.mp4`
		};
		const app = await rootDirectory.getDirectoryHandle('projects', { create: true });
		const projectDirectory = await app.getDirectoryHandle(projectId, { create: true });
		const media = await projectDirectory.getDirectoryHandle('media', { create: true });
		for (const filename of [`${retainedId}.mp4`, `${orphanId}.wav`, 'foreign-notes.txt']) {
			await media.getFileHandle(filename, { create: true });
		}

		const report = await collectMediaGarbage(project);
		expect(report.removedFiles).toEqual([`${orphanId}.wav`]);
		expect(report.foreignFiles).toEqual(['foreign-notes.txt']);
		expect([...media.files.keys()]).toEqual([`${retainedId}.mp4`, 'foreign-notes.txt']);
	});

	it('falls back to IndexedDB when OPFS is unavailable', async () => {
		// No OPFS stubbed - storageRoot() returns null
		const fallbackAssetId = 'fallback-asset-123' as AssetId;
		const file = new File(['fallback-video-bytes'], 'mobile-video.mp4', { type: 'video/mp4' });
		const path = await writeMedia(projectId, fallbackAssetId, file);
		expect(path).toBe(`projects/${projectId}/media/${fallbackAssetId}.mp4`);

		const asset: Asset = {
			id: fallbackAssetId,
			kind: 'video',
			name: 'mobile-video.mp4',
			mimeType: 'video/mp4',
			size: file.size,
			duration: 1_000_000,
			hasAudio: true,
			opfsPath: path
		};
		const retrieved = await getMediaFile(projectId, asset);
		expect(await retrieved.text()).toBe('fallback-video-bytes');
		expect(retrieved.name).toBe('mobile-video.mp4');

		await deleteMedia(projectId, fallbackAssetId);
		await expect(getMediaFile(projectId, asset)).rejects.toThrow('missing');
	});
});
