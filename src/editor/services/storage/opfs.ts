import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Asset, AssetId, Project, ProjectId } from '../../core';
import { rebaseMediaPath } from '../../core';
import { collectOrphanedDerived } from './mediaCache';

const ROOT_DIRECTORY = 'projects';
const IDB_MEDIA_DB = 'tfve-media-fallback';
const IDB_MEDIA_STORE = 'media';

interface FallbackMediaRecord {
	key: string;
	projectId: ProjectId;
	filename: string;
	file: Blob;
	name: string;
	mimeType: string;
	size: number;
	lastModified: number;
}

interface FallbackMediaDatabase extends DBSchema {
	media: {
		key: string;
		value: FallbackMediaRecord;
		indexes: { projectId: ProjectId };
	};
}

let fallbackDbPromise: Promise<IDBPDatabase<FallbackMediaDatabase>> | undefined;

function getFallbackDb(): Promise<IDBPDatabase<FallbackMediaDatabase>> | null {
	if (typeof indexedDB === 'undefined') return null;
	fallbackDbPromise ??= openDB<FallbackMediaDatabase>(IDB_MEDIA_DB, 1, {
		upgrade(db) {
			if (!db.objectStoreNames.contains(IDB_MEDIA_STORE)) {
				const store = db.createObjectStore(IDB_MEDIA_STORE, { keyPath: 'key' });
				store.createIndex('projectId', 'projectId');
			}
		}
	});
	return fallbackDbPromise;
}

async function writeFallbackMedia(
	projectId: ProjectId,
	filename: string,
	file: File,
	onProgress?: (loaded: number, total: number) => void,
	signal?: AbortSignal
): Promise<void> {
	if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
	const db = await getFallbackDb();
	if (!db) throw new UnsupportedMediaStorageError();
	const key = `${projectId}:${filename}`;
	const record: FallbackMediaRecord = {
		key,
		projectId,
		filename,
		file,
		name: file.name,
		mimeType: file.type,
		size: file.size,
		lastModified: file.lastModified || Date.now()
	};
	if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
	await db.put(IDB_MEDIA_STORE, record);
	onProgress?.(file.size, file.size);
}

async function getFallbackMedia(projectId: ProjectId, filename: string): Promise<File | null> {
	const db = await getFallbackDb();
	if (!db) return null;
	try {
		const record = (await db.get(IDB_MEDIA_STORE, `${projectId}:${filename}`)) as
			FallbackMediaRecord | undefined;
		if (!record) return null;
		return new File([record.file], record.name, {
			type: record.mimeType,
			lastModified: record.lastModified
		});
	} catch {
		return null;
	}
}

async function deleteFallbackMedia(projectId: ProjectId, assetIdOrFilename: string): Promise<void> {
	const db = await getFallbackDb();
	if (!db) return;
	try {
		const tx = db.transaction(IDB_MEDIA_STORE, 'readwrite');
		const index = tx.store.index('projectId');
		let cursor = await index.openCursor(projectId);
		while (cursor) {
			const record = cursor.value as FallbackMediaRecord;
			if (
				record.filename === assetIdOrFilename ||
				record.filename.startsWith(`${assetIdOrFilename}.`) ||
				record.filename.startsWith(assetIdOrFilename)
			) {
				await cursor.delete();
			}
			cursor = await cursor.continue();
		}
		await tx.done;
	} catch {}
}

let persistenceRequest: Promise<boolean> | undefined;

interface StorageEstimate {
	usage?: number;
	quota?: number;
}

interface MediaUrlEntry {
	url: string;
	refs: number;
}

const objectUrls = new Map<string, MediaUrlEntry>();

export class UnsupportedMediaStorageError extends Error {
	constructor() {
		super(
			'This browser does not support persistent media storage. Use a browser with OPFS support to import media.'
		);
		this.name = 'UnsupportedMediaStorageError';
	}
}

export class MediaMissingError extends Error {
	constructor(asset: Asset) {
		super(`Media file for “${asset.name}” is missing. Relink the file to use it.`);
		this.name = 'MediaMissingError';
	}
}

export class StorageQuotaError extends Error {
	readonly requestedBytes: number;
	readonly usageBytes: number | null;
	readonly quotaBytes: number | null;

