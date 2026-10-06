import { z } from 'zod';

export const DEFAULT_PROJECT_NAME = 'Untitled Project';
export const projectNameSchema = z
	.string()
	.trim()
	.min(1, 'Project name cannot be empty.')
	.max(80, 'Project name must be 80 characters or fewer.');

const PROJECT_NAME_KEY = 'tfve:project-name';

export interface ProjectNameLoadResult {
	name: string;
	message: string | null;
}

export type ProjectNameSaveResult = { ok: true; name: string } | { ok: false; message: string };

type ProjectNameStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readProjectName(storage: ProjectNameStorage): ProjectNameLoadResult {
	try {
		const storedName = storage.getItem(PROJECT_NAME_KEY);
		if (storedName === null) return { name: DEFAULT_PROJECT_NAME, message: null };

		const parsedName = projectNameSchema.safeParse(storedName);
		if (!parsedName.success) {
			return {
				name: DEFAULT_PROJECT_NAME,
				message: 'The saved project name is invalid. Rename the project to save a new name.'
			};
		}

		return { name: parsedName.data, message: null };
	} catch {
		return {
			name: DEFAULT_PROJECT_NAME,
			message: 'Could not read the saved project name from this browser.'
		};
	}
}

export function writeProjectName(name: string, storage: ProjectNameStorage): ProjectNameSaveResult {
	const parsedName = projectNameSchema.safeParse(name);
	if (!parsedName.success) {
		return {
			ok: false,
			message: parsedName.error.issues[0]?.message ?? 'Enter a valid project name.'
		};
	}

	try {
		storage.setItem(PROJECT_NAME_KEY, parsedName.data);
		return { ok: true, name: parsedName.data };
	} catch {
		return {
			ok: false,
			message:
				'Could not save the project name. Check this browser’s storage settings and try again.'
		};
	}
}

export function loadProjectName(): ProjectNameLoadResult {
	try {
		return readProjectName(window.localStorage);
	} catch {
		return {
			name: DEFAULT_PROJECT_NAME,
			message: 'Could not access this browser’s local storage.'
		};
	}
}

export function saveProjectName(name: string): ProjectNameSaveResult {
	try {
		return writeProjectName(name, window.localStorage);
	} catch {
		return {
			ok: false,
			message: 'Could not access this browser’s local storage. The project name was not saved.'
		};
	}
}
