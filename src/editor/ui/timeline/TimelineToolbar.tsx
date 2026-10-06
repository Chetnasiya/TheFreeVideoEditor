interface TimelineToolbarProps {
	playheadLabel: string;
	durationLabel: string;
	clipCount: number;
	snapEnabled: boolean;
	pixelsPerSecond: number;
	onSplit: () => void;
	onDelete: () => void;
	onRippleDelete: () => void;
	onToggleSnap: () => void;
	onZoom: (value: number) => void;
	onFit: () => void;
	onAddTrack: (kind: 'video' | 'audio') => void;
}

export default function TimelineToolbar({
	playheadLabel,
	durationLabel,
	clipCount,
	snapEnabled,
	pixelsPerSecond,
	onSplit,
	onDelete,
	onRippleDelete,
	onToggleSnap,
	onZoom,
	onFit,
	onAddTrack
}: TimelineToolbarProps) {
	return (
		<div className="timeline-toolbar-row">
			<div className="timeline-tool-group" role="group" aria-label="Timeline edit actions">
				<button
					className="tool-button"
					type="button"
					onClick={onSplit}
					title="Split selected clips at playhead (S)"
				>
					Split
				</button>
				<button
					className="tool-button"
					type="button"
					onClick={onDelete}
					title="Delete selected clips (Delete)"
				>
					Delete
				</button>
				<button
					className="tool-button"
					type="button"
					onClick={onRippleDelete}
					title="Ripple delete selected clips (Shift+Delete)"
				>
					Ripple
				</button>
				<button
					className={`tool-button ${snapEnabled ? 'is-active' : ''}`}
					type="button"
					aria-pressed={snapEnabled}
					onClick={onToggleSnap}
					title="Toggle snapping. Hold Ctrl/⌘ while dragging to temporarily disable."
				>
					Snap
				</button>
			</div>
			<div className="timeline-tool-group">
				<button type="button" className="tool-button" onClick={() => onAddTrack('video')}>
					+ Video Track
				</button>
				<button type="button" className="tool-button" onClick={() => onAddTrack('audio')}>
					+ Audio Track
				</button>
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
