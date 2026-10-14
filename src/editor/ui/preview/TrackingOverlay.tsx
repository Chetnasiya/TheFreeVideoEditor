import React, { useRef, useState } from 'react';
import type { Clip, Project } from '../../core/types';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import { evaluateTracker } from '../../core/tracking/evaluateTracker';

interface TrackingOverlayProps {
	project: Project;
	renderedWidth: number;
	renderedHeight: number;
}

type DragMode =
	| 'feature-move'
	| 'search-move'
	| 'resize-nw'
	| 'resize-ne'
	| 'resize-se'
	| 'resize-sw'
	| 'search-resize';

export function TrackingOverlay({ project, renderedWidth, renderedHeight }: TrackingOverlayProps) {
	const store = useEditorStoreApi();
	const selectedClipIds = useEditorStore((state) => state.timeline.selection.clipIds);
	const selectedTrackerId = useEditorStore((state) => state.selectedTrackerId);
	const playhead = useEditorStore((state) => state.timeline.playhead);

	const [dragMode, setDragMode] = useState<DragMode | null>(null);
	const dragStart = useRef<{
		mode: DragMode;
		clientX: number;
		clientY: number;
		initX: number;
		initY: number;
		initW: number;
		initH: number;
		initSearchMult: number;
	} | null>(null);

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

	// Mouse drag handlers to place/reposition/resize tracker box
	const handlePointerDown = (e: React.PointerEvent, mode: DragMode) => {
		e.stopPropagation();
		e.preventDefault();
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		setDragMode(mode);
		dragStart.current = {
			mode,
			clientX: e.clientX,
			clientY: e.clientY,
			initX: tracker.initialRegion.x,
			initY: tracker.initialRegion.y,
			initW: tracker.initialRegion.width,
			initH: tracker.initialRegion.height,
			initSearchMult: tracker.initialRegion.searchMultiplier ?? 2.5
		};
	};

	const handlePointerMove = (e: React.PointerEvent) => {
		if (!dragMode || !dragStart.current) return;
		const { mode, clientX, clientY, initX, initY, initW, initH, initSearchMult } =
			dragStart.current;

		if (mode === 'feature-move' || mode === 'search-move') {
			const dx = (e.clientX - clientX) / renderedWidth;
			const dy = (e.clientY - clientY) / renderedHeight;
			const nextX = Math.max(0.01, Math.min(0.99, initX + dx));
			const nextY = Math.max(0.01, Math.min(0.99, initY + dy));

			store.getState().updateTracker(targetClip!.id, tracker.id, {
				initialRegion: {
					...tracker.initialRegion,
					x: nextX,
					y: nextY
				}
			});
			return;
		}

		if (mode === 'search-resize') {
			const dxPx = e.clientX - clientX;
			const nextMult = Math.max(
				1.2,
				Math.min(6.0, initSearchMult + (2 * dxPx) / Math.max(10, templateW))
			);
			store.getState().updateTracker(targetClip!.id, tracker.id, {
				initialRegion: {
					...tracker.initialRegion,
					searchMultiplier: Math.round(nextMult * 10) / 10
				}
			});
			return;
		}

		// Feature box corner resizing
		const dxPx = e.clientX - clientX;
		const dyPx = e.clientY - clientY;
		const pixelScaleW = Math.max(1, renderedWidth * currentScale);
		const pixelScaleH = Math.max(1, renderedHeight * currentScale);

		let nextW = initW;
		let nextH = initH;

		switch (mode) {
			case 'resize-se':
				nextW = initW + (2 * dxPx) / pixelScaleW;
				nextH = initH + (2 * dyPx) / pixelScaleH;
				break;
			case 'resize-sw':
				nextW = initW - (2 * dxPx) / pixelScaleW;
				nextH = initH + (2 * dyPx) / pixelScaleH;
				break;
			case 'resize-ne':
				nextW = initW + (2 * dxPx) / pixelScaleW;
				nextH = initH - (2 * dyPx) / pixelScaleH;
				break;
			case 'resize-nw':
				nextW = initW - (2 * dxPx) / pixelScaleW;
				nextH = initH - (2 * dyPx) / pixelScaleH;
				break;
		}

		nextW = Math.max(0.02, Math.min(0.6, nextW));
		nextH = Math.max(0.02, Math.min(0.6, nextH));

		store.getState().updateTracker(targetClip!.id, tracker.id, {
			initialRegion: {
				...tracker.initialRegion,
				width: Math.round(nextW * 1000) / 1000,
				height: Math.round(nextH * 1000) / 1000
			}
		});
	};

	const handlePointerUp = (e: React.PointerEvent) => {
		if (dragMode) {
			try {
				(e.target as HTMLElement).releasePointerCapture(e.pointerId);
			} catch {}
			setDragMode(null);
			dragStart.current = null;
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
				onPointerDown={(e) => handlePointerDown(e, 'search-move')}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				data-testid="tracker-search-box"
			>
				{/* Search Box Resize Handle (Bottom-Right) */}
				<div
					className="pointer-events-auto absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-xs border border-slate-950 bg-amber-400 shadow-sm transition-transform hover:scale-125"
					title="Resize Search Area Multiplier"
					data-testid="tracker-search-resize-handle"
					onPointerDown={(e) => handlePointerDown(e, 'search-resize')}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
				/>
			</div>

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
				onPointerDown={(e) => handlePointerDown(e, 'feature-move')}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				data-testid="tracker-feature-box"
			>
				{/* Center Crosshair */}
				<div className="pointer-events-none absolute top-0 left-1/2 h-full w-[1px] -translate-x-1/2 bg-cyan-400/80" />
				<div className="pointer-events-none absolute top-1/2 left-0 h-[1px] w-full -translate-y-1/2 bg-cyan-400/80" />

				{/* Corner Resize Handles */}
				<div
					className="pointer-events-auto absolute -top-1.5 -left-1.5 h-3 w-3 cursor-nwse-resize rounded-xs border border-slate-950 bg-cyan-400 shadow-sm transition-transform hover:scale-125"
					title="Resize Tracker Width / Height"
					data-testid="tracker-resize-handle-nw"
					onPointerDown={(e) => handlePointerDown(e, 'resize-nw')}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
				/>
				<div
					className="pointer-events-auto absolute -top-1.5 -right-1.5 h-3 w-3 cursor-nesw-resize rounded-xs border border-slate-950 bg-cyan-400 shadow-sm transition-transform hover:scale-125"
					title="Resize Tracker Width / Height"
					data-testid="tracker-resize-handle-ne"
					onPointerDown={(e) => handlePointerDown(e, 'resize-ne')}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
				/>
				<div
					className="pointer-events-auto absolute -bottom-1.5 -left-1.5 h-3 w-3 cursor-nesw-resize rounded-xs border border-slate-950 bg-cyan-400 shadow-sm transition-transform hover:scale-125"
					title="Resize Tracker Width / Height"
					data-testid="tracker-resize-handle-sw"
					onPointerDown={(e) => handlePointerDown(e, 'resize-sw')}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
				/>
				<div
					className="pointer-events-auto absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-xs border border-slate-950 bg-cyan-400 shadow-sm transition-transform hover:scale-125"
					title="Resize Tracker Width / Height"
					data-testid="tracker-resize-handle-se"
					onPointerDown={(e) => handlePointerDown(e, 'resize-se')}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
				/>
			</div>
		</div>
	);
}
