import { describe, expect, it } from 'vitest';
import {
	addAsset,
	AssetInUseError,
	getAssetUsage,
	markAssetOffline,
	relinkAsset,
	removeAsset,
	renameAsset,
	UnknownAssetError
} from './assets';
import { createEmptyProject, secondsToTicks } from './index';
import type { Asset, AssetId, ClipId } from './types';

function asset(id = 'asset-one' as AssetId): Asset {
	return {
		id,
		kind: 'video',
		name: 'clip.mp4',
		mimeType: 'video/mp4',
		size: 10,
		duration: secondsToTicks(10),
		hasAudio: true,
		opfsPath: `projects/project/media/${id}.mp4`
	};
}

describe('project asset operations', () => {
	it('adds and renames assets immutably', () => {
		const project = createEmptyProject({ name: 'Assets' });
		const withAsset = addAsset(project, { asset: asset() });
		expect(project.assets['asset-one' as AssetId]).toBeUndefined();
		expect(
			renameAsset(withAsset, { assetId: 'asset-one' as AssetId, name: '  renamed.mp4 ' }).assets[
				'asset-one' as AssetId
			]?.name
		).toBe('renamed.mp4');
	});

	it('reports clip usage and refuses removal unless forced', () => {
		const base = addAsset(createEmptyProject({ name: 'Assets' }), { asset: asset() });
		const track = base.tracks[0];
		if (!track) throw new Error('Expected a video track.');
		const project = {
			...base,
			tracks: [
				{
					...track,
					clips: [
						{
							id: 'clip-one' as ClipId,
							assetId: 'asset-one' as AssetId,
							start: 0,
							duration: 1_000_000,
							sourceIn: 0,
							sourceOut: 1_000_000,
							speed: 1,
							volume: 1
						}
					]
				},
				...base.tracks.slice(1)
			]
		};
		expect(getAssetUsage(project, 'asset-one' as AssetId)).toHaveLength(1);
		expect(() => removeAsset(project, { assetId: 'asset-one' as AssetId })).toThrow(
			AssetInUseError
		);
		const removed = removeAsset(project, { assetId: 'asset-one' as AssetId, force: true });
		expect(removed.assets['asset-one' as AssetId]).toBeUndefined();
		expect(removed.tracks[0]?.clips).toHaveLength(0);
	});

	it('marks assets offline and relinking clears offline', () => {
		const project = addAsset(createEmptyProject({ name: 'Assets' }), { asset: asset() });
		const offline = markAssetOffline(project, { assetId: 'asset-one' as AssetId });
		expect(offline.assets['asset-one' as AssetId]?.offline).toBe(true);
		const linked = relinkAsset(offline, {
			assetId: 'asset-one' as AssetId,
			opfsPath: 'projects/project/media/asset-one.mp4'
		});
		expect(linked.assets['asset-one' as AssetId]?.offline).toBeUndefined();
	});

	it('throws a typed error when an asset id is unknown', () => {
		expect(() =>
			renameAsset(createEmptyProject({ name: 'Assets' }), {
				assetId: 'missing' as AssetId,
				name: 'renamed'
			})
		).toThrow(UnknownAssetError);
	});
});
