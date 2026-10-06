import { describe, expect, it } from 'vitest';
import { addAsset, createAssetId, createEmptyProject } from '../index';
import type { Asset, Project } from '../types';
import { addClipFromAsset } from './clips';
import { removeOrphanedLinkedAudioClips } from './repairAudio';

function addVideo(project: Project, name: string, hasAudio: boolean): Project {
	const id = createAssetId();
	const asset: Asset = {
		id,
		kind: 'video',
		name,
		mimeType: 'video/mp4',
		size: 10,
		duration: 2_000_000,
		width: 1920,
		height: 1080,
		fps: 25,
		hasAudio,
		audioChecked: true,
		opfsPath: `projects/${project.id}/media/${id}.mp4`
	};
	return addAsset(project, { asset });
}

describe('removeOrphanedLinkedAudioClips', () => {
	it('removes only linked audio from a video known to have no audio', () => {
		let project = createEmptyProject({ name: 'Audio metadata repair' });
		project = addVideo(project, 'silent.mp4', true);
		project = addVideo(project, 'with-audio.mp4', true);
		const silentId = Object.values(project.assets).find((asset) => asset.name === 'silent.mp4')!.id;
		const withAudioId = Object.values(project.assets).find(
			(asset) => asset.name === 'with-audio.mp4'
		)!.id;
		const videoTrack = project.tracks.find((track) => track.kind === 'video')!;
		project = addClipFromAsset(project, { assetId: silentId, trackId: videoTrack.id, start: 0 });
		project = addClipFromAsset(project, {
			assetId: withAudioId,
			trackId: videoTrack.id,
			start: 3_000_000
		});

		const silent = project.assets[silentId];
		expect(silent).toBeDefined();
		project = {
			...project,
			assets: {
				...project.assets,
				[silentId]: { ...silent!, hasAudio: false, audioChecked: true }
			}
		};
		const result = removeOrphanedLinkedAudioClips(project);

		expect(result.removedClipCount).toBe(1);
		expect(result.project.tracks.find((track) => track.kind === 'audio')?.clips).toHaveLength(1);
		expect(
			result.project.tracks
				.find((track) => track.kind === 'video')
				?.clips.find((clip) => clip.assetId === silentId)?.linkId
		).toBeUndefined();
		expect(result.project.tracks.find((track) => track.kind === 'audio')?.clips[0]?.assetId).toBe(
			withAudioId
		);
	});

	it('does not remove clips while audio presence is unknown and is idempotent', () => {
		let project = createEmptyProject({ name: 'Unknown audio metadata' });
		project = addVideo(project, 'legacy.mp4', true);
		const asset = Object.values(project.assets)[0]!;
		project = addClipFromAsset(project, {
			assetId: asset.id,
			trackId: project.tracks.find((track) => track.kind === 'video')!.id,
			start: 0
		});
		project = {
			...project,
			assets: { ...project.assets, [asset.id]: { ...asset, audioChecked: false } }
		};
		expect(removeOrphanedLinkedAudioClips(project).removedClipCount).toBe(0);
		const knownSilent = {
			...project,
			assets: { ...project.assets, [asset.id]: { ...asset, hasAudio: false, audioChecked: true } }
		};
		const once = removeOrphanedLinkedAudioClips(knownSilent);
		expect(once.removedClipCount).toBe(1);
		const twice = removeOrphanedLinkedAudioClips(once.project);
		expect(twice.removedClipCount).toBe(0);
		expect(twice.project).toBe(once.project);
	});
});
