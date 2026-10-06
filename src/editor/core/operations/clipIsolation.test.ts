import { describe, expect, it } from 'vitest';
import { addAsset, createAssetId, createEmptyProject } from '../index';
import type { Asset, ClipId, Project } from '../types';
import {
	addClipFromAsset,
	deleteClips,
	duplicateClips,
	moveClips,
	splitClipsAt,
	trimClip
} from './clips';

function projectWithVideoClips(): { project: Project; clipIds: ClipId[] } {
	let project = createEmptyProject({ name: 'Clip invariant checks' });
	const assetId = createAssetId();
	const asset: Asset = {
		id: assetId,
		kind: 'video',
		name: 'source.mp4',
		mimeType: 'video/mp4',
		size: 10,
		duration: 2_000_000,
		width: 1920,
		height: 1080,
		fps: 25,
		hasAudio: false,
		opfsPath: `projects/${project.id}/media/${assetId}.mp4`
	};
	project = addAsset(project, { asset });
	const videoTrack = project.tracks.find((track) => track.kind === 'video');
	if (!videoTrack) throw new Error('Factory did not create a video track.');
	project = addClipFromAsset(project, { assetId, trackId: videoTrack.id, start: 0 });
	project = addClipFromAsset(project, { assetId, trackId: videoTrack.id, start: 3_000_000 });
	project = addClipFromAsset(project, { assetId, trackId: videoTrack.id, start: 6_000_000 });
	return {
		project,
		clipIds: project.tracks
			.find((track) => track.id === videoTrack.id)!
			.clips.map((clip) => clip.id)
	};
}

const clipEdits: Array<[string, (project: Project, id: ClipId) => Project]> = [
	['move', (project, id) => moveClips(project, { clipIds: [id], deltaTime: 1_000_000 })],
	['trim', (project, id) => trimClip(project, id, 'end', 1_500_000)],
	['split', (project, id) => splitClipsAt(project, 1_000_000, [id]).project],
	['delete', (project, id) => deleteClips(project, [id])],
	['duplicate', (project, id) => duplicateClips(project, [id])]
];

describe('clip edit isolation', () => {
	it.each(clipEdits)('%s leaves a non-target clip unchanged', (_label, edit) => {
		const { project, clipIds } = projectWithVideoClips();
		const untouched = project.tracks[0]?.clips.find((clip) => clip.id === clipIds[2]);
		if (!untouched || !clipIds[0]) throw new Error('Test project clips were not created.');
		const updated = edit(project, clipIds[0]);
		const stillUntouched = updated.tracks
			.flatMap((track) => track.clips)
			.find((clip) => clip.id === untouched.id);
		expect(stillUntouched).toEqual(untouched);
	});
});
