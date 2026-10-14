import {
	useState,
	useRef,
	useEffect,
	type KeyboardEvent,
	type PointerEvent,
	type MouseEvent
} from 'react';
import {
	rulerTickStep,
	rulerLabel,
	timeToPixels,
	ticksToTimecode,
	framesToTicks,
	ticksToFrames,
	collectSnapPoints,
	snapTime
} from '../../core';
import type { Project, Time, Marker, MarkerId, MarkerColor } from '../../core';
import { MARKER_COLORS } from '../../core/markers';
import { useEditorStore } from '../../state/EditorProvider';

interface TimelineRulerProps {
	project: Project;
	duration: Time;
	playhead: Time;
	pixelsPerSecond: number;
	headerWidth: number;
	visibleStart?: number;
	visibleEnd?: number;
	onScrub: (event: PointerEvent<HTMLDivElement>) => void;
	onScrubEnd: () => void;
	onRulerKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

interface ContextMenuState {
	marker: Marker;
	x: number;
	y: number;
}

const COLOR_NAMES: Record<MarkerColor, string> = {
	green: 'Green',
	red: 'Red',
	purple: 'Purple',
	orange: 'Orange',
	yellow: 'Yellow',
	white: 'White',
	blue: 'Blue',
	cyan: 'Cyan'
};

export default function TimelineRuler({
	project,
	duration,
	playhead,
	pixelsPerSecond,
	headerWidth,
	visibleStart,
	visibleEnd,
	onScrub,
	onScrubEnd,
	onRulerKeyDown
}: TimelineRulerProps) {
	const step = rulerTickStep(pixelsPerSecond, project.settings.fps);
	const count = Math.ceil(duration / step);
	const timecodeStr = ticksToTimecode(playhead, project.settings.fps);
	const fps = project.settings.fps;

	const selectedMarkerId = useEditorStore((state) => state.selectedMarkerId);
	const selectedMarkerIds = useEditorStore((state) => state.selectedMarkerIds);
	const snapToMarkers = useEditorStore((state) => state.timeline.snapToMarkers);
	const snapEnabled = useEditorStore((state) => state.timeline.snapEnabled);
	const showLanes = useEditorStore((state) => state.keyframes.showLanes);
	const graphOpen = useEditorStore((state) => state.keyframes.graph.open);

	const selectMarker = useEditorStore((state) => state.selectMarker);
	const moveMarker = useEditorStore((state) => state.moveMarker);
	const updateMarker = useEditorStore((state) => state.updateMarker);
	const deleteMarker = useEditorStore((state) => state.deleteMarker);
	const deleteMarkers = useEditorStore((state) => state.deleteMarkers);
	const duplicateMarker = useEditorStore((state) => state.duplicateMarker);
	const setMarkerColor = useEditorStore((state) => state.setMarkerColor);
	const setMarkerRange = useEditorStore((state) => state.setMarkerRange);
	const openMarkerDialog = useEditorStore((state) => state.openMarkerDialog);
	const setPlayhead = useEditorStore((state) => state.setPlayhead);
	const toggleSnap = useEditorStore((state) => state.toggleSnap);
	const setSnapToMarkers = useEditorStore((state) => state.setSnapToMarkers);
	const toggleKeyframeLanes = useEditorStore((state) => state.toggleKeyframeLanes);
	const toggleGraphEditor = useEditorStore((state) => state.toggleGraphEditor);

	// Context menu
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
	const contextMenuRef = useRef<HTMLDivElement>(null);

	// Snap options dropdown menu
	const [snapMenuOpen, setSnapMenuOpen] = useState(false);
	const snapControlRef = useRef<HTMLDivElement>(null);

	// Dragging state for marker movement or range resizing
	const dragRef = useRef<{
		mode: 'move' | 'resize-start' | 'resize-end';
		markerId: MarkerId;
		initialTime: Time;
		initialDuration?: Time;
		pointerStartX: number;
		hasMoved: boolean;
	} | null>(null);

	const activeMarkers = project.markers ?? [];

	// Virtualize ruler ticks if visible pixel range is provided
	let firstIndex = 0;
	let lastIndex = count;
	if (visibleStart !== undefined && visibleEnd !== undefined) {
		const stepPixels = timeToPixels(step, pixelsPerSecond);
		if (stepPixels > 0) {
			firstIndex = Math.max(0, Math.floor(visibleStart / stepPixels) - 2);
			lastIndex = Math.min(count, Math.ceil(visibleEnd / stepPixels) + 2);
		}
	}
	const tickIndices: number[] = [];
	for (let i = firstIndex; i <= lastIndex; i++) {
		tickIndices.push(i);
	}

	useEffect(() => {
		function handleClickOutside(e: MouseEvent | globalThis.MouseEvent) {
			if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
				setContextMenu(null);
			}
			if (snapControlRef.current && !snapControlRef.current.contains(e.target as Node)) {
				setSnapMenuOpen(false);
			}
		}
		function handleKeyDown(e: globalThis.KeyboardEvent) {
			if (e.key === 'Escape') {
				setContextMenu(null);
				setSnapMenuOpen(false);
			}
		}
		if (contextMenu || snapMenuOpen) {
			window.addEventListener('mousedown', handleClickOutside);
			window.addEventListener('keydown', handleKeyDown);
			return () => {
				window.removeEventListener('mousedown', handleClickOutside);
				window.removeEventListener('keydown', handleKeyDown);
			};
		}
	}, [contextMenu, snapMenuOpen]);

