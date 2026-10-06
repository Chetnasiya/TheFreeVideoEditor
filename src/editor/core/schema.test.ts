import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './factory';
import { CURRENT_SCHEMA_VERSION, migrate, projectSchema } from './schema';

describe('project schema and migrations', () => {
	it('round-trips a complete default project through the schema', () => {
		const project = createEmptyProject({ name: 'Schema test' });
		expect(projectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
	});

	it('returns the current version project unchanged', () => {
		const project = createEmptyProject({ name: 'Migration test' });
		expect(migrate(project)).toEqual(project);
		expect(project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
	});

	it('accepts Gate C clip records without an optional link id', () => {
		const project = createEmptyProject({ name: 'Gate C compatibility' });
		const assetId = 'gate-c-asset' as keyof typeof project.assets;
		project.assets[assetId] = {
			id: assetId,
			kind: 'audio',
			name: 'tone.wav',
			mimeType: 'audio/wav',
			size: 1,
			duration: 1_000_000,
			hasAudio: true,
			opfsPath: `projects/${project.id}/media/${assetId}.wav`
		};
		project.tracks[1]?.clips.push({
			id: 'gate-c-clip' as (typeof project.tracks)[number]['clips'][number]['id'],
			assetId,
			start: 0,
			duration: 1_000_000,
			sourceIn: 0,
			sourceOut: 1_000_000,
			speed: 1,
			volume: 1
		});
		expect(projectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
	});

	it('explains when the project was made by a newer editor', () => {
		const project = { ...createEmptyProject({ name: 'Future' }), schemaVersion: 3 };
		expect(() => migrate(project)).toThrow(/newer than this editor supports/);
	});

	it('rejects invalid model data', () => {
		const project = { ...createEmptyProject({ name: 'Invalid' }), settings: { width: 0 } };
		expect(projectSchema.safeParse(project).success).toBe(false);
	});

	it('rejects duplicate entity ids and clips with missing assets', () => {
		const project = createEmptyProject({ name: 'Invalid relationships' });
		project.tracks[1].id = project.tracks[0].id;
		expect(projectSchema.safeParse(project).success).toBe(false);

		const danglingClip = createEmptyProject({ name: 'Dangling asset' });
		danglingClip.tracks[0].clips.push({
			id: 'clip-id' as (typeof danglingClip.tracks)[0]['clips'][number]['id'],
			assetId: 'missing-asset' as keyof typeof danglingClip.assets,
			start: 0,
			duration: 100,
			sourceIn: 0,
			sourceOut: 100,
			speed: 1,
			volume: 1
		});
		expect(projectSchema.safeParse(danglingClip).success).toBe(false);
	});
});
