import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Project, Track, CaptionSegment } from '../../core';
import { DEFAULT_CAPTION_STYLE } from '../../core/captions/presets';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';

interface CaptionOverlayProps {
	project: Project;
	renderedWidth: number;
	renderedHeight: number;
}

export default function CaptionOverlay({
	project,
	renderedWidth,
	renderedHeight
}: CaptionOverlayProps) {
	const store = useEditorStoreApi();
	const playhead = useEditorStore((state) => state.timeline.playhead);
	const selectedCaptionId = useEditorStore((state) => state.timeline.selection.captionId);
	const [isDragging, setIsDragging] = useState(false);
	const [isHovered, setIsHovered] = useState(false);

	const dragStart = useRef<{
		clientX: number;
		clientY: number;
		initialX: number;
		initialY: number;
	} | null>(null);

	// Find active caption track
	let activeTrack: Track | undefined;
	let activeCaption: CaptionSegment | undefined;

	for (const track of project.tracks) {
		if (track.kind !== 'caption' || track.hidden) continue;
		const found = (track.captions ?? []).find((c) => c.start <= playhead && playhead < c.end);
		if (found) {
			activeTrack = track;
			activeCaption = found;
			if (selectedCaptionId && found.id === selectedCaptionId) {
				break;
			}
		}
	}

	if (!activeTrack || !activeCaption) {
		return null;
	}

	const track = activeTrack;
	const caption = activeCaption;
	const monitorScale = renderedWidth / Math.max(1, project.settings.width);
	const cStyle = track.captionStyle ?? DEFAULT_CAPTION_STYLE;
	const marginPct = (cStyle.marginPercent ?? 7) / 100;

	const posX = cStyle.customX ?? 0;
	let posY = 0;
	if (cStyle.positionPreset === 'top') {
		posY = -Math.round(project.settings.height * (0.5 - marginPct - 0.05));
	} else if (cStyle.positionPreset === 'bottom') {
		posY = Math.round(project.settings.height * (0.5 - marginPct - 0.05));
	} else if (cStyle.positionPreset === 'custom') {
		posY = cStyle.customY ?? 0;
	}

	const screenX = renderedWidth / 2 + posX * monitorScale;
	const screenY = renderedHeight / 2 + posY * monitorScale;

	const fontSize = Math.max(12, (cStyle.fontSize ?? 42) * monitorScale);
	const lines = caption.text.split('\n');
	const maxLineLen = Math.max(...lines.map((l) => l.length), 1);
	const boxWidth = Math.min(
		renderedWidth * 0.95,
		Math.max(70, maxLineLen * fontSize * 0.58 + 24)
	);
	const boxHeight = Math.max(28, lines.length * fontSize * 1.35 + 16);

	const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		e.stopPropagation();
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);

		dragStart.current = {
			clientX: e.clientX,
			clientY: e.clientY,
			initialX: posX,
			initialY: posY
		};
		setIsDragging(true);
		store.getState().selectCaption(track.id, caption.id);
	};

	const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (!dragStart.current) return;
		e.stopPropagation();
		e.preventDefault();

		const dx = (e.clientX - dragStart.current.clientX) / monitorScale;
		const dy = (e.clientY - dragStart.current.clientY) / monitorScale;
		const nextX = Math.round(dragStart.current.initialX + dx);
		const nextY = Math.round(dragStart.current.initialY + dy);

		store.getState().setCaptionTrackStyle(track.id, {
			positionPreset: 'custom',
			customX: nextX,
			customY: nextY
		});
	};

	const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (dragStart.current) {
			try {
				e.currentTarget.releasePointerCapture(e.pointerId);
			} catch {}
			dragStart.current = null;
			setIsDragging(false);
		}
	};

	const isSelected = selectedCaptionId === caption.id;
	const showBorder = isDragging || isHovered || isSelected;

	return (
		<div
			className={`caption-canvas-overlay ${isDragging ? 'is-dragging' : ''} ${showBorder ? 'is-active' : ''}`}
			style={{
				position: 'absolute',
				left: `${screenX}px`,
				top: `${screenY}px`,
				width: `${boxWidth}px`,
				height: `${boxHeight}px`,
				transform: 'translate(-50%, -50%)',
				pointerEvents: 'auto',
				cursor: isDragging ? 'grabbing' : 'grab',
				zIndex: 40
			}}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			onPointerEnter={() => setIsHovered(true)}
			onPointerLeave={() => setIsHovered(false)}
			title="Click and drag to position caption on video canvas"
			role="button"
			tabIndex={0}
			aria-label="Caption Layer. Drag to position."
		>
			{showBorder && (
				<>
					<div className="caption-canvas-badge">
						<span>Caption: {cStyle.positionPreset === 'custom' ? `${posX}, ${posY}` : cStyle.positionPreset}</span>
					</div>
					<div className="caption-canvas-handle handle-tl" />
					<div className="caption-canvas-handle handle-tr" />
					<div className="caption-canvas-handle handle-bl" />
					<div className="caption-canvas-handle handle-br" />
				</>
			)}
		</div>
	);
}

