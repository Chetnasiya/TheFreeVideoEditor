import { useEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from 'react';
import { framesToTicks, ticksToFrames, ticksToTimecode, timecodeToTicks } from '../../core/time';
import { useEditorStore } from '../../state/EditorProvider';

export default function SpeedDurationDialog() {
	const open = useEditorStore((state) => state.isSpeedDialogOpen);
	const targetClipId = useEditorStore((state) => state.speedDialogClipId);
	const project = useEditorStore((state) => state.project);
	const close = useEditorStore((state) => state.closeSpeedDialog);
	const setClipSpeed = useEditorStore((state) => state.setClipSpeed);

	const clip = project?.tracks.flatMap((t) => t.clips).find((c) => c.id === targetClipId) ?? null;
	const fps = project?.settings.fps ?? 30;

	const [speedPercent, setSpeedPercent] = useState<number>(100);
	const [durationStr, setDurationStr] = useState<string>('00:00:01:00');
	const [reverse, setReverse] = useState<boolean>(false);
	const [maintainPitch, setMaintainPitch] = useState<boolean>(true);
	const [ripple, setRipple] = useState<boolean>(false);
	const [durationError, setDurationError] = useState<string>('');

	const dialogRef = useRef<HTMLDialogElement>(null);
	const speedInputRef = useRef<HTMLInputElement>(null);

	// Synchronize initial dialog state when opened
	useEffect(() => {
		if (open && clip) {
			const currentSpeed = clip.speed ?? 1;
			const absSpeed = Math.abs(currentSpeed);
			const percent = Math.round(absSpeed * 1000) / 10;
			setSpeedPercent(percent);
			setReverse(currentSpeed < 0);
			setMaintainPitch(clip.maintainPitch ?? true);
			setRipple(false);
			setDurationError('');
			setDurationStr(ticksToTimecode(clip.duration, fps));
		}
	}, [open, clip, fps]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			speedInputRef.current?.select();
			speedInputRef.current?.focus();
		}
		if (!open && dialog.open) {
			dialog.close();
		}
	}, [open]);

	// Calculate base source range length (unscaled)
	const sourceRangeTicks = clip ? Math.abs(clip.sourceOut - clip.sourceIn) : 0;

	function handleSpeedChange(newPercent: number) {
		setSpeedPercent(newPercent);
		setDurationError('');
		if (newPercent > 0) {
			const multiplier = newPercent / 100;
			const rawTicks = Math.round(Math.max(0, sourceRangeTicks / multiplier));
			const snappedFrames = Math.max(1, ticksToFrames(rawTicks, fps));
			const snappedTicks = framesToTicks(snappedFrames, fps);
			setDurationStr(ticksToTimecode(snappedTicks, fps));
		}
	}

	function handleDurationChange(newDurationStr: string) {
		setDurationStr(newDurationStr);
		try {
			const ticks = timecodeToTicks(newDurationStr, fps);
			if (ticks <= 0) {
				setDurationError('Duration must be greater than zero.');
				return;
			}
			setDurationError('');
			const multiplier = sourceRangeTicks / ticks;
			const percent = Math.round(multiplier * 1000) / 10;
			const clampedPercent = Math.max(1, Math.min(10000, percent));
			setSpeedPercent(clampedPercent);
		} catch {
			setDurationError('Invalid timecode (HH:MM:SS:FF)');
		}
	}

	function submit(event: SyntheticEvent<HTMLFormElement>): void {
		event.preventDefault();
		if (!clip || speedPercent <= 0) return;
		const finalMultiplier = (speedPercent / 100) * (reverse ? -1 : 1);
		setClipSpeed([clip.id], finalMultiplier, {
			ripple,
			maintainPitch
		});
		close();
	}

	return (
		<dialog
			ref={dialogRef}
			className="editor-dialog speed-duration-dialog"
			aria-labelledby="speed-duration-title"
			onCancel={(event) => {
				event.preventDefault();
				close();
			}}
			onClick={(event: MouseEvent<HTMLDialogElement>) => {
				if (event.target === event.currentTarget) close();
			}}
		>
			<form className="dialog-content" onSubmit={submit} style={{ minWidth: '22rem' }}>
				<div className="dialog-heading">
					<div>
						<p className="dialog-eyebrow">CLIP SPEED</p>
						<h2 id="speed-duration-title">Speed / Duration</h2>
					</div>
					<button
						className="icon-button dialog-close"
						type="button"
						aria-label="Close speed and duration dialog"
						onClick={close}
					>
						×
					</button>
				</div>

				<div style={{ display: 'grid', gap: 'var(--spacing-sm)' }}>
					<label
						className="dialog-field"
						style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
					>
						<span>Speed</span>
						<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xxs)' }}>
							<input
								ref={speedInputRef}
								type="number"
								step="0.1"
								min="1"
								max="10000"
								style={{ width: '6rem', textAlign: 'right' }}
								value={speedPercent}
								aria-label="Speed percentage"
								onChange={(e) => handleSpeedChange(parseFloat(e.target.value) || 0)}
							/>
							<span aria-hidden="true">%</span>
						</div>
					</label>

					<label
						className="dialog-field"
						style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
					>
						<span>Duration</span>
						<input
							type="text"
							value={durationStr}
							style={{ width: '7.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}
							aria-label="Clip duration timecode"
							aria-invalid={!!durationError}
							onChange={(e) => handleDurationChange(e.target.value)}
						/>
					</label>
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

					<hr
						style={{
							margin: 'var(--spacing-xxs) 0',
							border: 'none',
							borderTop: 'var(--panel-divider)'
						}}
					/>

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
							checked={reverse}
							onChange={(e) => setReverse(e.currentTarget.checked)}
						/>
						<span>Reverse Speed</span>
					</label>

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
							checked={maintainPitch}
							onChange={(e) => setMaintainPitch(e.currentTarget.checked)}
						/>
						<span>Maintain Audio Pitch</span>
					</label>

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
							checked={ripple}
							onChange={(e) => setRipple(e.currentTarget.checked)}
						/>
						<span>Ripple Sequence (Shift Trailing Clips)</span>
					</label>
				</div>

				<div
					style={{
						display: 'flex',
						justifyContent: 'flex-end',
						gap: 'var(--spacing-sm)',
						marginTop: 'var(--spacing-sm)'
					}}
				>
					<button type="button" className="secondary-button" onClick={close}>
						Cancel
					</button>
					<button
						type="submit"
						className="primary-button"
						disabled={speedPercent <= 0 || !!durationError}
					>
						OK
					</button>
				</div>
			</form>
		</dialog>
	);
}
