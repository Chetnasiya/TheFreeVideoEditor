import { strToU8, strFromU8, unzipSync, Zip, ZipPassThrough } from 'fflate';
import { z } from 'zod';
import { duplicateProject, migrate, projectSchema } from '../../core';
import type { Asset, AssetId, Project } from '../../core';
import { getProject } from '../storage/projectDb';
import {
	getProjectMediaFileHandles,
	isSupported as isOpfsSupported,
	deleteMedia,
	writeMedia,
	UnsupportedMediaStorageError
} from '../storage/opfs';

const manifestSchema = z.object({
	format: z.literal('tfve'),
	version: z.literal(1),
	createdWith: z.literal('thefreevideoeditor.com'),
	includesMedia: z.boolean()
});

const manifest = (includesMedia: boolean) => ({
	format: 'tfve' as const,
	version: 1 as const,
	createdWith: 'thefreevideoeditor.com' as const,
	includesMedia
});

function validatedProject(project: Project): Project {
	return migrate(projectSchema.parse(project));
}

function projectAssetFiles(project: Project): string[] {
	return Object.values(project.assets).map((asset) => {
		const ext = asset.opfsPath.split('/').at(-1)?.split('.').at(-1);
		return `assets/${asset.id}${ext ? `.${ext.toLowerCase()}` : ''}`;
	});
}

export async function exportTfve(
	project: Project,
	options: { includeMedia?: boolean } = {}
): Promise<Blob> {
	const chunks: Uint8Array[] = [];
	await streamTfve(project, options, async (chunk) => {
		chunks.push(chunk.slice());
	});
	return new Blob(
		chunks.map((chunk) => Uint8Array.from(chunk).buffer),
		{
			type: 'application/zip'
		}
	);
}

export async function streamTfve(
	project: Project,
	options: { includeMedia?: boolean } = {},
	write: (chunk: Uint8Array) => Promise<void>
): Promise<void> {
	const validated = validatedProject(project);
	const includeMedia = options.includeMedia ?? false;
	const assets = includeMedia ? Object.values(validated.assets) : [];
	let handles = new Map<string, FileSystemFileHandle>();
	if (includeMedia && assets.length > 0) {
		if (!isOpfsSupported()) throw new UnsupportedMediaStorageError();
		handles = await getProjectMediaFileHandles(validated.id);
	}

	let outputQueue = Promise.resolve();
	let streamError: Error | null = null;
	let finalOutput = false;
	const zip = new Zip((error, chunk, final) => {
		if (error) {
			streamError = new Error('Could not generate the TFVE project archive.', { cause: error });
			return;
		}
		if (chunk) outputQueue = outputQueue.then(() => write(chunk));
		if (final) finalOutput = true;
	});

	const pushBytes = (filename: string, bytes: Uint8Array) => {
		const entry = new ZipPassThrough(filename);
		zip.add(entry);
		entry.push(bytes, true);
	};

	pushBytes('project.json', strToU8(JSON.stringify(validated, null, 2)));
	pushBytes('manifest.json', strToU8(JSON.stringify(manifest(includeMedia), null, 2)));
	pushBytes('assets/', new Uint8Array());
	await outputQueue;

	const archivePaths = projectAssetFiles(validated);
	for (const [index, asset] of assets.entries()) {
		const expectedPath = archivePaths[index];
		const filename = expectedPath?.slice('assets/'.length);
		if (!filename) continue;
		const handleName = asset.opfsPath.split('/').at(-1) ?? '';
		const handle = handles.get(handleName);
		if (!handle || asset.offline) {
			throw new Error(
				`Cannot include “${asset.name}”: its local media file is missing or offline.`
			);
		}
		const file = await handle.getFile();
		const entry = new ZipPassThrough(`assets/${filename}`);
		zip.add(entry);
		const reader = file.stream().getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				entry.push(value);
				if (streamError) throw streamError;
				await outputQueue;
			}
			entry.push(new Uint8Array(), true);
		} finally {
			reader.releaseLock();
		}
	}
	zip.end();
	await outputQueue;
	if (streamError) throw streamError;
	if (!finalOutput) throw new Error('The TFVE archive stream did not finish.');
}

