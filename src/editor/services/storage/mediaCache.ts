import { z } from 'zod';
import type { AssetId, ProjectId, Time } from '../../core';
import { openProjectDatabase } from './projectDb';

export interface DerivedThumbnail {
	time: Time;
	blob: Blob;
}

export interface AudioPeaks {
	sampleRate: number;
	bucketsPerSecond: number;
	min: Int8Array;
	max: Int8Array;
}

export interface DerivedData {
	poster: Blob;
	thumbs: DerivedThumbnail[];
	peaks?: AudioPeaks;
	waveformStatus: 'ready' | 'unavailable' | 'none';
}

const derivedDataSchema = z.object({
	poster: z.instanceof(Blob),
	thumbs: z.array(z.object({ time: z.number().int().nonnegative(), blob: z.instanceof(Blob) })),
	peaks: z
		.object({
			sampleRate: z.number().positive(),
			bucketsPerSecond: z.number().positive(),
			min: z.instanceof(Int8Array),
			max: z.instanceof(Int8Array)
		})
		.optional(),
	waveformStatus: z.enum(['ready', 'unavailable', 'none'])
});

function cacheKey(projectId: ProjectId, assetId: AssetId): string {
	return `${projectId}:${assetId}`;
}

export async function getDerived(
	projectId: ProjectId,
	assetId: AssetId
): Promise<DerivedData | null> {
	const db = await openProjectDatabase();
	const record = await db.get('mediaCache', cacheKey(projectId, assetId));
	if (!record) return null;

	const result = derivedDataSchema.safeParse(record.value);
	if (!result.success) {
		console.error(`Ignoring invalid derived media cache for asset ${assetId}.`, result.error);
		await db.delete('mediaCache', record.key);
		return null;
	}
	return result.data;
}

export async function putDerived(
	projectId: ProjectId,
	assetId: AssetId,
	data: DerivedData
): Promise<void> {
	const validated = derivedDataSchema.parse(data);
	const db = await openProjectDatabase();
	const key = cacheKey(projectId, assetId);
	await db.put('mediaCache', { key, projectId, assetId, value: validated });
}

export async function deleteDerived(projectId: ProjectId, assetId: AssetId): Promise<void> {
	const db = await openProjectDatabase();
	await db.delete('mediaCache', cacheKey(projectId, assetId));
}

export async function deleteProjectDerived(projectId: ProjectId): Promise<void> {
	const db = await openProjectDatabase();
	const tx = db.transaction('mediaCache', 'readwrite');
	let cursor = await tx.store.openCursor();
	while (cursor) {
		if (cursor.value.projectId === projectId) await cursor.delete();
		cursor = await cursor.continue();
	}
	await tx.done;
}

export async function collectOrphanedDerived(
	projectId: ProjectId,
	referencedAssetIds: ReadonlySet<AssetId>
): Promise<AssetId[]> {
	const db = await openProjectDatabase();
	const tx = db.transaction('mediaCache', 'readwrite');
	const removed: AssetId[] = [];
	let cursor = await tx.store.openCursor();
	while (cursor) {
		const record = cursor.value;
		if (record.projectId === projectId && !referencedAssetIds.has(record.assetId)) {
			removed.push(record.assetId);
			await cursor.delete();
		}
		cursor = await cursor.continue();
	}
	await tx.done;
	return removed;
}