	constructor(requestedBytes: number, estimate: StorageEstimate = {}) {
		const usage = estimate.usage ?? null;
		const quota = estimate.quota ?? null;
		const available = usage === null || quota === null ? null : Math.max(0, quota - usage);
		const details =
			usage === null || quota === null || available === null
				? 'Browser storage is full.'
				: `Browser storage has ${formatBytes(available)} available of ${formatBytes(quota)} (${formatBytes(usage)} used).`;
		super(
			`Not enough device storage for this media file (${formatBytes(requestedBytes)} required). ${details} Free space and try again.`
		);
		this.name = 'StorageQuotaError';
		this.requestedBytes = requestedBytes;
		this.usageBytes = usage;
		this.quotaBytes = quota;
	}
}

export class MediaWriteError extends Error {
	constructor(message: string, cause: unknown) {
		super(message, { cause });
		this.name = 'MediaWriteError';
	}
}

function formatBytes(value: number): string {
	return new Intl.NumberFormat(undefined, {
		style: 'unit',
		unit: 'byte',
		unitDisplay: 'narrow',
		maximumFractionDigits: 1
	}).format(value);
}

function storageRoot(): StorageManager | null {
	if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
	return navigator.storage;
}

function requestPersistence(storage: StorageManager): void {
	if (!storage.persist || persistenceRequest) return;
	persistenceRequest = Promise.race([
		storage.persist(),
		new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1000))
	]).catch(() => false);
}

async function projectDirectory(projectId: ProjectId): Promise<FileSystemDirectoryHandle> {
	const storage = storageRoot();
	if (!storage) throw new UnsupportedMediaStorageError();
	requestPersistence(storage);
	const root = await storage.getDirectory();
	const app = await root.getDirectoryHandle(ROOT_DIRECTORY, { create: true });
	return app.getDirectoryHandle(projectId, { create: true });
}

async function mediaDirectory(projectId: ProjectId): Promise<FileSystemDirectoryHandle> {
	const project = await projectDirectory(projectId);
	return project.getDirectoryHandle('media', { create: true });
}

export async function proxiesDirectory(projectId: ProjectId): Promise<FileSystemDirectoryHandle> {
	const project = await projectDirectory(projectId);
	return project.getDirectoryHandle('proxies', { create: true });
}

function mediaFilename(asset: Asset): string {
	const name = asset.opfsPath.split('/').at(-1) ?? '';
	if (!name.startsWith(`${asset.id}.`) && name !== asset.id) {
		throw new Error(`Unsafe media path for asset “${asset.id}”.`);
	}
	return name;
}

function mediaFilenameForFile(assetId: AssetId, file: File): string {
	const extension =
		file.name
			.split('.')
			.at(-1)
			?.toLowerCase()
			.replace(/[^a-z0-9]/g, '') ?? '';
	return `${assetId}${extension ? `.${extension}` : ''}`;
}

async function quotaEstimate(): Promise<StorageEstimate> {
	if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return {};
	return Promise.race([
		navigator.storage.estimate(),
		new Promise<StorageEstimate>((resolve) => setTimeout(() => resolve({}), 1500))
	]).catch(() => ({}));
}

export function isSupported(): boolean {
	return storageRoot() !== null || typeof indexedDB !== 'undefined';
}

export async function ensureProjectDir(
	projectId: ProjectId
): Promise<FileSystemDirectoryHandle | null> {
	if (!storageRoot()) return null;
	return projectDirectory(projectId);
}

export async function deleteProjectDir(projectId: ProjectId): Promise<void> {
	const storage = storageRoot();
	if (storage) {
		try {
			const originDirectory = await storage.getDirectory();
			const appDirectory = await originDirectory.getDirectoryHandle(ROOT_DIRECTORY);
			await appDirectory.removeEntry(projectId, { recursive: true });
		} catch (error) {
			if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
				console.warn('Could not remove project directory:', error);
			}
		}
	}

	for (const [key, entry] of objectUrls) {
		if (key.startsWith(`${projectId}:`)) {
			URL.revokeObjectURL(entry.url);
			objectUrls.delete(key);
		}
	}

	const db = await getFallbackDb();
	if (db) {
		try {
			const tx = db.transaction(IDB_MEDIA_STORE, 'readwrite');
			const index = tx.store.index('projectId');
			let cursor = await index.openCursor(projectId);
			while (cursor) {
				await cursor.delete();
				cursor = await cursor.continue();
			}
			await tx.done;
		} catch {}
	}
}

