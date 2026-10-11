interface TimelineToolbarProps {
	playheadLabel: string;
	durationLabel: string;
	clipCount: number;
	snapEnabled: boolean;
	pixelsPerSecond: number;
	showLanes?: 'selected' | 'all' | 'off';
	onToggleKeyframes?: () => void;
	graphOpen?: boolean;
	onToggleGraph?: () => void;
	onSplit: () => void;
	onDelete: () => void;
	onRippleDelete: () => void;
	onToggleSnap: () => void;
	onZoom: (value: number) => void;
	onFit: () => void;
	onAddTrack: (kind: 'video' | 'audio') => void;
	onAddAdjustment?: () => void;
	onAddSolid?: () => void;
	onAddText?: () => void;
	onAddCaption?: () => void;
}

export default function TimelineToolbar({
	playheadLabel,
	durationLabel,
	clipCount,
	snapEnabled,
	pixelsPerSecond,
	showLanes = 'selected',
	onToggleKeyframes,
	graphOpen = false,
	onToggleGraph,
	onSplit,
	onDelete,
	onRippleDelete,
	onToggleSnap,
	onZoom,
	onFit,
	onAddTrack,
	onAddAdjustment,
	onAddSolid,
	onAddText,
	onAddCaption
}: TimelineToolbarProps) {
	return (
		<div className="timeline-toolbar-row">
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
						width="14"
						height="14"
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
						width="13"
						height="13"
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
						width="13"
						height="13"
						fill="currentColor"
						aria-hidden="true"
					>
						<path d="M2.5 1a1 1 0 0 0-1 1v1h11V2a1 1 0 0 0-1-1h-9zm10 3H1.5v8a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V4zm-7 2.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5z" />
						<path d="M14 6l2 2-2 2V6z" />
					</svg>
					<span>Ripple</span>
				</button>
				<button
					className={`tool-button ${snapEnabled ? 'is-active' : ''}`}
					type="button"
					aria-pressed={snapEnabled}
					onClick={onToggleSnap}
					title="Toggle snapping. Hold Ctrl/⌘ while dragging to temporarily disable."
					aria-label="Toggle snapping"
				>
					<svg
						className="tool-btn-icon"
						viewBox="0 0 16 16"
						width="13"
						height="13"
						fill="currentColor"
						aria-hidden="true"
					>
						<path d="M3 2a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v5a1 1 0 0 1-2 0V2H5v5a3 3 0 0 0 6 0V2h-1V1h1a2 2 0 0 1 2 2v5a5 5 0 0 1-10 0V2z" />
						<path d="M3 2h2v2H3V2zm8 0h2v2h-2V2z" />
					</svg>
					<span>Snap</span>
				</button>
				{onToggleKeyframes && (
					<button
						className={`tool-button ${showLanes !== 'off' ? 'is-active' : ''}`}
						type="button"
						onClick={onToggleKeyframes}
						title={`Keyframes: ${showLanes} (Cmd+K)`}
						aria-label={`Keyframes display mode: ${showLanes}`}
					>
						<svg
							className="tool-btn-icon"
							viewBox="0 0 16 16"
							width="12"
							height="12"
							fill="currentColor"
							aria-hidden="true"
						>
							<path d="M8 1.5L14 8L8 14.5L2 8L8 1.5Z" />
						</svg>
						<span>
							Keyframes{showLanes === 'all' ? ' (All)' : showLanes === 'off' ? ' (Off)' : ''}
						</span>
					</button>
				)}
				{onToggleGraph && (
					<button
						className={`tool-button ${graphOpen ? 'is-active' : ''}`}
						type="button"
						onClick={onToggleGraph}
						title="Toggle Graph Editor (Shift+G)"
						aria-pressed={graphOpen}
					>
						<svg
							className="tool-btn-icon"
							viewBox="0 0 16 16"
							width="13"
							height="13"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.75"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M2 14C5 14 6 2 14 2" />
							<circle cx="2" cy="14" r="1.5" fill="currentColor" />
							<circle cx="14" cy="2" r="1.5" fill="currentColor" />
						</svg>
						<span>Graph</span>
					</button>
				)}
			</div>
			<div className="timeline-tool-group">
				<button type="button" className="tool-button" onClick={() => onAddTrack('video')}>
					+ Video Track
				</button>
				<button type="button" className="tool-button" onClick={() => onAddTrack('audio')}>
					+ Audio Track
				</button>
				{onAddAdjustment && (
					<button
						type="button"
						className="tool-button"
						onClick={onAddAdjustment}
						title="Add adjustment layer across sequence"
					>
						+ Adjustment Layer
					</button>
				)}
				{onAddSolid && (
					<button
						type="button"
						className="tool-button"
						onClick={onAddSolid}
						title="Add solid color layer"
					>
						+ Solid Layer
					</button>
				)}
				{onAddText && (
					<button
						type="button"
						className="tool-button"
						onClick={onAddText}
						title="Add text layer across sequence"
					>
						+ Text
					</button>
				)}
				{onAddCaption && (
					<button
						type="button"
						className="tool-button"
						onClick={onAddCaption}
						title="Add caption track or subtitle cue"
					>
						+ Caption
					</button>
				)}
			</div>
			<div className="timeline-tool-group timeline-zoom-tools">
				<label>
					<span className="sr-only">Timeline zoom</span>
					<input
						type="range"
						name="timeline-zoom"
						min="8"
						max="400"
						step="1"
						value={pixelsPerSecond}
						onChange={(event) => onZoom(Number(event.currentTarget.value))}
					/>
				</label>
				<button
					type="button"
					className="tool-button"
					onClick={onFit}
					title="Fit the full sequence (\)"
				>
					Fit
				</button>
				<output className="timeline-time-readout" aria-label="Playhead time and sequence duration">
					{playheadLabel} / {durationLabel}
				</output>
				<span className="timeline-clip-count" aria-label={`${clipCount} clips`}>
					{clipCount} clips
				</span>
			</div>
		</div>
	);
}
