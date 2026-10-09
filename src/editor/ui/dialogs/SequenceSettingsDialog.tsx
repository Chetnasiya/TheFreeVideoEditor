import { useEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from 'react';
import { useEditorStore } from '../../state/EditorProvider';
import { isRootSequence } from '../../core/sequences/access';

export default function SequenceSettingsDialog() {
	const open = useEditorStore((state) => state.isSequenceSettingsDialogOpen);
	const targetSeqId = useEditorStore((state) => state.sequenceSettingsDialogId);
	const project = useEditorStore((state) => state.project);
	const close = useEditorStore((state) => state.closeSequenceSettingsDialog);
	const updateSettings = useEditorStore((state) => state.updateSequenceSettings);

	const isRoot = !targetSeqId || isRootSequence(targetSeqId);
	const seq = (!isRoot && targetSeqId && project?.sequences?.[targetSeqId]) || null;
	const currentSettings = seq?.settings ?? project?.settings;

	const [inheritFromProject, setInheritFromProject] = useState<boolean>(!seq?.settings && !isRoot);
	const [width, setWidth] = useState<number>(1920);
	const [height, setHeight] = useState<number>(1080);
	const [fps, setFps] = useState<number>(30);
	const [sampleRate, setSampleRate] = useState<number>(48000);

	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		if (open && currentSettings) {
			setInheritFromProject(!seq?.settings && !isRoot);
			setWidth(currentSettings.width ?? 1920);
			setHeight(currentSettings.height ?? 1080);
			setFps(currentSettings.fps ?? 30);
			setSampleRate(currentSettings.sampleRate ?? 48000);
		}
	}, [open, currentSettings, seq, isRoot]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
		}
		if (!open && dialog.open) {
			dialog.close();
		}
	}, [open]);

	function handleBackdropClick(e: MouseEvent<HTMLDialogElement>) {
		if (e.target === dialogRef.current) {
			close();
		}
	}

	function handleSave(e: SyntheticEvent) {
		e.preventDefault();
		if (!targetSeqId) return;

		if (isRoot) {
			updateSettings(targetSeqId, {
				width,
				height,
				fps,
				sampleRate
			});
		} else if (inheritFromProject) {
			// Clear custom settings to inherit from root
			updateSettings(targetSeqId, undefined);
		} else {
			updateSettings(targetSeqId, {
				width,
				height,
				fps,
				sampleRate
			});
		}
		close();
	}

	if (!open) return null;

	const sequenceName = isRoot
		? (project?.name ?? 'Main Timeline')
		: (seq?.name ?? 'Nested Sequence');

	return (
		<dialog
			ref={dialogRef}
			className="dialog sequence-settings-dialog"
			onClick={handleBackdropClick}
			onClose={close}
			aria-labelledby="seq-settings-title"
			style={{
				padding: 'var(--spacing-lg, 24px)',
				borderRadius: 'var(--radius-md, 8px)',
				background: 'var(--color-surface, #1e1e1e)',
				color: 'var(--color-ink, #ffffff)',
				border: '1px solid var(--color-stroke, #333)',
				maxWidth: '440px',
				width: '100%',
				boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)'
			}}
		>
			<form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
					<h2 id="seq-settings-title" style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
						Sequence Settings: {sequenceName}
					</h2>
					<button
						type="button"
						onClick={close}
						aria-label="Close"
						style={{
							background: 'transparent',
							border: 'none',
							color: 'var(--color-ink-muted, #888)',
							cursor: 'pointer',
							fontSize: '1.25rem'
						}}
					>
						✕
					</button>
				</div>

				{!isRoot && (
					<label
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '8px',
							fontSize: '0.875rem',
							cursor: 'pointer'
						}}
					>
						<input
							type="checkbox"
							checked={inheritFromProject}
							onChange={(e) => setInheritFromProject(e.target.checked)}
							data-testid="inherit-settings-checkbox"
						/>
						<span>Inherit resolution and frame rate from main project</span>
					</label>
				)}

				<fieldset
					disabled={!isRoot && inheritFromProject}
					style={{
						border: 'none',
						padding: 0,
						margin: 0,
						display: 'flex',
						flexDirection: 'column',
						gap: '12px',
						opacity: !isRoot && inheritFromProject ? 0.5 : 1
					}}
				>
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
						<label
							style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem' }}
						>
							<span>Width (px)</span>
							<input
								type="number"
								min="16"
								max="7680"
								step="2"
								value={width}
								onChange={(e) => setWidth(Math.max(16, Number(e.target.value) || 16))}
								data-testid="seq-width-input"
								style={{
									padding: '6px 8px',
									background: 'var(--color-surface-subtle, #282828)',
									color: 'var(--color-ink, #fff)',
									border: '1px solid var(--color-stroke, #444)',
									borderRadius: '4px'
								}}
							/>
						</label>

						<label
							style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem' }}
						>
							<span>Height (px)</span>
							<input
								type="number"
								min="16"
								max="4320"
								step="2"
								value={height}
								onChange={(e) => setHeight(Math.max(16, Number(e.target.value) || 16))}
								data-testid="seq-height-input"
								style={{
									padding: '6px 8px',
									background: 'var(--color-surface-subtle, #282828)',
									color: 'var(--color-ink, #fff)',
									border: '1px solid var(--color-stroke, #444)',
									borderRadius: '4px'
								}}
							/>
						</label>
					</div>

					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
						<label
							style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem' }}
						>
							<span>Frame Rate (fps)</span>
							<select
								value={fps}
								onChange={(e) => setFps(Number(e.target.value))}
								data-testid="seq-fps-select"
								style={{
									padding: '6px 8px',
									background: 'var(--color-surface-subtle, #282828)',
									color: 'var(--color-ink, #fff)',
									border: '1px solid var(--color-stroke, #444)',
									borderRadius: '4px'
								}}
							>
								<option value="24">24 fps (Cinema)</option>
								<option value="25">25 fps (PAL)</option>
								<option value="30">30 fps (Standard)</option>
								<option value="50">50 fps</option>
								<option value="60">60 fps (Smooth)</option>
							</select>
						</label>

						<label
							style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem' }}
						>
							<span>Sample Rate (Hz)</span>
							<select
								value={sampleRate}
								onChange={(e) => setSampleRate(Number(e.target.value))}
								data-testid="seq-samplerate-select"
								style={{
									padding: '6px 8px',
									background: 'var(--color-surface-subtle, #282828)',
									color: 'var(--color-ink, #fff)',
									border: '1px solid var(--color-stroke, #444)',
									borderRadius: '4px'
								}}
							>
								<option value="44100">44,100 Hz (CD)</option>
								<option value="48000">48,000 Hz (Pro Video)</option>
							</select>
						</label>
					</div>
				</fieldset>

				<div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
					<button
						type="button"
						onClick={close}
						style={{
							padding: '6px 14px',
							background: 'transparent',
							border: '1px solid var(--color-stroke, #444)',
							borderRadius: '4px',
							color: 'var(--color-ink, #fff)',
							cursor: 'pointer'
						}}
					>
						Cancel
					</button>
					<button
						type="submit"
						data-testid="seq-settings-save-button"
						style={{
							padding: '6px 14px',
							background: 'var(--color-accent, #3b82f6)',
							border: 'none',
							borderRadius: '4px',
							color: '#fff',
							fontWeight: 500,
							cursor: 'pointer'
						}}
					>
						Apply Settings
					</button>
				</div>
			</form>
		</dialog>
	);
}
