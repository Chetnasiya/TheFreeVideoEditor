import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type SyntheticEvent
} from 'react';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import './editor-shell.css';
import ProjectManagerDialog from '../project/ProjectManagerDialog';
import NewProjectDialog from '../project/NewProjectDialog';
import RecoveryDialog from '../project/RecoveryDialog';
import SaveCopyPrompt from '../project/SaveCopyPrompt';
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog';
import SpeedDurationDialog from '../dialogs/SpeedDurationDialog';
import SequenceSettingsDialog from '../dialogs/SequenceSettingsDialog';
import MarkerDialog from '../dialogs/MarkerDialog';
import ExportDialog from '../export/ExportDialog';
import PreviewWorkspace from '../preview/PreviewWorkspace';
import SourceMonitor from '../preview/SourceMonitor';
import Timeline from '../timeline/Timeline';
import WorkspaceShell from '../layout/WorkspaceShell';
import EditWorkspacesDialog from '../dialogs/EditWorkspacesDialog';
import { collectPanels } from '../layout/operations';
import { importTfve } from '../../services/interop/native';
import {
	createEditorShortcutRegistry,
	detectShortcutPlatform,
	registerShortcutListener
} from '../../services/keyboard/registry';
import { openFile } from '../../services/storage/fileAccess';
import { clipEnd, framesToTicks, timelineDuration, isTransitionsEnabled } from '../../core';
import type { PlaybackEngine } from '../../services/playback/engine';

