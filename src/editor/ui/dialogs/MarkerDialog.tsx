import {
	useEffect,
	useRef,
	useState,
	type KeyboardEvent,
	type MouseEvent,
	type SyntheticEvent
} from 'react';
import { framesToTicks, ticksToFrames, ticksToTimecode, timecodeToTicks } from '../../core/time';
import { MARKER_COLORS, MARKER_TYPES, type MarkerColor, type MarkerType } from '../../core/markers';
import { viewProject } from '../../core/sequences/access';
import { useEditorStore } from '../../state/EditorProvider';

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

const TYPE_NAMES: Record<MarkerType, string> = {
	comment: 'Comment',
	chapter: 'Chapter',
	segment: 'Segment',
	'web-link': 'Web Link'
};

export default function MarkerDialog() {
	const open = useEditorStore((state) => state.isMarkerDialogOpen);
	const targetMarkerId = useEditorStore((state) => state.editingMarkerId);
	const project = useEditorStore((state) => state.project);
	const activeSeqId = useEditorStore((state) => state.activeSequenceId);
	const close = useEditorStore((state) => state.closeMarkerDialog);
	const updateMarker = useEditorStore((state) => state.updateMarker);
	const deleteMarker = useEditorStore((state) => state.deleteMarker);
	const duplicateMarker = useEditorStore((state) => state.duplicateMarker);

	const fps = project?.settings.fps ?? 30;

	const activeProject = project ? viewProject(project, activeSeqId) : null;
	const activeMarkers = activeProject?.markers ?? [];
	const marker = activeMarkers.find((m) => m.id === targetMarkerId) ?? null;

	const [name, setName] = useState('');
	const [comment, setComment] = useState('');
	const [color, setColor] = useState<MarkerColor>('green');
	const [type, setType] = useState<MarkerType>('comment');
	const [url, setUrl] = useState('');
	const [timeStr, setTimeStr] = useState('00:00:00:00');
	const [durationStr, setDurationStr] = useState('00:00:00:00');
	const [isRange, setIsRange] = useState(false);
	const [timeError, setTimeError] = useState('');
	const [durationError, setDurationError] = useState('');

	const dialogRef = useRef<HTMLDialogElement>(null);
	const nameInputRef = useRef<HTMLInputElement>(null);

	// Synchronize initial dialog state when opened
	useEffect(() => {
		if (open && marker) {
			setName(marker.name ?? marker.label ?? '');
			setComment(marker.comment ?? '');
			setColor(marker.color ?? 'green');
			setType(marker.type ?? 'comment');
			setUrl(marker.url ?? '');
			setTimeStr(ticksToTimecode(marker.time, fps));
			const dur = marker.duration ?? 0;
			setIsRange(dur > 0);
			setDurationStr(dur > 0 ? ticksToTimecode(dur, fps) : '00:00:00:00');
			setTimeError('');
			setDurationError('');
		}
	}, [open, marker, fps]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			nameInputRef.current?.focus();
			nameInputRef.current?.select();
		}
		if (!open && dialog.open) {
			dialog.close();
		}
	}, [open]);

	function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
		// Shortcuts 1-8 to pick color when not typing in text/comment inputs
		const target = event.target as HTMLElement;
		const isTextInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
		if (!isTextInput && event.key >= '1' && event.key <= '8') {
			const index = parseInt(event.key, 10) - 1;
			const pickedColor = MARKER_COLORS[index];
			if (pickedColor) {
				event.preventDefault();
				setColor(pickedColor);
			}
		}
	}

	function handleDurationChange(val: string) {
		setDurationStr(val);
		try {
			const ticks = timecodeToTicks(val, fps);
			if (ticks < 0) {
				setDurationError('Duration must be positive');
			} else {
				setDurationError('');
			}
		} catch {
			setDurationError('Invalid timecode');
		}
	}

	function handleTimeChange(val: string) {
		setTimeStr(val);
		try {
			const ticks = timecodeToTicks(val, fps);
			if (ticks < 0) {
				setTimeError('Time must be positive');
			} else {
				setTimeError('');
			}
		} catch {
			setTimeError('Invalid timecode');
		}
	}

	function submit(event: SyntheticEvent<HTMLFormElement>): void {
		event.preventDefault();
		if (!marker) return;

		let startTicks = marker.time;
		try {
			startTicks = timecodeToTicks(timeStr, fps);
		} catch {
			return;
		}

		let durTicks: number | undefined = undefined;
		if (isRange) {
			try {
				const ticks = timecodeToTicks(durationStr, fps);
				durTicks = Math.max(1, framesToTicks(Math.max(1, ticksToFrames(ticks, fps)), fps));
			} catch {
				return;
			}
		}

		updateMarker(marker.id, {
			name: name.trim(),
			comment: comment.trim(),
			color,
			type,
			url: type === 'web-link' ? url.trim() : undefined,
			time: startTicks,
			duration: durTicks
		});
		close();
	}

	function handleDelete() {
		if (marker) {
			deleteMarker(marker.id);
			close();
		}
	}

	function handleDuplicate() {
		if (marker) {
			duplicateMarker(marker.id);
			close();
		}
	}

	return (
		<dialog
			ref={dialogRef}
			className="editor-dialog marker-dialog"
			aria-labelledby="marker-dialog-title"
			onKeyDown={handleKeyDown}
			onCancel={(event) => {
				event.preventDefault();
				close();
			}}
			onClick={(event: MouseEvent<HTMLDialogElement>) => {
				if (event.target === event.currentTarget) close();
			}}
		>
			<form className="dialog-content" onSubmit={submit} style={{ minWidth: '24rem' }}>
				<div className="dialog-heading">
					<div>
						<p className="dialog-eyebrow">MARKER</p>
						<h2 id="marker-dialog-title">Edit Marker</h2>
					</div>
					<button
						className="icon-button dialog-close"
						type="button"
						aria-label="Close marker dialog"
						onClick={close}
					>
						×
					</button>
				</div>

				<div style={{ display: 'grid', gap: 'var(--spacing-sm)' }}>
					<label className="dialog-field" style={{ display: 'grid', gap: 'var(--spacing-xxs)' }}>
						<span>Name</span>
						<input
							ref={nameInputRef}
							type="text"
							value={name}
							placeholder="Marker name"
							aria-label="Marker name"
							onChange={(e) => setName(e.target.value)}
						/>
					</label>

					<label className="dialog-field" style={{ display: 'grid', gap: 'var(--spacing-xxs)' }}>
						<span>Comment</span>
						<textarea
							value={comment}
							rows={3}
							placeholder="Notes, transcript, or instructions..."
							aria-label="Marker comment"
							style={{ resize: 'vertical' }}
							onChange={(e) => setComment(e.target.value)}
						/>
					</label>

					<div className="dialog-field" style={{ display: 'grid', gap: 'var(--spacing-xxs)' }}>
						<span>Color (1-8)</span>
						<div
							role="radiogroup"
							aria-label="Marker color"
							style={{
								display: 'grid',
								gridTemplateColumns: 'repeat(8, 1fr)',
								gap: 'var(--spacing-xs)',
								padding: 'var(--spacing-xxs) 0'
							}}
						>
							{MARKER_COLORS.map((col, idx) => {
								const isSelected = color === col;
								return (
									<button
										key={col}
										type="button"
										role="radio"
										aria-checked={isSelected}
										aria-label={COLOR_NAMES[col]}
										title={`${COLOR_NAMES[col]} (${idx + 1})`}
										className="marker-color-swatch"
										data-color={col}
										onClick={() => setColor(col)}
										style={{
											width: '1.75rem',
											height: '1.75rem',
											borderRadius: 'var(--radius-sm)',
											backgroundColor: `var(--marker-${col})`,
											border: isSelected ? '2px solid var(--color-ink)' : '2px solid transparent',
											outline: isSelected ? '2px solid var(--color-link)' : 'none',
											outlineOffset: '1px',
											cursor: 'pointer',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											transition: 'transform 0.1s ease',
											transform: isSelected ? 'scale(1.15)' : 'none'
										}}
									>
										{isSelected && (
											<span
												style={{
													color: `var(--marker-${col}-fg)`,
													fontSize: '0.75rem',
													fontWeight: 'bold',
													lineHeight: 1
												}}
											>
												✓
											</span>
										)}
									</button>
								);
							})}
						</div>
					</div>

					<div
						style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)' }}
					>
						<label className="dialog-field" style={{ display: 'grid', gap: 'var(--spacing-xxs)' }}>
							<span>Type</span>
							<select
								value={type}
								aria-label="Marker type"
								onChange={(e) => setType(e.target.value as MarkerType)}
							>
								{MARKER_TYPES.map((t) => (
									<option key={t} value={t}>
										{TYPE_NAMES[t]}
									</option>
								))}
							</select>
						</label>

						<label className="dialog-field" style={{ display: 'grid', gap: 'var(--spacing-xxs)' }}>
							<span>Start Time</span>
							<input
								type="text"
								value={timeStr}
								style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}
								aria-label="Marker start timecode"
								aria-invalid={!!timeError}
								onChange={(e) => handleTimeChange(e.target.value)}
							/>
						</label>
					</div>

					{type === 'web-link' && (
						<label className="dialog-field" style={{ display: 'grid', gap: 'var(--spacing-xxs)' }}>
							<span>URL</span>
							<input
								type="url"
								value={url}
								placeholder="https://example.com"
								aria-label="Marker URL"
								onChange={(e) => setUrl(e.target.value)}
							/>
						</label>
					)}

					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							marginTop: 'var(--spacing-xxs)'
						}}
					>
						<label
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--spacing-xs)',
								cursor: 'pointer'
							}}
						>
							<input
								type="checkbox"
								checked={isRange}
								onChange={(e) => {
									const checked = e.currentTarget.checked;
									setIsRange(checked);
									if (checked && durationStr === '00:00:00:00') {
										setDurationStr(ticksToTimecode(framesToTicks(30, fps), fps));
									}
								}}
							/>
							<span>Range Marker (Duration)</span>
						</label>

						{isRange && (
							<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
								<input
									type="text"
									value={durationStr}
									style={{
										width: '7.5rem',
										textAlign: 'right',
										fontFamily: 'var(--font-mono)'
									}}
									aria-label="Marker duration timecode"
									aria-invalid={!!durationError}
									onChange={(e) => handleDurationChange(e.target.value)}
								/>
							</div>
						)}
					</div>

					{durationError && (
						<p
							style={{
								color: 'var(--color-danger, #f43f5e)',
								fontSize: 'var(--text-body-sm)',
								margin: 0
							}}
						>
							{durationError}
						</p>
					)}
					{timeError && (
						<p
							style={{
								color: 'var(--color-danger, #f43f5e)',
								fontSize: 'var(--text-body-sm)',
								margin: 0
							}}
						>
							{timeError}
						</p>
					)}
				</div>

				<div
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
						marginTop: 'var(--spacing-md)'
					}}
				>
					<div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
						<button
							type="button"
							className="secondary-button"
							onClick={handleDelete}
							style={{ color: 'var(--color-error)' }}
						>
							Delete
						</button>
						<button type="button" className="secondary-button" onClick={handleDuplicate}>
							Duplicate
						</button>
					</div>

					<div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
						<button type="button" className="secondary-button" onClick={close}>
							Cancel
						</button>
						<button
							type="submit"
							className="primary-button"
							disabled={!!timeError || (isRange && !!durationError)}
						>
							Save
						</button>
					</div>
				</div>
			</form>
		</dialog>
	);
}
