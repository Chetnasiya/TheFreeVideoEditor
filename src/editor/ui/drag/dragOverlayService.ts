export interface DragGhostInfo {
	title: string;
	kind: 'graphic' | 'shape' | 'media' | 'effect' | 'transition';
	badge?: string;
}

type DragGhostListener = (info: DragGhostInfo | null) => void;

const listeners = new Set<DragGhostListener>();
let currentGhost: DragGhostInfo | null = null;
let transparentImage: HTMLImageElement | null = null;

/**
 * Suppresses the browser's default native drag ghost by providing a 1x1 transparent image.
 */
export function setTransparentDragImage(dataTransfer: DataTransfer): void {
	try {
		if (!transparentImage && typeof document !== 'undefined') {
			transparentImage = new Image();
			transparentImage.src =
				'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
		}
		if (transparentImage) {
			dataTransfer.setDragImage(transparentImage, 0, 0);
		}
	} catch {
		try {
			const canvas = document.createElement('canvas');
			canvas.width = 1;
			canvas.height = 1;
			dataTransfer.setDragImage(canvas, 0, 0);
		} catch {}
	}
}

/**
 * Initiates the in-app custom drag ghost.
 */
export function startDragGhost(info: DragGhostInfo): void {
	currentGhost = info;
	listeners.forEach((listener) => listener(currentGhost));
}

/**
 * Clears the active drag ghost.
 */
export function stopDragGhost(): void {
	if (currentGhost !== null) {
		currentGhost = null;
		listeners.forEach((listener) => listener(null));
	}
}

/**
 * Subscribes to drag ghost updates.
 */
export function subscribeDragGhost(listener: DragGhostListener): () => void {
	listeners.add(listener);
	listener(currentGhost);
	return () => {
		listeners.delete(listener);
	};
}

