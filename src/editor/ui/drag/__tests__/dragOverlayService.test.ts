import { describe, it, expect, vi } from 'vitest';
import {
	startDragGhost,
	stopDragGhost,
	subscribeDragGhost,
	setTransparentDragImage,
	type DragGhostInfo
} from '../dragOverlayService';

describe('dragOverlayService', () => {
	it('notifies subscribers when drag ghost starts and stops', () => {
		const received: Array<DragGhostInfo | null> = [];
		const unsubscribe = subscribeDragGhost((info) => {
			received.push(info);
		});

		// Initial subscription callback with null
		expect(received).toEqual([null]);

		startDragGhost({
			title: 'Tutorial Video Badge',
			kind: 'graphic',
			badge: 'Badge'
		});

		expect(received.length).toBe(2);
		expect(received[1]).toEqual({
			title: 'Tutorial Video Badge',
			kind: 'graphic',
			badge: 'Badge'
		});

		stopDragGhost();
		expect(received.length).toBe(3);
		expect(received[2]).toBeNull();

		unsubscribe();
	});

	it('safely handles setTransparentDragImage on dataTransfer with mock DOM', () => {
		const originalDoc = globalThis.document;
		const originalImg = (globalThis as any).Image;
		const setDragImageMock = vi.fn();
		const mockDataTransfer = {
			setDragImage: setDragImageMock
		} as unknown as DataTransfer;

		try {
			class MockImage {
				src = '';
			}
			(globalThis as any).Image = MockImage;
			(globalThis as any).document = {
				createElement: vi.fn().mockReturnValue({ width: 0, height: 0 })
			};

			setTransparentDragImage(mockDataTransfer);
			expect(setDragImageMock).toHaveBeenCalledTimes(1);
			expect(setDragImageMock).toHaveBeenCalledWith(expect.anything(), 0, 0);
		} finally {
			globalThis.document = originalDoc;
			(globalThis as any).Image = originalImg;
		}
	});
});

