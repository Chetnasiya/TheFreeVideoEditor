import { useEffect, useMemo, useRef, useState, type MouseEvent, type SyntheticEvent } from 'react';
import { ticksToSeconds } from '../../core';
import type { ProjectId, ProjectSummary } from '../../core';
import { useEditorStore } from '../../state/EditorProvider';
import { importTfve } from '../../services/interop/native';
import { openFile } from '../../services/storage/fileAccess';

function relativeTime(timestamp: string): string {
	const seconds = Math.round((new Date(timestamp).getTime() - Date.now()) / 1_000);
	const units: [Intl.RelativeTimeFormatUnit, number][] = [
		['year', 31_536_000],
		['month', 2_592_000],
		['week', 604_800],
		['day', 86_400],
		['hour', 3_600],
		['minute', 60]
	];
	const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
	for (const [unit, secondsPerUnit] of units) {
		if (Math.abs(seconds) >= secondsPerUnit) {
			return formatter.format(Math.round(seconds / secondsPerUnit), unit);
		}
	}
	return formatter.format(seconds, 'second');
}

function durationLabel(ticks: number): string {
	const seconds = Math.floor(ticksToSeconds(ticks));
	const hours = Math.floor(seconds / 3_600);
	const minutes = Math.floor((seconds % 3_600) / 60);
	const remainder = seconds % 60;
	return [hours, minutes, remainder].map((part) => String(part).padStart(2, '0')).join(':');
}

function ProjectRow({
	project,
	onDelete
}: {
	project: ProjectSummary;
	onDelete: (id: ProjectId) => void;
}) {
	const currentId = useEditorStore((state) => state.project?.id ?? null);
	const openProject = useEditorStore((state) => state.openProject);
	const duplicateProject = useEditorStore((state) => state.duplicateProject);
	const renameSavedProject = useEditorStore((state) => state.renameSavedProject);
	const [isRenaming, setIsRenaming] = useState(false);
	const [name, setName] = useState(project.name);
	const renameRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isRenaming) renameRef.current?.focus();
	}, [isRenaming]);

	function submitRename(event: SyntheticEvent<HTMLFormElement>): void {
		event.preventDefault();
		void renameSavedProject(project.id, name).then((renamed) => {
			if (renamed) setIsRenaming(false);
		});
	}

	return (
		<li className="project-manager-row">
			<div className="project-row-name">
				{isRenaming ? (
					<form className="project-row-rename" onSubmit={submitRename}>
						<label className="sr-only" htmlFor={`rename-${project.id}`}>
							Project name
						</label>
						<input
							ref={renameRef}
							id={`rename-${project.id}`}
							name="project-name"
							autoComplete="off"
							maxLength={80}
							value={name}
							onChange={(event) => setName(event.currentTarget.value)}
						/>
						<button className="secondary-button" type="submit">
							Save
						</button>
						<button
							className="secondary-button"
							type="button"
							onClick={() => {
								setName(project.name);
								setIsRenaming(false);
							}}
						>
							Cancel
						</button>
					</form>
				) : (
					<>
						<strong title={project.name}>{project.name}</strong>
						<span>
							Updated {relativeTime(project.updatedAt)} · {durationLabel(project.duration)} ·{' '}
							{project.assetCount} {project.assetCount === 1 ? 'asset' : 'assets'}
						</span>
					</>
				)}
			</div>
			<div className="project-row-actions" role="group" aria-label={`${project.name} actions`}>
				<button
					className="secondary-button"
					type="button"
					disabled={currentId === project.id}
					title={currentId === project.id ? 'This project is already open' : undefined}
					onClick={() => void openProject(project.id)}
				>
					{currentId === project.id ? 'Open' : 'Open'}
				</button>
				<button className="secondary-button" type="button" onClick={() => setIsRenaming(true)}>
					Rename
				</button>
				<button
					className="secondary-button"
					type="button"
					onClick={() => void duplicateProject(project.id)}
				>
					Duplicate
				</button>
				<button
					className="secondary-button danger-button"
					type="button"
					onClick={() => onDelete(project.id)}
				>
					Delete
				</button>
			</div>
		</li>
	);
}

function DeleteProjectDialog({
	project,
	onCancel,
	onDelete
}: {
	project: ProjectSummary | null;
	onCancel: () => void;
	onDelete: () => void;
}) {
	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (project && !dialog.open) dialog.showModal();
		if (!project && dialog.open) dialog.close();
	}, [project]);

	return (
		<dialog
			ref={dialogRef}
			className="editor-dialog confirm-delete-dialog"
			aria-labelledby="delete-project-title"
			onCancel={(event) => {
				event.preventDefault();
				onCancel();
			}}
			onClick={(event: MouseEvent<HTMLDialogElement>) => {
				if (event.target === event.currentTarget) onCancel();
			}}
		>
			{project && (
				<div className="dialog-content">
					<h2 id="delete-project-title">Delete “{project.name}”?</h2>
					<p>
						This permanently deletes the project and its media storage from this device. This action
						cannot be undone.
					</p>
					<div className="dialog-actions">
						<button className="secondary-button" type="button" onClick={onCancel}>
							Keep project
						</button>
						<button className="danger-button" type="button" onClick={onDelete}>
							Delete project
						</button>
					</div>
				</div>
			)}
		</dialog>
	);
}

