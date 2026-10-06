import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { streamTfve, exportTfve } from '../../services/interop/native';
import {
	createStreamingSaveTarget,
	saveFile,
	type StreamingSaveTarget
} from '../../services/storage/fileAccess';
import { projectMediaSize } from '../../services/storage/opfs';
import { useEditorStore } from '../../state/EditorProvider';

const TFVE_TYPES = [
	{
		description: 'The Free Video Editor project',
		accept: { 'application/zip': ['.tfve'] }
	}
];
const LARGE_FILE_WARNING_BYTES = 500 * 1024 * 1024;

export default function SaveCopyPrompt() {
	const open = useEditorStore((state) => state.isSaveCopyPromptOpen);
	const project = useEditorStore((state) => state.project);
	const projectId = project?.id;
	const close = useEditorStore((state) => state.closeSaveCopyPrompt);
	const flushSave = useEditorStore((state) => state.flushSave);
	const setProjectMessage = useEditorStore((state) => state.setProjectMessage);
	const [includeMedia, setIncludeMedia] = useState(true);
	const [mediaBytes, setMediaBytes] = useState(0);
	const [confirmLargeExport, setConfirmLargeExport] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			setConfirmLargeExport(false);
		}
		if (!open && dialog.open) dialog.close();
	}, [open]);

	useEffect(() => {
		if (!projectId || !open) return;
		let active = true;
		void projectMediaSize(projectId)
			.then((size) => {
				if (active) setMediaBytes(size);
			})
			.catch((error: unknown) => {
				if (active) {
					setProjectMessage(
						`Could not calculate media size: ${error instanceof Error ? error.message : 'Unknown storage error.'}`
					);
				}
			});
		return () => {
			active = false;
		};
	}, [open, projectId, setProjectMessage]);

	async function writeStreaming(
		target: StreamingSaveTarget,
		activeProject: NonNullable<typeof project>
	): Promise<void> {
		try {
			await streamTfve(activeProject, { includeMedia }, (chunk) => target.write(chunk));
			await target.close();
			setProjectMessage(
				includeMedia
					? 'Project and media saved in a portable .tfve file.'
					: 'Project saved. Media files were not included.'
			);
		} catch (error) {
			await target.abort(error);
			throw error;
		}
	}

	async function saveCopy(): Promise<void> {
		if (!project || isSaving) return;
		const activeProject = project;
		if (includeMedia && mediaBytes > LARGE_FILE_WARNING_BYTES && !confirmLargeExport) {
			setConfirmLargeExport(true);
			return;
		}
		setIsSaving(true);
		const filename = `${project.name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'project'}.tfve`;
		try {
			await flushSave();
			const target = await createStreamingSaveTarget(filename, TFVE_TYPES);
			if (target) {
				await writeStreaming(target, activeProject);
			} else {
				const blob = await exportTfve(project, { includeMedia });
				const result = await saveFile(blob, filename, TFVE_TYPES);
				if (result === 'saved') {
					setProjectMessage(
						includeMedia
							? 'Project and media saved in a portable .tfve file.'
							: 'Project saved. Media files were not included.'
					);
				}
			}
			close();
		} catch (error) {
			if (!(error instanceof DOMException && error.name === 'AbortError')) {
				setProjectMessage(
					`Could not save the project copy: ${error instanceof Error ? error.message : 'Unknown file error.'}`
				);
			}
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<dialog
			ref={dialogRef}
			className="editor-dialog save-copy-dialog"
			aria-labelledby="save-copy-title"
			onCancel={(event) => {
				event.preventDefault();
				close();
			}}
			onClick={(event: MouseEvent<HTMLDialogElement>) => {
				if (event.target === event.currentTarget) close();
			}}
		>
			<div className="dialog-content">
				<p className="dialog-eyebrow">LOCAL PROJECT</p>
				<h2 id="save-copy-title">Save a project copy?</h2>
				<p>
					Save a portable <code>.tfve</code> file that you can reopen on this device or another
					browser.
				</p>
				<label className="save-copy-include-media">
					<input
						type="checkbox"
						name="include-media"
						checked={includeMedia}
						onChange={(event) => setIncludeMedia(event.currentTarget.checked)}
					/>
					<span>
						Include media files (
						{new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
							mediaBytes / 1_000_000
						)}{' '}
						MB)
					</span>
				</label>
				{confirmLargeExport && (
					<p className="dialog-message" role="alert">
						This archive is larger than 500 MB. Your browser may need substantial memory to prepare
						the download. Continue?
					</p>
				)}
				<div className="dialog-actions">
					<button className="secondary-button" type="button" onClick={close}>
						Not Now
					</button>
					<button
						className="primary-button"
						type="button"
						onClick={() => void saveCopy()}
						disabled={isSaving}
					>
						{isSaving ? 'Saving…' : confirmLargeExport ? 'Continue Export' : 'Save Copy as .tfve'}
					</button>
				</div>
			</div>
		</dialog>
	);
}
