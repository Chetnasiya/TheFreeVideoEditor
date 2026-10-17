import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startDragGhost, stopDragGhost, subscribeDragGhost } from '../dragOverlayService';

describe('DragGhostOverlay behavior', () => {
	beforeEach(() => {
		stopDragGhost();
	});

	afterEach(() => {
		stopDragGhost();
	});

	it('manages lifecycle correctly', () => {
		let activeGhost: any = null;
		const unsub = subscribeDragGhost((g) => {
			activeGhost = g;
		});

		expect(activeGhost).toBeNull();

		startDragGhost({
			title: 'Tutorial Video Badge',
			kind: 'graphic',
			badge: 'Badge'
		});
		expect(activeGhost?.title).toBe('Tutorial Video Badge');

		stopDragGhost();
		expect(activeGhost).toBeNull();
		unsub();
	});
});