export async function writeMedia(
	projectId: ProjectId,
	assetId: AssetId,
	file: File,
	onProgress?: (loaded: number, total: number) => void,
	signal?: AbortSignal
): Promise<string> {
	const filename = mediaFilenameForFile(assetId, file);
	const path = `projects/${projectId}/media/${filename}`;

	let directory: FileSystemDirectoryHandle | null = null;
	if (storageRoot()) {
		try {
			directory = await mediaDirectory(projectId);
		} catch (error) {
			if (!(error instanceof UnsupportedMediaStorageError)) {
				console.warn('Could not open OPFS media directory:', error);
			}
		}
	}

	if (directory) {
		let handle: FileSystemFileHandle | null = null;
		let writable: FileSystemWritableFileStream | null = null;
		try {
			if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
			const estimate = await quotaEstimate();
			if (estimate.quota !== undefined && estimate.usage !== undefined) {
				const available = Math.max(0, estimate.quota - estimate.usage);
				if (file.size > available) throw new StorageQuotaError(file.size, estimate);
			}
			handle = await directory.getFileHandle(filename, { create: true });
			if (typeof handle.createWritable === 'function') {
				writable = await handle.createWritable();
				const CHUNK_SIZE = 2 * 1024 * 1024;
				let loaded = 0;
				if (file.size === 0) {
					await writable.write(new Uint8Array(0));
					onProgress?.(0, 0);
				} else {
					while (loaded < file.size) {
						if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
						const end = Math.min(loaded + CHUNK_SIZE, file.size);
						const chunk = file.slice(loaded, end);
						const buffer = await chunk.arrayBuffer();
						await writable.write(buffer);
						loaded = end;
						onProgress?.(loaded, file.size);
					}
				}
				await writable.close();
				writable = null;
				return path;
			}
		} catch (error) {
			if (writable) {
				try {
					await writable.abort();
				} catch (abortError) {
					console.error('Could not abort a partial media write.', abortError);
				}
			}
			if (handle) {
				try {
					await directory.removeEntry(filename);
				} catch (removeError) {
					if (!(removeError instanceof DOMException && removeError.name === 'NotFoundError')) {
						console.error('Could not remove a partial media file.', removeError);
					}
				}
			}
			if (
				error instanceof StorageQuotaError ||
				(error instanceof DOMException && error.name === 'AbortError')
			) {
				throw error;
			}
			console.warn('OPFS write failed, attempting fallback storage:', error);
		}
	}

	try {
		await writeFallbackMedia(projectId, filename, file, onProgress, signal);
		return path;
	} catch (fallbackError) {
		if (
			fallbackError instanceof StorageQuotaError ||
			(fallbackError instanceof DOMException && fallbackError.name === 'AbortError')
		) {
			throw fallbackError;
		}
		throw new MediaWriteError(`Could not store “${file.name}” on this device.`, fallbackError);
	}
}

export async function getMediaFile(projectId: ProjectId, asset: Asset): Promise<File> {
	const filename = mediaFilename(asset);
	if (storageRoot()) {
		try {
			const directory = await mediaDirectory(projectId);
			const handle = await directory.getFileHandle(filename);
			return await handle.getFile();
		} catch (error) {
			if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
				console.warn('OPFS read failed, trying fallback:', error);
			}
		}
	}
	const fallback = await getFallbackMedia(projectId, filename);
	if (fallback) return fallback;
	throw new MediaMissingError(asset);
}

export async function getMediaObjectUrl(
	projectId: ProjectId,
	asset: Asset
): Promise<{ url: string; release: () => void }> {
	const key = `${projectId}:${asset.id}`;
	let entry = objectUrls.get(key);
	if (!entry) {
		const file = await getMediaFile(projectId, asset);
		entry = { url: URL.createObjectURL(file), refs: 0 };
		objectUrls.set(key, entry);
	}
	entry.refs += 1;
	let released = false;
	return {
		url: entry.url,
		release() {
			if (released) return;
			released = true;
			const current = objectUrls.get(key);
			if (!current) return;
			current.refs -= 1;
			if (current.refs <= 0) {
				URL.revokeObjectURL(current.url);
				objectUrls.delete(key);
			}
		}
	};
}

