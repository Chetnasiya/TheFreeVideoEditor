import { describe, expect, it } from 'vitest';
import { createAssetId, mediaFilename, projectMediaPath, rebaseMediaPath } from './ids';
import type { AssetId } from './types';

describe('asset ids and media paths', () => {
	it('generates distinct ids and avoids supplied collisions', () => {
		const existing = createAssetId();
		const next = createAssetId([existing]);
		expect(next).not.toBe(existing);
	});

	it('uses only an asset id and sanitized extension in OPFS filenames', () => {
		const id = 'asset-id' as AssetId;
		expect(mediaFilename(id, '../My private clip.MP4')).toBe('asset-id.mp4');
		expect(projectMediaPath('project-id', id, 'clip.wav')).toBe(
			'projects/project-id/media/asset-id.wav'
		);
		expect(rebaseMediaPath('copy-id', id, 'projects/old-id/media/asset-id.mkv')).toBe(
			'projects/copy-id/media/asset-id.mkv'
		);
	});
});