	function handleMarkerPointerDown(
		e: PointerEvent<HTMLDivElement>,
		marker: Marker,
		mode: 'move' | 'resize-start' | 'resize-end'
	) {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.currentTarget.setPointerCapture(e.pointerId);

		const isMulti = e.shiftKey || e.metaKey || e.ctrlKey;
		selectMarker(marker.id, isMulti);

		dragRef.current = {
			mode,
			markerId: marker.id,
			initialTime: marker.time,
			initialDuration: marker.duration,
			pointerStartX: e.clientX,
			hasMoved: false
		};
	}

	function handleMarkerPointerMove(e: PointerEvent<HTMLDivElement>) {
		const drag = dragRef.current;
		if (!drag) return;

		const deltaPx = e.clientX - drag.pointerStartX;
		if (Math.abs(deltaPx) > 3) {
			drag.hasMoved = true;
		}
		if (!drag.hasMoved) return;

		const deltaTicks = Math.round((deltaPx / pixelsPerSecond) * 1_000_000);

		// Prepare snap points if snapping is active
		let snapPoints: Time[] = [];
		if (snapEnabled && !e.metaKey && !e.ctrlKey) {
			snapPoints = collectSnapPoints(project, {
				playhead,
				includeMarkers: snapToMarkers
			}).filter((p) => Math.abs(p - drag.initialTime) > 100);
		}

		const snapTolerance = framesToTicks(5, fps);

		if (drag.mode === 'move') {
			let targetTime = Math.max(0, drag.initialTime + deltaTicks);
			if (snapPoints.length > 0) {
				const snapped = snapTime(targetTime, snapPoints, snapTolerance);
				if (snapped.snappedTo !== undefined) targetTime = snapped.time;
			}
			// Snap to frame boundary
			const frame = ticksToFrames(targetTime, fps);
			targetTime = framesToTicks(frame, fps);
			moveMarker(drag.markerId, targetTime, { coalesce: true });
		} else if (drag.mode === 'resize-end') {
			const baseDur = drag.initialDuration ?? framesToTicks(1, fps);
			let targetEnd = Math.max(
				drag.initialTime + framesToTicks(1, fps),
				drag.initialTime + baseDur + deltaTicks
			);
			if (snapPoints.length > 0) {
				const snapped = snapTime(targetEnd, snapPoints, snapTolerance);
				if (snapped.snappedTo !== undefined) targetEnd = snapped.time;
			}
			const frame = ticksToFrames(targetEnd, fps);
			targetEnd = framesToTicks(frame, fps);
			const newDur = Math.max(framesToTicks(1, fps), targetEnd - drag.initialTime);
			updateMarker(drag.markerId, { duration: newDur }, { coalesce: true });
		} else if (drag.mode === 'resize-start') {
			const currentEnd = drag.initialTime + (drag.initialDuration ?? framesToTicks(1, fps));
			let targetStart = Math.min(
				currentEnd - framesToTicks(1, fps),
				Math.max(0, drag.initialTime + deltaTicks)
			);
			if (snapPoints.length > 0) {
				const snapped = snapTime(targetStart, snapPoints, snapTolerance);
				if (snapped.snappedTo !== undefined) targetStart = snapped.time;
			}
			const frame = ticksToFrames(targetStart, fps);
			targetStart = framesToTicks(frame, fps);
			const newDur = Math.max(framesToTicks(1, fps), currentEnd - targetStart);
			updateMarker(drag.markerId, { time: targetStart, duration: newDur }, { coalesce: true });
		}
	}

