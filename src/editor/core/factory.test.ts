import { describe, expect, it } from 'vitest';
import { createEmptyProject, DEFAULT_PROJECT_SETTINGS, duplicateProject } from './factory';
import type { Asset, AssetId, ClipId, MarkerId, TrackId } from './types';
import { secondsToTicks } from './time';

describe('project factory', () => {
	it('creates a default project with one video and one audio track', () => {
		const project = createEmptyProject({ name: '  New project  ' });
		expect(project.name).toBe('New project');
		expect(project.settings).toEqual(DEFAULT_PROJECT_SETTINGS);
		expect(project.tracks.map((track) => track.kind)).toEqual(['video', 'audio']);
		expect(project.assets).toEqual({});
	});

	it('applies setting overrides without replacing defaults', () => {
		const project = createEmptyProject({ name: 'Custom', settings: { width: 1080, height: 1920 } });
		expect(project.settings).toEqual({ ...DEFAULT_PROJECT_SETTINGS, width: 1080, height: 1920 });
	});

	it('duplicates all project and nested entity identifiers', () => {
		const project = createEmptyProject({ name: 'Source' });
		const assetId = 'asset-1' as AssetId;
		const videoTrack = project.tracks[0];
		const clipId = 'clip-1' as ClipId;
		const markerId = 'marker-1' as MarkerId;
		const asset: Asset = {
			id: assetId,
			kind: 'video',
			name: 'footage.mp4',
			mimeType: 'video/mp4',
			size: 100,
			duration: secondsToTicks(10),
			hasAudio: true,
			opfsPath: 'source/footage.mp4'
		};
		project.assets[assetId] = asset;
		videoTrack.clips.push({
			id: clipId,
			assetId,
			start: 0,
			duration: secondsToTicks(3),
			sourceIn: 0,
			sourceOut: secondsToTicks(3),
			speed: 1,
			volume: 1,
			effects: [{ id: 'effect-1', type: 'color', params: { intensity: 0.5 } }]
		});
		project.markers.push({ id: markerId, time: 0, label: 'Start' });

		const duplicate = duplicateProject(project);
		expect(duplicate.id).not.toBe(project.id);
		expect(duplicate.name).toBe('Source copy');
		expect(duplicate.assets[Object.keys(duplicate.assets)[0] as AssetId].id).not.toBe(assetId);
		expect(duplicate.tracks[0].id).not.toBe(videoTrack.id);
		expect(duplicate.tracks[0].clips[0].id).not.toBe(clipId);
		expect(duplicate.tracks[0].clips[0].assetId).not.toBe(assetId);
		expect(duplicate.tracks[0].clips[0].effects?.[0]?.id).not.toBe('effect-1');
		expect(duplicate.markers[0].id).not.toBe(markerId);

		const ids = [
			duplicate.id,
			...Object.values(duplicate.assets).map((item) => item.id),
			...duplicate.tracks.flatMap((track) => [track.id, ...track.clips.map((clip) => clip.id)]),
			...duplicate.markers.map((marker) => marker.id)
		];
		expect(new Set(ids).size).toBe(ids.length);
		expect(duplicate.tracks[0].id).not.toBe('other' as TrackId);
	});
});