export async function importTfve(file: Blob): Promise<Project> {
	let archive: Record<string, Uint8Array>;
	try {
		archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
	} catch (error) {
		throw new Error('This file is not a valid TFVE ZIP project.', { cause: error });
	}

	const manifestBytes = archive['manifest.json'];
	const projectBytes = archive['project.json'];
	if (!manifestBytes || !projectBytes) {
		throw new Error('The TFVE archive must include manifest.json and project.json.');
	}

	let manifestData: unknown;
	let projectData: unknown;
	try {
		manifestData = JSON.parse(strFromU8(manifestBytes)) as unknown;
		projectData = JSON.parse(strFromU8(projectBytes)) as unknown;
	} catch (error) {
		throw new Error('The TFVE archive contains invalid JSON.', { cause: error });
	}

	const manifestResult = manifestSchema.safeParse(manifestData);
	if (!manifestResult.success) {
		throw new Error('This TFVE archive has an unsupported or invalid manifest.');
	}

	let project = migrate(projectData);
	const archiveAssetIds = Object.keys(project.assets);
	let idIsInUse = false;
	try {
		idIsInUse = (await getProject(project.id)) !== null;
	} catch (error) {
		if (
			error instanceof Error &&
			error.name === 'CorruptProjectError' &&
			'projectId' in error &&
			error.projectId === project.id
		) {
			idIsInUse = true;
		} else {
			throw error;
		}
	}
	if (idIsInUse) {
		const originalName = project.name;
		project = { ...duplicateProject(project), name: originalName };
	}

	const entries = Object.keys(archive).filter(
		(name) => name.startsWith('assets/') && name !== 'assets/'
	);
	if (entries.length > 0 && !manifestResult.data.includesMedia) {
		throw new Error(
			'The TFVE manifest declares media absent, but the archive contains media entries.'
		);
	}
	const assetsByEntry = new Map<string, Asset>();
	for (const entry of entries) {
		const filename = entry.slice('assets/'.length);
		const archiveAssetId = filename.split('.').at(0);
		const archiveIndex = archiveAssetIds.indexOf(archiveAssetId ?? '');
		const asset = Object.values(project.assets)[archiveIndex];
		if (!asset) {
			throw new Error(`The TFVE archive contains media for unknown asset “${archiveAssetId}”.`);
		}
		assetsByEntry.set(entry, asset);
	}

	const includesMedia = entries.length > 0;
	if (includesMedia && !isOpfsSupported()) throw new UnsupportedMediaStorageError();
	const assets: Project['assets'] = Object.fromEntries(
		Object.values(project.assets).map((asset) => [asset.id, { ...asset, offline: true }])
	) as Project['assets'];
	if (includesMedia) {
		const restoredAssetIds: Asset['id'][] = [];
		try {
			for (const [entry, asset] of assetsByEntry) {
				const bytes = archive[entry];
				if (!bytes) continue;
				const filename = entry.slice('assets/'.length);
				const blob = new Blob([Uint8Array.from(bytes).buffer], { type: asset.mimeType });
				const mediaFile = new File([blob], filename, { type: asset.mimeType });
				const opfsPath = await writeMedia(project.id, asset.id, mediaFile);
				restoredAssetIds.push(asset.id);
				assets[asset.id] = { ...asset, opfsPath, offline: false };
			}
		} catch (error) {
			const cleanup = await Promise.allSettled(
				restoredAssetIds.map((assetId) => deleteMedia(project.id, assetId))
			);
			const cleanupFailures = cleanup.filter(
				(result): result is PromiseRejectedResult => result.status === 'rejected'
			);
			if (cleanupFailures.length > 0) {
				throw new AggregateError(
					[error, ...cleanupFailures.map((result) => result.reason)],
					'Could not restore the TFVE project, and some partially restored media files could not be removed.'
				);
			}
			throw error;
		}
	}

	return { ...project, assets };
}
