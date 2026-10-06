import { applyPatches, type Patch } from 'immer';
import type { ClipId, Project } from '../core';

export const DEFAULT_HISTORY_LIMIT = 200;
export const DEFAULT_COALESCE_WINDOW_MS = 500;

export interface HistoryEntry {
	id: string;
	label: string;
	mergeKey?: string;
	timestamp: number;
	patches: Patch[];
	inversePatches: Patch[];
	selectionBefore: ClipId[];
	selectionAfter: ClipId[];
}

export interface HistorySnapshot {
	canUndo: boolean;
	canRedo: boolean;
	undoLabel: string | null;
	redoLabel: string | null;
	size: number;
}

export interface HistoryOptions {
	limit?: number;
	coalesceWindowMs?: number;
}

export interface ProjectHistory {
	record: (entry: HistoryEntry) => void;
	undo: (project: Project) => { project: Project; entry: HistoryEntry } | null;
	redo: (project: Project) => { project: Project; entry: HistoryEntry } | null;
	canUndo: () => boolean;
	canRedo: () => boolean;
	peekUndoLabel: () => string | null;
	peekRedoLabel: () => string | null;
	clear: () => void;
	barrier: (reason: string) => boolean;
	updateSelectionAfter: (selectionAfter: ClipId[]) => void;
	subscribe: (listener: (snapshot: HistorySnapshot) => void) => () => void;
	snapshot: () => HistorySnapshot;
	readonly lastBarrierReason: string | null;
}

export function createHistory(options: HistoryOptions = {}): ProjectHistory {
	const limit = Math.max(1, Math.floor(options.limit ?? DEFAULT_HISTORY_LIMIT));
	const coalesceWindowMs = Math.max(0, options.coalesceWindowMs ?? DEFAULT_COALESCE_WINDOW_MS);
	const undoStack: HistoryEntry[] = [];
	const redoStack: HistoryEntry[] = [];
	const listeners = new Set<(snapshot: HistorySnapshot) => void>();
	let lastBarrierReason: string | null = null;

	function snapshot(): HistorySnapshot {
		return {
			canUndo: undoStack.length > 0,
			canRedo: redoStack.length > 0,
			undoLabel: undoStack.at(-1)?.label ?? null,
			redoLabel: redoStack.at(-1)?.label ?? null,
			size: undoStack.length
		};
	}

	function publish(): void {
		const current = snapshot();
		for (const listener of listeners) listener(current);
	}

	function clear(): void {
		const changed = undoStack.length > 0 || redoStack.length > 0;
		undoStack.length = 0;
		redoStack.length = 0;
		lastBarrierReason = null;
		if (changed) publish();
	}

	function record(entry: HistoryEntry): void {
		const previous = undoStack.at(-1);
		const coalesces =
			entry.mergeKey !== undefined &&
			previous?.mergeKey === entry.mergeKey &&
			entry.timestamp >= previous.timestamp &&
			entry.timestamp - previous.timestamp <= coalesceWindowMs;
		if (coalesces && previous) {
			undoStack[undoStack.length - 1] = {
				...entry,
				id: previous.id,
				patches: [...previous.patches, ...entry.patches],
				inversePatches: [...entry.inversePatches, ...previous.inversePatches],
				selectionBefore: previous.selectionBefore
			};
		} else {
			undoStack.push(entry);
			if (undoStack.length > limit) undoStack.splice(0, undoStack.length - limit);
		}
		redoStack.length = 0;
		lastBarrierReason = null;
		publish();
	}

	function undo(project: Project): { project: Project; entry: HistoryEntry } | null {
		const entry = undoStack.pop();
		if (!entry) return null;
		const reverted = applyPatches(project, entry.inversePatches);
		redoStack.push(entry);
		publish();
		return { project: reverted, entry };
	}

	function redo(project: Project): { project: Project; entry: HistoryEntry } | null {
		const entry = redoStack.pop();
		if (!entry) return null;
		const restored = applyPatches(project, entry.patches);
		undoStack.push(entry);
		publish();
		return { project: restored, entry };
	}

	function barrier(reason: string): boolean {
		const discarded = undoStack.length > 0 || redoStack.length > 0;
		undoStack.length = 0;
		redoStack.length = 0;
		lastBarrierReason = reason;
		if (discarded) publish();
		return discarded;
	}

	function updateSelectionAfter(selectionAfter: ClipId[]): void {
		const latest = undoStack.at(-1);
		if (!latest) return;
		undoStack[undoStack.length - 1] = { ...latest, selectionAfter: [...selectionAfter] };
		publish();
	}

	return {
		record,
		undo,
		redo,
		canUndo: () => undoStack.length > 0,
		canRedo: () => redoStack.length > 0,
		peekUndoLabel: () => undoStack.at(-1)?.label ?? null,
		peekRedoLabel: () => redoStack.at(-1)?.label ?? null,
		clear,
		barrier,
		updateSelectionAfter,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		snapshot,
		get lastBarrierReason() {
			return lastBarrierReason;
		}
	};
}
