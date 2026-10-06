import { removeOrphanedLinkedAudioClips } from '../../core';
import type { Asset, AssetId, Project } from '../../core';
import { getMediaFile } from '../storage/opfs';
import { probeMedia } from './probe';

export interface ProjectAudioRepairResult {
	project: Project;
	removedAudioClips: number;
	warnings: string[];
}

export async function repairProjectAudioMetadata(
	project: Project
): Promise<ProjectAudioRepairResult> {
	let updated = project;
	const warnings: string[] = [];

	for (const asset of Object.values(project.assets)) {
		if (asset.kind !== 'video' || asset.audioChecked || asset.offline) continue;
		try {
			const file = await getMediaFile(project.id, asset);
			const inspected = await probeMedia(file, { fps: project.settings.fps });
			if (!inspected.audioChecked) continue;
			const repaired: Asset = {
				...asset,
				hasAudio: inspected.hasAudio,
				audioChecked: true,
				...(inspected.audioDecodable === undefined
					? { audioDecodable: undefined }
					: { audioDecodable: inspected.audioDecodable }),
				...(inspected.audioCodec === undefined
					? { audioCodec: undefined }
					: { audioCodec: inspected.audioCodec })
			};
			updated = {
				...updated,
				assets: { ...updated.assets, [asset.id]: repaired }
			};
		} catch (error) {
			const detail = error instanceof Error ? error.message : 'Unknown media metadata error.';
			warnings.push(`Could not inspect audio tracks in “${asset.name}”: ${detail}`);
		}
	}

	const result = removeOrphanedLinkedAudioClips(updated);
	if (result.removedClipCount > 0) {
		const removedByAsset = new Map<AssetId, number>();
		for (const track of project.tracks) {
			if (track.kind !== 'video') continue;
			for (const clip of track.clips) {
				const asset = updated.assets[clip.assetId];
				if (!clip.linkId || !asset?.audioChecked || asset.hasAudio) continue;
				const linkedClipCount = project.tracks
					.filter((audioTrack) => audioTrack.kind === 'audio')
					.flatMap((audioTrack) => audioTrack.clips)
					.filter((audioClip) => audioClip.linkId === clip.linkId).length;
				if (linkedClipCount > 0) {
					removedByAsset.set(asset.id, (removedByAsset.get(asset.id) ?? 0) + linkedClipCount);
				}
			}
		}
		for (const [assetId, count] of removedByAsset) {
			const asset = updated.assets[assetId];
			if (!asset) continue;
			const clipLabel = count === 1 ? 'audio clip' : 'audio clips';
			warnings.push(
				`Removed ${count} empty ${clipLabel} from “${asset.name}”: the file has no audio.`
			);
		}
		if (removedByAsset.size === 0) {
			warnings.push(
				`Removed ${result.removedClipCount} empty audio clip(s): the source video files have no audio.`
			);
		}
	}
	return {
		project: result.project,
		removedAudioClips: result.removedClipCount,
		warnings
	};
}
