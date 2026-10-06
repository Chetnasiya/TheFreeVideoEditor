import { describe, expect, it } from 'vitest';
import { readProjectName, writeProjectName } from './projectName';

function createStorage(initial: Record<string, string> = {}): Storage {
	const values = new Map(Object.entries(initial));

	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, String(value)),
		removeItem: (key) => values.delete(key),
		clear: () => values.clear(),
		key: (index) => [...values.keys()][index] ?? null,
		get length() {
			return values.size;
		}
	};
}

describe('project name persistence', () => {
	it('loads the default name when no name has been saved', () => {
		expect(readProjectName(createStorage())).toEqual({
			name: 'Untitled Project',
			message: null
		});
	});

	it('trims and saves a valid project name', () => {
		const storage = createStorage();
		expect(writeProjectName('  Travel Cut  ', storage)).toEqual({
			ok: true,
			name: 'Travel Cut'
		});
		expect(readProjectName(storage)).toEqual({ name: 'Travel Cut', message: null });
	});

	it('rejects an empty project name without replacing the saved name', () => {
		const storage = createStorage();
		writeProjectName('Travel Cut', storage);

		expect(writeProjectName('   ', storage)).toEqual({
			ok: false,
			message: 'Project name cannot be empty.'
		});
		expect(readProjectName(storage).name).toBe('Travel Cut');
	});

	it('rejects names longer than 80 characters', () => {
		expect(writeProjectName('x'.repeat(81), createStorage())).toEqual({
			ok: false,
			message: 'Project name must be 80 characters or fewer.'
		});
	});

	it('reports storage errors instead of claiming the name was saved', () => {
		const storage = createStorage();
		storage.setItem = () => {
			throw new Error('Storage unavailable');
		};

		expect(writeProjectName('Travel Cut', storage)).toEqual({
			ok: false,
			message:
				'Could not save the project name. Check this browser’s storage settings and try again.'
		});
	});
});
