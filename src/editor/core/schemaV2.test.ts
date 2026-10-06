import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './factory';
import { CURRENT_SCHEMA_VERSION, migrate, projectSchema } from './schema';
import type { AssetId, ClipId, Project, SequenceId } from './types';

function withClip(): Project {
	const project = createEmptyProject({ name: 'v2' });
	const assetId = 'a1' as AssetId;
	project.assets[assetId] = {
		id: assetId,
		kind: 'video',
		name: 'a.mp4',
		mimeType: 'video/mp4',
		size: 1,
		duration: 5_000_000,
		hasAudio: false,
		opfsPath: 'x'
	};
	project.tracks[0]?.clips.push({
		id: 'c1' as ClipId,
		assetId,
		start: 0,
		duration: 2_000_000,
		sourceIn: 0,
		sourceOut: 2_000_000,
		speed: 1,
		volume: 1
	});
	return project;
}

describe('schema v2', () => {
	it('is version 2', () => expect(CURRENT_SCHEMA_VERSION).toBe(2));

	it('opens a v1 project unchanged apart from the version', () => {
		const project = withClip();
		const v1 = JSON.parse(JSON.stringify({ ...project, schemaVersion: 1 })) as Record<
			string,
			unknown
		>;
		expect(migrate(v1)).toEqual({ ...project, schemaVersion: 2 });
	});

	it('round-trips animated properties, masks, source, blend mode and time remap', () => {
		const project = withClip();
		const clip = project.tracks[0]!.clips[0]!;
		clip.properties = {
			position: {
				keyframes: [
					{ time: 0, value: [0, 0], interpolation: 'bezier', easeOut: { x: 0.3, y: 0 } },
					{ time: 1_000_000, value: [100, 50], interpolation: 'linear' }
				]
			},
			opacity: { value: 0.5 }
		};
		clip.masks = [
			{ id: 'm1', type: 'rect', mode: 'add', inverted: false, feather: 0, expansion: 0, opacity: 1 }
		];
		clip.source = { type: 'solid', color: { r: 1, g: 0, b: 0, a: 1 } };
		clip.blendMode = 'screen';
		clip.timeRemap = { value: 2 };
		clip.effects = [{ id: 'e1', type: 'blur', version: 1, params: { radius: { value: 4 } } }];
		expect(projectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
	});

	it('rejects unsorted keyframes, duplicate nested ids and dangling transitions', () => {
		const project = withClip();
		const clip = project.tracks[0]!.clips[0]!;
		clip.properties = {
			opacity: {
				keyframes: [
					{ time: 5, value: 1, interpolation: 'linear' },
					{ time: 1, value: 0, interpolation: 'linear' }
				]
			}
		};
		expect(projectSchema.safeParse(JSON.parse(JSON.stringify(project))).success).toBe(false);
		delete clip.properties;
		clip.effects = [{ id: 'c1', type: 'blur', params: {} }];
		expect(projectSchema.safeParse(project).success).toBe(false);
		delete clip.effects;
		project.tracks[0]!.transitions = [
			{
				id: 't1',
				type: 'fade',
				duration: 1,
				alignment: 'center',
				edge: { kind: 'head', clipId: 'missing' as ClipId },
				params: {}
			}
		];
		expect(projectSchema.safeParse(project).success).toBe(false);
	});

	it('validates sequences and their record keys', () => {
		const project = withClip();
		const id = 's1' as SequenceId;
		project.sequences = { [id]: { id, name: 'Nested', tracks: [] } };
		expect(projectSchema.safeParse(project).success).toBe(true);
		project.sequences = { [id]: { id: 'other' as SequenceId, name: 'Nested', tracks: [] } };
		expect(projectSchema.safeParse(project).success).toBe(false);
	});
});