	function handleMarkerPointerUp(e: PointerEvent<HTMLDivElement>) {
		if (e.currentTarget.hasPointerCapture(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId);
		}
		dragRef.current = null;
	}

	function handleMarkerDoubleClick(e: MouseEvent<HTMLDivElement>, marker: Marker) {
		e.stopPropagation();
		openMarkerDialog(marker.id);
	}

	function handleMarkerContextMenu(e: MouseEvent<HTMLDivElement>, marker: Marker) {
		e.preventDefault();
		e.stopPropagation();
		const alreadySelected =
			selectedMarkerId === marker.id ||
			(selectedMarkerIds && selectedMarkerIds.includes(marker.id));
		if (!alreadySelected) {
			selectMarker(marker.id, false);
		}
		setContextMenu({
			marker,
			x: Math.min(window.innerWidth - 220, e.clientX),
			y: Math.min(window.innerHeight - 300, e.clientY)
		});
	}

	function handleMarkerKeyDown(e: KeyboardEvent<HTMLDivElement>, marker: Marker) {
		const frameDelta = framesToTicks(e.shiftKey ? fps : 1, fps);
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			e.stopPropagation();
			moveMarker(marker.id, Math.max(0, marker.time - frameDelta));
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			e.stopPropagation();
			moveMarker(marker.id, marker.time + frameDelta);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			openMarkerDialog(marker.id);
		} else if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			e.stopPropagation();
			deleteMarker(marker.id);
		}
	}

	return (
		<div className="timeline-ruler-row">
			<div className="timeline-ruler-corner" style={{ width: headerWidth }}>
				<div
					className="timeline-corner-timecode"
					title={`Current Timecode (${project.settings.fps} fps)`}
				>
					<span className="timecode-digits">{timecodeStr}</span>
				</div>
				<div
					className="timeline-corner-actions"
					role="toolbar"
					aria-label="Timeline display controls"
				>
					<div className="timeline-snap-control" ref={snapControlRef}>
						<button
							type="button"
							className={`timeline-corner-btn timeline-snap-main-btn ${snapEnabled ? 'is-active' : ''}`}
							onClick={toggleSnap}
							title={`Snap in Timeline: ${snapEnabled ? 'On' : 'Off'} (S)`}
							aria-label="Toggle Snapping"
							aria-pressed={snapEnabled}
						>
							<svg
								viewBox="0 0 16 16"
								width="13"
								height="13"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d="M3 2a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v5a1 1 0 0 1-2 0V2H5v5a3 3 0 0 0 6 0V2h-1V1h1a2 2 0 0 1 2 2v5a5 5 0 0 1-10 0V2z" />
								<path d="M3 2h2v2H3V2zm8 0h2v2h-2V2z" />
							</svg>
						</button>
						<button
							type="button"
							className={`timeline-corner-btn timeline-snap-trigger-btn ${snapMenuOpen ? 'is-open' : ''}`}
							onClick={(e) => {
								e.stopPropagation();
								setSnapMenuOpen((prev) => !prev);
							}}
							title="Snap options (Click for dropdown)"
							aria-label="Snap options dropdown"
							aria-haspopup="true"
							aria-expanded={snapMenuOpen}
						>
							<svg viewBox="0 0 8 6" width="7" height="5" fill="currentColor" aria-hidden="true">
								<path d="M0.5 1l3.5 4 3.5-4z" />
							</svg>
						</button>
						{snapMenuOpen && (
							<div
								className="timeline-dropdown-menu snap-dropdown-menu"
								role="menu"
								aria-label="Snap options"
								onMouseDown={(e) => e.stopPropagation()}
							>
								<button
									type="button"
									role="menuitemcheckbox"
									aria-checked={snapEnabled}
									className={`dropdown-menu-item ${snapEnabled ? 'is-checked' : ''}`}
									onClick={() => toggleSnap()}
								>
									<span className="menu-check">{snapEnabled ? '✓' : ''}</span>
									<span className="menu-label">Snap in Timeline</span>
									<span className="menu-shortcut">S</span>
								</button>
								<button
									type="button"
									role="menuitemcheckbox"
									aria-checked={snapToMarkers}
									className={`dropdown-menu-item ${snapToMarkers ? 'is-checked' : ''}`}
									onClick={() => setSnapToMarkers(!snapToMarkers)}
								>
									<span className="menu-check">{snapToMarkers ? '✓' : ''}</span>
									<span className="menu-label">Snap to Markers</span>
								</button>
							</div>
						)}
					</div>
					<button
						type="button"
						className={`timeline-corner-btn ${showLanes !== 'off' ? 'is-active' : ''}`}
						onClick={toggleKeyframeLanes}
						title={`Keyframes: ${showLanes} (Cmd+K)`}
						aria-label={`Keyframes display: ${showLanes}`}
						aria-pressed={showLanes !== 'off'}
					>
						<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
							<path d="M8 1.5L14 8L8 14.5L2 8L8 1.5Z" />
						</svg>
					</button>
					<button
						type="button"
						className={`timeline-corner-btn ${graphOpen ? 'is-active' : ''}`}
						onClick={toggleGraphEditor}
						title="Toggle Graph Editor (Shift+G)"
						aria-label="Graph"
						aria-pressed={graphOpen}
					>
						<svg
							viewBox="0 0 16 16"
							width="12"
							height="12"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.75"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M2 13C5 13 6 3 14 3" />
							<circle cx="2" cy="13" r="1.5" fill="currentColor" />
							<circle cx="14" cy="3" r="1.5" fill="currentColor" />
						</svg>
					</button>
				</div>
			</div>
			<div
				className="timeline-ruler"
				role="slider"
				tabIndex={0}
				aria-label="Timeline playhead"
				aria-orientation="horizontal"
				aria-valuemin={0}
				aria-valuemax={duration}
				aria-valuenow={playhead}
				onPointerDown={(event) => {
					// Ignore if click originated on marker element
					if ((event.target as HTMLElement).closest('.timeline-marker-item')) return;
					event.currentTarget.setPointerCapture(event.pointerId);
					onScrub(event);
				}}
				onPointerMove={(event) => {
					if (dragRef.current) return;
					if (event.currentTarget.hasPointerCapture(event.pointerId)) onScrub(event);
				}}
				onPointerUp={onScrubEnd}
				onPointerCancel={onScrubEnd}
				onClick={(event) => {
					if ((event.target as HTMLElement).closest('.timeline-marker-item')) return;
					onScrub(event as unknown as PointerEvent<HTMLDivElement>);
				}}
				onKeyDown={onRulerKeyDown}
				style={{ width: Math.max(1, timeToPixels(duration, pixelsPerSecond)) }}
			>
				{/* Ruler ticks */}
				{tickIndices.map((index) => {
					const time = index * step;
					return (
						<span
							className="timeline-ruler-tick"
							key={time}
							style={{ left: timeToPixels(time, pixelsPerSecond) }}
						>
							<span>{rulerLabel(time, project.settings.fps)}</span>
						</span>
					);
				})}

				{/* Marker track row rendered directly above or at top of ruler */}
				<div className="timeline-marker-track" aria-label="Sequence Markers">
					{activeMarkers.map((m) => {
						const isSelected =
							selectedMarkerId === m.id || (selectedMarkerIds && selectedMarkerIds.includes(m.id));
						const startPx = timeToPixels(m.time, pixelsPerSecond);
						const isRange = m.duration !== undefined && m.duration > 0;
						const durPx = isRange ? Math.max(4, timeToPixels(m.duration!, pixelsPerSecond)) : 0;
						const titleText = `${m.name || m.label || 'Marker'} (${ticksToTimecode(m.time, fps)}${
							isRange ? ` + ${ticksToTimecode(m.duration!, fps)}` : ''
						})${m.comment ? `\n${m.comment}` : ''}`;

						return (
							<div
								key={m.id}
								className={`timeline-marker-item ${isSelected ? 'is-selected' : ''} ${
									isRange ? 'is-range' : 'is-point'
								}`}
								data-marker-id={m.id}
								data-marker-color={m.color}
								title={titleText}
								tabIndex={0}
								role="button"
								aria-label={`Marker: ${m.name || m.label || 'Marker'}`}
								aria-selected={isSelected}
								style={{
									left: startPx,
									width: isRange ? durPx : undefined
								}}
								onPointerDown={(e) => handleMarkerPointerDown(e, m, 'move')}
								onPointerMove={handleMarkerPointerMove}
								onPointerUp={handleMarkerPointerUp}
								onDoubleClick={(e) => handleMarkerDoubleClick(e, m)}
								onContextMenu={(e) => handleMarkerContextMenu(e, m)}
								onKeyDown={(e) => handleMarkerKeyDown(e, m)}
							>
								{/* Marker Head / Flag Pin */}
								{isRange ? (
									<>
										{/* Range bar */}
										<div
											className="timeline-marker-range-bar"
											style={{
												backgroundColor: `var(--marker-${m.color})`
											}}
										>
											<span className="timeline-marker-label">{m.name || m.label || 'M'}</span>
										</div>

										{/* Start Pin */}
										<div className="timeline-marker-pin-wrapper start-pin">
											<svg
												viewBox="0 0 12 18"
												width="12"
												height="18"
												className="timeline-marker-pin"
											>
												<path
													d="M 0.5 0.5 H 11.5 V 11.5 L 6 17.5 L 0.5 11.5 Z"
													fill={`var(--marker-${m.color})`}
													stroke={isSelected ? 'var(--color-link)' : 'rgba(0, 0, 0, 0.45)'}
													strokeWidth={isSelected ? 1.5 : 0.75}
													strokeLinejoin="round"
												/>
											</svg>
										</div>

										{/* End Pin */}
										<div className="timeline-marker-pin-wrapper end-pin">
											<svg
												viewBox="0 0 12 18"
												width="12"
												height="18"
												className="timeline-marker-pin"
											>
												<path
													d="M 0.5 0.5 H 11.5 V 11.5 L 6 17.5 L 0.5 11.5 Z"
													fill={`var(--marker-${m.color})`}
													stroke={isSelected ? 'var(--color-link)' : 'rgba(0, 0, 0, 0.45)'}
													strokeWidth={isSelected ? 1.5 : 0.75}
													strokeLinejoin="round"
												/>
											</svg>
										</div>

										{/* Resize handles */}
										<div
											className="timeline-marker-handle handle-start"
											onPointerDown={(e) => handleMarkerPointerDown(e, m, 'resize-start')}
											onPointerMove={handleMarkerPointerMove}
											onPointerUp={handleMarkerPointerUp}
											title="Drag to resize marker start"
										/>
										<div
											className="timeline-marker-handle handle-end"
											onPointerDown={(e) => handleMarkerPointerDown(e, m, 'resize-end')}
											onPointerMove={handleMarkerPointerMove}
											onPointerUp={handleMarkerPointerUp}
											title="Drag to resize marker end"
										/>
									</>
								) : (
									<div className="timeline-marker-pin-wrapper">
										<svg viewBox="0 0 12 18" width="12" height="18" className="timeline-marker-pin">
											<path
												d="M 0.5 0.5 H 11.5 V 11.5 L 6 17.5 L 0.5 11.5 Z"
												fill={`var(--marker-${m.color})`}
												stroke={isSelected ? 'var(--color-link)' : 'rgba(0, 0, 0, 0.45)'}
												strokeWidth={isSelected ? 1.5 : 0.75}
												strokeLinejoin="round"
											/>
										</svg>
										{/* Accessible/visible label container for tests and readability */}
										<span className="timeline-marker-label visually-hidden">
											{m.name || m.label || 'M'}
										</span>
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>

			{/* Marker Context Menu */}
			{contextMenu && (
				<div
					ref={contextMenuRef}
					className="timeline-context-menu marker-context-menu"
					role="menu"
					aria-label="Marker options"
					style={{ left: contextMenu.x, top: contextMenu.y, zIndex: 100 }}
				>
					<button
						type="button"
						role="menuitem"
						onClick={() => {
							openMarkerDialog(contextMenu.marker.id);
							setContextMenu(null);
						}}
					>
						Edit Marker…
					</button>
					<button
						type="button"
						role="menuitem"
						onClick={() => {
							setPlayhead(contextMenu.marker.time);
							setContextMenu(null);
						}}
					>
						Go to Marker
					</button>

					<div className="menu-divider" />

					{/* 8 Color swatches */}
					<div className="menu-swatches-row" role="group" aria-label="Set marker color">
						{MARKER_COLORS.map((col) => (
							<button
								key={col}
								type="button"
								className="swatch-btn"
								title={COLOR_NAMES[col]}
								aria-label={COLOR_NAMES[col]}
								style={{ backgroundColor: `var(--marker-${col})` }}
								onClick={() => {
									if (selectedMarkerIds && selectedMarkerIds.length > 1) {
										setMarkerColor(selectedMarkerIds, col);
									} else {
										setMarkerColor(contextMenu.marker.id, col);
									}
									setContextMenu(null);
								}}
							/>
						))}
					</div>

					<div className="menu-divider" />

					<button
						type="button"
						role="menuitem"
						onClick={() => {
							setMarkerRange(
								contextMenu.marker.id,
								contextMenu.marker.duration ? 0 : framesToTicks(30, fps)
							);
							setContextMenu(null);
						}}
					>
						{contextMenu.marker.duration ? 'Convert to Point Marker' : 'Convert to Range Marker'}
					</button>

					<button
						type="button"
						role="menuitem"
						onClick={() => {
							duplicateMarker(contextMenu.marker.id);
							setContextMenu(null);
						}}
					>
						Duplicate Marker
					</button>

					<div className="menu-divider" />

					<button
						type="button"
						role="menuitem"
						style={{ color: 'var(--color-error)' }}
						onClick={() => {
							if (selectedMarkerIds && selectedMarkerIds.length > 1) {
								deleteMarkers(selectedMarkerIds);
							} else {
								deleteMarker(contextMenu.marker.id);
							}
							setContextMenu(null);
						}}
					>
						Delete Marker
					</button>
				</div>
			)}
		</div>
	);
}
