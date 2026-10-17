import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	startDragGhost,
	stopDragGhost,
	subscribeDragGhost,
	type DragGhostInfo
} from '../dragOverlayService';

describe('DragGhostOverlay behavior', () => {
	beforeEach(() => {
		stopDragGhost();
	});

	afterEach(() => {
		stopDragGhost();
	});

	it('manages lifecycle correctly', () => {
		let activeGhost: DragGhostInfo | null = null;
		const unsub = subscribeDragGhost((g) => {
			activeGhost = g;
		});

		expect(activeGhost).toBeNull();

		startDragGhost({
			title: 'Tutorial Video Badge',
			kind: 'graphic',
			badge: 'Badge'
		});
		expect((activeGhost as DragGhostInfo | null)?.title).toBe('Tutorial Video Badge');

		stopDragGhost();
		expect(activeGhost).toBeNull();
		unsub();
	});
});
