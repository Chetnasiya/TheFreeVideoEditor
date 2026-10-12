import type { ReactNode } from 'react';

interface TimelineToolbarProps {
	playheadLabel: string;
	durationLabel: string;
	clipCount: number;
	sequenceTabs?: ReactNode;
	isMaximized?: boolean;
	onToggleMaximize?: () => void;
	snapEnabled?: boolean;
	snapToMarkers?: boolean;
	onToggleSnapToMarkers?: () => void;
	markerCount?: number;
	pixelsPerSecond: number;
	showLanes?: 'selected' | 'all' | 'off';
	onToggleKeyframes?: () => void;
	graphOpen?: boolean;
	onToggleGraph?: () => void;
	onSplit: () => void;
	onDelete: () => void;
	onRippleDelete: () => void;
	onToggleSnap?: () => void;
	onZoom: (value: number) => void;
	onFit: () => void;
	onAddTrack: (kind: 'video' | 'audio') => void;
	onAddAdjustment?: () => void;
	onAddSolid?: () => void;
	onAddText?: () => void;
	onAddCaption?: () => void;
}

export default function TimelineToolbar({
	playheadLabel: _playheadLabel,
	durationLabel: _durationLabel,
	clipCount,
	sequenceTabs,
	isMaximized = false,
	onToggleMaximize,
	markerCount,
	pixelsPerSecond,
	onSplit,
	onDelete,
	onRippleDelete,
	onZoom,
	onFit,
	onAddTrack,
	onAddAdjustment,
	onAddSolid,
	onAddCaption
}: TimelineToolbarProps) {
	return (
		<div className="timeline-toolbar-row">
			<div className="timeline-toolbar-left">
				{sequenceTabs && (
					<>
						<div className="timeline-tabs-inline">{sequenceTabs}</div>
						<div className="timeline-toolbar-separator" aria-hidden="true" />
					</>
				)}
				<div className="timeline-tool-group" role="group" aria-label="Timeline edit actions">
					<button
						className="tool-button"
						type="button"
						onClick={onSplit}
						title="Split selected clips at playhead (S)"
						aria-label="Split selected clips at playhead"
					>
						<svg
							className="tool-btn-icon"
							viewBox="0 0 16 16"
							width="13"
							height="13"
							fill="currentColor"
							aria-hidden="true"
						>
							<g transform="rotate(45 8 8)">
								<path
									fillRule="evenodd"
									clipRule="evenodd"
									d="M2.5 4.5h11l1 1.5v1.2h-1.2v1.6h1.2v1.2l-1 1.5h-11l-1-1.5V8.8h1.2V7.2H1.5V6l1-1.5zm2 3h7v1h-7v-1zm3.5-1.5a1 1 0 100 2 1 1 0 000-2z"
								/>
							</g>
						</svg>
						<span>Split</span>
					</button>
					<button
						className="tool-button"
						type="button"
						onClick={onDelete}
						title="Delete selected clips (Delete)"
						aria-label="Delete selected clips"
					>
						<svg
							className="tool-btn-icon"
							viewBox="0 0 16 16"
							width="12"
							height="12"
							fill="currentColor"
							aria-hidden="true"
						>
							<path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
							<path
								fillRule="evenodd"
								d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
							/>
						</svg>
						<span>Delete</span>
					</button>
					<button
						className="tool-button"
						type="button"
						onClick={onRippleDelete}
						title="Ripple delete selected clips (Shift+Delete)"
						aria-label="Ripple delete selected clips"
					>
						<svg
							className="tool-btn-icon"
							viewBox="0 0 16 16"
							width="12"
							height="12"
							fill="currentColor"
							aria-hidden="true"
						>
							<path d="M2.5 1a1 1 0 0 0-1 1v1h11V2a1 1 0 0 0-1-1h-9zm10 3H1.5v8a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V4zm-7 2.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5z" />
							<path d="M14 6l2 2-2 2V6z" />
						</svg>
						<span>Ripple</span>
					</button>
				</div>
				<div className="timeline-toolbar-separator" aria-hidden="true" />
				<div className="timeline-tool-group" role="group" aria-label="Add tracks and layers">
					{/* <button type="button" className="tool-button" onClick={() => onAddTrack('video')} title="Add video track">
						<svg className="tool-btn-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
							<path d="M0 3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2.5l3.5-2.5v9L12 10.5V13a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3z" />
						</svg>
						<span>+ Video</span>
					</button>
					<button type="button" className="tool-button" onClick={() => onAddTrack('audio')} title="Add audio track">
						<svg className="tool-btn-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
							<path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-.708.707A7.476 7.476 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303l.708.707z" />
							<path d="M10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.482 5.482 0 0 1 11.025 8a5.482 5.482 0 0 1-1.61 3.89l.706.706z" />
							<path d="M8.707 11.182A4.486 4.486 0 0 0 10.025 8a4.486 4.486 0 0 0-1.318-3.182L8 5.525A3.489 3.489 0 0 1 9.025 8 3.49 3.49 0 0 1 8 10.475l.707.707zM6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A1.5 1.5 0 0 1 0 9V7a1.5 1.5 0 0 1 1.5-1.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06z" />
						</svg>
						<span>+ Audio</span>
					</button> */}
					{onAddAdjustment && (
						<button
							type="button"
							className="tool-button"
							onClick={onAddAdjustment}
							title="Add adjustment layer across sequence"
						>
							<svg className="tool-btn-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
								<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5v11A5.5 5.5 0 0 1 8 2.5z" />
							</svg>
							<span>Adjustment Layer</span>
						</button>
					)}
					{onAddSolid && (
						<button
							type="button"
							className="tool-button"
							onClick={onAddSolid}
							title="Add solid color layer"
						>
							<svg className="tool-btn-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
								<rect x="2" y="2" width="12" height="12" rx="2" />
							</svg>
							<span>Solid Layer</span>
						</button>
					)}
					{onAddCaption && (
						<button
							type="button"
							className="tool-button"
							onClick={onAddCaption}
							title="Add caption track or subtitle cue"
						>
							<svg className="tool-btn-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
								<path d="M2 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1.5v2.5L7 13h7a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H2zm3.5 3h1.5a.5.5 0 0 1 .5.5v.5h-1v-.5H5.5v3H6v-.5h1v.5a.5.5 0 0 1-.5.5h-1.5a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5zm5 0H12a.5.5 0 0 1 .5.5v.5h-1v-.5H10.5v3H11v-.5h1v.5a.5.5 0 0 1-.5.5h-1.5a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5z" />
							</svg>
							<span>Caption Layer</span>
						</button>
					)}
				</div>
			</div>
			<div className="timeline-toolbar-right">
				<div className="timeline-tool-group timeline-zoom-tools">
					<label title="Timeline zoom">
						<span className="sr-only">Timeline zoom</span>
						<svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" className="timeline-zoom-icon" aria-hidden="true">
							<path d="M6.5 12a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zm4.4-1.8l3.4 3.4a.75.75 0 0 1-1.06 1.06l-3.4-3.4a5.5 5.5 0 0 1-3.34.74zM4 6h5v1H4V6z" />
						</svg>
						<input
							type="range"
							name="timeline-zoom"
							className="timeline-zoom-slider"
							min="8"
							max="400"
							step="1"
							value={pixelsPerSecond}
							onChange={(event) => onZoom(Number(event.currentTarget.value))}
						/>
						<svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" className="timeline-zoom-icon" aria-hidden="true">
							<path d="M6.5 12a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zm4.4-1.8l3.4 3.4a.75.75 0 0 1-1.06 1.06l-3.4-3.4a5.5 5.5 0 0 1-3.34.74zM6 4h1v2h2v1H7v2H6V7H4V6h2V4z" />
						</svg>
					</label>
					<button
						type="button"
						className="tool-button"
						onClick={onFit}
						title="Fit the full sequence (\)"
					>
						Fit
					</button>
					<span className="timeline-counter-badge" aria-label={`${clipCount} clips`}>
						{clipCount} clips
					</span>
					{markerCount !== undefined && markerCount > 0 && (
						<span
							className="timeline-counter-badge timeline-marker-count"
							aria-label={`${markerCount} markers`}
						>
							<span className="marker-dot" aria-hidden="true" />
							{markerCount} markers
						</span>
					)}
					{onToggleMaximize && (
						<button
							type="button"
							className="tool-button timeline-maximize-btn"
							title={isMaximized ? 'Restore panel' : 'Maximize timeline'}
							aria-label={isMaximized ? 'Restore panel' : 'Maximize timeline'}
							onClick={onToggleMaximize}
						>
							⤢
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
