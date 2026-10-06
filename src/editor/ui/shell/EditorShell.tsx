import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent,
	type SyntheticEvent
} from 'react';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import './editor-shell.css';
import ProjectManagerDialog from '../project/ProjectManagerDialog';
import NewProjectDialog from '../project/NewProjectDialog';
import RecoveryDialog from '../project/RecoveryDialog';
import SaveCopyPrompt from '../project/SaveCopyPrompt';
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog';
import MediaLibrary from '../media-library/MediaLibrary';
import Timeline from '../timeline/Timeline';
import { importTfve } from '../../services/interop/native';
import {
	createEditorShortcutRegistry,
	detectShortcutPlatform,
	registerShortcutListener
} from '../../services/keyboard/registry';
import { openFile } from '../../services/storage/fileAccess';
import { clipEnd, framesToTicks, timelineDuration } from '../../core';
import type { PlaybackEngine } from '../../services/playback/engine';
import type { ResizeHandle } from '../../state/store';
import PreviewWorkspace from '../preview/PreviewWorkspace';
import SourceMonitor from '../preview/SourceMonitor';
import ExportDialog from '../export/ExportDialog';

interface PanelLayoutStyle extends CSSProperties {
	'--media-panel-width': string;
	'--inspector-panel-width': string;
	'--timeline-panel-height': string;
}

const PANEL_LIMITS = {
	media: { min: 200, max: 420 },
	inspector: { min: 210, max: 400 },
	timeline: { min: 170, max: 460 }
} as const;

