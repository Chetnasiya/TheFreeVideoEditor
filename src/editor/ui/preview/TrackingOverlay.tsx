import React, { useRef, useState } from 'react';
import type { Clip, Project } from '../../core/types';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import { evaluateTracker } from '../../core/tracking/evaluateTracker';

interface TrackingOverlayProps {
	project: Project;
	renderedWidth: number;
	renderedHeight: number;
}

export function TrackingOverlay({ project, renderedWidth, renderedHeight }: TrackingOverlayProps) {
	const store = useEditorStoreApi();
	const selectedClipIds = useEditorStore((state) => state.timeline.selection.clipIds);
	const selectedTrackerId = useEditorStore((state) => state.selectedTrackerId);
	const playhead = useEditorStore((state) => state.timeline.playhead);

	const [draggingBox, setDraggingBox] = useState<'feature' | 'search' | null>(null);
	const dragStartPos = useRef<{ x: number; y: number; initX: number; initY: number } | null>(null);

	if (selectedClipIds.length !== 1) return null;
	const selectedClipId = selectedClipIds[0]!;

	let targetClip: Clip | null = null;
	for (const track of project.tracks) {
		const found = track.clips.find((c) => c.id === selectedClipId);
		if (found) {
			targetClip = found;
			break;
		}
	}
	if (!targetClip && project.sequences) {
		for (const seq of Object.values(project.sequences)) {
			for (const track of seq.tracks) {
				const found = track.clips.find((c) => c.id === selectedClipId);
				if (found) {
					targetClip = found;
					break;
				}
			}
			if (targetClip) break;
		}
	}

	if (!targetClip || !targetClip.trackers || targetClip.trackers.length === 0) return null;

	const tracker =
		targetClip.trackers.find((t) => t.id === selectedTrackerId) ?? targetClip.trackers[0]!;

	const localTime = playhead - targetClip.start;
	const sourceTime = targetClip.sourceIn + Math.round(localTime * targetClip.speed);

	// Evaluate tracker state at current frame
	const state = evaluateTracker(tracker, sourceTime);

	// Screen coordinates [0, renderedWidth] x [0, renderedHeight]
	const screenCenterX = state.x * renderedWidth;
	const screenCenterY = state.y * renderedHeight;

	const currentScale = Math.max(0.05, state.scale ?? 1.0);
	const templateW = tracker.initialRegion.width * renderedWidth * currentScale;
	const templateH = tracker.initialRegion.height * renderedHeight * currentScale;
	const searchMultiplier = tracker.initialRegion.searchMultiplier ?? 2.5;
	const searchW = templateW * searchMultiplier;
	const searchH = templateH * searchMultiplier;
	const rotDeg = ((state.rotation ?? 0) * 180) / Math.PI;

	// Mouse drag handlers to place/reposition tracker box with mouse
	const handlePointerDown = (e: React.PointerEvent, kind: 'feature' | 'search') => {
		e.stopPropagation();
		e.preventDefault();
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		setDraggingBox(kind);
		dragStartPos.current = {
			x: e.clientX,
			y: e.clientY,
			initX: tracker.initialRegion.x,
			initY: tracker.initialRegion.y
		};
	};

	const handlePointerMove = (e: React.PointerEvent) => {
		if (!draggingBox || !dragStartPos.current) return;
		const dx = (e.clientX - dragStartPos.current.x) / renderedWidth;
		const dy = (e.clientY - dragStartPos.current.y) / renderedHeight;

		const nextX = Math.max(0, Math.min(1, dragStartPos.current.initX + dx));
		const nextY = Math.max(0, Math.min(1, dragStartPos.current.initY + dy));

		store.getState().updateTracker(targetClip!.id, tracker.id, {
			initialRegion: {
				...tracker.initialRegion,
				x: nextX,
				y: nextY
			}
		});
	};

	const handlePointerUp = (e: React.PointerEvent) => {
		if (draggingBox) {
			(e.target as HTMLElement).releasePointerCapture(e.pointerId);
			setDraggingBox(null);
			dragStartPos.current = null;
		}
	};

	return (
		<div
			className="pointer-events-none absolute inset-0 overflow-hidden"
			style={{ width: renderedWidth, height: renderedHeight }}
			data-testid="tracking-overlay"
		>
			<svg className="pointer-events-none h-full w-full">
				{/* Trail overlay of all tracked samples */}
				{tracker.samples.length > 1 && (
					<polyline
						points={tracker.samples
							.map(
								(s) => `${(s.x * renderedWidth).toFixed(1)},${(s.y * renderedHeight).toFixed(1)}`
							)
							.join(' ')}
						fill="none"
						stroke="rgba(59, 130, 246, 0.75)"
						strokeWidth="2"
						strokeDasharray="4 2"
					/>
				)}

				{/* Sample point dots */}
				{tracker.samples.map((s, idx) => (
					<circle
						key={idx}
						cx={s.x * renderedWidth}
						cy={s.y * renderedHeight}
						r={s.lost ? 2 : 2.5}
						fill={s.lost ? 'rgba(239, 68, 68, 0.9)' : 'rgba(59, 130, 246, 0.9)'}
					/>
				))}
			</svg>

			{/* Outer Search Box (Dashed red/amber) */}
			<div
				className="pointer-events-auto absolute cursor-move border border-dashed border-amber-400/80"
				style={{
					left: screenCenterX - searchW / 2,
					top: screenCenterY - searchH / 2,
					width: searchW,
					height: searchH,
					transform: `rotate(${rotDeg.toFixed(2)}deg)`
				}}
				onPointerDown={(e) => handlePointerDown(e, 'search')}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				data-testid="tracker-search-box"
			/>

			{/* Inner Feature Box (Solid cyan/blue) */}
			<div
				className="pointer-events-auto absolute cursor-move border-2 border-cyan-400 bg-cyan-500/10"
				style={{
					left: screenCenterX - templateW / 2,
					top: screenCenterY - templateH / 2,
					width: templateW,
					height: templateH,
					transform: `rotate(${rotDeg.toFixed(2)}deg)`
				}}
				onPointerDown={(e) => handlePointerDown(e, 'feature')}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				data-testid="tracker-feature-box"
			>
				{/* Center Crosshair */}
				<div className="pointer-events-none absolute top-0 left-1/2 h-full w-[1px] -translate-x-1/2 bg-cyan-400/80" />
				<div className="pointer-events-none absolute top-1/2 left-0 h-[1px] w-full -translate-y-1/2 bg-cyan-400/80" />
			</div>
		</div>
	);
}
