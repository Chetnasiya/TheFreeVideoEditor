import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useEditorStore } from '../../state/EditorProvider';
import { saveFile } from '../../services/storage/fileAccess';

export default function RecoveryDialog() {
	const recovery = useEditorStore((state) => state.recovery);
	const deleteCorruptProject = useEditorStore((state) => state.deleteCorruptProject);
	const setProjectMessage = useEditorStore((state) => state.setProjectMessage);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const [confirmingDelete, setConfirmingDelete] = useState(false);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (recovery && !dialog.open) dialog.showModal();
		if (!recovery && dialog.open) dialog.close();
	}, [recovery]);

	async function exportRaw(): Promise<void> {
		if (!recovery) return;
		try {
			const result = await saveFile(
				new Blob([recovery.rawJson], { type: 'application/json' }),
				`corrupt-project-${recovery.projectId}.json`,
				[{ description: 'JSON file', accept: { 'application/json': ['.json'] } }]
			);
			if (result === 'saved') setProjectMessage('Raw project JSON exported for recovery.');
		} catch (error) {
			setProjectMessage(
				`Could not export raw project JSON: ${error instanceof Error ? error.message : 'Unknown file error.'}`
			);
		}
	}

	return (
		<dialog
			ref={dialogRef}
			className="editor-dialog recovery-dialog"
			aria-labelledby="recovery-title"
			onCancel={(event) => event.preventDefault()}
			onClick={(event: MouseEvent<HTMLDialogElement>) => {
				if (event.target === event.currentTarget) event.preventDefault();
			}}
		>
			{recovery && (
				<div className="dialog-content">
					<p className="dialog-eyebrow">PROJECT RECOVERY</p>
					<h2 id="recovery-title">This project could not be opened</h2>
					<p>{recovery.message}</p>
					<p>
						The saved record is preserved. Export its raw JSON before deleting it if you want to
						attempt manual recovery.
					</p>
					{confirmingDelete ? (
						<div className="recovery-confirm" role="alert">
							<p>Delete this corrupt project record and its local media folder?</p>
							<div className="dialog-actions">
								<button
									className="secondary-button"
									type="button"
									onClick={() => setConfirmingDelete(false)}
								>
									Keep project
								</button>
								<button
									className="danger-button"
									type="button"
									onClick={() => void deleteCorruptProject()}
								>
									Delete corrupt project
								</button>
							</div>
						</div>
					) : (
						<div className="dialog-actions recovery-actions">
							<button className="secondary-button" type="button" onClick={() => void exportRaw()}>
								Export raw JSON
							</button>
							<button
								className="danger-button"
								type="button"
								onClick={() => setConfirmingDelete(true)}
							>
								Delete…
							</button>
						</div>
					)}
				</div>
			)}
		</dialog>
	);
}