function EditorShell() {
	const editorStore = useEditorStoreApi();
	const theme = useEditorStore((state) => state.theme);
	const themeMessage = useEditorStore((state) => state.themeMessage);
	const mediaWidth = useEditorStore((state) => state.mediaWidth);
	const inspectorWidth = useEditorStore((state) => state.inspectorWidth);
	const timelineHeight = useEditorStore((state) => state.timelineHeight);
	const projectName = useEditorStore((state) => state.projectName);
	const project = useEditorStore((state) => state.project);
	const revision = useEditorStore((state) => state.revision);
	const history = useEditorStore((state) => state.history);
	const historyMessage = useEditorStore((state) => state.historyMessage);
	const projectNameDraft = useEditorStore((state) => state.projectNameDraft);
	const isRenaming = useEditorStore((state) => state.isRenaming);
	const isFileMenuOpen = useEditorStore((state) => state.isFileMenuOpen);
	const projectMessage = useEditorStore((state) => state.projectMessage);
	const saveStatus = useEditorStore((state) => state.saveStatus);
	const toggleTheme = useEditorStore((state) => state.toggleTheme);
	const beginRename = useEditorStore((state) => state.beginRename);
	const cancelRename = useEditorStore((state) => state.cancelRename);
	const toggleFileMenu = useEditorStore((state) => state.toggleFileMenu);
	const closeFileMenu = useEditorStore((state) => state.closeFileMenu);
	const setProjectNameDraft = useEditorStore((state) => state.setProjectNameDraft);
	const saveProjectName = useEditorStore((state) => state.saveProjectName);
	const resizePanel = useEditorStore((state) => state.resizePanel);
	const openProjectManager = useEditorStore((state) => state.openProjectManager);
	const openNewProjectDialog = useEditorStore((state) => state.openNewProjectDialog);
	const openExportDialog = useEditorStore((state) => state.openExportDialog);
	const isExporting = useEditorStore((state) => state.isExporting);
	const closeProject = useEditorStore((state) => state.closeProject);
	const duplicateProject = useEditorStore((state) => state.duplicateProject);
	const flushSave = useEditorStore((state) => state.flushSave);
	const openSaveCopyPrompt = useEditorStore((state) => state.openSaveCopyPrompt);
	const setProjectMessage = useEditorStore((state) => state.setProjectMessage);
	const replaceProject = useEditorStore((state) => state.replaceProject);
	const [isEditMenuOpen, setIsEditMenuOpen] = useState(false);
	const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
	const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
	const shortcutReturnFocusRef = useRef<HTMLElement | null>(null);
	const shortcutPlatform = detectShortcutPlatform();
	const undoShortcut = shortcutPlatform === 'mac' ? '⌘Z' : 'Ctrl+Z';
	const redoShortcut = shortcutPlatform === 'mac' ? '⌘⇧Z' : 'Ctrl+Shift+Z';
	const fileMenuButtonRef = useRef<HTMLButtonElement>(null);
	const editMenuButtonRef = useRef<HTMLButtonElement>(null);
	const helpMenuButtonRef = useRef<HTMLButtonElement>(null);
	const projectNameButtonRef = useRef<HTMLButtonElement>(null);
	const projectNameInputRef = useRef<HTMLInputElement>(null);
	const playbackRef = useRef<PlaybackEngine | null>(null);
	const onPlaybackEngineChange = useCallback((engine: PlaybackEngine | null) => {
		playbackRef.current = engine;
	}, []);

	useEffect(() => {
		if (isRenaming && projectMessage) projectNameInputRef.current?.focus();
	}, [isRenaming, projectMessage]);

	const layoutStyle: PanelLayoutStyle = {
		'--media-panel-width': `${mediaWidth}px`,
		'--inspector-panel-width': `${inspectorWidth}px`,
		'--timeline-panel-height': `${timelineHeight}px`
	};

	function commitProjectName(event: SyntheticEvent<HTMLFormElement>): void {
		event.preventDefault();
		saveProjectName();
	}

	const openShortcutsDialog = useCallback(() => {
		const activeElement = document.activeElement;
		shortcutReturnFocusRef.current =
			activeElement instanceof HTMLElement && activeElement.closest('[role="menu"]')
				? helpMenuButtonRef.current
				: activeElement instanceof HTMLElement
					? activeElement
					: null;
		setIsShortcutsOpen(true);
	}, []);

	const closeShortcutsDialog = useCallback(() => {
		setIsShortcutsOpen(false);
		requestAnimationFrame(() => {
			if (shortcutReturnFocusRef.current?.isConnected) shortcutReturnFocusRef.current.focus();
		});
	}, []);

	const shortcutEntries = useMemo(() => {
		const state = () => editorStore.getState();
		const seekEdit = (direction: -1 | 1) => {
			const playback = playbackRef.current;
			if (playback) {
				playback.jumpTo(direction < 0 ? 'prevEdge' : 'nextEdge');
				return;
			}
			const current = state();
			const edges =
				current.project?.tracks
					.flatMap((track) => track.clips.flatMap((clip) => [clip.start, clipEnd(clip)]))
					.toSorted((first, second) => first - second) ?? [];
			const next =
				direction < 0
					? edges.filter((time) => time < current.timeline.playhead).at(-1)
					: edges.find((time) => time > current.timeline.playhead);
			if (next !== undefined) current.setPlayhead(next);
		};
		const nudge = (direction: -1 | 1, seconds: boolean) => {
			const current = state();
			const project = current.project;
			const selected = current.timeline.selection.clipIds;
			if (!project || selected.length === 0) return;
			const delta = seconds ? 1_000_000 : framesToTicks(1, project.settings.fps);
			current.moveClips(selected, direction * delta);
		};
		return createEditorShortcutRegistry({
			'play-pause': () => playbackRef.current?.toggle(),
			pause: () => playbackRef.current?.pause(),
			'shuttle-back': () => playbackRef.current?.shuttle(-1),
			'shuttle-forward': () => playbackRef.current?.shuttle(1),
			loop: () => {
				const playback = playbackRef.current;
				if (playback) playback.setLoop(!playback.snapshot.looping);
			},
			mute: () => {
				const playback = playbackRef.current;
				if (playback) playback.setMuted(!playback.snapshot.muted);
			},
			'frame-step-back': () => {
				const current = state();
				const project = current.project;
				if (!project) return;
				if (playbackRef.current) playbackRef.current.stepFrames(-1);
				else
					current.setPlayhead(
						Math.max(0, current.timeline.playhead - framesToTicks(1, project.settings.fps))
					);
			},
			'frame-step-forward': () => {
				const current = state();
				const project = current.project;
				if (!project) return;
				if (playbackRef.current) playbackRef.current.stepFrames(1);
				else
					current.setPlayhead(current.timeline.playhead + framesToTicks(1, project.settings.fps));
			},
			'seek-second-back': () => {
				const current = state();
				if (playbackRef.current)
					playbackRef.current.seek(Math.max(0, playbackRef.current.snapshot.time - 1_000_000));
				else current.setPlayhead(Math.max(0, current.timeline.playhead - 1_000_000));
			},
			'seek-second-forward': () => {
				const current = state();
				if (playbackRef.current)
					playbackRef.current.seek(playbackRef.current.snapshot.time + 1_000_000);
				else current.setPlayhead(current.timeline.playhead + 1_000_000);
			},
			start: () => {
				if (playbackRef.current) playbackRef.current.jumpTo('start');
				else state().setPlayhead(0);
			},
			end: () => {
				if (playbackRef.current) playbackRef.current.jumpTo('end');
				else {
					const current = state();
					if (current.project) current.setPlayhead(timelineDuration(current.project));
				}
			},
			'previous-edit': () => seekEdit(-1),
			'next-edit': () => seekEdit(1),
			split: () => state().splitAtPlayhead(),
			delete: () => state().deleteSelection(),
			'ripple-delete': () => state().rippleDeleteSelection(),
			duplicate: () => state().duplicateSelection(),
			'select-all': () => {
				const current = state();
				current.selectClips(
					current.project?.tracks.flatMap((track) => track.clips.map((clip) => clip.id)) ?? []
				);
			},
			deselect: () => {
				const current = state();
				if (current.timeline.drag) current.cancelTimelineDrag();
				else current.clearSelection();
			},
			'zoom-in': () => {
				const current = state();
				current.setZoom(current.timeline.pixelsPerSecond * 1.1);
			},
			'zoom-out': () => {
				const current = state();
				current.setZoom(current.timeline.pixelsPerSecond / 1.1);
			},
			'zoom-fit': () => {
				const width = document.querySelector('.timeline-scroll')?.clientWidth ?? 800;
				state().zoomToFit(width);
			},
			'toggle-snap': () => state().toggleSnap(),
			'nudge-frame-back': () => nudge(-1, false),
			'nudge-frame-forward': () => nudge(1, false),
			'nudge-second-back': () => nudge(-1, true),
			'nudge-second-forward': () => nudge(1, true),
			'add-video-track': () => state().addTimelineTrack('video'),
			'add-audio-track': () => state().addTimelineTrack('audio'),
			undo: () => state().undo(),
			redo: () => state().redo(),
			'new-project': () => state().openNewProjectDialog(),
			'open-project': () => state().openProjectManager(),
			export: () => state().openExportDialog(),
			'save-project': () => {
				void (async () => {
					try {
						await state().flushSave();
						const current = state();
						if (current.project && !current.saveCopyPromptShown) current.openSaveCopyPrompt();
					} catch (error) {
						state().setProjectMessage(
							`Save failed. Retry when storage is available: ${error instanceof Error ? error.message : 'Unknown save error.'}`
						);
					}
				})();
			},
			'import-media': () => {
				document.querySelector<HTMLInputElement>('input[name="media-files"]')?.click();
			},
			'cheat-sheet': openShortcutsDialog
		});
	}, [editorStore, openShortcutsDialog]);

	useEffect(() => registerShortcutListener(shortcutEntries), [shortcutEntries]);

	async function openProjectFile(): Promise<void> {
		try {
			const file = await openFile('.tfve,application/zip');
			if (!file) return;
			const imported = await importTfve(file);
			const opened = await replaceProject(imported);
			if (opened && Object.keys(imported.assets).length > 0) {
				setProjectMessage(
					`Project opened. ${Object.keys(imported.assets).length} media asset(s) are offline because this project file does not include media.`
				);
			}
		} catch (error) {
			setProjectMessage(
				`Could not open the project file: ${error instanceof Error ? error.message : 'Unknown file error.'}`
			);
		}
		closeFileMenu();
	}

	function startResize(event: PointerEvent<HTMLDivElement>): void {
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function resizeWithPointer(handle: ResizeHandle, event: PointerEvent<HTMLDivElement>): void {
		if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

		if (handle === 'media') {
			resizePanel('media', event.movementX);
		} else if (handle === 'inspector') {
			resizePanel('inspector', -event.movementX);
		} else {
			resizePanel('timeline', -event.movementY);
		}
	}

	function resizeWithKeyboard(
		handle: ResizeHandle,
		event: ReactKeyboardEvent<HTMLDivElement>
	): void {
		const step = event.shiftKey ? 32 : 12;
		let delta = 0;

		if (handle === 'media' && event.key === 'ArrowRight') delta = step;
		if (handle === 'media' && event.key === 'ArrowLeft') delta = -step;
		if (handle === 'inspector' && event.key === 'ArrowLeft') delta = step;
		if (handle === 'inspector' && event.key === 'ArrowRight') delta = -step;
		if (handle === 'timeline' && event.key === 'ArrowUp') delta = step;
		if (handle === 'timeline' && event.key === 'ArrowDown') delta = -step;

		if (delta === 0) return;
		event.preventDefault();

		resizePanel(handle, delta);
	}

	function resizeHandle(
		handle: ResizeHandle,
		label: string,
		orientation: 'vertical' | 'horizontal'
	) {
		const value =
			handle === 'media' ? mediaWidth : handle === 'inspector' ? inspectorWidth : timelineHeight;
		const limits = PANEL_LIMITS[handle];

		return (
			<div
				className={`resize-handle resize-handle-${orientation}`}
				role="separator"
				tabIndex={0}
				aria-label={label}
				aria-orientation={orientation}
				aria-controls={
					handle === 'media'
						? 'media-panel'
						: handle === 'inspector'
							? 'inspector-panel'
							: 'timeline-panel'
				}
				aria-valuemin={limits.min}
				aria-valuemax={limits.max}
				aria-valuenow={value}
				onPointerDown={startResize}
				onPointerMove={(event) => resizeWithPointer(handle, event)}
				onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
				onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
				onKeyDown={(event) => resizeWithKeyboard(handle, event)}
			/>
		);
	}

	return (
		<div className="editor-app" style={layoutStyle}>
			<a className="skip-link" href="#editor-workspace">
				Skip to editor
			</a>

			<header className="editor-topbar">
				<div className="application-bar">
					<a className="brand-mark" href="/" aria-label="The Free Video Editor home">
						<span className="brand-glyph" aria-hidden="true">
							V
						</span>
					</a>
					<nav className="menu-bar" aria-label="Application menu">
						<div className="file-menu">
							<button
								ref={fileMenuButtonRef}
								className="menu-button"
								type="button"
								aria-haspopup="menu"
								aria-expanded={isFileMenuOpen}
								onClick={toggleFileMenu}
								onKeyDown={(event) => {
									if (event.key === 'Escape') closeFileMenu();
								}}
							>
								File
							</button>
							{isFileMenuOpen && (
								<div
									className="file-menu-items"
									role="menu"
									aria-label="File actions"
									onKeyDown={(event) => {
										if (event.key === 'Escape') {
											closeFileMenu();
											fileMenuButtonRef.current?.focus();
											event.preventDefault();
										}
									}}
								>
									<button type="button" role="menuitem" onClick={openNewProjectDialog}>
										New Project… <span>⌘/Ctrl+N</span>
									</button>
									<button type="button" role="menuitem" onClick={openProjectManager}>
										Open Project… <span>⌘/Ctrl+O</span>
									</button>
									<hr />
									<button
										type="button"
										role="menuitem"
										disabled={!project}
										title={!project ? 'Open a project before renaming it.' : undefined}
										onClick={() => {
											beginRename();
											closeFileMenu();
										}}
									>
										Rename Project…
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={!project}
										title={!project ? 'Open a project before duplicating it.' : undefined}
										onClick={() => {
											if (project) void duplicateProject(project.id);
											closeFileMenu();
										}}
									>
										Duplicate Project
									</button>
									<hr />
									<button
										type="button"
										role="menuitem"
										disabled={!project}
										title={!project ? 'Open a project before saving a copy.' : undefined}
										onClick={() => {
											openSaveCopyPrompt();
											closeFileMenu();
										}}
									>
										Save a Copy as .tfve…
									</button>
									<button type="button" role="menuitem" onClick={() => void openProjectFile()}>
										Open .tfve Project…
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={!project || isExporting}
										title={!project ? 'Open a project before exporting.' : undefined}
										onClick={() => openExportDialog()}
									>
										Export… <span>⌘/Ctrl+E</span>
									</button>
									<button
										type="button"
										role="menuitem"
										onClick={() => {
											document
												.querySelector<HTMLInputElement>('input[name="media-files"]')
												?.click();
											closeFileMenu();
										}}
									>
										Import Media… <span>⌘/Ctrl+I</span>
									</button>
									<hr />
									<button
										type="button"
										role="menuitem"
										disabled={!project}
										title={!project ? 'No project is currently open.' : undefined}
										onClick={() => {
											void closeProject();
											closeFileMenu();
										}}
									>
										Close Project
									</button>
								</div>
							)}
						</div>
						<div className="application-menu">
							<button
								ref={editMenuButtonRef}
								className="menu-button"
								type="button"
								aria-haspopup="menu"
								aria-expanded={isEditMenuOpen}
								onClick={() => setIsEditMenuOpen((open) => !open)}
							>
								Edit
							</button>
							{isEditMenuOpen && (
								<div
									className="file-menu-items application-menu-items"
									role="menu"
									aria-label="Edit actions"
									onKeyDown={(event) => {
										if (event.key === 'Escape') {
											setIsEditMenuOpen(false);
											editMenuButtonRef.current?.focus();
											event.preventDefault();
										}
									}}
								>
									<button
										type="button"
										role="menuitem"
										disabled={!history.canUndo}
										title={
											history.canUndo
												? `Undo ${history.undoLabel} ${undoShortcut}`
												: `Nothing to undo (${undoShortcut}).`
										}
										onClick={() => {
											editorStore.getState().undo();
											setIsEditMenuOpen(false);
										}}
									>
										Undo <span>{undoShortcut}</span>
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={!history.canRedo}
										title={
											history.canRedo
												? `Redo ${history.redoLabel} ${redoShortcut}`
												: `Nothing to redo (${redoShortcut}).`
										}
										onClick={() => {
											editorStore.getState().redo();
											setIsEditMenuOpen(false);
										}}
									>
										Redo <span>{redoShortcut}</span>
									</button>
									<hr />
									<button
										type="button"
										role="menuitem"
										disabled={!project}
										onClick={() => {
											const current = editorStore.getState();
											current.selectClips(
												current.project?.tracks.flatMap((track) =>
													track.clips.map((clip) => clip.id)
												) ?? []
											);
											setIsEditMenuOpen(false);
										}}
									>
										Select All <span>⌘/Ctrl+A</span>
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={!project}
										onClick={() => {
											editorStore.getState().duplicateSelection();
											setIsEditMenuOpen(false);
										}}
									>
										Duplicate <span>⌘/Ctrl+D</span>
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={!project}
										onClick={() => {
											editorStore.getState().deleteSelection();
											setIsEditMenuOpen(false);
										}}
									>
										Delete <span>Delete</span>
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={!project}
										onClick={() => {
											editorStore.getState().rippleDeleteSelection();
											setIsEditMenuOpen(false);
										}}
									>
										Ripple Delete <span>Shift+Delete</span>
									</button>
								</div>
							)}
						</div>
						<div className="application-menu">
							<button
								ref={helpMenuButtonRef}
								className="menu-button"
								type="button"
								aria-haspopup="menu"
								aria-expanded={isHelpMenuOpen}
								onClick={() => setIsHelpMenuOpen((open) => !open)}
							>
								Help
							</button>
							{isHelpMenuOpen && (
								<div
									className="file-menu-items application-menu-items"
									role="menu"
									aria-label="Help actions"
									onKeyDown={(event) => {
										if (event.key === 'Escape') {
											setIsHelpMenuOpen(false);
											helpMenuButtonRef.current?.focus();
											event.preventDefault();
										}
									}}
								>
									<button
										type="button"
										role="menuitem"
										onClick={() => {
											setIsHelpMenuOpen(false);
											openShortcutsDialog();
										}}
									>
										Keyboard Shortcuts… <span>?</span>
									</button>
								</div>
							)}
						</div>
					</nav>
					<div className="project-title" role="group" aria-label="Current project">
						{isRenaming && project ? (
							<form className="project-rename-form" onSubmit={commitProjectName}>
								<label className="sr-only" htmlFor="project-name-input">
									Project name
								</label>
								<input
									ref={projectNameInputRef}
									id="project-name-input"
									name="project-name"
									type="text"
									autoComplete="off"
									maxLength={80}
									value={projectNameDraft}
									aria-invalid={projectMessage.length > 0}
									aria-describedby={projectMessage ? 'project-name-message' : undefined}
									onChange={(event) => setProjectNameDraft(event.currentTarget.value)}
									onKeyDown={(event) => {
										if (event.key === 'Escape') cancelRename();
									}}
								/>
								<button className="rename-save" type="submit">
									Save
								</button>
								<button className="rename-cancel" type="button" onClick={cancelRename}>
									Cancel
								</button>
								{projectMessage && (
									<span className="rename-error" role="alert">
										{projectMessage}
									</span>
								)}
							</form>
						) : project ? (
							<>
								<h1 id="project-title">
									<button
										ref={projectNameButtonRef}
										className="project-name-trigger"
										type="button"
										onClick={beginRename}
										aria-label={`Rename project: ${projectName}`}
										title="Rename project"
									>
										{projectName}
									</button>
								</h1>
								<span className="project-status">On this device</span>
							</>
						) : (
							<h1 id="project-title">No project open</h1>
						)}
					</div>
					<div className="topbar-actions">
						<button
							className="toolbar-button history-button"
							type="button"
							aria-label="Undo"
							title={
								history.canUndo
									? `Undo ${history.undoLabel} ${undoShortcut}`
									: `Nothing to undo (${undoShortcut}).`
							}
							disabled={!history.canUndo}
							onClick={() => editorStore.getState().undo()}
						>
							<span aria-hidden="true">↶</span>
						</button>
						<button
							className="toolbar-button history-button"
							type="button"
							aria-label="Redo"
							title={
								history.canRedo
									? `Redo ${history.redoLabel} ${redoShortcut}`
									: `Nothing to redo (${redoShortcut}).`
							}
							disabled={!history.canRedo}
							onClick={() => editorStore.getState().redo()}
						>
							<span aria-hidden="true">↷</span>
						</button>
						{project &&
							(saveStatus === 'error' ? (
								<button
									className="save-status save-status-error"
									type="button"
									onClick={() =>
										void flushSave().catch((error: unknown) =>
											setProjectMessage(
												`Save failed. Retry when storage is available: ${error instanceof Error ? error.message : 'Unknown save error.'}`
											)
										)
									}
									aria-live="polite"
									title="Retry saving this project"
								>
									Save failed, retry
								</button>
							) : (
								<span
									className={`save-status save-status-${saveStatus}`}
									role="status"
									aria-live="polite"
								>
									{saveStatus === 'saving'
										? 'Saving…'
										: saveStatus === 'unsaved'
											? 'Unsaved changes'
											: 'Saved'}
								</span>
							))}
						<button
							className="toolbar-button theme-button"
							type="button"
							aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
							onClick={toggleTheme}
						>
							<span className="theme-indicator" aria-hidden="true" />
							{theme === 'dark' ? 'Light' : 'Dark'}
						</button>
						<button
							className="export-button"
							type="button"
							disabled={!project || isExporting}
							title={
								!project
									? 'Open a project before exporting.'
									: 'Export video or project interchange files'
							}
							onClick={openExportDialog}
						>
							{isExporting ? 'Exporting…' : 'Export'}
						</button>
					</div>
				</div>

				<nav className="workspace-bar" aria-label="Workspace layout">
					<span className="workspace-tab is-active" aria-current="page">
						Editing
					</span>
					<span className="workspace-spacer" />
					{project && (
						<span className="workspace-resolution">
							Sequence 01 <span>·</span> {project.settings.width} × {project.settings.height}
						</span>
					)}
				</nav>
			</header>

			<main
				id="editor-workspace"
				className="editor-workspace"
				style={layoutStyle}
				aria-label="Video editing workspace"
			>
				<section
					id="media-panel"
					className="workspace-panel media-panel"
					aria-labelledby="project-panel-title"
				>
					<div className="panel-tabs" role="group" aria-label="Project panel">
						<span className="panel-tab is-active" id="project-panel-title" aria-current="page">
							Project
						</span>
					</div>
					<div className="project-panel-content">
						<MediaLibrary />
					</div>
				</section>

				{resizeHandle('media', 'Resize media library panel', 'vertical')}

				<section className="monitor-panel" aria-label="Video monitors">
					<div className="monitor monitor-source" aria-labelledby="source-title">
						<div className="monitor-heading">
							<h2 id="source-title">Source</h2>
							<span className="panel-meta">Project media</span>
						</div>
						<div className="monitor-stage">
							<SourceMonitor />
						</div>
					</div>

					<div className="monitor monitor-program" aria-labelledby="program-title">
						<div className="monitor-heading">
							<h2 id="program-title">Program</h2>
							<span className="panel-meta">
								{project ? `${project.settings.width} × ${project.settings.height}` : 'No sequence'}
							</span>
						</div>
						<div className="monitor-stage">
							<PreviewWorkspace
								project={project}
								revision={revision}
								onEngineChange={onPlaybackEngineChange}
							/>
						</div>
					</div>
				</section>

				{resizeHandle('inspector', 'Resize inspector panel', 'vertical')}

				<aside
					id="inspector-panel"
					className="workspace-panel inspector-panel"
					aria-labelledby="inspector-title"
				>
					<div className="panel-tabs" role="group" aria-label="Utility panel">
						<span className="panel-tab is-active" id="inspector-title" aria-current="page">
							Properties
						</span>
					</div>
					<div className="inspector-empty">
						<div className="properties-section">
							<h3>Clip Properties</h3>
							<p>
								{project
									? 'Clip selection and properties editing are planned for a later phase.'
									: 'Open a project to view its properties.'}
							</p>
						</div>
						{project && (
							<div className="properties-section">
								<h3>Sequence</h3>
								<dl className="sequence-details">
									<div>
										<dt>Frame size</dt>
										<dd>
											{project.settings.width} × {project.settings.height}
										</dd>
									</div>
									<div>
										<dt>Frame rate</dt>
										<dd>{project.settings.fps} fps</dd>
									</div>
									<div>
										<dt>Audio sample rate</dt>
										<dd>{project.settings.sampleRate.toLocaleString()} Hz</dd>
									</div>
								</dl>
							</div>
						)}
					</div>
				</aside>

				{resizeHandle('timeline', 'Resize timeline height', 'horizontal')}

				<section id="timeline-panel" className="timeline-panel" aria-labelledby="timeline-title">
					<h2 id="timeline-title" className="sr-only">
						Timeline
					</h2>
					<Timeline />
				</section>
			</main>

			<p id="project-name-message" className="sr-only" role="status" aria-live="polite">
				{projectMessage || themeMessage}
			</p>
			<p className="sr-only" role="status" aria-live="polite">
				{historyMessage}
			</p>
			<ProjectManagerDialog />
			<NewProjectDialog focusProjectTitle={() => projectNameButtonRef.current?.focus()} />
			<RecoveryDialog />
			<SaveCopyPrompt />
			<ExportDialog />
			{isShortcutsOpen && (
				<KeyboardShortcutsDialog entries={shortcutEntries} onClose={closeShortcutsDialog} />
			)}
		</div>
	);
}

export default EditorShell;
