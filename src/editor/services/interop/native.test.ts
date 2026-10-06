import { strToU8, unzipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../../core';
import type { AssetId } from '../../core';
import { getProject } from '../storage/projectDb';
import { exportTfve, importTfve } from './native';

vi.mock('../storage/projectDb', () => ({
	getProject: vi.fn().mockResolvedValue(null)
}));

describe('native TFVE projects', () => {
	beforeEach(() => {
		vi.mocked(getProject).mockReset().mockResolvedValue(null);
	});

	it('exports and imports a project without changing its data', async () => {
		const project = createEmptyProject({ name: 'Native test' });
		const blob = await exportTfve(project);
		const imported = await importTfve(blob);
		expect(imported).toEqual(project);

		const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
		expect(files['project.json']).toBeDefined();
		expect(files['manifest.json']).toBeDefined();
		expect(files['assets/']).toBeDefined();
	});

	it('round-trips linked clips and their track references', async () => {
		const project = createEmptyProject({ name: 'Linked sequence' });
		const assetId = 'linked-asset' as AssetId;
		project.assets[assetId] = {
			id: assetId,
			kind: 'video',
			name: 'linked.mp4',
			mimeType: 'video/mp4',
			size: 10,
			duration: 1_000_000,
			hasAudio: true,
			opfsPath: `projects/${project.id}/media/${assetId}.mp4`
		};
		const linkId = 'linked-audio-group';
		const videoClip = {
			id: 'linked-video-clip' as (typeof project.tracks)[number]['clips'][number]['id'],
			assetId,
			start: 0,
			duration: 1_000_000,
			sourceIn: 0,
			sourceOut: 1_000_000,
			speed: 1,
			volume: 1,
			linkId
		};
		project.tracks[0]?.clips.push(videoClip);
		project.tracks[1]?.clips.push({
			...videoClip,
			id: 'linked-audio-clip' as typeof videoClip.id
		});
		const imported = await importTfve(await exportTfve(project));
		expect(imported.tracks).toEqual(project.tracks);
		expect(imported.assets[assetId]?.offline).toBe(true);
	});

	it('rejects a file that is not a ZIP archive', async () => {
		await expect(importTfve(new Blob(['not a zip']))).rejects.toThrow('valid TFVE ZIP project');
	});

	it('rejects a wrong manifest', async () => {
		const archive = {
			'manifest.json': strToU8('{"format":"other","version":1}'),
			'project.json': strToU8(JSON.stringify(createEmptyProject({ name: 'Bad manifest' })))
		};
		const { zipSync } = await import('fflate');
		await expect(importTfve(new Blob([zipSync(archive)]))).rejects.toThrow('invalid manifest');
	});

	it('rejects future project schemas', async () => {
		const project = { ...createEmptyProject({ name: 'Future' }), schemaVersion: 3 };
		const { zipSync } = await import('fflate');
		const archive = {
			'manifest.json': strToU8(
				JSON.stringify({
					format: 'tfve',
					version: 1,
					createdWith: 'thefreevideoeditor.com',
					includesMedia: false
				})
			),
			'project.json': strToU8(JSON.stringify(project))
		};
		await expect(importTfve(new Blob([zipSync(archive)]))).rejects.toThrow(
			/newer than this editor supports/
		);
	});

	it('assigns a fresh project id rather than overwriting an existing project', async () => {
		const project = createEmptyProject({ name: 'Do not overwrite' });
		vi.mocked(getProject).mockResolvedValueOnce(project);

		const imported = await importTfve(await exportTfve(project));

		expect(imported.id).not.toBe(project.id);
		expect(imported.name).toBe(project.name);
		expect(imported.tracks.map((track) => track.id)).not.toEqual(
			project.tracks.map((track) => track.id)
		);
	});

	it('marks assets offline because Gate B project files do not embed media', async () => {
		const project = createEmptyProject({ name: 'Offline assets' });
		const assetId = 'offline-asset' as AssetId;
		project.assets[assetId] = {
			id: assetId,
			kind: 'video',
			name: 'source.mp4',
			mimeType: 'video/mp4',
			size: 100,
			duration: 1_000_000,
			hasAudio: true,
			opfsPath: `${project.id}/source.mp4`
		};

		const imported = await importTfve(await exportTfve(project));

		expect(imported.assets[assetId]?.offline).toBe(true);
	});
});