export async function deleteMedia(projectId: ProjectId, assetId: AssetId): Promise<void> {
	const key = `${projectId}:${assetId}`;
	const entry = objectUrls.get(key);
	if (entry) {
		URL.revokeObjectURL(entry.url);
		objectUrls.delete(key);
	}
	let filename = `${assetId}`;
	if (storageRoot()) {
		try {
			const directory = await mediaDirectory(projectId);
			for await (const [name] of directory.entries()) {
				if (name === assetId || name.startsWith(`${assetId}.`)) {
					filename = name;
					await directory.removeEntry(name);
					break;
				}
			}
		} catch (error) {
			if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
				console.warn('Could not remove OPFS media file:', error);
			}
		}
	}
	await deleteFallbackMedia(projectId, filename);
}

export async function deleteMediaFile(projectId: ProjectId, asset: Asset): Promise<void> {
	const key = `${projectId}:${asset.id}`;
	const entry = objectUrls.get(key);
	if (entry) {
		URL.revokeObjectURL(entry.url);
		objectUrls.delete(key);
	}
	const filename = mediaFilename(asset);
	if (storageRoot()) {
		try {
			const directory = await mediaDirectory(projectId);
			await directory.removeEntry(filename);
		} catch (error) {
			if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
				console.warn('Could not remove OPFS media file:', error);
			}
		}
	}
	await deleteFallbackMedia(projectId, filename);
}

export interface StoredMedia {
	filename: string;
	assetId: AssetId | null;
	size: number;
}

export interface MediaGarbageCollectionReport {
	removedFiles: string[];
	removedCacheAssetIds: AssetId[];
	removedProxyAssetIds: AssetId[];
	foreignFiles: string[];
}

