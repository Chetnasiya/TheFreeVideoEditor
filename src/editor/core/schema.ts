import { z } from 'zod';
import type {
	AnimatedValue,
	AssetId,
	ClipId,
	ClipSource,
	JsonValue,
	MarkerId,
	Project,
	ProjectId,
	SequenceId,
	TrackId
} from './types';

export const CURRENT_SCHEMA_VERSION = 2;

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

const bezierHandleSchema = z.object({ x: z.number(), y: z.number() });

const keyframeSchema = z.object({
	time: timeSchema,
	value: z.unknown().refine((value) => value !== undefined, 'Keyframe value is required.'),
	interpolation: z.enum(['linear', 'hold', 'bezier']),
	easeOut: bezierHandleSchema.optional(),
	easeIn: bezierHandleSchema.optional()
});

export const animatedValueSchema = z.union([
	z.object({
		keyframes: z
			.array(keyframeSchema)
			.min(1)
			.refine(
				(frames) =>
					frames.every((frame, index) => index === 0 || frame.time > frames[index - 1]!.time),
				'Keyframes must be sorted by strictly increasing time.'
			),
		angleMode: z.enum(['unwrapped', 'shortest']).optional()
	}),
	z.object({ value: z.unknown().refine((value) => value !== undefined, 'Value is required.') })
]) as unknown as z.ZodType<AnimatedValue<unknown>>;

const propertiesSchema = z.record(z.string().min(1), animatedValueSchema);

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(jsonValueSchema),
		z.record(z.string(), jsonValueSchema)
	])
);

export const effectSchema = z.object({
	id: z.string().min(1),
	type: z.string().min(1),
	version: z.number().int().nonnegative().optional(),
	enabled: z.boolean().optional(),
	params: z.record(z.string(), z.union([jsonValueSchema, animatedValueSchema]))
});

const colorSchema = z.object({
	r: z.number(),
	g: z.number(),
	b: z.number(),
	a: z.number()
});

export const clipSourceSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('asset') }),
	z.object({ type: z.literal('text'), text: z.string() }),
	z.object({ type: z.literal('sequence'), sequenceId: z.string().min(1) }),
	z.object({ type: z.literal('solid'), color: colorSchema }),
	z.object({ type: z.literal('adjustment') })
]) as unknown as z.ZodType<ClipSource>;

export const maskPointSchema = z.object({
	x: z.number(),
	y: z.number(),
	inHandle: z.object({ x: z.number(), y: z.number() }).optional(),
	outHandle: z.object({ x: z.number(), y: z.number() }).optional()
});

export const maskSchema = z.object({
	id: z.string().min(1),
	name: z.string().optional(),
	type: z.enum(['rect', 'ellipse', 'path']),
	mode: z.enum(['add', 'subtract', 'intersect']),
	inverted: z.boolean(),
	feather: z.number(),
	expansion: z.number(),
	opacity: z.number().min(0).max(1),
	enabled: z.boolean().optional(),
	closed: z.boolean().optional(),
	shape: z.array(z.number()).optional(),
	points: z.array(maskPointSchema).optional(),
	effectId: z.string().optional(),
	properties: propertiesSchema.optional()
});

export const transitionSchema = z.object({
	id: z.string().min(1),
	type: z.string().min(1),
	duration: timeSchema,
	alignment: z.enum(['center', 'start', 'end']),
	edge: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('cut'), fromClipId: clipIdSchema, toClipId: clipIdSchema }),
		z.object({ kind: z.literal('head'), clipId: clipIdSchema }),
		z.object({ kind: z.literal('tail'), clipId: clipIdSchema })
	]),
	params: z.record(z.string(), jsonValueSchema)
});

export const proxyInfoSchema = z.object({
	opfsPath: z.string(),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	status: z.enum(['pending', 'ready', 'failed'])
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
	assetId: assetIdSchema.optional(),
	start: timeSchema,
	duration: timeSchema.positive(),
	sourceIn: timeSchema,
	sourceOut: timeSchema.positive(),
	speed: z.number().positive(),
	volume: z.number().nonnegative(),
	linkId: z.string().min(1).optional(),
	effects: z.array(effectSchema).optional(),
	transform: clipTransformSchema.optional(),
	text: z.string().optional(),
	source: clipSourceSchema.optional(),
	properties: propertiesSchema.optional(),
	masks: z.array(maskSchema).optional(),
	blendMode: z.enum(['normal', 'add', 'multiply', 'screen']).optional(),
	timeRemap: (animatedValueSchema as unknown as z.ZodType<AnimatedValue<number>>)
		.refine(
			(curve) =>
				'keyframes' in curve
					? curve.keyframes.every((frame) => Number.isFinite(frame.value))
					: Number.isFinite(curve.value),
			'Time remap values must be finite numbers.'
		)
		.optional()
});

