import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../core';
import { createEmptyProject } from '../../core';
import { attachAutosave } from './autosave';

const service = vi.hoisted(() => ({ saveProject: vi.fn() }));

vi.mock('./projectDb', () => ({ saveProject: service.saveProject }));

interface Snapshot {
	project: Project | null;
	revision: number;
	saveStatus: 'saved' | 'saving' | 'error' | 'unsaved';
	setSaveStatus: (status: Snapshot['saveStatus']) => void;
	refreshProjects: () => Promise<void>;
}

function createTestStore() {
	let state: Snapshot = {
		project: null,
		revision: 0,
		saveStatus: 'saved',
		setSaveStatus(status) {
			state = { ...state, saveStatus: status };
		},
		refreshProjects: vi.fn().mockResolvedValue(undefined)
	};
	let listener: ((next: Snapshot, previous: Snapshot) => void) | undefined;

	return {
		getState: () => state,
		subscribe(nextListener: (next: Snapshot, previous: Snapshot) => void) {
			listener = nextListener;
			return () => {
				listener = undefined;
			};
		},
		update(project: Project, revision: number) {
			const previous = state;
			state = { ...state, project, revision };
			listener?.(state, previous);
		}
	};
}

describe('project autosave', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('transitions through saving and saved for a changed revision', async () => {
		const browserWindow = {
			setTimeout: (callback: TimerHandler, delay?: number) =>
				globalThis.setTimeout(callback, delay) as unknown as number,
			clearTimeout: (timer: number) => globalThis.clearTimeout(timer),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		};
		const browserDocument = {
			visibilityState: 'visible',
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		};
		vi.stubGlobal('window', browserWindow);
		vi.stubGlobal('document', browserDocument);

		let finishSave: (() => void) | undefined;
		service.saveProject.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					finishSave = resolve;
				})
		);

		const store = createTestStore();
		const autosave = attachAutosave(store, 60_000);
		store.update(createEmptyProject({ name: 'Autosave test' }), 1);

		const saving = autosave.flush();
		expect(store.getState().saveStatus).toBe('saving');
		finishSave?.();
		await saving;

		expect(service.saveProject).toHaveBeenCalledTimes(1);
		expect(store.getState().saveStatus).toBe('saved');
		autosave.dispose();
	});

	it('does not write when the project revision has not changed', async () => {
		const browserWindow = {
			setTimeout: (callback: TimerHandler, delay?: number) =>
				globalThis.setTimeout(callback, delay) as unknown as number,
			clearTimeout: (timer: number) => globalThis.clearTimeout(timer),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		};
		const browserDocument = {
			visibilityState: 'visible',
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		};
		vi.stubGlobal('window', browserWindow);
		vi.stubGlobal('document', browserDocument);
		const store = createTestStore();
		const autosave = attachAutosave(store);

		await autosave.flush();

		expect(service.saveProject).not.toHaveBeenCalled();
		autosave.dispose();
	});
});
