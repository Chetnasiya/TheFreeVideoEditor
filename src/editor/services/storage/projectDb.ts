import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { migrate, projectIdSchema } from '../../core';
import type { AssetId, Project, ProjectId, ProjectSummary, Time } from '../../core';

interface ProjectRecord {
	id: ProjectId;
	updatedAt: string;
	value: unknown;
}

interface MetaRecord {
	key: string;
	value: unknown;
}

export interface MediaCacheRecord {
	key: string;
	projectId: ProjectId;
	assetId: AssetId;
	value: unknown;
}

export interface ProjectDatabase extends DBSchema {
	projects: {
		key: ProjectId;
		value: ProjectRecord;
		indexes: { updatedAt: string };
	};
	meta: {
		key: string;
		value: MetaRecord;
	};
	mediaCache: {
		key: string;
		value: MediaCacheRecord;
	};
}

const DATABASE_NAME = 'tfve';
const DATABASE_VERSION = 2;
const LAST_OPENED_KEY = 'lastOpenedProjectId';
let databasePromise: Promise<IDBPDatabase<ProjectDatabase>> | undefined;

export function openProjectDatabase(): Promise<IDBPDatabase<ProjectDatabase>> {
	databasePromise ??= openDB<ProjectDatabase>(DATABASE_NAME, DATABASE_VERSION, {
		upgrade(db, oldVersion) {
			if (oldVersion < 1) {
				const projects = db.createObjectStore('projects', { keyPath: 'id' });
				projects.createIndex('updatedAt', 'updatedAt');
				db.createObjectStore('meta', { keyPath: 'key' });
			}
			if (oldVersion < 2) db.createObjectStore('mediaCache', { keyPath: 'key' });
		}
	});
	return databasePromise;
}

export class CorruptProjectError extends Error {
	readonly rawJson: string;
	readonly projectId: ProjectId;

	constructor(projectId: ProjectId, raw: unknown, cause: unknown) {
		const reason = cause instanceof Error ? ` ${cause.message}` : '';
		super(`This saved project is corrupt and could not be opened.${reason}`, { cause });
		this.name = 'CorruptProjectError';
		this.projectId = projectId;
		this.rawJson = serializeRaw(raw);
	}
}

function serializeRaw(raw: unknown): string {
	try {
		return JSON.stringify(raw, null, 2) ?? 'null';
	} catch (error) {
		console.error('Could not serialize corrupt project data for recovery.', error);
		return '"Unable to serialize corrupt project data."';
	}
}

function getProjectId(value: unknown): ProjectId | null {
	const parsed = projectIdSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

function durationOf(project: Project): Time {
	return project.tracks.reduce(
		(projectDuration, track) =>
			track.clips.reduce(
				(trackDuration, clip) => Math.max(trackDuration, clip.start + clip.duration),
				projectDuration
			),
		0
	);
}

export function summarizeProject(project: Project): ProjectSummary {
	return {
		id: project.id,
		name: project.name,
		updatedAt: project.updatedAt,
		duration: durationOf(project),
		assetCount: Object.keys(project.assets).length
	};
}

function parseRecord(record: ProjectRecord): Project {
	try {
		const project = migrate(record.value);
		if (project.id !== record.id) {
			throw new Error('The project id does not match its IndexedDB record key.');
		}
		return project;
	} catch (error) {
		throw new CorruptProjectError(record.id, record.value, error);
	}
}

export async function listProjects(): Promise<ProjectSummary[]> {
	const db = await openProjectDatabase();
	const records = await db.getAllFromIndex('projects', 'updatedAt');
	const projects: ProjectSummary[] = [];

	for (const record of records) {
		try {
			projects.push(summarizeProject(parseRecord(record)));
		} catch (error) {
			console.info(`Skipping corrupt saved project ${record.id}.`, error);
		}
	}

	return projects.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
}

export async function getProject(id: ProjectId): Promise<Project | null> {
	const db = await openProjectDatabase();
	const record = await db.get('projects', id);
	if (!record) return null;
	return parseRecord(record);
}

export async function saveProject(project: Project): Promise<void> {
	const validated = migrate(project);
	const db = await openProjectDatabase();
	await db.put('projects', {
		id: validated.id,
		updatedAt: validated.updatedAt,
		value: validated
	});
}

export async function deleteProject(id: ProjectId): Promise<void> {
	const db = await openProjectDatabase();
	await db.delete('projects', id);
	const lastOpenedId = await getLastOpenedId();
	if (lastOpenedId === id) await db.delete('meta', LAST_OPENED_KEY);
}

export async function getLastOpenedId(): Promise<ProjectId | null> {
	const db = await openProjectDatabase();
	const record = await db.get('meta', LAST_OPENED_KEY);
	if (!record) return null;

	const id = getProjectId(record.value);
	if (!id) {
		console.error('Ignoring an invalid last-opened project id in IndexedDB.');
		return null;
	}
	return id;
}

export async function setLastOpenedId(id: ProjectId | null): Promise<void> {
	const db = await openProjectDatabase();
	if (id === null) {
		await db.delete('meta', LAST_OPENED_KEY);
		return;
	}
	await db.put('meta', { key: LAST_OPENED_KEY, value: id });
}

export async function exportRawProjectJson(id: ProjectId): Promise<string> {
	const db = await openProjectDatabase();
	const record = await db.get('projects', id);
	if (!record) throw new Error('The corrupt project record no longer exists.');
	return serializeRaw(record.value);
}
