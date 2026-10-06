import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../core';
import { audioSchedulesForChunk } from './audioMix';

describe('export audio mix scheduling', () => {
	it('honors muted tracks, trimmed source time, speed, volume, and chunk boundaries', () => {
		const project = createEmptyProject({ name: 'Audio mix' });
		const track = project.tracks.find((item) => item.kind === 'audio');
		if (!track) throw new Error('Factory did not create an audio track.');
		const assetId = 'tone' as keyof typeof project.assets;
		project.assets[assetId] = {
			id: assetId,
			kind: 'audio',
			name: 'tone.wav',
			mimeType: 'audio/wav',
			size: 5,
			duration: 8_000_000,
			hasAudio: true,
			opfsPath: 'tone.wav'
		};
		track.clips.push({
			id: 'tone-clip' as (typeof track.clips)[number]['id'],
			assetId,
			start: 2_000_000,
			duration: 4_000_000,
			sourceIn: 1_000_000,
			sourceOut: 5_000_000,
			speed: 2,
			volume: 0.5
		});

		expect(audioSchedulesForChunk(project, 0, 3_000_000)).toEqual([
			{
				clipId: 'tone-clip',
				assetId,
				whenSeconds: 2,
				sourceOffsetSeconds: 1,
				sourceDurationSeconds: 2,
				playbackRate: 2,
				volume: 0.5
			}
		]);
		expect(audioSchedulesForChunk(project, 3_000_000, 3_000_000)[0]).toMatchObject({
			whenSeconds: 0,
			sourceOffsetSeconds: 3,
			sourceDurationSeconds: 2
		});
		track.muted = true;
		expect(audioSchedulesForChunk(project, 0, 6_000_000)).toEqual([]);
	});
});