export default function ProjectManagerDialog() {
	const open = useEditorStore((state) => state.isProjectManagerOpen);
	const hasProject = useEditorStore((state) => state.project !== null);
	const projects = useEditorStore((state) => state.projects);
	const message = useEditorStore((state) => state.projectMessage);
	const refreshProjects = useEditorStore((state) => state.refreshProjects);
	const openNewProjectDialog = useEditorStore((state) => state.openNewProjectDialog);
	const closeProjectManager = useEditorStore((state) => state.closeProjectManager);
	const deleteProject = useEditorStore((state) => state.deleteProject);
	const replaceProject = useEditorStore((state) => state.replaceProject);
	const setProjectMessage = useEditorStore((state) => state.setProjectMessage);
	const [search, setSearch] = useState('');
	const [pendingDelete, setPendingDelete] = useState<ProjectId | null>(null);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const managerTitleRef = useRef<HTMLHeadingElement>(null);
	const pendingProject = projects.find((project) => project.id === pendingDelete) ?? null;
	const visibleProjects = useMemo(() => {
		const term = search.trim().toLocaleLowerCase();
		if (!term) return projects;
		return projects.filter((project) => project.name.toLocaleLowerCase().includes(term));
	}, [projects, search]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			managerTitleRef.current?.focus({ preventScroll: true });
		}
		if (!open && dialog.open) dialog.close();
	}, [open]);

	useEffect(() => {
		if (open) void refreshProjects();
	}, [open, refreshProjects]);

	function cancelManager(event: SyntheticEvent<HTMLDialogElement>): void {
		if (!hasProject) {
			event.preventDefault();
			return;
		}
		closeProjectManager();
	}

	async function openProjectFile(): Promise<void> {
		try {
			const file = await openFile('.tfve,application/zip');
			if (!file) return;
			const project = await importTfve(file);
			const opened = await replaceProject(project);
			if (opened && Object.keys(project.assets).length > 0) {
				setProjectMessage(
					`Project opened. ${Object.keys(project.assets).length} media asset(s) are offline because this project file does not include media.`
				);
			}
		} catch (error) {
			setProjectMessage(
				`Could not open the project file: ${error instanceof Error ? error.message : 'Unknown file error.'}`
			);
		}
	}

	return (
		<>
			<dialog
				ref={dialogRef}
				className="editor-dialog project-manager-dialog"
				aria-labelledby="project-manager-title"
				onCancel={cancelManager}
				onClick={(event) => {
					if (event.target === event.currentTarget && hasProject) closeProjectManager();
				}}
			>
				<div className="dialog-content">
					<div className="dialog-heading">
						<div>
							<p className="dialog-eyebrow">THE FREE VIDEO EDITOR</p>
							<h2
								id="project-manager-title"
								ref={managerTitleRef}
								tabIndex={-1}
								style={{ outline: 'none' }}
							>
								Your Projects
							</h2>
						</div>
						{hasProject && (
							<button
								className="icon-button dialog-close"
								type="button"
								aria-label="Close project manager"
								onClick={closeProjectManager}
							>
								×
							</button>
						)}
					</div>
					<p className="dialog-description">Projects stay in this browser on your device.</p>

					{projects.length > 8 && (
						<label className="project-search">
							<span className="sr-only">Search projects</span>
							<input
								type="search"
								name="project-search"
								autoComplete="off"
								placeholder="Search projects…"
								value={search}
								onChange={(event) => setSearch(event.currentTarget.value)}
							/>
						</label>
					)}

					{projects.length === 0 ? (
						<div className="project-manager-empty">
							<h3>No projects yet</h3>
							<p>Create a project to start your edit. Your project file stays on this device.</p>
							<button className="primary-button" type="button" onClick={openNewProjectDialog}>
								New project
							</button>
						</div>
					) : visibleProjects.length === 0 ? (
						<p className="project-manager-empty">No projects match “{search}”.</p>
					) : (
						<ul className="project-manager-list">
							{visibleProjects.map((project) => (
								<ProjectRow key={project.id} project={project} onDelete={setPendingDelete} />
							))}
						</ul>
					)}

					{message && (
						<p className="dialog-message" role="status" aria-live="polite">
							{message}
						</p>
					)}
					<div className="dialog-footer">
						<button
							className="secondary-button"
							type="button"
							onClick={() => void refreshProjects()}
						>
							Refresh list
						</button>
						<button
							className="secondary-button"
							type="button"
							onClick={() => void openProjectFile()}
						>
							Open .tfve project…
						</button>
						{projects.length > 0 && (
							<button className="primary-button" type="button" onClick={openNewProjectDialog}>
								New project
							</button>
						)}
					</div>
				</div>
			</dialog>

			<DeleteProjectDialog
				project={pendingProject}
				onCancel={() => setPendingDelete(null)}
				onDelete={() => {
					if (!pendingProject) return;
					void deleteProject(pendingProject.id).then((deleted) => {
						setPendingDelete(null);
						if (deleted) managerTitleRef.current?.focus();
					});
				}}
			/>
		</>
	);
}
