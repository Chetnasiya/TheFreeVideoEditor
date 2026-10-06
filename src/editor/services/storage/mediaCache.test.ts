import 'fake-indexeddb/auto';
import { afterAll, describe, expect, it } from 'vitest';
import { collectOrphanedDerived, deleteDerived, getDerived, putDerived } from './mediaCache';
import { openProjectDatabase } from './projectDb';
import type { AssetId, ProjectId } from '../../core';
import { createEmptyProject } from '../../core';
import { reconcileMediaListing } from './opfs';

const DB_NAME = 'tfve';
let connection: Awaited<ReturnType<typeof openProjectDatabase>> | null = null;

function deleteDatabase(): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(DB_NAME);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(new Error('Test database deletion was blocked.'));
	});
}

afterAll(async () => {
	connection?.close();
	await deleteDatabase();
});

describe('derived media cache database', () => {
	it('upgrades the Gate B v1 database additively to v2', async () => {
		const versionOne = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, 1);
			request.onupgradeneeded = () => {
				const db = request.result;
				const projects = db.createObjectStore('projects', { keyPath: 'id' });
				projects.createIndex('updatedAt', 'updatedAt');
				db.createObjectStore('meta', { keyPath: 'key' });
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});

		versionOne.close();

		const upgraded = await openProjectDatabase();
		connection = upgraded;
		expect(upgraded.objectStoreNames).toContain('projects');
		expect(upgraded.objectStoreNames).toContain('meta');
		expect(upgraded.objectStoreNames).toContain('mediaCache');
		expect(upgraded.version).toBe(2);
	});

	describe('OPFS project reconciliation', () => {
		it('marks missing known media offline and preserves unknown files as a report', () => {
			const project = createEmptyProject({ name: 'Reconcile' });
			const onlineId = 'online-file' as AssetId;
			const missingId = 'missing-file' as AssetId;
			for (const [id, name] of [
				[onlineId, 'online.mp4'],
				[missingId, 'missing.wav']
			] as const) {
				project.assets[id] = {
					id,
					kind: name.endsWith('.mp4') ? 'video' : 'audio',
					name,
					mimeType: name.endsWith('.mp4') ? 'video/mp4' : 'audio/wav',
					size: 10,
					duration: 1_000_000,
					hasAudio: true,
					opfsPath: `projects/${project.id}/media/${id}.${name.split('.').at(-1)}`
				};
			}
			const result = reconcileMediaListing(project, [
				{ filename: `${onlineId}.mp4`, assetId: onlineId, size: 10 },
				{ filename: 'orphan.bin', assetId: 'orphan' as AssetId, size: 5 }
			]);
			expect(result.assets[onlineId]?.offline).toBeUndefined();
			expect(result.assets[missingId]?.offline).toBe(true);
			expect(result.unknownFiles).toEqual(['orphan.bin']);
			expect(result.changed).toBe(true);
		});
	});

	it('stores and deletes regenerable derived data', async () => {
		const projectId = 'project-cache' as ProjectId;
		const assetId = 'asset-cache' as AssetId;
		const value = {
			poster: new Blob(['poster'], { type: 'image/webp' }),
			thumbs: [{ time: 0, blob: new Blob(['thumb'], { type: 'image/webp' }) }],
			peaks: {
				sampleRate: 48_000,
				bucketsPerSecond: 10,
				min: new Int8Array([-1, 0]),
				max: new Int8Array([1, 0])
			},
			waveformStatus: 'ready' as const
		};
		await putDerived(projectId, assetId, value);
		connection = await openProjectDatabase();
		expect(await getDerived(projectId, assetId)).toEqual(value);
		await deleteDerived(projectId, assetId);
		expect(await getDerived(projectId, assetId)).toBeNull();
	});

	it('collects only cache rows no longer referenced by project assets', async () => {
		const projectId = 'project-gc' as ProjectId;
		const retained = 'retained-cache' as AssetId;
		const orphaned = 'orphaned-cache' as AssetId;
		const value = {
			poster: new Blob(['poster']),
			thumbs: [],
			waveformStatus: 'none' as const
		};
		await putDerived(projectId, retained, value);
		await putDerived(projectId, orphaned, value);

		expect(await collectOrphanedDerived(projectId, new Set([retained]))).toEqual([orphaned]);
		expect(await getDerived(projectId, retained)).toEqual(value);
		expect(await getDerived(projectId, orphaned)).toBeNull();
	});
});
