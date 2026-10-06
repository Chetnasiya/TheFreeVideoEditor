import type { Project } from '../../core';
import { saveProject } from './projectDb';
import type { SaveStatus } from '../../state/store';

interface AutosaveSnapshot {
	project: Project | null;
	revision: number;
	setSaveStatus: (status: SaveStatus) => void;
	refreshProjects: () => Promise<void>;
}

interface AutosaveStore {
	getState: () => AutosaveSnapshot;
	subscribe: (
		listener: (state: AutosaveSnapshot, previous: AutosaveSnapshot) => void
	) => () => void;
}

export interface AutosaveController {
	flush: () => Promise<void>;
	dispose: () => void;
}

export function attachAutosave(store: AutosaveStore, delay = 800): AutosaveController {
	let timer: number | undefined;
	let saving: Promise<void> | null = null;
	let savedRevision = store.getState().revision;

	function schedule(): void {
		if (timer !== undefined) window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			timer = undefined;
			void flush().catch((error: unknown) => {
				console.error('Autosave failed; the project remains available for retry.', error);
			});
		}, delay);
	}

	async function flush(): Promise<void> {
		if (timer !== undefined) {
			window.clearTimeout(timer);
			timer = undefined;
		}
		if (saving) {
			await saving;
			if (store.getState().revision > savedRevision) await flush();
			return;
		}

		const snapshot = store.getState();
		if (!snapshot.project || snapshot.revision <= savedRevision) {
			if (snapshot.project && snapshot.revision === savedRevision) snapshot.setSaveStatus('saved');
			return;
		}

		const project = snapshot.project;
		const revision = snapshot.revision;
		const saveStartedAt = Date.now();
		snapshot.setSaveStatus('saving');
		saving = (async () => {
			try {
				await saveProject(project);
				const remainingVisibleTime = 250 - (Date.now() - saveStartedAt);
				if (document.visibilityState === 'visible' && remainingVisibleTime > 0) {
					await new Promise<void>((resolve) => {
						window.setTimeout(resolve, remainingVisibleTime);
					});
				}
				savedRevision = revision;
				await store.getState().refreshProjects();
				if (store.getState().revision === revision) {
					store.getState().setSaveStatus('saved');
				} else {
					store.getState().setSaveStatus('unsaved');
					schedule();
				}
			} catch (error) {
				store.getState().setSaveStatus('error');
				throw error;
			} finally {
				saving = null;
			}
		})();

		await saving;
		if (store.getState().revision > savedRevision) await flush();
	}

	function onVisibilityChange(): void {
		if (document.visibilityState === 'hidden') {
			void flush().catch((error: unknown) => {
				console.error('Autosave failed while the document was hidden.', error);
			});
		}
	}

	function onPageHide(): void {
		void flush().catch((error: unknown) => {
			console.error('Autosave failed while the page was closing.', error);
		});
	}

	const unsubscribe = store.subscribe((state, previous) => {
		if (state.revision === previous.revision) return;
		if (!state.project) return;
		state.setSaveStatus('unsaved');
		schedule();
	});

	document.addEventListener('visibilitychange', onVisibilityChange);
	window.addEventListener('pagehide', onPageHide);

	return {
		flush,
		dispose() {
			if (timer !== undefined) window.clearTimeout(timer);
			unsubscribe();
			document.removeEventListener('visibilitychange', onVisibilityChange);
			window.removeEventListener('pagehide', onPageHide);
		}
	};
}
