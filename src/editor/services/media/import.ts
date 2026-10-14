import { addAsset, assetDefaults, classifyMime, createAssetId } from '../../core';
import type { Asset, Project, ProjectId } from '../../core';
import {
	deleteMedia,
	isSupported,
	writeMedia,
	UnsupportedMediaStorageError
} from '../storage/opfs';
import { generateDerived, type DerivedStatus } from './derived';
import { probeMedia } from './probe';

export type ImportPhase = 'queued' | 'copying' | 'probing' | 'done' | 'failed' | 'cancelled';

export interface ImportProgress {
	index: number;
	name: string;
	phase: ImportPhase;
	loaded: number;
	total: number;
	reason?: string;
}

export interface ImportFailure {
	name: string;
	reason: string;
}

export interface ImportBatchResult {
	imported: Asset[];
	failed: ImportFailure[];
}

export interface ImportFilesOptions {
	projectId: ProjectId;
	fps: number;
	signal?: AbortSignal;
	signalForFile?: (index: number) => AbortSignal | undefined;
	onProgress?: (progress: ImportProgress) => void;
	mutateProject: (label: string, recipe: (project: Project) => Project) => void;
	onDerivedStatus?: (assetId: Asset['id'], status: DerivedStatus) => void;
	scheduleDerived?: (asset: Asset) => void;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'An unexpected media import error occurred.';
}

export async function importFiles(
	files: File[],
	options: ImportFilesOptions
): Promise<ImportBatchResult> {
	if (!isSupported()) throw new UnsupportedMediaStorageError();
	const imported: Asset[] = [];
	const failed: ImportFailure[] = [];
	let probeQueue: Promise<void> = Promise.resolve();
	let nextFile = 0;

	async function serializedProbe(file: File, signal?: AbortSignal): ReturnType<typeof probeMedia> {
		const result = probeQueue.then(() => probeMedia(file, { fps: options.fps }, { signal }));
		probeQueue = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	async function processFile(file: File, index: number): Promise<void> {
		const signal = options.signalForFile?.(index) ?? options.signal;
		if (signal?.aborted) return;
		if (!classifyMime(file.type, file.name)) {
			const reason = 'Unsupported media type. Choose a supported video, audio, or image file.';
			failed.push({ name: file.name, reason });
			options.onProgress?.({
				index,
				name: file.name,
				phase: 'failed',
				loaded: 0,
				total: file.size,
				reason
			});
			return;
		}
		const assetId = createAssetId();
		let fileStored = false;
		try {
			options.onProgress?.({
				index,
				name: file.name,
				phase: 'copying',
				loaded: 0,
				total: file.size
			});
			const opfsPath = await writeMedia(
				options.projectId,
				assetId,
				file,
				(loaded, total) =>
					options.onProgress?.({ index, name: file.name, phase: 'copying', loaded, total }),
				signal
			);
			fileStored = true;
			options.onProgress?.({
				index,
				name: file.name,
				phase: 'probing',
				loaded: file.size,
				total: file.size
			});
			const probed = await serializedProbe(file, signal);
			const asset: Asset = {
				id: assetId,
				kind: probed.kind,
				name: file.name,
				mimeType: file.type || `${probed.kind}/unknown`,
				size: file.size,
				...assetDefaults(probed.kind),
				duration: probed.duration,
				...(probed.width === undefined ? {} : { width: probed.width }),
				...(probed.height === undefined ? {} : { height: probed.height }),
				...(probed.fps === undefined ? {} : { fps: probed.fps }),
				...(probed.fpsEstimated === undefined ? {} : { fpsEstimated: probed.fpsEstimated }),
				hasAudio: probed.hasAudio,
				audioChecked: probed.audioChecked,
				...(probed.audioDecodable === undefined ? {} : { audioDecodable: probed.audioDecodable }),
				...(probed.audioCodec === undefined ? {} : { audioCodec: probed.audioCodec }),
				...(probed.videoDecodable === undefined ? {} : { videoDecodable: probed.videoDecodable }),
				...(probed.videoCodec === undefined ? {} : { videoCodec: probed.videoCodec }),
				...(probed.bitDepth !== undefined ? { bitDepth: probed.bitDepth } : {}),
				...(probed.colorSpace !== undefined ? { colorSpace: probed.colorSpace } : {}),
				...(probed.isHdr !== undefined ? { isHdr: probed.isHdr } : {}),
				...(probed.isInterlaced !== undefined ? { isInterlaced: probed.isInterlaced } : {}),
				...(probed.isVfr !== undefined ? { isVfr: probed.isVfr } : {}),
				...(probed.transfer !== undefined ? { transfer: probed.transfer } : {}),
				...(probed.video !== undefined ? { video: probed.video } : {}),
				...(probed.audio !== undefined ? { audio: probed.audio } : {}),
				opfsPath,
				offline: false
			};
			options.mutateProject(`Import ${asset.name}`, (project) => addAsset(project, { asset }));
			imported.push(asset);
			options.onProgress?.({
				index,
				name: file.name,
				phase: 'done',
				loaded: file.size,
				total: file.size
			});
			if (options.scheduleDerived) options.scheduleDerived(asset);
			else {
				void generateDerived(options.projectId, asset, {
					signal,
					onStatus: (status) => options.onDerivedStatus?.(asset.id, status)
				}).catch((error: unknown) => {
					if (!(error instanceof DOMException && error.name === 'AbortError')) {
						console.error(`Could not generate previews for ${asset.name}.`, error);
					}
				});
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				if (fileStored) {
					try {
						await deleteMedia(options.projectId, assetId);
					} catch (cleanupError) {
						const reason = `Import was cancelled, but its partial media file could not be removed: ${errorMessage(cleanupError)}`;
						failed.push({ name: file.name, reason });
						options.onProgress?.({
							index,
							name: file.name,
							phase: 'failed',
							loaded: 0,
							total: file.size,
							reason
						});
						return;
					}
				}
				options.onProgress?.({
					index,
					name: file.name,
					phase: 'cancelled',
					loaded: 0,
					total: file.size
				});
				return;
			}
			if (fileStored) {
				try {
					await deleteMedia(options.projectId, assetId);
				} catch (cleanupError) {
					console.error(`Could not remove failed import ${file.name}.`, cleanupError);
				}
			}
			const reason = errorMessage(error);
			failed.push({ name: file.name, reason });
			options.onProgress?.({
				index,
				name: file.name,
				phase: 'failed',
				loaded: 0,
				total: file.size,
				reason
			});
		}
	}

	async function worker(): Promise<void> {
		while (nextFile < files.length && !options.signal?.aborted) {
			const current = nextFile;
			nextFile += 1;
			const file = files[current];
			if (file) await processFile(file, current);
		}
	}

	await Promise.all([worker(), worker()]);
	return { imported, failed };
}