export async function collectMediaGarbage(project: Project): Promise<MediaGarbageCollectionReport> {
	const referenced = new Set(Object.keys(project.assets) as AssetId[]);
	const report: MediaGarbageCollectionReport = {
		removedFiles: [],
		removedCacheAssetIds: [],
		removedProxyAssetIds: [],
		foreignFiles: []
	};
	if (isSupported()) {
		const directory = await mediaDirectory(project.id);
		for await (const [filename, handle] of directory.entries()) {
			if (handle.kind !== 'file') continue;
			const match = /^([a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\.[a-z0-9]+$/i.exec(
				filename
			);
			if (!match) {
				report.foreignFiles.push(filename);
				continue;
			}
			const assetId = match[1] as AssetId;
			if (referenced.has(assetId)) continue;
			await directory.removeEntry(filename);
			report.removedFiles.push(filename);
			const key = `${project.id}:${assetId}`;
			const url = objectUrls.get(key);
			if (url) {
				URL.revokeObjectURL(url.url);
				objectUrls.delete(key);
			}
		}

		// Also collect orphaned proxy files in projects/<id>/proxies/<assetId>.<ext>
		try {
			const pDir = await proxiesDirectory(project.id);
			for await (const [filename, handle] of pDir.entries()) {
				if (handle.kind !== 'file') continue;
				const match =
					/^([a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\.[a-z0-9]+$/i.exec(filename);
				if (!match) continue;
				const assetId = match[1] as AssetId;
				if (!referenced.has(assetId)) {
					await pDir.removeEntry(filename);
					report.removedProxyAssetIds.push(assetId);
					const proxyKey = `${project.id}:proxy:${assetId}`;
					const url = objectUrls.get(proxyKey);
					if (url) {
						URL.revokeObjectURL(url.url);
						objectUrls.delete(proxyKey);
					}
				}
			}
		} catch {
			// proxies directory might not exist yet
		}
	}
	report.removedCacheAssetIds = await collectOrphanedDerived(project.id, referenced);
	return report;
}

export async function listMedia(projectId: ProjectId): Promise<StoredMedia[]> {
	const media: StoredMedia[] = [];
	if (storageRoot()) {
		try {
			const directory = await mediaDirectory(projectId);
			for await (const [filename, handle] of directory.entries()) {
				if (handle.kind !== 'file') continue;
				const file = await handle.getFile();
				const match = /^(.+?)(?:\.[a-z0-9]+)?$/i.exec(filename);
				media.push({
					filename,
					assetId: match ? (match[1] as AssetId) : null,
					size: file.size
				});
			}
		} catch (error) {
			if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
				console.warn('Could not read OPFS media list:', error);
			}
		}
	}
	const db = await getFallbackDb();
	if (db) {
		try {
			const tx = db.transaction(IDB_MEDIA_STORE, 'readonly');
			const index = tx.store.index('projectId');
			let cursor = await index.openCursor(projectId);
			while (cursor) {
				const record = cursor.value as FallbackMediaRecord;
				if (!media.some((m) => m.filename === record.filename)) {
					const match = /^(.+?)(?:\.[a-z0-9]+)?$/i.exec(record.filename);
					media.push({
						filename: record.filename,
						assetId: match ? (match[1] as AssetId) : null,
						size: record.size
					});
				}
				cursor = await cursor.continue();
			}
		} catch {}
	}
	return media;
}

export async function getProjectMediaFileHandles(
	projectId: ProjectId
): Promise<Map<string, FileSystemFileHandle>> {
	let directory: FileSystemDirectoryHandle;
	try {
		directory = await mediaDirectory(projectId);
	} catch (error) {
		if (error instanceof DOMException && error.name === 'NotFoundError') return new Map();
		throw error;
	}
	const handles = new Map<string, FileSystemFileHandle>();
	for await (const [filename, handle] of directory.entries()) {
		if (handle.kind === 'file') handles.set(filename, handle);
	}
	return handles;
}

export async function projectMediaSize(projectId: ProjectId): Promise<number> {
	if (!isSupported()) return 0;
	const media = await listMedia(projectId);
	return media.reduce((total, file) => total + file.size, 0);
}

export async function reconcileProjectMedia(
	project: Project
): Promise<{ assets: Project['assets']; unknownFiles: string[]; changed: boolean }> {
	const files = await listMedia(project.id);
	return reconcileMediaListing(project, files);
}

export function reconcileMediaListing(
	project: Project,
	files: StoredMedia[]
): { assets: Project['assets']; unknownFiles: string[]; changed: boolean } {
	const fileIds = new Set(files.flatMap((file) => (file.assetId ? [file.assetId] : [])));
	const knownIds = new Set(Object.keys(project.assets));
	const unknownFiles = files
		.filter((file) => !file.assetId || !knownIds.has(file.assetId))
		.map((f) => f.filename);
	let changed = false;
	const assets = Object.fromEntries(
		Object.values(project.assets).map((asset) => {
			const offline = !fileIds.has(asset.id);
			if (asset.offline !== offline) changed = true;
			const onlineAsset = { ...asset };
			delete onlineAsset.offline;
			return [asset.id, offline ? { ...asset, offline: true } : onlineAsset];
		})
	) as Project['assets'];
	return { assets, unknownFiles, changed };
}

export async function copyProjectMedia(source: Project, destination: Project): Promise<Project> {
	const onlineAssets = Object.values(source.assets).filter((asset) => !asset.offline);
	if (onlineAssets.length > 0 && !isSupported()) {
		throw new UnsupportedMediaStorageError();
	}
	if (onlineAssets.length === 0) return destination;
	try {
		const originalAssets = Object.values(source.assets);
		const copiedAssets = Object.values(destination.assets);
		const assets = { ...destination.assets };
		for (let index = 0; index < originalAssets.length; index += 1) {
			const sourceAsset = originalAssets[index];
			const destinationAsset = copiedAssets[index];
			if (!sourceAsset || !destinationAsset || sourceAsset.offline) continue;
			try {
				const file = await getMediaFile(source.id, sourceAsset);
				const opfsPath = await writeMedia(destination.id, destinationAsset.id, file);
				assets[destinationAsset.id] = { ...destinationAsset, opfsPath, offline: false };
			} catch (error) {
				if (error instanceof MediaMissingError) {
					assets[destinationAsset.id] = { ...destinationAsset, offline: true };
					continue;
				}
				throw error;
			}
		}
		return { ...destination, assets };
	} catch (error) {
		await deleteProjectDir(destination.id);
		throw error;
	}
}

export async function writeProxy(
	projectId: ProjectId,
	assetId: AssetId,
	extension: string,
	data: Blob | ArrayBuffer,
	onProgress?: (loaded: number, total: number) => void,
	signal?: AbortSignal
): Promise<string> {
	const directory = await proxiesDirectory(projectId);
	const filename = `${assetId}.${extension.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
	const path = `projects/${projectId}/proxies/${filename}`;
	let handle: FileSystemFileHandle | null = null;
	let writable: FileSystemWritableFileStream | null = null;
	try {
		if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
		handle = await directory.getFileHandle(filename, { create: true });
		writable = await handle.createWritable();
		if (data instanceof Blob) {
			const CHUNK_SIZE = 2 * 1024 * 1024;
			let loaded = 0;
			const total = data.size;
			if (total === 0) {
				await writable.write(new Uint8Array(0));
				onProgress?.(0, 0);
			} else {
				while (loaded < total) {
					if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
					const end = Math.min(loaded + CHUNK_SIZE, total);
					const chunk = data.slice(loaded, end);
					const buffer = await chunk.arrayBuffer();
					await writable.write(buffer);
					loaded = end;
					onProgress?.(loaded, total);
				}
			}
		} else {
			await writable.write(data);
			onProgress?.(data.byteLength, data.byteLength);
		}
		await writable.close();
		writable = null;
		return path;
	} catch (error) {
		if (writable) {
			try {
				await writable.abort();
			} catch {}
		}
		if (handle) {
			try {
				await directory.removeEntry(filename);
			} catch {}
		}
		throw error;
	}
}

export async function getProxyFile(
	projectId: ProjectId,
	assetId: AssetId,
	extension = 'mp4'
): Promise<File> {
	const directory = await proxiesDirectory(projectId);
	const filename = `${assetId}.${extension.toLowerCase()}`;
	const handle = await directory.getFileHandle(filename);
	return await handle.getFile();
}

export async function getProxyObjectUrl(
	projectId: ProjectId,
	asset: Asset
): Promise<{ url: string; release: () => void }> {
	const key = `${projectId}:proxy:${asset.id}`;
	let entry = objectUrls.get(key);
	if (!entry) {
		const ext = asset.proxy?.container ?? 'mp4';
		const file = await getProxyFile(projectId, asset.id, ext);
		entry = { url: URL.createObjectURL(file), refs: 0 };
		objectUrls.set(key, entry);
	}
	entry.refs += 1;
	let released = false;
	return {
		url: entry.url,
		release() {
			if (released) return;
			released = true;
			const current = objectUrls.get(key);
			if (!current) return;
			current.refs -= 1;
			if (current.refs <= 0) {
				URL.revokeObjectURL(current.url);
				objectUrls.delete(key);
			}
		}
	};
}

export async function deleteProxyFile(projectId: ProjectId, assetId: AssetId): Promise<void> {
	const key = `${projectId}:proxy:${assetId}`;
	const entry = objectUrls.get(key);
	if (entry) {
		URL.revokeObjectURL(entry.url);
		objectUrls.delete(key);
	}
	try {
		const directory = await proxiesDirectory(projectId);
		for await (const [name] of directory.entries()) {
			if (name === assetId || name.startsWith(`${assetId}.`)) {
				await directory.removeEntry(name);
				return;
			}
		}
	} catch (error) {
		if (error instanceof DOMException && error.name === 'NotFoundError') return;
		throw error;
	}
}

export async function listProxies(projectId: ProjectId): Promise<StoredMedia[]> {
	try {
		const directory = await proxiesDirectory(projectId);
		const list: StoredMedia[] = [];
		for await (const [filename, handle] of directory.entries()) {
			if (handle.kind !== 'file') continue;
			const file = await handle.getFile();
			const match = /^([a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})/i.exec(filename);
			list.push({
				filename,
				assetId: (match ? match[1] : null) as AssetId | null,
				size: file.size
			});
		}
		return list;
	} catch {
		return [];
	}
}

export async function projectProxyTotalSize(projectId: ProjectId): Promise<number> {
	const list = await listProxies(projectId);
	return list.reduce((sum, item) => sum + item.size, 0);
}

export function rebaseAssetPath(projectId: ProjectId, assetId: AssetId, path: string): string {
	return rebaseMediaPath(projectId, assetId, path);
}
