import type { Project } from '../types';

export interface OrphanedAudioRepair {
	project: Project;
	removedClipCount: number;
}

export function removeOrphanedLinkedAudioClips(project: Project): OrphanedAudioRepair {
	const noAudioAssetIds = new Set(
		Object.values(project.assets)
			.filter((asset) => asset.kind === 'video' && asset.audioChecked && !asset.hasAudio)
			.map((asset) => asset.id)
	);
	if (noAudioAssetIds.size === 0) return { project, removedClipCount: 0 };

	const orphanedLinkIds = new Set(
		project.tracks
			.filter((track) => track.kind === 'video')
			.flatMap((track) =>
				track.clips.flatMap((clip) =>
					clip.assetId && noAudioAssetIds.has(clip.assetId) && clip.linkId ? [clip.linkId] : []
				)
			)
	);
	if (orphanedLinkIds.size === 0) return { project, removedClipCount: 0 };

	let removedClipCount = 0;
	let changed = false;
	const tracks = project.tracks.map((track) => {
		if (track.kind === 'video') {
			const clips = track.clips.map((clip) => {
				if (!clip.assetId || !noAudioAssetIds.has(clip.assetId) || !clip.linkId) return clip;
				const next = { ...clip };
				delete next.linkId;
				changed = true;
				return next;
			});
			return clips.every((clip, index) => clip === track.clips[index])
				? track
				: { ...track, clips };
		}
		const clips = track.clips.filter((clip) => {
			const remove = Boolean(clip.linkId && orphanedLinkIds.has(clip.linkId));
			if (remove) {
				removedClipCount += 1;
				changed = true;
			}
			return !remove;
		});
		return clips.length === track.clips.length ? track : { ...track, clips };
	});
	return changed
		? { project: { ...project, tracks }, removedClipCount }
		: { project, removedClipCount };
}
