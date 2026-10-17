import { useEffect, useRef, useState } from 'react';
import { subscribeDragGhost, stopDragGhost, type DragGhostInfo } from './dragOverlayService';
import './drag-ghost.css';

function DragIcon({ kind }: { kind: DragGhostInfo['kind'] }) {
	if (kind === 'graphic') {
		return (
			<svg
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<polyline points="4 7 4 4 20 4 20 7" />
				<line x1="9" x2="15" y1="20" y2="20" />
				<line x1="12" x2="12" y1="4" y2="20" />
			</svg>
		);
	}

	if (kind === 'shape') {
		return (
			<svg
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" />
			</svg>
		);
	}

	if (kind === 'media') {
		return (
			<svg
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18" />
				<line x1="7" x2="7" y1="2" y2="22" />
				<line x1="17" x2="17" y1="2" y2="22" />
				<line x1="2" x2="22" y1="12" y2="12" />
				<line x1="2" x2="7" y1="7" y2="7" />
				<line x1="2" x2="7" y1="17" y2="17" />
				<line x1="17" x2="22" y1="7" y2="7" />
				<line x1="17" x2="22" y1="17" y2="17" />
			</svg>
		);
	}

	if (kind === 'transition') {
		return (
			<svg
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M4 12h16" />
				<path d="m14 6 6 6-6 6" />
			</svg>
		);
	}

	// Default effect icon
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
		</svg>
	);
}

function isInsideTimeline(x: number, y: number, target: EventTarget | null): boolean {
	if (target instanceof Element) {
		if (
			target.closest(
				'.timeline-scroll, .timeline-root, .timeline-workspace, .timeline-tracks-container, [data-timeline-area], .timeline-track-lane, .timeline-track-rows'
			)
		) {
			return true;
		}
	}
	const timelineEl = document.querySelector('.timeline-scroll, .timeline-root, [data-timeline-area]');
	if (timelineEl) {
		const rect = timelineEl.getBoundingClientRect();
		if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
			return true;
		}
	}
	return false;
}

export function DragGhostOverlay() {
	const [ghost, setGhost] = useState<DragGhostInfo | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		return subscribeDragGhost((info) => {
			setGhost(info);
		});
	}, []);

	useEffect(() => {
		if (!ghost) return;

		const handleDragOver = (e: DragEvent) => {
			if (!containerRef.current) return;
			const target = e.target as HTMLElement | null;
			const overTimeline = isInsideTimeline(e.clientX, e.clientY, target);

			if (overTimeline) {
				containerRef.current.style.display = 'none';
			} else {
				containerRef.current.style.display = 'flex';
				containerRef.current.style.transform = `translate3d(${e.clientX + 14}px, ${e.clientY + 14}px, 0)`;
			}
		};

		const handleDragEnd = () => {
			stopDragGhost();
		};

		const handleDrop = () => {
			stopDragGhost();
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				stopDragGhost();
			}
		};

		window.addEventListener('dragover', handleDragOver, { passive: true });
		window.addEventListener('dragend', handleDragEnd);
		window.addEventListener('drop', handleDrop);
		window.addEventListener('keydown', handleKeyDown);

		return () => {
			window.removeEventListener('dragover', handleDragOver);
			window.removeEventListener('dragend', handleDragEnd);
			window.removeEventListener('drop', handleDrop);
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [ghost]);

	if (!ghost) return null;

	return (
		<div
			ref={containerRef}
			className="tfve-drag-ghost"
			role="presentation"
			aria-hidden="true"
			data-testid="tfve-drag-ghost"
		>
			<span className="tfve-drag-ghost-icon">
				<DragIcon kind={ghost.kind} />
			</span>
			<span className="tfve-drag-ghost-title">{ghost.title}</span>
			{ghost.badge && <span className="tfve-drag-ghost-badge">{ghost.badge}</span>}
		</div>
	);
}

export default DragGhostOverlay;
