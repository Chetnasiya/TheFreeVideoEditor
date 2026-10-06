import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../../core';
import type { AssetId, ClipId } from '../../core';
import { getMediaFile } from '../storage/opfs';
import { probeMedia } from './probe';
import { repairProjectAudioMetadata } from './repairAudio';

vi.mock('../storage/opfs', () => ({ getMediaFile: vi.fn() }));
vi.mock('./probe', () => ({ probeMedia: vi.fn() }));

describe('repairProjectAudioMetadata', () => {
	beforeEach(() => {
		vi.mocked(getMediaFile).mockResolvedValue(new File(['video'], 'stock.mp4'));
		vi.mocked(probeMedia).mockResolvedValue({
			kind: 'video',
			duration: 2_000_000,
			fps: 25,
			hasAudio: false,
			audioChecked: true,
			videoDecodable: true
		});
	});

	it('refreshes legacy metadata and names the removed linked audio clip', async () => {
		const project = createEmptyProject({ name: 'Legacy audio' });
		const assetId = 'stock-video' as AssetId;
		project.assets[assetId] = {
			id: assetId,
			kind: 'video',
			name: 'stock.mp4',
			mimeType: 'video/mp4',
			size: 5,
			duration: 2_000_000,
			hasAudio: true,
			audioChecked: false,
			opfsPath: 'stock.mp4'
		};
		const videoTrack = project.tracks.find((track) => track.kind === 'video');
		const audioTrack = project.tracks.find((track) => track.kind === 'audio');
		if (!videoTrack || !audioTrack) throw new Error('Factory did not create default tracks.');
		videoTrack.clips.push({
			id: 'video-clip' as ClipId,
			assetId,
			start: 0,
			duration: 2_000_000,
			sourceIn: 0,
			sourceOut: 2_000_000,
			speed: 1,
			volume: 1,
			linkId: 'clip-link'
		});
		audioTrack.clips.push({
			id: 'audio-clip' as ClipId,
			assetId,
			start: 0,
			duration: 2_000_000,
			sourceIn: 0,
			sourceOut: 2_000_000,
			speed: 1,
			volume: 1,
			linkId: 'clip-link'
		});

		const result = await repairProjectAudioMetadata(project);

		expect(result.project.assets[assetId]?.hasAudio).toBe(false);
		expect(result.project.assets[assetId]?.audioChecked).toBe(true);
		expect(result.project.tracks.find((track) => track.kind === 'audio')?.clips).toHaveLength(0);
		expect(result.warnings).toEqual([
			'Removed 1 empty audio clip from “stock.mp4”: the file has no audio.'
		]);
	});
});
