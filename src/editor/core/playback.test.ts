import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './factory';
import { fitRect, previewScale } from './composition';
import { nextBoundary, resolveFrame } from './playback';
import type { Asset, AssetId, Clip, Project, Track } from './types';

function makeAsset(id: string, kind: Asset['kind'], overrides: Partial<Asset> = {}): Asset {
	return {
		id: id as AssetId,
		kind,
		name: `${id}.${kind === 'image' ? 'png' : kind === 'audio' ? 'wav' : 'mp4'}`,
		mimeType: kind === 'image' ? 'image/png' : kind === 'audio' ? 'audio/wav' : 'video/mp4',
		size: 100,
		duration: 2_000_000,
		hasAudio: kind !== 'image',
		opfsPath: `projects/project/media/${id}`,
		...overrides
	};
}

function makeClip(id: string, assetId: string, start: number, overrides: Partial<Clip> = {}): Clip {
	return {
		id: id as Clip['id'],
		assetId: assetId as AssetId,
		start,
		duration: 1_000_000,
		sourceIn: 0,
		sourceOut: 1_000_000,
		speed: 1,
		volume: 1,
		...overrides
	};
}

function makeTrack(
	id: string,
	kind: Track['kind'],
	clips: Clip[],
	overrides: Partial<Track> = {}
): Track {
	return {
		id: id as Track['id'],
		kind,
		name: id,
		muted: false,
		locked: false,
		hidden: false,
		clips,
		...overrides
	};
}

function projectWith(tracks: Track[], assets: Asset[]): Project {
	const project = createEmptyProject({ name: 'Playback test' });
	return {
		...project,
		assets: Object.fromEntries(assets.map((asset) => [asset.id, asset])),
		tracks
	};
}

describe('resolveFrame', () => {
	it('uses start-inclusive, end-exclusive clip bounds and speed-aware source time', () => {
		const asset = makeAsset('video-a', 'video');
		const clip = makeClip('clip-a', asset.id, 1_000_000, {
			duration: 500_000,
			sourceIn: 250_000,
			sourceOut: 750_000,
			speed: 2
		});
		const project = projectWith(
			[makeTrack('video', 'video', [clip]), makeTrack('audio', 'audio', [])],
			[asset]
		);

		expect(resolveFrame(project, 1_000_000).videoLayers[0]?.sourceTime).toBe(250_000);
		expect(resolveFrame(project, 1_250_000).videoLayers[0]?.sourceTime).toBe(750_000);
		expect(resolveFrame(project, 1_500_000).videoLayers).toEqual([]);
	});

	it('draws the first video track on top and excludes hidden and offline media', () => {
		const top = makeAsset('top', 'video');
		const lower = makeAsset('lower', 'image');
		const hidden = makeAsset('hidden', 'video');
		const offline = makeAsset('offline', 'video', { offline: true });
		const project = projectWith(
			[
				makeTrack('top-track', 'video', [makeClip('top-clip', top.id, 0)]),
				makeTrack('hidden-track', 'video', [makeClip('hidden-clip', hidden.id, 0)], {
					hidden: true
				}),
				makeTrack('lower-track', 'video', [
					makeClip('lower-clip', lower.id, 0),
					makeClip('offline-clip', offline.id, 0)
				]),
				makeTrack('audio-track', 'audio', [])
			],
			[top, lower, hidden, offline]
		);

		const resolved = resolveFrame(project, 500_000);
		expect(resolved.videoLayers.map((layer) => layer.clipId)).toEqual(['lower-clip', 'top-clip']);
		expect(resolved.missing).toEqual([offline.id]);
		expect(resolveFrame(project, 1_000_000).videoLayers).toEqual([]);
	});

	it('resolves audio clips, volume and mute state without filling timeline gaps', () => {
		const audio = makeAsset('audio-a', 'audio');
		const linkedVideo = makeAsset('linked-video', 'video');
		const project = projectWith(
			[
				makeTrack('video', 'video', []),
				makeTrack(
					'audio',
					'audio',
					[
						makeClip('audio-clip', audio.id, 0, { volume: 0.4 }),
						makeClip('linked-clip', linkedVideo.id, 0, { linkId: 'pair' })
					],
					{ muted: true }
				)
			],
			[audio, linkedVideo]
		);

		expect(resolveFrame(project, 500_000).audioSources).toEqual([]);
		const audible = {
			...project,
			tracks: project.tracks.map((track) =>
				track.kind === 'audio' ? { ...track, muted: false } : track
			)
		};
		expect(resolveFrame(audible, 500_000).audioSources).toMatchObject([
			{ clipId: 'audio-clip', sourceTime: 500_000, volume: 0.4 },
			{ clipId: 'linked-clip', sourceTime: 500_000, volume: 1 }
		]);
		expect(resolveFrame(audible, 1_000_000).audioSources).toEqual([]);
	});

	it('reports boundaries in the requested direction', () => {
		const asset = makeAsset('video-a', 'video');
		const project = projectWith(
			[
				makeTrack('video', 'video', [
					makeClip('first', asset.id, 1_000_000),
					makeClip('second', asset.id, 3_000_000)
				]),
				makeTrack('audio', 'audio', [])
			],
			[asset]
		);

		expect(nextBoundary(project, 1_000_000, 1)).toBe(2_000_000);
		expect(nextBoundary(project, 2_000_000, 1)).toBe(3_000_000);
		expect(nextBoundary(project, 3_000_000, -1)).toBe(2_000_000);
		expect(nextBoundary(project, 0, -1)).toBeNull();
	});
});

describe('composition geometry', () => {
	it('fits the full source in the project output and computes preview scale', () => {
		expect(fitRect(1920, 1080, 1080, 1080)).toEqual({
			x: 0,
			y: 236.25,
			width: 1080,
			height: 607.5
		});
		expect(fitRect(1920, 1080, 1080, 1080, 'cover')).toEqual({
			x: -420,
			y: 0,
			width: 1920,
			height: 1080
		});
		expect(previewScale(1920, 1080, 960, 540)).toBe(0.5);
	});
});
