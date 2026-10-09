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
import Inspector from '../inspector/Inspector';
import { importTfve } from '../../services/interop/native';
import {
	createEditorShortcutRegistry,
	detectShortcutPlatform,
	registerShortcutListener
} from '../../services/keyboard/registry';
import { openFile } from '../../services/storage/fileAccess';
import { clipEnd, framesToTicks, timelineDuration, isTransitionsEnabled } from '../../core';
import type { PlaybackEngine } from '../../services/playback/engine';
import type { ResizeHandle } from '../../state/store';
import PreviewWorkspace from '../preview/PreviewWorkspace';
import SourceMonitor from '../preview/SourceMonitor';
import ExportDialog from '../export/ExportDialog';
import SpeedDurationDialog from '../dialogs/SpeedDurationDialog';
import EffectsLibrary from '../effects/EffectsLibrary';
import ColorPanel from '../color/ColorPanel';
import { MixerPanel } from '../audio/MixerPanel';
import { CaptionsPanel } from '../captions/CaptionsPanel';

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
	const keyframeSelection = useEditorStore((state) => state.keyframes.selection);
	const keyframeClipboard = useEditorStore((state) => state.keyframes.clipboard);
	const effectsClipboard = useEditorStore((state) => state.effectsClipboard);
	const selectedClipIds = useEditorStore((state) => state.timeline.selection.clipIds);
	const [isEditMenuOpen, setIsEditMenuOpen] = useState(false);
	const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
	const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
	const [leftTab, setLeftTab] = useState<'project' | 'effects' | 'captions'>('project');
	const [inspectorTab, setInspectorTab] = useState<'properties' | 'color'>('properties');
	const shortcutReturnFocusRef = useRef<HTMLElement | null>(null);
	const shortcutPlatform = detectShortcutPlatform();
	const undoShortcut = shortcutPlatform === 'mac' ? '⌘Z' : 'Ctrl+Z';
	const redoShortcut = shortcutPlatform === 'mac' ? '⌘⇧Z' : 'Ctrl+Shift+Z';
	const fileMenuButtonRef = useRef<HTMLButtonElement>(null);
	const editMenuButtonRef = useRef<HTMLButtonElement>(null);
	const helpMenuButtonRef = useRef<HTMLButtonElement>(null);
	const menuBarRef = useRef<HTMLElement>(null);
	const projectNameButtonRef = useRef<HTMLButtonElement>(null);
	const projectNameInputRef = useRef<HTMLInputElement>(null);
	const playbackRef = useRef<PlaybackEngine | null>(null);
	const [playbackEngine, setPlaybackEngine] = useState<PlaybackEngine | null>(null);
	const onPlaybackEngineChange = useCallback((engine: PlaybackEngine | null) => {
		playbackRef.current = engine;
		setPlaybackEngine(engine);
	}, []);

	const [isAppFullscreen, setIsAppFullscreen] = useState(false);

	useEffect(() => {
		const handleFsChange = () => {
			setIsAppFullscreen(Boolean(document.fullscreenElement));
		};
		document.addEventListener('fullscreenchange', handleFsChange);
		return () => document.removeEventListener('fullscreenchange', handleFsChange);
	}, []);

	const toggleAppFullscreen = useCallback(() => {
		if (!document.fullscreenElement) {
			void document.documentElement.requestFullscreen?.().catch(() => {});
		} else {
			void document.exitFullscreen?.().catch(() => {});
		}
	}, []);

	const closeAllMenus = useCallback(() => {
		closeFileMenu();
		setIsEditMenuOpen(false);
		setIsHelpMenuOpen(false);
	}, [closeFileMenu]);

	useEffect(() => {
		if (!isFileMenuOpen && !isEditMenuOpen && !isHelpMenuOpen) return;

		const handlePointerDown = (event: globalThis.PointerEvent) => {
			const target = event.target;
			if (target instanceof Node && menuBarRef.current?.contains(target)) {
				return;
			}
			closeAllMenus();
		};

		window.addEventListener('pointerdown', handlePointerDown);
		return () => {
			window.removeEventListener('pointerdown', handlePointerDown);
		};
	}, [isFileMenuOpen, isEditMenuOpen, isHelpMenuOpen, closeAllMenus]);

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
			delete: () => {
				const current = state();
				if (current.keyframes.selection.length > 0) {
					current.deleteSelectedKeyframes();
					return;
				}
				current.deleteSelection();
			},
			'ripple-delete': () => state().rippleDeleteSelection(),
			duplicate: () => state().duplicateSelection(),
			'speed-duration': () => {
				const current = state();
				const clipId = current.timeline.selection.clipIds[0];
				if (clipId) current.openSpeedDialog(clipId);
			},
			'add-freeze-frame': () => {
				const current = state();
				const clipId = current.timeline.selection.clipIds[0];
				if (clipId) current.addFreezeFrame(clipId);
			},
			'freeze-frame-to-end': () => {
				const current = state();
				const clipId = current.timeline.selection.clipIds[0];
				if (clipId) current.freezeFrameToEnd(clipId);
			},
			'add-default-transition': () => state().applyDefaultTransition(),
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
			'new-text-clip': () => state().addTextClip(),
			'add-caption': () => state().addCaptionAtPlayhead(),
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
			'cheat-sheet': openShortcutsDialog,
			'toggle-keyframe': () => {
				const current = state();
				const clipId = current.timeline.selection.clipIds[0];
				if (!clipId || !current.project) return;
				const clip = current.project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
				if (!clip) return;
				const animatedProps = Object.entries(clip.properties ?? {}).filter(
					([, v]) => typeof v === 'object' && v !== null && 'keyframes' in v
				);
				if (animatedProps.length > 0) {
					for (const [propId] of animatedProps) current.toggleKeyframe(clipId, propId);
				} else {
					current.toggleKeyframe(clipId, 'position');
				}
			},
			'prev-keyframe': () => {
				state().prevKeyframe();
			},
			'next-keyframe': () => {
				state().nextKeyframe();
			},
			'easy-ease': () => {
				state().easyEase();
			},
			'toggle-graph-editor': () => {
				state().toggleGraphEditor();
			},
			'toggle-keyframe-lanes': () => {
				state().toggleKeyframeLanes();
			},
			'toggle-scopes': () => {
				state().toggleScopesOpen();
			},
			'toggle-mixer': () => {
				state().toggleMixer();
			},
			'reset-fader': () => {
				const current = state();
				const trackId = current.timeline.selection.trackId;
				if (trackId) {
					current.setTrackAudioGain(trackId, 0);
				} else {
					current.setMasterAudioGain(0);
				}
			},
			'mute-track': () => {
				const current = state();
				const trackId = current.timeline.selection.trackId;
				if (trackId && current.project) {
					const track = current.project.tracks.find((t) => t.id === trackId);
					if (track) current.setTimelineTrackFlags(trackId, { muted: !track.muted });
				}
			},
			'solo-track': () => {
				const current = state();
				const trackId = current.timeline.selection.trackId;
				if (trackId) current.setTrackAudioSolo(trackId);
			}
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
					<nav ref={menuBarRef} className="menu-bar" aria-label="Application menu">
						<div className="file-menu">
							<button
								ref={fileMenuButtonRef}
								className="menu-button"
								type="button"
								aria-haspopup="menu"
								aria-expanded={isFileMenuOpen}
								onClick={() => {
									setIsEditMenuOpen(false);
									setIsHelpMenuOpen(false);
									toggleFileMenu();
								}}
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
								onClick={() => {
									closeFileMenu();
									setIsHelpMenuOpen(false);
									setIsEditMenuOpen((open) => !open);
								}}
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
									{isTransitionsEnabled() && (
										<button
											type="button"
											role="menuitem"
											disabled={!project}
											onClick={() => {
												editorStore.getState().applyDefaultTransition();
												setIsEditMenuOpen(false);
											}}
										>
											Add Default Transition <span>⇧⌘/Ctrl+D</span>
										</button>
									)}
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
									<hr />
									<button
										type="button"
										role="menuitem"
										disabled={!project || selectedClipIds.length === 0}
										onClick={() => {
											const current = editorStore.getState();
											const clipId = current.timeline.selection.clipIds[0];
											if (clipId) current.openSpeedDialog(clipId);
											setIsEditMenuOpen(false);
										}}
									>
										Speed / Duration… <span>⌥R / Alt+R</span>
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={!project || selectedClipIds.length === 0}
										onClick={() => {
											const current = editorStore.getState();
											const clipId = current.timeline.selection.clipIds[0];
											if (clipId) current.addFreezeFrame(clipId);
											setIsEditMenuOpen(false);
										}}
									>
										Add Freeze Frame <span>Shift+F</span>
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={!project || selectedClipIds.length === 0}
										onClick={() => {
											const current = editorStore.getState();
											const clipId = current.timeline.selection.clipIds[0];
											if (clipId) current.freezeFrameToEnd(clipId);
											setIsEditMenuOpen(false);
										}}
									>
										Freeze Frame to End of Clip <span>⌥Shift+F</span>
									</button>
									<hr />
									<button
										type="button"
										role="menuitem"
										disabled={!project || selectedClipIds.length === 0}
										onClick={() => {
											const current = editorStore.getState();
											const clipId = current.timeline.selection.clipIds[0];
											if (clipId && current.project) {
												const clip = current.project.tracks
													.flatMap((t) => t.clips)
													.find((c) => c.id === clipId);
												if (clip) {
													const animatedProps = Object.entries(clip.properties ?? {}).filter(
														([, v]) => typeof v === 'object' && v !== null && 'keyframes' in v
													);
													if (animatedProps.length > 0) {
														for (const [propId] of animatedProps)
															current.toggleKeyframe(clipId, propId);
													} else {
														current.toggleKeyframe(clipId, 'position');
													}
												}
											}
											setIsEditMenuOpen(false);
										}}
									>
										Add / Remove Keyframe <span>⌥K</span>
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={!project}
										onClick={() => {
											editorStore.getState().prevKeyframe();
											setIsEditMenuOpen(false);
										}}
									>
										Previous Keyframe <span>⌥J</span>
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={!project}
										onClick={() => {
											editorStore.getState().nextKeyframe();
											setIsEditMenuOpen(false);
										}}
									>
										Next Keyframe <span>⌥L</span>
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={!project || keyframeSelection.length === 0}
										onClick={() => {
											editorStore.getState().easyEase();
											setIsEditMenuOpen(false);
										}}
									>
										Easy Ease <span>F9</span>
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={!project || keyframeSelection.length === 0}
										onClick={() => {
											editorStore.getState().copySelectedKeyframes();
											setIsEditMenuOpen(false);
										}}
									>
										Copy Keyframes <span>⌘C</span>
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={!project || !keyframeClipboard || selectedClipIds.length === 0}
										onClick={() => {
											editorStore.getState().pasteKeyframes();
											setIsEditMenuOpen(false);
										}}
									>
										Paste Keyframes <span>⌘V</span>
									</button>
									<hr />
									<button
										type="button"
										role="menuitem"
										disabled={!project}
										onClick={() => {
											editorStore.getState().addAdjustmentLayer();
											setIsEditMenuOpen(false);
										}}
									>
										Add Adjustment Layer
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={!project}
										onClick={() => {
											editorStore.getState().addSolidLayer();
											setIsEditMenuOpen(false);
										}}
									>
										Add Solid Color...
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={!project}
										onClick={() => {
											editorStore.getState().addTextClip();
											setIsEditMenuOpen(false);
										}}
									>
										New → Text
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={!project || selectedClipIds.length === 0}
										onClick={() => {
											const clipId = selectedClipIds[0];
											if (clipId) editorStore.getState().copyClipEffects(clipId);
											setIsEditMenuOpen(false);
										}}
									>
										Copy Clip Effects
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={
											!project ||
											!effectsClipboard ||
											effectsClipboard.length === 0 ||
											selectedClipIds.length === 0
										}
										onClick={() => {
											const clipId = selectedClipIds[0];
											if (clipId) editorStore.getState().pasteClipEffects(clipId);
											setIsEditMenuOpen(false);
										}}
									>
										Paste Clip Effects
									</button>
									<hr />
									<button
										type="button"
										role="menuitem"
										disabled={!project}
										onClick={() => {
											editorStore.getState().toggleMixer();
											setIsEditMenuOpen(false);
										}}
									>
										Audio Mixer <span>⌥M / Alt+M</span>
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
								onClick={() => {
									closeFileMenu();
									setIsEditMenuOpen(false);
									setIsHelpMenuOpen((open) => !open);
								}}
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
							className="toolbar-button fullscreen-button"
							type="button"
							aria-label={isAppFullscreen ? 'Exit full screen' : 'Enter full screen'}
							title={isAppFullscreen ? 'Exit full screen' : 'Enter full screen'}
							onClick={toggleAppFullscreen}
						>
							<svg
								viewBox="0 0 16 16"
								width="13"
								height="13"
								fill="currentColor"
								aria-hidden="true"
								style={{
									marginRight: '4px',
									display: 'inline-block',
									verticalAlign: 'text-bottom'
								}}
							>
								{isAppFullscreen ? (
									<path d="M5.5 0a.5.5 0 0 1 .5.5v4A1.5 1.5 0 0 1 4.5 6h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5zm5 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 10 4.5v-4a.5.5 0 0 1 .5-.5zM0 10.5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 6 11.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zm10 1a1.5 1.5 0 0 1 1.5-1.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4z" />
								) : (
									<path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zm10-1a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1 0-1h4zm-10 15a.5.5 0 0 1-.5-.5v-4a.5.5 0 0 1 1 0v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5zm14.5 0a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 1 0v4z" />
								)}
							</svg>
							{isAppFullscreen ? 'Windowed' : 'Fullscreen'}
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
						<button
							type="button"
							className={`panel-tab ${leftTab === 'project' ? 'is-active' : ''}`}
							id="project-panel-title"
							onClick={() => setLeftTab('project')}
						>
							Project
						</button>
						<button
							type="button"
							className={`panel-tab ${leftTab === 'effects' ? 'is-active' : ''}`}
							id="effects-panel-title"
							onClick={() => setLeftTab('effects')}
						>
							Effects
						</button>
						<button
							type="button"
							className={`panel-tab ${leftTab === 'captions' ? 'is-active' : ''}`}
							id="captions-panel-title"
							onClick={() => setLeftTab('captions')}
						>
							Captions
						</button>
					</div>
					<div className="project-panel-content">
						{leftTab === 'project' ? (
							<MediaLibrary />
						) : leftTab === 'effects' ? (
							<EffectsLibrary />
						) : (
							<CaptionsPanel />
						)}
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
							<SourceMonitor engine={playbackEngine} />
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
						<button
							type="button"
							className={`panel-tab ${inspectorTab === 'properties' ? 'is-active' : ''}`}
							id="inspector-title"
							onClick={() => setInspectorTab('properties')}
						>
							Properties
						</button>
						<button
							type="button"
							className={`panel-tab ${inspectorTab === 'color' ? 'is-active' : ''}`}
							id="color-panel-title"
							onClick={() => setInspectorTab('color')}
						>
							Color
						</button>
					</div>
					{inspectorTab === 'properties' ? <Inspector /> : <ColorPanel />}
				</aside>

				{resizeHandle('timeline', 'Resize timeline height', 'horizontal')}

				<section id="timeline-panel" className="timeline-panel" aria-labelledby="timeline-title">
					<h2 id="timeline-title" className="sr-only">
						Timeline
					</h2>
					<Timeline />
				</section>
				<MixerPanel />
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
			<SpeedDurationDialog />
			{isShortcutsOpen && (
				<KeyboardShortcutsDialog entries={shortcutEntries} onClose={closeShortcutsDialog} />
			)}
		</div>
	);
}

export default EditorShell;
