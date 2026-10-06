import type { AssetId, Project } from '../../core';
import { Zip, ZipPassThrough, strToU8 } from 'fflate';
import { sanitizeFilename } from '../export/presets';
import { exportEdlTrack, exportEdlTracks } from './edl';
import { exportFcpxml } from './fcpxml';
import { exportOtio } from './otio';
import { exportXmeml } from './xmeml';
import { uniqueMediaPaths } from './exportUtils';
import type { InteropOptions } from './exportUtils';
import { getMediaFile } from '../storage/opfs';

export type InterchangeFormat = 'xmeml' | 'edl' | 'fcpxml' | 'otio';
export type ProjectExporter = (project: Project, options?: InteropOptions) => string;

const exporters: Record<Exclude<InterchangeFormat, 'edl'>, ProjectExporter> = {
	xmeml: exportXmeml,
	fcpxml: exportFcpxml,
	otio: exportOtio
};

export function exportInterchangeFile(
	project: Project,
	format: InterchangeFormat,
	options: InteropOptions = {}
): string {
	if (format === 'edl') {
		const track = project.tracks.find((item) => item.kind === 'video');
		if (!track)
			throw new Error('Create a video track with at least one clip before exporting EDL.');
		return exportEdlTrack(project, track, options);
	}
	return exporters[format](project, options);
}

export interface PackageProgress {
	filesDone: number;
	totalFiles: number;
	bytesWritten: number;
}

export async function streamInterchangePackage(
	project: Project,
	format: InterchangeFormat,
	write: (chunk: Uint8Array) => Promise<void>,
	options: {
		getFile?: typeof getMediaFile;
		includeMedia?: boolean;
		onProgress?: (progress: PackageProgress) => void;
		signal?: AbortSignal;
	} = {}
): Promise<void> {
	const checkCancelled = () => {
		if (options.signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError');
	};
	const includeMedia = options.includeMedia ?? true;
	const mediaPaths = uniqueMediaPaths(project);
	const edlTracks = format === 'edl' ? exportEdlTracks(project, { mediaPaths }) : [];
	const fileCount = includeMedia ? Object.keys(project.assets).length : 0;
	const totalFiles = fileCount + (format === 'edl' ? edlTracks.length + 1 : 1);
	let outputQueue = Promise.resolve();
	let zipError: Error | null = null;
	const zip = new Zip((error, chunk) => {
		if (error) {
			zipError = new Error('Could not create interchange package.', { cause: error });
			return;
		}
		if (chunk) outputQueue = outputQueue.then(() => write(chunk));
	});
	let filesDone = 0;
	let bytesWritten = 0;
	const addBytes = async (path: string, bytes: Uint8Array) => {
		checkCancelled();
		const entry = new ZipPassThrough(path);
		zip.add(entry);
		entry.push(bytes, true);
		filesDone += 1;
		bytesWritten += bytes.byteLength;
		options.onProgress?.({ filesDone, totalFiles, bytesWritten });
		await outputQueue;
	};

	if (format === 'edl') {
		for (const edl of edlTracks) await addBytes(edl.filename, strToU8(edl.content));
		await addBytes(
			'AUDIO-NOTE.txt',
			strToU8('CMX3600 EDL exports cuts for each video track only. Audio is not included.')
		);
	} else {
		const extension = format === 'xmeml' ? 'xml' : format;
		const filename = sanitizeFilename(project.name, extension);
		await addBytes(filename, strToU8(exporters[format](project, { mediaPaths })));
	}

	if (includeMedia) {
		const getFile = options.getFile ?? getMediaFile;
		for (const asset of Object.values(project.assets)) {
			checkCancelled();
			if (asset.offline) throw new Error(`Cannot package offline media “${asset.name}”.`);
			const path = mediaPaths.get(asset.id);
			if (!path) throw new Error(`No package path was allocated for media “${asset.name}”.`);
			const file = await getFile(project.id, asset);
			const entry = new ZipPassThrough(path);
			zip.add(entry);
			const reader = file.stream().getReader();
			try {
				while (true) {
					checkCancelled();
					const { done, value } = await reader.read();
					if (done) break;
					entry.push(value);
					bytesWritten += value.byteLength;
					if (zipError) throw zipError;
					await outputQueue;
				}
				entry.push(new Uint8Array(), true);
			} finally {
				reader.releaseLock();
			}
			filesDone += 1;
			options.onProgress?.({ filesDone, totalFiles, bytesWritten });
		}
	}
	zip.end();
	await outputQueue;
	if (zipError) throw zipError;
}

export async function exportInterchangePackage(
	project: Project,
	format: InterchangeFormat,
	options: {
		getFile?: typeof getMediaFile;
		includeMedia?: boolean;
		signal?: AbortSignal;
		onProgress?: (progress: PackageProgress) => void;
	} = {}
): Promise<Blob> {
	const chunks: Uint8Array[] = [];
	await streamInterchangePackage(
		project,
		format,
		async (chunk) => {
			chunks.push(chunk.slice());
		},
		{ ...options, onProgress: options.onProgress }
	);
	return new Blob(
		chunks.map((chunk) => Uint8Array.from(chunk).buffer),
		{
			type: 'application/zip'
		}
	);
}

export function assetPackagePath(paths: ReadonlyMap<AssetId, string>, assetId: AssetId): string {
	const path = paths.get(assetId);
	if (!path) throw new Error(`No media package path exists for asset “${assetId}”.`);
	return path;
}
