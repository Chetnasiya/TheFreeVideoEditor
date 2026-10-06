import { z } from 'zod';
import type { AssetId, ClipId, MarkerId, Project, ProjectId, TrackId } from './types';

export const CURRENT_SCHEMA_VERSION = 1;

export const projectIdSchema = z.custom<ProjectId>(
	(value) => typeof value === 'string' && value.length > 0
);
export const assetIdSchema = z.custom<AssetId>(
	(value) => typeof value === 'string' && value.length > 0
);
export const trackIdSchema = z.custom<TrackId>(
	(value) => typeof value === 'string' && value.length > 0
);
export const clipIdSchema = z.custom<ClipId>(
	(value) => typeof value === 'string' && value.length > 0
);
export const markerIdSchema = z.custom<MarkerId>(
	(value) => typeof value === 'string' && value.length > 0
);
const timeSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const projectSettingsSchema = z.object({
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	fps: z.number().positive(),
	sampleRate: z.number().int().positive()
});

export const effectSchema = z.object({
	id: z.string().min(1),
	type: z.string().min(1),
	params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
});

export const clipTransformSchema = z.object({
	x: z.number(),
	y: z.number(),
	scaleX: z.number(),
	scaleY: z.number(),
	rotation: z.number(),
	opacity: z.number().min(0).max(1)
});

export const clipSchema = z.object({
	id: clipIdSchema,
	assetId: assetIdSchema,
	start: timeSchema,
	duration: timeSchema.positive(),
	sourceIn: timeSchema,
	sourceOut: timeSchema.positive(),
	speed: z.number().positive(),
	volume: z.number().nonnegative(),
	linkId: z.string().min(1).optional(),
	effects: z.array(effectSchema).optional(),
	transform: clipTransformSchema.optional(),
	text: z.string().optional()
});

export const assetSchema = z.object({
	id: assetIdSchema,
	kind: z.enum(['video', 'audio', 'image']),
	name: z.string().min(1),
	mimeType: z.string().min(1),
	size: z.number().int().nonnegative(),
	duration: timeSchema,
	width: z.number().int().positive().optional(),
	height: z.number().int().positive().optional(),
	fps: z.number().positive().optional(),
	fpsEstimated: z.boolean().optional(),
	hasAudio: z.boolean(),
	audioChecked: z.boolean().optional(),
	audioDecodable: z.boolean().optional(),
	audioCodec: z.string().min(1).optional(),
	videoDecodable: z.boolean().optional(),
	videoCodec: z.string().min(1).optional(),
	opfsPath: z.string(),
	offline: z.boolean().optional()
});

export const trackSchema = z.object({
	id: trackIdSchema,
	kind: z.enum(['video', 'audio']),
	name: z.string().min(1),
	muted: z.boolean(),
	locked: z.boolean(),
	hidden: z.boolean(),
	clips: z.array(clipSchema)
});

export const markerSchema = z.object({
	id: markerIdSchema,
	time: timeSchema,
	label: z.string(),
	color: z.string().optional()
});

export const projectSchema = z
	.object({
		id: projectIdSchema,
		schemaVersion: z.number().int().positive(),
		name: z.string().trim().min(1).max(80),
		createdAt: z.iso.datetime(),
		updatedAt: z.iso.datetime(),
		settings: projectSettingsSchema,
		assets: z.record(assetIdSchema, assetSchema),
		tracks: z.array(trackSchema),
		markers: z.array(markerSchema)
	})
	.superRefine((project, context) => {
		const ids = new Set<string>([project.id]);
		for (const [assetKey, asset] of Object.entries(project.assets)) {
			if (assetKey !== asset.id) {
				context.addIssue({
					code: 'custom',
					path: ['assets', assetKey, 'id'],
					message: 'Asset id must match its asset record key.'
				});
			}
			if (ids.has(asset.id)) {
				context.addIssue({
					code: 'custom',
					path: ['assets', assetKey, 'id'],
					message: 'Project entity ids must be unique.'
				});
			}
			ids.add(asset.id);
		}

		for (const [trackIndex, track] of project.tracks.entries()) {
			if (ids.has(track.id)) {
				context.addIssue({
					code: 'custom',
					path: ['tracks', trackIndex, 'id'],
					message: 'Project entity ids must be unique.'
				});
			}
			ids.add(track.id);

			for (const [clipIndex, clip] of track.clips.entries()) {
				if (ids.has(clip.id)) {
					context.addIssue({
						code: 'custom',
						path: ['tracks', trackIndex, 'clips', clipIndex, 'id'],
						message: 'Project entity ids must be unique.'
					});
				}
				ids.add(clip.id);
				if (!project.assets[clip.assetId]) {
					context.addIssue({
						code: 'custom',
						path: ['tracks', trackIndex, 'clips', clipIndex, 'assetId'],
						message: 'Clip must reference an asset in this project.'
					});
				}
				for (const [effectIndex, effect] of (clip.effects ?? []).entries()) {
					if (ids.has(effect.id)) {
						context.addIssue({
							code: 'custom',
							path: ['tracks', trackIndex, 'clips', clipIndex, 'effects', effectIndex, 'id'],
							message: 'Project entity ids must be unique.'
						});
					}
					ids.add(effect.id);
				}
				if (clip.sourceOut <= clip.sourceIn) {
					context.addIssue({
						code: 'custom',
						path: ['tracks', trackIndex, 'clips', clipIndex, 'sourceOut'],
						message: 'Clip sourceOut must be greater than sourceIn.'
					});
				}
			}
		}

		for (const [markerIndex, marker] of project.markers.entries()) {
			if (ids.has(marker.id)) {
				context.addIssue({
					code: 'custom',
					path: ['markers', markerIndex, 'id'],
					message: 'Project entity ids must be unique.'
				});
			}
			ids.add(marker.id);
		}
	});

export type ProjectInput = z.input<typeof projectSchema>;

export class ProjectMigrationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProjectMigrationError';
	}
}

export function migrate(raw: unknown): Project {
	const versionResult = z.object({ schemaVersion: z.number().int() }).safeParse(raw);
	if (!versionResult.success) {
		throw new ProjectMigrationError(
			'Project data is missing a valid schema version and cannot be opened.'
		);
	}

	if (versionResult.data.schemaVersion > CURRENT_SCHEMA_VERSION) {
		throw new ProjectMigrationError(
			`This project uses schema version ${versionResult.data.schemaVersion}, which is newer than this editor supports (version ${CURRENT_SCHEMA_VERSION}). Update the editor to open it.`
		);
	}

	if (versionResult.data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
		throw new ProjectMigrationError(
			`No migration is available for project schema version ${versionResult.data.schemaVersion}.`
		);
	}

	return projectSchema.parse(raw);
}