export const assetSchema = z.object({
	id: assetIdSchema,
	kind: z.enum(['video', 'audio', 'image', 'lut']),
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
	offline: z.boolean().optional(),
	proxy: proxyInfoSchema.optional()
});

export const trackSchema = z.object({
	id: trackIdSchema,
	kind: z.enum(['video', 'audio']),
	name: z.string().min(1),
	muted: z.boolean(),
	locked: z.boolean(),
	hidden: z.boolean(),
	clips: z.array(clipSchema),
	transitions: z.array(transitionSchema).optional()
});

export const markerSchema = z.object({
	id: markerIdSchema,
	time: timeSchema,
	label: z.string(),
	color: z.string().optional()
});

export const sequenceSchema = z.object({
	id: z.custom<SequenceId>((value) => typeof value === 'string' && value.length > 0),
	name: z.string().min(1),
	settings: projectSettingsSchema.optional(),
	tracks: z.array(trackSchema)
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
		markers: z.array(markerSchema),
		sequences: z
			.record(
				z.custom<SequenceId>((value) => typeof value === 'string' && value.length > 0),
				sequenceSchema
			)
			.optional()
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

		const checkTracks = (tracks: typeof project.tracks, base: Array<string | number>) => {
			const clipIds = new Set<string>();
			for (const [trackIndex, track] of tracks.entries()) {
				const trackPath = [...base, trackIndex];
				if (ids.has(track.id)) {
					context.addIssue({
						code: 'custom',
						path: [...trackPath, 'id'],
						message: 'Project entity ids must be unique.'
					});
				}
				ids.add(track.id);
				for (const [clipIndex, clip] of track.clips.entries()) {
					const clipPath = [...trackPath, 'clips', clipIndex];
					if (ids.has(clip.id)) {
						context.addIssue({
							code: 'custom',
							path: [...clipPath, 'id'],
							message: 'Project entity ids must be unique.'
						});
					}
					ids.add(clip.id);
					clipIds.add(clip.id);
					if (!clip.source || clip.source.type === 'asset') {
						if (!clip.assetId || !project.assets[clip.assetId]) {
							context.addIssue({
								code: 'custom',
								path: [...clipPath, 'assetId'],
								message: 'Clip must reference an asset in this project.'
							});
						}
					}
					const nested = [
						...(clip.effects ?? []).map((effect) => ['effects', effect.id] as const),
						...(clip.masks ?? []).map((mask) => ['masks', mask.id] as const)
					];
					for (const [kind, id] of nested) {
						if (ids.has(id)) {
							context.addIssue({
								code: 'custom',
								path: [...clipPath, kind],
								message: 'Project entity ids must be unique.'
							});
						}
						ids.add(id);
					}
					if (clip.sourceOut <= clip.sourceIn) {
						context.addIssue({
							code: 'custom',
							path: [...clipPath, 'sourceOut'],
							message: 'Clip sourceOut must be greater than sourceIn.'
						});
					}
				}
			}
			for (const [trackIndex, track] of tracks.entries()) {
				for (const [transitionIndex, transition] of (track.transitions ?? []).entries()) {
					const path = [...base, trackIndex, 'transitions', transitionIndex];
					if (ids.has(transition.id)) {
						context.addIssue({
							code: 'custom',
							path: [...path, 'id'],
							message: 'Project entity ids must be unique.'
						});
					}
					ids.add(transition.id);
					const edge = transition.edge;
					const referenced = edge.kind === 'cut' ? [edge.fromClipId, edge.toClipId] : [edge.clipId];
					if (referenced.some((id) => !clipIds.has(id))) {
						context.addIssue({
							code: 'custom',
							path: [...path, 'edge'],
							message: 'Transition must reference clips in this project.'
						});
					}
				}
			}
		};
		checkTracks(project.tracks, ['tracks']);
		for (const [sequenceKey, sequence] of Object.entries(project.sequences ?? {})) {
			if (sequenceKey !== sequence.id) {
				context.addIssue({
					code: 'custom',
					path: ['sequences', sequenceKey, 'id'],
					message: 'Sequence id must match its record key.'
				});
			}
			if (ids.has(sequence.id)) {
				context.addIssue({
					code: 'custom',
					path: ['sequences', sequenceKey, 'id'],
					message: 'Project entity ids must be unique.'
				});
			}
			ids.add(sequence.id);
			checkTracks(sequence.tracks, ['sequences', sequenceKey, 'tracks']);
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

	if (versionResult.data.schemaVersion === 1) {
		// v1 → v2 only adds optional fields, so existing data is valid unchanged.
		return projectSchema.parse({ ...(raw as object), schemaVersion: CURRENT_SCHEMA_VERSION });
	}

	if (versionResult.data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
		throw new ProjectMigrationError(
			`No migration is available for project schema version ${versionResult.data.schemaVersion}.`
		);
	}

	return projectSchema.parse(raw);
}
