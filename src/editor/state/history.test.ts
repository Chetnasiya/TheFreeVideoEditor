import { describe, expect, it } from 'vitest';
import { enablePatches, produceWithPatches } from 'immer';
import { createEmptyProject } from '../core';
import type { ClipId } from '../core';
import { createHistory, type HistoryEntry } from './history';

enablePatches();

function entryFor(
	label: string,
	before: ReturnType<typeof createEmptyProject>,
	after: ReturnType<typeof createEmptyProject>,
	options: { mergeKey?: string; timestamp?: number; selectionBefore?: ClipId[] } = {}
): HistoryEntry {
	const [, patches, inversePatches] = produceWithPatches(before, () => after);
	return {
		id: `${label}-${options.timestamp ?? 1}`,
		label,
		...(options.mergeKey ? { mergeKey: options.mergeKey } : {}),
		timestamp: options.timestamp ?? 1,
		patches,
		inversePatches,
		selectionBefore: options.selectionBefore ?? [],
		selectionAfter: []
	};
}

describe('project history', () => {
	it('records, undoes, redoes, and publishes human-readable labels', () => {
		const initial = createEmptyProject({ name: 'Initial' });
		const changed = { ...initial, name: 'Changed' };
		const history = createHistory();
		const snapshots: string[] = [];
		history.subscribe((snapshot) => snapshots.push(`${snapshot.undoLabel}/${snapshot.redoLabel}`));
		history.record(entryFor('Rename project', initial, changed));

		expect(history.canUndo()).toBe(true);
		expect(history.peekUndoLabel()).toBe('Rename project');
		expect(history.undo(changed)?.project).toEqual(initial);
		expect(history.peekRedoLabel()).toBe('Rename project');
		expect(history.redo(initial)?.project).toEqual(changed);
		expect(snapshots).toEqual([
			'Rename project/null',
			'null/Rename project',
			'Rename project/null'
		]);
	});

	it('clears redo after a new edit and evicts oldest entries at the limit', () => {
		const initial = createEmptyProject({ name: 'Initial' });
		const first = { ...initial, name: 'First' };
		const second = { ...first, name: 'Second' };
		const history = createHistory({ limit: 2 });
		history.record(entryFor('First edit', initial, first));
		history.record(entryFor('Second edit', first, second, { timestamp: 2 }));
		history.undo(second);
		history.record(entryFor('Replacement edit', first, second, { timestamp: 3 }));
		expect(history.canRedo()).toBe(false);
		history.record(entryFor('Third edit', second, { ...second, name: 'Third' }, { timestamp: 4 }));
		expect(history.snapshot().size).toBe(2);
		expect(history.peekUndoLabel()).toBe('Third edit');
	});

	it('coalesces matching merge keys inside the window and preserves the first inverse', () => {
		const initial = createEmptyProject({ name: 'Initial' });
		const one = { ...initial, name: 'One' };
		const two = { ...one, name: 'Two' };
		const history = createHistory();
		history.record(
			entryFor('Rename project', initial, one, {
				mergeKey: 'project-name',
				timestamp: 10,
				selectionBefore: ['clip-a' as ClipId]
			})
		);
		history.record(
			entryFor('Rename project', one, two, {
				mergeKey: 'project-name',
				timestamp: 500
			})
		);

		expect(history.snapshot().size).toBe(1);
		expect(history.undo(two)?.project).toEqual(initial);
		expect(history.redo(initial)?.project).toEqual(two);
	});

	it('does not coalesce outside the time window or across merge keys', () => {
		const initial = createEmptyProject({ name: 'Initial' });
		const one = { ...initial, name: 'One' };
		const two = { ...one, name: 'Two' };
		const history = createHistory({ coalesceWindowMs: 500 });
		history.record(entryFor('Rename project', initial, one, { mergeKey: 'name', timestamp: 1 }));
		history.record(entryFor('Move clips', one, two, { mergeKey: 'move', timestamp: 2 }));
		history.record(entryFor('Rename project', two, one, { mergeKey: 'name', timestamp: 900 }));
		expect(history.snapshot().size).toBe(3);
	});

	it('clears both stacks at a barrier and reports whether entries were discarded', () => {
		const initial = createEmptyProject({ name: 'Initial' });
		const changed = { ...initial, name: 'Changed' };
		const history = createHistory();
		expect(history.barrier('Relink replaced media')).toBe(false);
		history.record(entryFor('Rename project', initial, changed));
		expect(history.barrier('Relink replaced media')).toBe(true);
		expect(history.lastBarrierReason).toBe('Relink replaced media');
		expect(history.canUndo()).toBe(false);
		expect(history.canRedo()).toBe(false);
	});
});