interface PanelLayoutStyle extends CSSProperties {
	'--media-panel-width': string;
	'--inspector-panel-width': string;
	'--timeline-panel-height': string;
}

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
	const proxySuggestion = useEditorStore((state) => state.proxySuggestion);
	const acceptProxySuggestion = useEditorStore((state) => state.acceptProxySuggestion);
	const dismissProxySuggestion = useEditorStore((state) => state.dismissProxySuggestion);
	const activeLayout = useEditorStore((state) => state.activeLayout);
	const updateLayout = useEditorStore((state) => state.updateLayout);
	const maximizedPanelId = useEditorStore((state) => state.maximizedPanelId);
	const toggleMaximizePanel = useEditorStore((state) => state.toggleMaximizePanel);
	const togglePanelVisibility = useEditorStore((state) => state.togglePanelVisibility);
	const workspaces = useEditorStore((state) => state.workspaces);
	const activeWorkspaceId = useEditorStore((state) => state.activeWorkspaceId);
	const switchWorkspace = useEditorStore((state) => state.switchWorkspace);
	const resetWorkspaceLayout = useEditorStore((state) => state.resetWorkspaceLayout);
	const saveAsNewWorkspace = useEditorStore((state) => state.saveAsNewWorkspace);
	const workspaceMessage = useEditorStore((state) => state.workspaceMessage);

	const [isEditMenuOpen, setIsEditMenuOpen] = useState(false);
	const [isWindowMenuOpen, setIsWindowMenuOpen] = useState(false);
	const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
	const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
	const [isEditWorkspacesOpen, setIsEditWorkspacesOpen] = useState(false);
	const [isWorkspaceOverflowOpen, setIsWorkspaceOverflowOpen] = useState(false);
	const shortcutReturnFocusRef = useRef<HTMLElement | null>(null);
	const shortcutPlatform = detectShortcutPlatform();
	const undoShortcut = shortcutPlatform === 'mac' ? '⌘Z' : 'Ctrl+Z';
	const redoShortcut = shortcutPlatform === 'mac' ? '⌘⇧Z' : 'Ctrl+Shift+Z';
	const fileMenuButtonRef = useRef<HTMLButtonElement>(null);
	const editMenuButtonRef = useRef<HTMLButtonElement>(null);
	const windowMenuButtonRef = useRef<HTMLButtonElement>(null);
	const helpMenuButtonRef = useRef<HTMLButtonElement>(null);
	const menuBarRef = useRef<HTMLElement>(null);
	const workspaceOverflowRef = useRef<HTMLDivElement>(null);
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
		setIsWindowMenuOpen(false);
		setIsHelpMenuOpen(false);
		setIsWorkspaceOverflowOpen(false);
	}, [closeFileMenu]);

	useEffect(() => {
		if (
			!isFileMenuOpen &&
			!isEditMenuOpen &&
			!isWindowMenuOpen &&
			!isHelpMenuOpen &&
			!isWorkspaceOverflowOpen
		)
			return;

		const handlePointerDown = (event: globalThis.PointerEvent) => {
			const target = event.target;
			if (
				target instanceof Node &&
				(menuBarRef.current?.contains(target) || workspaceOverflowRef.current?.contains(target))
			) {
				return;
			}
			closeAllMenus();
		};

		window.addEventListener('pointerdown', handlePointerDown);
		return () => {
			window.removeEventListener('pointerdown', handlePointerDown);
		};
	}, [
		isFileMenuOpen,
		isEditMenuOpen,
		isWindowMenuOpen,
		isHelpMenuOpen,
		isWorkspaceOverflowOpen,
		closeAllMenus
	]);

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
				if (current.selectedMarkerIds && current.selectedMarkerIds.length > 0) {
					current.deleteMarkers(current.selectedMarkerIds);
					return;
				}
				if (current.selectedMarkerId) {
					current.deleteMarker(current.selectedMarkerId);
					return;
				}
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
			'tool-select': () => state().setActiveTimelineTool('select'),
			'tool-track-select': () => state().setActiveTimelineTool('track-select'),
			'tool-ripple': () => state().setActiveTimelineTool('ripple'),
			'tool-razor': () => state().setActiveTimelineTool('razor'),
			'tool-slip': () => state().setActiveTimelineTool('slip'),
			'tool-pen': () => state().setActiveTimelineTool('pen'),
			'tool-hand': () => state().setActiveTimelineTool('hand'),
			'new-text-clip': () => state().setActiveTimelineTool('type'),
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
			'toggle-proxies': () => {
				state().toggleProxiesEnabled();
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
			},
			'nest-selection': () => {
				const current = state();
				const clipIds = current.timeline.selection.clipIds;
				if (clipIds.length > 0) {
					const defaultName = `Sequence ${Object.keys(current.project?.sequences ?? {}).length + 1}`;
					const name = window.prompt('Name for nested sequence:', defaultName);
					if (name) {
						current.nestSelection(name);
					}
				}
			},
			'open-sequence-instance': () => {
				const current = state();
				const project = current.project;
				if (!project) return;
				const clipIds = current.timeline.selection.clipIds;
				if (clipIds.length === 0) return;
				const allClips = [
					...project.tracks.flatMap((t) => t.clips),
					...Object.values(project.sequences ?? {}).flatMap((s) => s.tracks.flatMap((t) => t.clips))
				];
				const selectedClip = allClips.find((c) => clipIds.includes(c.id));
				if (selectedClip?.source?.type === 'sequence') {
					current.openSequence(selectedClip.source.sequenceId);
				}
			},
			'go-up-sequence': () => {
				const current = state();
				current.closeSequence();
			},
			'workspace-1': () => {
				state().switchWorkspace('assembly');
			},
			'workspace-2': () => {
				state().switchWorkspace('editing');
			},
			'workspace-3': () => {
				state().switchWorkspace('color');
			},
			'workspace-4': () => {
				state().switchWorkspace('effects');
			},
			'workspace-5': () => {
				state().switchWorkspace('audio');
			},
			'workspace-6': () => {
				state().switchWorkspace('graphics');
			},
			'toggle-maximize-panel': () => {
				const current = state();
				// Toggle maximize active or program panel
				current.toggleMaximizePanel(current.maximizedPanelId ?? 'program');
			},
			'add-marker': () => {
				const current = state();
				const isPlaying = playbackRef.current?.snapshot.playing ?? false;
				const time =
					isPlaying && playbackRef.current
						? playbackRef.current.snapshot.time
						: current.timeline.playhead;
				current.addMarker(time);
			},
			'add-marker-edit': () => {
				const current = state();
				const isPlaying = playbackRef.current?.snapshot.playing ?? false;
				const time =
					isPlaying && playbackRef.current
						? playbackRef.current.snapshot.time
						: current.timeline.playhead;
				const id = current.addMarker(time);
				if (id) {
					current.openMarkerDialog(id);
				}
			},
			'next-marker': () => {
				const current = state();
				current.seekToNextMarker();
			},
			'prev-marker': () => {
				const current = state();
				current.seekToPrevMarker();
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

	return (
		<div className="editor-app editor-shell" style={layoutStyle}>
			<a className="skip-link" href="#editor-workspace">
				Skip to editor
			</a>

			<header className="editor-topbar">
				<div className="application-bar">
					<a className="brand-mark" href="/" aria-label="The Free Video Editor home">
						<span className="brand-glyph" aria-hidden="true">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.2"
								strokeLinecap="round"
								strokeLinejoin="round"
								style={{ width: '15px', height: '15px' }}
							>
								<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
								<path d="m6.2 5.3 3.1 3.9" />
								<path d="m12.4 3.4 3.1 4" />
								<path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
							</svg>
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
									setIsWindowMenuOpen(false);
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
									setIsWindowMenuOpen(false);
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
								ref={windowMenuButtonRef}
								className="menu-button"
								type="button"
								aria-haspopup="menu"
								aria-expanded={isWindowMenuOpen}
								onClick={() => {
									closeFileMenu();
									setIsEditMenuOpen(false);
									setIsHelpMenuOpen(false);
									setIsWindowMenuOpen((open) => !open);
								}}
							>
								Window
							</button>
							{isWindowMenuOpen && (
								<div
									className="file-menu-items application-menu-items"
									role="menu"
									aria-label="Window actions"
									onKeyDown={(event) => {
										if (event.key === 'Escape') {
											setIsWindowMenuOpen(false);
											windowMenuButtonRef.current?.focus();
											event.preventDefault();
										}
									}}
								>
									<div
										style={{
											padding: '4px 12px',
											fontSize: '11px',
											color: 'var(--color-mute, #888)',
											fontWeight: 600
										}}
									>
										WORKSPACES
									</div>
									<button
										type="button"
										role="menuitem"
										onClick={() => {
											setIsWindowMenuOpen(false);
											resetWorkspaceLayout();
										}}
									>
										Reset to Saved Layout
									</button>
									<button
										type="button"
										role="menuitem"
										onClick={() => {
											setIsWindowMenuOpen(false);
											const name = window.prompt('Enter name for new workspace:');
											if (name) saveAsNewWorkspace(name);
										}}
									>
										Save as New Workspace…
									</button>
									<button
										type="button"
										role="menuitem"
										onClick={() => {
											setIsWindowMenuOpen(false);
											setIsEditWorkspacesOpen(true);
										}}
									>
										Edit Workspaces…
									</button>
									<hr />
									<div
										style={{
											padding: '4px 12px',
											fontSize: '11px',
											color: 'var(--color-mute, #888)',
											fontWeight: 600
										}}
									>
										PANELS
									</div>
									{(
										[
											['media', 'Project / Media Library'],
											['effects', 'Effects'],
											['captions', 'Captions'],
											['source', 'Source Monitor'],
											['program', 'Program Monitor'],
											['inspector', 'Properties / Inspector'],
											['color', 'Color'],
											['mixer', 'Audio Mixer'],
											['timeline', 'Timeline'],
											['graph', 'Graph Editor']
										] as const
									).map(([panelId, title]) => {
										const visiblePanels = collectPanels(activeLayout);
										const isVisible = visiblePanels.includes(panelId);
										return (
											<button
												key={panelId}
												type="button"
												role="menuitem"
												onClick={() => {
													setIsWindowMenuOpen(false);
													togglePanelVisibility(panelId);
												}}
												style={{ display: 'flex', justifyContent: 'space-between' }}
											>
												<span>{title}</span>
												<span>{isVisible ? '✓' : ''}</span>
											</button>
										);
									})}
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
									setIsWindowMenuOpen(false);
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
								fill="none"
								stroke="currentColor"
								strokeWidth="1.6"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
								style={{
									marginRight: '5px',
									display: 'inline-block',
									verticalAlign: 'text-bottom'
								}}
							>
								{isAppFullscreen ? (
									/* Exit Fullscreen: inward corners */
									<path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
								) : (
									/* Enter Fullscreen: 4 expanding corner brackets */
									<path d="M2 6V2h4M10 2h4v4M2 10v4h4M14 10v4h-4" />
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

				<nav className="workspace-bar" aria-label="Workspace layout" role="tablist">
					<div className="workspace-bar-left" aria-hidden="true" />
					<div className="workspace-bar-center">
						{workspaces.order.map((wsId, idx) => {
							const customWs = workspaces.custom.find((c) => c.id === wsId);
							const nameMap: Record<string, string> = {
								assembly: 'Assembly',
								editing: 'Editing',
								color: 'Color',
								effects: 'Effects',
								audio: 'Audio',
								graphics: 'Graphics'
							};
							const name = customWs ? customWs.name : (nameMap[wsId] ?? wsId);
							const isActive = wsId === activeWorkspaceId;

							return (
								<button
									key={wsId}
									type="button"
									role="tab"
									aria-selected={isActive}
									data-active={isActive ? 'true' : undefined}
									className={`workspace-tab ${isActive ? 'is-active' : ''}`}
									tabIndex={isActive ? 0 : -1}
									onClick={() => switchWorkspace(wsId)}
									onKeyDown={(e) => {
										if (e.key === 'ArrowRight') {
											e.preventDefault();
											const next = workspaces.order[(idx + 1) % workspaces.order.length]!;
											switchWorkspace(next);
										} else if (e.key === 'ArrowLeft') {
											e.preventDefault();
											const prev =
												workspaces.order[
													(idx - 1 + workspaces.order.length) % workspaces.order.length
												]!;
											switchWorkspace(prev);
										} else if (e.key === 'Home') {
											e.preventDefault();
											switchWorkspace(workspaces.order[0]!);
										} else if (e.key === 'End') {
											e.preventDefault();
											switchWorkspace(workspaces.order[workspaces.order.length - 1]!);
										}
									}}
								>
									{name}
								</button>
							);
						})}
						<div
							ref={workspaceOverflowRef}
							style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
						>
							<button
								type="button"
								className="workspace-overflow-btn"
								aria-label="More workspaces and layout options"
								title="More workspaces"
								aria-haspopup="menu"
								aria-expanded={isWorkspaceOverflowOpen}
								onClick={() => setIsWorkspaceOverflowOpen((open) => !open)}
							>
								»
							</button>
							{isWorkspaceOverflowOpen && (
								<div
									className="workspace-overflow-menu"
									role="menu"
									aria-label="Workspace options"
									onKeyDown={(e) => {
										if (e.key === 'Escape') {
											setIsWorkspaceOverflowOpen(false);
											e.preventDefault();
										}
									}}
								>
									<button
										type="button"
										role="menuitem"
										className="workspace-overflow-item"
										onClick={() => {
											setIsWorkspaceOverflowOpen(false);
											resetWorkspaceLayout();
										}}
									>
										Reset to Saved Layout
									</button>
									<button
										type="button"
										role="menuitem"
										className="workspace-overflow-item"
										onClick={() => {
											setIsWorkspaceOverflowOpen(false);
											const name = window.prompt('Enter name for new workspace:');
											if (name) saveAsNewWorkspace(name);
										}}
									>
										Save as New Workspace…
									</button>
									<button
										type="button"
										role="menuitem"
										className="workspace-overflow-item"
										onClick={() => {
											setIsWorkspaceOverflowOpen(false);
											setIsEditWorkspacesOpen(true);
										}}
									>
										Edit Workspaces…
									</button>
								</div>
							)}
						</div>
					</div>
					<div className="workspace-bar-right">
						{project && (
							<span className="workspace-resolution">
								Sequence 01 <span>·</span> {project.settings.width} × {project.settings.height}
							</span>
						)}
					</div>
				</nav>
			</header>

			<main
				id="editor-workspace"
				className="editor-workspace"
				style={{ width: '100%', height: '100%', flex: 1, minHeight: 0, overflow: 'hidden' }}
				aria-label="Video editing workspace"
			>
				<WorkspaceShell
					layout={activeLayout}
					onLayoutChange={updateLayout}
					maximizedPanelId={maximizedPanelId}
					onToggleMaximize={toggleMaximizePanel}
					onClosePanel={togglePanelVisibility}
					keepAliveSlots={{
						program: (
							<PreviewWorkspace
								project={project}
								revision={revision}
								onEngineChange={onPlaybackEngineChange}
							/>
						),
						timeline: <Timeline />
					}}
					renderPanel={(panelId) => {
						if (panelId === 'source') {
							return <SourceMonitor engine={playbackEngine} />;
						}
						return undefined;
					}}
				/>
			</main>

			<p id="project-name-message" className="sr-only" role="status" aria-live="polite">
				{projectMessage || themeMessage || workspaceMessage}
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
			<SequenceSettingsDialog />
			<MarkerDialog />
			<EditWorkspacesDialog
				isOpen={isEditWorkspacesOpen}
				onClose={() => setIsEditWorkspacesOpen(false)}
			/>
			{isShortcutsOpen && (
				<KeyboardShortcutsDialog entries={shortcutEntries} onClose={closeShortcutsDialog} />
			)}
			{proxySuggestion && (
				<div
					className="editor-toast proxy-suggestion-toast"
					role="status"
					aria-live="polite"
					data-testid="proxy-suggestion-toast"
					style={{
						position: 'fixed',
						bottom: '24px',
						right: '24px',
						zIndex: 1000,
						backgroundColor: 'var(--color-surface, #1e1e1e)',
						border: '1px solid var(--color-hairline, #333333)',
						borderRadius: '6px',
						padding: '12px 16px',
						boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
						display: 'flex',
						flexDirection: 'column',
						gap: '8px',
						maxWidth: '380px',
						fontSize: '12px',
						color: 'var(--color-ink, #ffffff)'
					}}
				>
					<div style={{ fontWeight: 500 }}>
						High-resolution media imported: “{proxySuggestion.assetName}”
					</div>
					<div style={{ color: 'var(--color-mute, #888888)', fontSize: '11px' }}>
						Create a proxy for smoother playback and scrubbing? The original file is always used for
						export.
					</div>
					<div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
						<button
							className="primary-button"
							type="button"
							style={{ fontSize: '11px', padding: '4px 10px' }}
							onClick={acceptProxySuggestion}
						>
							Create Proxy
						</button>
						<button
							className="secondary-button"
							type="button"
							style={{ fontSize: '11px', padding: '4px 10px' }}
							onClick={() => dismissProxySuggestion(false)}
						>
							Not Now
						</button>
						<button
							className="secondary-button"
							type="button"
							style={{ fontSize: '11px', padding: '4px 10px' }}
							onClick={() => dismissProxySuggestion(true)}
						>
							Don't Ask Again
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

export default EditorShell;
