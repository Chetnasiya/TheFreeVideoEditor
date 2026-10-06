import { useEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from 'react';
import { useEditorStore } from '../../state/EditorProvider';

const PRESETS = {
	'1920x1080': { width: 1920, height: 1080 },
	'1280x720': { width: 1280, height: 720 },
	'3840x2160': { width: 3840, height: 2160 },
	'1080x1920': { width: 1080, height: 1920 },
	'1080x1080': { width: 1080, height: 1080 }
} as const;

export default function NewProjectDialog({ focusProjectTitle }: { focusProjectTitle: () => void }) {
	const open = useEditorStore((state) => state.isNewProjectDialogOpen);
	const project = useEditorStore((state) => state.project);
	const message = useEditorStore((state) => state.projectMessage);
	const createProject = useEditorStore((state) => state.createProject);
	const closeNewProjectDialog = useEditorStore((state) => state.closeNewProjectDialog);
	const setProjectMessage = useEditorStore((state) => state.setProjectMessage);
	const [name, setName] = useState('Untitled Project');
	const [resolution, setResolution] = useState<keyof typeof PRESETS>('1920x1080');
	const [fps, setFps] = useState(30);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const nameRef = useRef<HTMLInputElement>(null);
	const errorRef = useRef<HTMLParagraphElement>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			nameRef.current?.focus();
		}
		if (!open && dialog.open) {
			dialog.close();
			if (project) focusProjectTitle();
		}
	}, [focusProjectTitle, open, project]);

	useEffect(() => {
		if (open && message) errorRef.current?.focus();
	}, [message, open]);

	async function submit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault();
		setProjectMessage('');
		await createProject({ name, settings: { ...PRESETS[resolution], fps } });
	}

	return (
		<dialog
			ref={dialogRef}
			className="editor-dialog new-project-dialog"
			aria-labelledby="new-project-title"
			onCancel={(event) => {
				event.preventDefault();
				closeNewProjectDialog();
			}}
			onClick={(event: MouseEvent<HTMLDialogElement>) => {
				if (event.target === event.currentTarget) closeNewProjectDialog();
			}}
		>
			<form className="dialog-content" onSubmit={(event) => void submit(event)}>
				<div className="dialog-heading">
					<div>
						<p className="dialog-eyebrow">NEW EDIT</p>
						<h2 id="new-project-title">Create a Project</h2>
					</div>
					<button
						className="icon-button dialog-close"
						type="button"
						aria-label="Close new project dialog"
						onClick={closeNewProjectDialog}
					>
						×
					</button>
				</div>
				<label className="dialog-field">
					<span>Project name</span>
					<input
						ref={nameRef}
						type="text"
						name="project-name"
						autoComplete="off"
						maxLength={80}
						required
						value={name}
						aria-invalid={message.length > 0}
						aria-describedby={message ? 'new-project-error' : undefined}
						onChange={(event) => setName(event.currentTarget.value)}
					/>
				</label>
				<label className="dialog-field">
					<span>Resolution</span>
					<select
						name="resolution"
						value={resolution}
						onChange={(event) => setResolution(event.currentTarget.value as keyof typeof PRESETS)}
					>
						<option value="1920x1080">1080p · 1920 × 1080</option>
						<option value="1280x720">720p · 1280 × 720</option>
						<option value="3840x2160">4K · 3840 × 2160</option>
						<option value="1080x1920">Vertical · 1080 × 1920</option>
						<option value="1080x1080">Square · 1080 × 1080</option>
					</select>
				</label>
				<label className="dialog-field">
					<span>Frame rate</span>
					<select
						name="frame-rate"
						value={fps}
						onChange={(event) => setFps(Number(event.currentTarget.value))}
					>
						{[24, 25, 30, 60].map((rate) => (
							<option value={rate} key={rate}>
								{rate} fps
							</option>
						))}
					</select>
				</label>
				{message && (
					<p
						ref={errorRef}
						id="new-project-error"
						className="dialog-message"
						role="alert"
						tabIndex={-1}
					>
						{message}
					</p>
				)}
				<div className="dialog-actions">
					<button className="secondary-button" type="button" onClick={closeNewProjectDialog}>
						Cancel
					</button>
					<button className="primary-button" type="submit">
						Create project
					</button>
				</div>
			</form>
		</dialog>
	);
}
