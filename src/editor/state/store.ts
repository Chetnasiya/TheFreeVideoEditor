import { createStore } from 'zustand/vanilla';
import { immer } from 'zustand/middleware/immer';
import { enablePatches, produceWithPatches } from 'immer';
import {
	createEmptyProject,
	duplicateProject as duplicateProjectData,
	createAssetId,
	getAssetUsage,
	migrate,
	renameAsset as renameProjectAsset,
	removeAsset as removeProjectAsset,
	relinkAsset as relinkProjectAsset,
	classifyMime,
	projectSchema,
	ticksToSeconds,
	framesToTicks,
	addClipFromAsset as addClipFromAssetOperation,
	addTrack as addTrackOperation,
	deleteClips as deleteClipsOperation,
	duplicateClips as duplicateClipsOperation,
	moveClips as moveClipsOperation,
	linkClips as linkClipsOperation,
	reorderTrack as reorderTrackOperation,
	removeTrack as removeTrackOperation,
	renameTrack as renameTrackOperation,
	rippleDeleteClips as rippleDeleteClipsOperation,
	setTrackFlags as setTrackFlagsOperation,
	splitClipsAt,
	trimClip as trimClipOperation,
	unlinkClips as unlinkClipsOperation,
	timelineDuration,
	groupOf,
	snapToFrame,
	type Asset,
	type AssetId,
	type Clip,
	type ClipId,
	type DragPosition,
	type DragSession,
	type Project,
	type ProjectId,
	type ProjectSettings,
	type ProjectSummary,
	type Time,
	type Track,
	type TrackId
} from '../core';
import {
	CorruptProjectError,
	deleteProject as deleteProjectRecord,
	getLastOpenedId,
	getProject,
	listProjects,
	saveProject as saveProjectRecord,
	setLastOpenedId
} from '../services/storage/projectDb';
import {
	copyProjectMedia,
	deleteProjectDir,
	ensureProjectDir,
	isSupported as isOpfsSupported,
	collectMediaGarbage,
	reconcileProjectMedia,
	writeMedia,
	deleteMediaFile
} from '../services/storage/opfs';
import { deleteDerived, deleteProjectDerived } from '../services/storage/mediaCache';
import { cancelProjectExport, isProjectExportActive } from '../services/export/session';
import { generateDerived, type DerivedStatus } from '../services/media/derived';
import {
	importFiles as runMediaImport,
	type ImportPhase,
	type ImportProgress,
	type ImportBatchResult
} from '../services/media/import';
import { probeMedia } from '../services/media/probe';
import { projectNameSchema } from '../services/project/projectName';
import { applyTheme, initializeTheme, type ThemeMode } from '../services/theme/theme';
import { clampPanelSize } from '../ui/shell/panelSizing';
import { createHistory, type HistorySnapshot } from './history';

enablePatches();

export type ResizeHandle = 'media' | 'inspector' | 'timeline';
export type SaveStatus = 'saved' | 'saving' | 'error' | 'unsaved';

const PANEL_LIMITS = {
	media: { min: 200, max: 420 },
	inspector: { min: 210, max: 400 },
	timeline: { min: 170, max: 460 }
} as const;

export interface ProjectOptions {
	name: string;
	settings?: Partial<ProjectSettings>;
}

export interface RecoveryState {
	projectId: ProjectId;
	rawJson: string;
	message: string;
}

export interface ImportJob {
	id: string;
	projectId: ProjectId;
	name: string;
	file: File;
	status: ImportPhase | 'cancelled';
	progress: number;
	reason?: string;
}

export interface MediaState {
	importQueue: ImportJob[];
	derivedStatus: Record<AssetId, DerivedStatus>;
	viewMode: 'grid' | 'list';
	search: string;
	selectedAssetIds: AssetId[];
}

export interface DeleteAssetResult {
	deleted: boolean;
	usage: Clip[];
}

export interface RelinkAssetResult {
	relinked: boolean;
	mismatch?: string;
}

export interface TimelineSelection {
	clipIds: ClipId[];
	trackId?: TrackId;
}

export interface TimelineState {
	pixelsPerSecond: number;
	scrollLeft: number;
	scrollTop: number;
	playhead: Time;
	selection: TimelineSelection;
	drag: DragSession | null;
	snapEnabled: boolean;
	rippleMode: false;
	message: string;
	followPlayhead: boolean;
}

export interface TimelineZoomAnchor {
	time: Time;
	pixel: number;
}

export interface TrackRemovalResult {
	removed: boolean;
	clipCount: number;
}

type ProjectRecipe = (project: Project) => Project;
type HistoryPolicy = 'record' | 'skip';

const EMPTY_HISTORY: HistorySnapshot = {
	canUndo: false,
	canRedo: false,
	undoLabel: null,
	redoLabel: null,
	size: 0
};

function createTimelineState(): TimelineState {
	return {
		pixelsPerSecond: 64,
		scrollLeft: 0,
		scrollTop: 0,
		playhead: 0,
		selection: { clipIds: [] },
		drag: null,
		snapEnabled: true,
		rippleMode: false,
		message: '',
		followPlayhead: false
	};
}

function projectClipPositions(project: Project, clipIds: readonly ClipId[]): DragPosition[] {
	const ids = new Set(clipIds);
	return project.tracks.flatMap((track) =>
		track.clips
			.filter((clip) => ids.has(clip.id))
			.map((clip) => ({
				clipId: clip.id,
				trackId: track.id,
				start: clip.start,
				duration: clip.duration,
				sourceIn: clip.sourceIn,
				sourceOut: clip.sourceOut
			}))
	);
}

export interface EditorState {
	theme: ThemeMode;
	themeMessage: string;
	mediaWidth: number;
	inspectorWidth: number;
	timelineHeight: number;
	projectName: string;
	projectNameDraft: string;
	isRenaming: boolean;
	isFileMenuOpen: boolean;
	projectMessage: string;
	project: Project | null;
	revision: number;
	projects: ProjectSummary[];
	saveStatus: SaveStatus;
	history: HistorySnapshot;
	historyMessage: string;
	isInitialized: boolean;
	isProjectManagerOpen: boolean;
	isNewProjectDialogOpen: boolean;
	isSaveCopyPromptOpen: boolean;
	saveCopyPromptShown: boolean;
	isExportDialogOpen: boolean;
	isExportClosePromptOpen: boolean;
	isExporting: boolean;
	recovery: RecoveryState | null;
	media: MediaState;
	timeline: TimelineState;
	initialize: () => Promise<void>;
	toggleTheme: () => void;
	beginRename: () => void;
	cancelRename: () => void;
	toggleFileMenu: () => void;
	closeFileMenu: () => void;
	setProjectNameDraft: (value: string) => void;
	saveProjectName: () => void;
	renameProject: (name: string) => void;
	renameSavedProject: (id: ProjectId, name: string) => Promise<boolean>;
	resizePanel: (handle: ResizeHandle, delta: number) => void;
	createProject: (options: ProjectOptions) => Promise<void>;
	openProject: (id: ProjectId) => Promise<void>;
	closeProject: () => Promise<void>;
	duplicateProject: (id: ProjectId) => Promise<void>;
	deleteProject: (id: ProjectId) => Promise<boolean>;
	refreshProjects: () => Promise<void>;
	replaceProject: (project: Project) => Promise<boolean>;
	importMedia: (files: File[]) => Promise<ImportBatchResult | null>;
	cancelImport: (jobId: string) => void;
	deleteAsset: (assetId: AssetId, options?: { force?: boolean }) => Promise<DeleteAssetResult>;
	renameAsset: (assetId: AssetId, name: string) => boolean;
	relinkAsset: (
		assetId: AssetId,
		file: File,
		options?: { acceptMismatch?: boolean }
	) => Promise<RelinkAssetResult>;
	setMediaView: (viewMode: MediaState['viewMode']) => void;
	setMediaSearch: (search: string) => void;
	selectAssets: (assetIds: AssetId[]) => void;
	generateAssetDerived: (assetId: AssetId) => void;
	openProjectManager: () => void;
	closeProjectManager: () => void;
	openNewProjectDialog: () => void;
	closeNewProjectDialog: () => void;
	openSaveCopyPrompt: () => void;
	closeSaveCopyPrompt: () => void;
	openExportDialog: () => void;
	closeExportDialog: () => void;
	setExporting: (exporting: boolean) => void;
	confirmCancelExportAndContinue: () => Promise<void>;
	dismissExportClosePrompt: () => void;
	setProjectMessage: (message: string) => void;
	setSaveStatus: (status: SaveStatus) => void;
	setAutosaveFlush: (flush: (() => Promise<void>) | null) => void;
	flushSave: () => Promise<void>;
	undo: () => boolean;
	redo: () => boolean;
	clearHistory: (reason?: string) => void;
	deleteCorruptProject: () => Promise<void>;
	clearRecovery: () => void;
	setZoom: (pixelsPerSecond: number, anchor?: TimelineZoomAnchor) => void;
	zoomToFit: (viewportWidth?: number) => void;
	setScroll: (scrollLeft: number, scrollTop: number) => void;
	setTimelineFollowing: (following: boolean) => void;
	setPlayhead: (time: Time) => void;
	selectClips: (ids: ClipId[], mode?: 'replace' | 'toggle' | 'add') => void;
	clearSelection: () => void;
	toggleSnap: () => void;
	beginTimelineDrag: (session: DragSession) => void;
	updateTimelineDrag: (
		pointerTime: Time,
		options?: { targetTrackId?: TrackId; unlink?: boolean; snappedTo?: Time }
	) => void;
	cancelTimelineDrag: () => void;
	commitTimelineDrag: () => boolean;
	addAssetToTimeline: (assetId: AssetId, trackId: TrackId, time: Time) => boolean;
	addAssetOnNewTrack: (assetId: AssetId, kind: Track['kind'], time: Time) => boolean;
	moveClips: (ids: ClipId[], deltaTime: Time, targetTrackId?: TrackId, unlink?: boolean) => boolean;
	trimClip: (id: ClipId, edge: 'start' | 'end', time: Time, unlink?: boolean) => boolean;
	splitAtPlayhead: (unlink?: boolean) => boolean;
	deleteSelection: (unlink?: boolean) => boolean;
	rippleDeleteSelection: () => boolean;
	duplicateSelection: () => boolean;
	addTimelineTrack: (kind: Track['kind']) => void;
	removeTimelineTrack: (id: TrackId, options?: { force?: boolean }) => TrackRemovalResult;
	reorderTimelineTrack: (id: TrackId, targetIndex: number) => boolean;
	renameTimelineTrack: (id: TrackId, name: string) => boolean;
	setTimelineTrackFlags: (
		id: TrackId,
		flags: Partial<Pick<Track, 'muted' | 'locked' | 'hidden'>>
	) => boolean;
	linkSelection: () => boolean;
	unlinkSelection: () => boolean;
	setTimelineMessage: (message: string) => void;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'An unexpected project error occurred.';
}

export function createEditorStore() {
	let autosaveFlush: (() => Promise<void>) | null = null;
	let afterExportAction: (() => Promise<void>) | null = null;
	const projectHistory = createHistory();
	const importControllers = new Map<
		string,
		{ projectId: ProjectId; controller: AbortController }
	>();
	const derivedControllers = new Map<
		AssetId,
		{ projectId: ProjectId; controller: AbortController }
	>();

	return createStore<EditorState>()(
		immer((set, get) => {
			function deferForActiveExport(project: Project | null, action: () => Promise<void>): boolean {
				if (!project || !isProjectExportActive(project.id)) return false;
				afterExportAction = action;
				set((state) => {
					state.isExportClosePromptOpen = true;
				});
				return true;
			}

			projectHistory.subscribe((snapshot) => {
				set((state) => {
					state.history = snapshot;
				});
			});

			function mutateProject(
				label: string,
				recipe: ProjectRecipe | null,
				options: {
					target?: Project;
					initial?: Project;
					activate?: boolean;
					dirty?: boolean;
					history?: HistoryPolicy;
					mergeKey?: string;
					resetHistory?: boolean;
				} = {}
			): Project | null {
				const current = options.target ?? get().project ?? options.initial;
				const switchingProject = options.activate === true && current?.id !== get().project?.id;
				if (options.resetHistory || recipe === null || switchingProject) {
					const history = projectHistory.snapshot();
					if (history.canUndo || history.canRedo) {
						const reason = switchingProject
							? 'the active project changed'
							: recipe === null
								? 'the project closed'
								: 'a new project session started';
						set((state) => {
							state.historyMessage = `Undo history cleared because ${reason}.`;
						});
					}
					projectHistory.clear();
				}
				if (recipe === null) {
					if (!current) return null;
					set((state) => {
						state.project = null;
						state.projectName = 'Untitled Project';
						state.projectNameDraft = 'Untitled Project';
						state.isRenaming = false;
						state.saveStatus = 'saved';
						state.timeline = createTimelineState();
					});
					return null;
				}

				if (!current) {
					throw new Error('Open a project before changing project data.');
				}
				const selectionBefore = [...get().timeline.selection.clipIds];
				const [updated, patches, inversePatches] = produceWithPatches(current, () =>
					recipe(current)
				);
				const dirty = options.dirty ?? true;
				const shouldActivate = options.activate ?? get().project?.id === current.id;
				if (shouldActivate) {
					const project = dirty ? { ...updated, updatedAt: new Date().toISOString() } : updated;
					set((state) => {
						const switchedProject = state.project?.id !== project.id;
						state.project = project;
						state.projectName = project.name;
						state.projectNameDraft = project.name;
						state.revision += dirty ? 1 : 0;
						if (dirty) state.saveStatus = 'unsaved';
						if (switchedProject) state.timeline = createTimelineState();
						else {
							const clipIds = new Set(
								project.tracks.flatMap((track) => track.clips.map((clip) => clip.id))
							);
							state.timeline.selection.clipIds = state.timeline.selection.clipIds.filter((id) =>
								clipIds.has(id)
							);
							if (
								state.timeline.selection.trackId &&
								!project.tracks.some((track) => track.id === state.timeline.selection.trackId)
							) {
								delete state.timeline.selection.trackId;
							}
						}
					});
					if (dirty && options.history !== 'skip' && patches.length > 0) {
						const state = get();
						projectHistory.record({
							id: `${current.id}:${state.revision}`,
							label,
							...(options.mergeKey ? { mergeKey: options.mergeKey } : {}),
							timestamp: Date.now(),
							patches,
							inversePatches,
							selectionBefore,
							selectionAfter: [...state.timeline.selection.clipIds]
						});
					}
					return get().project;
				}
				if (!dirty) return updated;
				const changed = { ...updated, updatedAt: new Date().toISOString() };
				set((state) => {
					state.revision += 1;
					state.saveStatus = 'unsaved';
				});
				return changed;
			}

			function historyActionBlocked(): boolean {
				const state = get();
				if (
					state.timeline.drag ||
					state.isProjectManagerOpen ||
					state.isNewProjectDialogOpen ||
					state.isSaveCopyPromptOpen ||
					state.recovery
				) {
					return true;
				}
				return (
					typeof document !== 'undefined' &&
					document.querySelector('dialog[open], [role="dialog"]') !== null
				);
			}

			function restoreHistorySelection(ids: readonly ClipId[], project: Project): void {
				const clips = new Set(
					project.tracks.flatMap((track) => track.clips.map((clip) => clip.id))
				);
				const tracks = new Set(project.tracks.map((track) => track.id));
				set((state) => {
					state.timeline.selection.clipIds = ids.filter((id) => clips.has(id));
					if (state.timeline.selection.trackId && !tracks.has(state.timeline.selection.trackId)) {
						delete state.timeline.selection.trackId;
					}
					state.timeline.playhead = Math.min(state.timeline.playhead, timelineDuration(project));
				});
			}

			async function refreshProjects(): Promise<void> {
				try {
					const projects = await listProjects();
					set((state) => {
						state.projects = projects;
					});
				} catch (error) {
					set((state) => {
						state.projectMessage = `Could not list saved projects: ${errorMessage(error)}`;
					});
				}
			}

			async function collectProjectGarbage(project: Project): Promise<void> {
				if (isProjectExportActive(project.id)) return;
				const report = await collectMediaGarbage(project);
				const removedCount = report.removedFiles.length + report.removedCacheAssetIds.length;
				if (removedCount > 0 || report.foreignFiles.length > 0) {
					const details = [
						removedCount > 0 ? `Removed ${removedCount} unreferenced media item(s).` : '',
						report.foreignFiles.length > 0
							? `Kept ${report.foreignFiles.length} unrecognized file(s) for safety.`
							: ''
					]
						.filter(Boolean)
						.join(' ');
					set((state) => {
						state.projectMessage = details;
					});
				}
			}

			async function rememberStorageAvailability(projectId: ProjectId): Promise<void> {
				try {
					const directory = await ensureProjectDir(projectId);
					if (!directory) {
						set((state) => {
							state.projectMessage =
								'Project data is saved in this browser, but persistent media storage is unavailable. Media import requires OPFS support.';
						});
					}
				} catch (error) {
					set((state) => {
						state.projectMessage = `Project folder could not be prepared: ${errorMessage(error)}`;
					});
				}
			}

			function cancelMediaWork(projectId?: ProjectId): void {
				for (const [jobId, entry] of importControllers) {
					if (!projectId || entry.projectId === projectId) {
						entry.controller.abort();
						importControllers.delete(jobId);
					}
				}
				for (const [assetId, entry] of derivedControllers) {
					if (!projectId || entry.projectId === projectId) {
						entry.controller.abort();
						derivedControllers.delete(assetId);
					}
				}
			}

			async function reconcileProject(project: Project): Promise<Project> {
				if (!isOpfsSupported()) {
					set((state) => {
						state.projectMessage =
							'Persistent media storage is unavailable in this browser. Media assets are marked offline.';
					});
					const assets = Object.fromEntries(
						Object.values(project.assets).map((asset) => [asset.id, { ...asset, offline: true }])
					) as Project['assets'];
					return { ...project, assets };
				}
				const result = await reconcileProjectMedia(project);
				if (result.unknownFiles.length > 0) {
					set((state) => {
						state.projectMessage = `Found ${result.unknownFiles.length} untracked file(s) in this project's media folder. They were preserved.`;
					});
				}
				return result.changed ? { ...project, assets: result.assets } : project;
			}

			function scheduleDerived(projectId: ProjectId, asset: Asset): void {
				if (asset.offline) return;
				derivedControllers.get(asset.id)?.controller.abort();
				const controller = new AbortController();
				derivedControllers.set(asset.id, { projectId, controller });
				set((state) => {
					state.media.derivedStatus[asset.id] = 'queued';
				});
				void generateDerived(projectId, asset, {
					signal: controller.signal,
					onStatus(status) {
						set((state) => {
							state.media.derivedStatus[asset.id] = status;
						});
					}
				})
					.catch((error: unknown) => {
						if (!(error instanceof DOMException && error.name === 'AbortError')) {
							set((state) => {
								state.media.derivedStatus[asset.id] = 'failed';
								state.projectMessage = `Could not generate previews for ${asset.name}: ${errorMessage(error)}`;
							});
						}
					})
					.finally(() => {
						if (derivedControllers.get(asset.id)?.controller === controller) {
							derivedControllers.delete(asset.id);
						}
					});
			}

			return {
				theme: 'dark',
				themeMessage: '',
				mediaWidth: 264,
				inspectorWidth: 256,
				timelineHeight: 360,
				projectName: 'Untitled Project',
				projectNameDraft: 'Untitled Project',
				isRenaming: false,
				isFileMenuOpen: false,
				projectMessage: '',
				project: null,
				revision: 0,
				projects: [],
				saveStatus: 'saved',
				history: EMPTY_HISTORY,
				historyMessage: '',
				isInitialized: false,
				isProjectManagerOpen: true,
				isNewProjectDialogOpen: false,
				isSaveCopyPromptOpen: false,
				saveCopyPromptShown: false,
				isExportDialogOpen: false,
				isExportClosePromptOpen: false,
				isExporting: false,
				recovery: null,
				media: {
					importQueue: [],
					derivedStatus: {},
					viewMode: 'list',
					search: '',
					selectedAssetIds: []
				},
				timeline: createTimelineState(),
				async initialize() {
					if (get().isInitialized) return;
					set((state) => {
						state.isInitialized = true;
					});
					const theme = initializeTheme();
					set((state) => {
						state.theme = theme.mode;
						state.themeMessage = theme.persistenceAvailable
							? ''
							: 'Theme preference could not be read.';
					});

					try {
						const projects = await listProjects();
						set((state) => {
							state.projects = projects;
						});
						const lastOpenedId = await getLastOpenedId();
						if (!lastOpenedId) {
							set((state) => {
								state.isProjectManagerOpen = true;
							});
							return;
						}

						try {
							const project = await getProject(lastOpenedId);
							if (!project) {
								await setLastOpenedId(null);
								set((state) => {
									state.isProjectManagerOpen = true;
								});
								return;
							}
							await collectProjectGarbage(project);
							const reconciled = await reconcileProject(project);
							mutateProject('Open last project', () => reconciled, {
								target: reconciled,
								activate: true,
								dirty: reconciled !== project,
								history: 'skip',
								resetHistory: true
							});
							for (const asset of Object.values(reconciled.assets))
								scheduleDerived(reconciled.id, asset);
							set((state) => {
								state.isProjectManagerOpen = false;
							});
						} catch (error) {
							if (!(error instanceof CorruptProjectError)) throw error;
							mutateProject('Recover corrupt project', null);
							set((state) => {
								state.recovery = {
									projectId: error.projectId,
									rawJson: error.rawJson,
									message: error.message
								};
								state.isProjectManagerOpen = false;
							});
						}
					} catch (error) {
						set((state) => {
							state.projectMessage = `Could not load saved projects: ${errorMessage(error)}`;
							state.isProjectManagerOpen = true;
						});
					}
				},
				toggleTheme() {
					const nextTheme = get().theme === 'dark' ? 'light' : 'dark';
					const saved = applyTheme(nextTheme);
					set((state) => {
						state.theme = nextTheme;
						state.themeMessage = saved
							? `${nextTheme === 'dark' ? 'Dark' : 'Light'} theme enabled.`
							: 'Theme changed, but this browser could not save the preference.';
					});
				},
				beginRename() {
					if (!get().project) return;
					set((state) => {
						state.projectNameDraft = state.projectName;
						state.projectMessage = '';
						state.isRenaming = true;
					});
				},
				cancelRename() {
					set((state) => {
						state.projectNameDraft = state.projectName;
						state.projectMessage = '';
						state.isRenaming = false;
					});
				},
				toggleFileMenu() {
					set((state) => {
						state.isFileMenuOpen = !state.isFileMenuOpen;
					});
				},
				closeFileMenu() {
					set((state) => {
						state.isFileMenuOpen = false;
					});
				},
				setProjectNameDraft(value) {
					set((state) => {
						state.projectNameDraft = value;
						state.projectMessage = '';
					});
				},
				saveProjectName() {
					get().renameProject(get().projectNameDraft);
				},
				renameProject(name) {
					const parsed = projectNameSchema.safeParse(name);
					if (!parsed.success) {
						set((state) => {
							state.projectMessage =
								parsed.error.issues[0]?.message ?? 'Enter a valid project name.';
						});
						return;
					}
					if (!get().project) {
						set((state) => {
							state.projectMessage = 'Open a project before renaming it.';
						});
						return;
					}

					mutateProject('Rename project', (project) => ({ ...project, name: parsed.data }), {
						history: 'record',
						mergeKey: 'project-name'
					});
					set((state) => {
						state.projectMessage = `Project renamed to “${parsed.data}”.`;
						state.isRenaming = false;
					});
				},
				async renameSavedProject(id, name) {
					const parsed = projectNameSchema.safeParse(name);
					if (!parsed.success) {
						set((state) => {
							state.projectMessage =
								parsed.error.issues[0]?.message ?? 'Enter a valid project name.';
						});
						return false;
					}
					try {
						const project = get().project?.id === id ? get().project : await getProject(id);
						if (!project) throw new Error('This project no longer exists.');
						const updated = mutateProject(
							'Rename saved project',
							(current) => ({ ...current, name: parsed.data }),
							{
								target: project,
								activate: get().project?.id === id,
								history: get().project?.id === id ? 'record' : 'skip',
								mergeKey: 'project-name'
							}
						);
						if (updated) await saveProjectRecord(projectSchema.parse(updated));
						await refreshProjects();
						set((state) => {
							state.projectMessage = `Project renamed to “${parsed.data}”.`;
						});
						return true;
					} catch (error) {
						set((state) => {
							state.projectMessage = `Could not rename project: ${errorMessage(error)}`;
						});
						return false;
					}
				},
				resizePanel(handle, delta) {
					const limits = PANEL_LIMITS[handle];
					set((state) => {
						if (handle === 'media') {
							state.mediaWidth = clampPanelSize(state.mediaWidth + delta, limits.min, limits.max);
						} else if (handle === 'inspector') {
							state.inspectorWidth = clampPanelSize(
								state.inspectorWidth + delta,
								limits.min,
								limits.max
							);
						} else {
							state.timelineHeight = clampPanelSize(
								state.timelineHeight + delta,
								limits.min,
								limits.max
							);
						}
					});
				},
				async createProject(options) {
					if (
						deferForActiveExport(get().project, async () => {
							await get().createProject(options);
						})
					)
						return;
					const name = projectNameSchema.safeParse(options.name);
					if (!name.success) {
						set((state) => {
							state.projectMessage = name.error.issues[0]?.message ?? 'Enter a valid project name.';
						});
						return;
					}
					try {
						const project = projectSchema.parse(
							createEmptyProject({ name: name.data, settings: options.settings })
						);
						await rememberStorageAvailability(project.id);
						await setLastOpenedId(project.id);
						mutateProject('Create project', () => project, {
							initial: project,
							activate: true,
							history: 'skip',
							resetHistory: true
						});
						set((state) => {
							state.isProjectManagerOpen = false;
							state.isNewProjectDialogOpen = false;
							state.recovery = null;
						});
					} catch (error) {
						set((state) => {
							state.projectMessage = `Could not create project: ${errorMessage(error)}`;
						});
					}
				},
				async openProject(id) {
					const activeProject = get().project;
					if (
						activeProject?.id !== id &&
						deferForActiveExport(activeProject, async () => {
							await get().openProject(id);
						})
					)
						return;
					set((state) => {
						state.projectMessage = '';
					});
					try {
						const loadedProject = await getProject(id);
						if (!loadedProject) throw new Error('This project no longer exists.');
						cancelMediaWork();
						const activeProject = get().project;
						if (activeProject && activeProject.id !== loadedProject.id) {
							await collectProjectGarbage(activeProject);
						}
						await collectProjectGarbage(loadedProject);
						const project = await reconcileProject(loadedProject);
						await setLastOpenedId(id);
						mutateProject('Open project', () => project, {
							target: project,
							activate: true,
							dirty: project !== loadedProject,
							history: 'skip',
							resetHistory: true
						});
						for (const asset of Object.values(project.assets)) scheduleDerived(project.id, asset);
						set((state) => {
							state.isProjectManagerOpen = false;
							state.recovery = null;
							state.saveStatus = 'saved';
						});
					} catch (error) {
						if (error instanceof CorruptProjectError) {
							set((state) => {
								state.recovery = {
									projectId: error.projectId,
									rawJson: error.rawJson,
									message: error.message
								};
								state.isProjectManagerOpen = false;
							});
							return;
						}
						set((state) => {
							state.projectMessage = `Could not open project: ${errorMessage(error)}`;
						});
					}
				},
				async closeProject() {
					const project = get().project;
					if (!project) return;
					if (
						deferForActiveExport(project, async () => {
							await get().closeProject();
						})
					)
						return;
					set((state) => {
						state.projectMessage = '';
					});
					try {
						await collectProjectGarbage(project);
					} catch (error) {
						set((state) => {
							state.projectMessage = `Could not clean unused media before closing: ${errorMessage(error)}`;
						});
						return;
					}
					cancelMediaWork(project.id);
					mutateProject('Close project', null, { history: 'skip', resetHistory: true });
					set((state) => {
						state.media.importQueue = [];
						state.media.derivedStatus = {};
						state.media.selectedAssetIds = [];
					});
					try {
						await setLastOpenedId(null);
						await refreshProjects();
						set((state) => {
							state.isProjectManagerOpen = true;
						});
					} catch (error) {
						set((state) => {
							state.isProjectManagerOpen = true;
							state.projectMessage = `Project closed, but its last-opened state could not be cleared: ${errorMessage(error)}`;
						});
					}
				},
				async duplicateProject(id) {
					if (
						deferForActiveExport(get().project, async () => {
							await get().duplicateProject(id);
						})
					)
						return;
					try {
						const source = get().project?.id === id ? get().project : await getProject(id);
						if (!source) throw new Error('This project no longer exists.');
						const duplicate = await copyProjectMedia(
							source,
							projectSchema.parse(duplicateProjectData(source))
						);
						await rememberStorageAvailability(duplicate.id);
						await setLastOpenedId(duplicate.id);
						mutateProject('Duplicate project', () => duplicate, {
							initial: duplicate,
							activate: true,
							history: 'skip',
							resetHistory: true
						});
						for (const asset of Object.values(duplicate.assets)) {
							scheduleDerived(duplicate.id, asset);
						}
						set((state) => {
							state.isProjectManagerOpen = false;
						});
					} catch (error) {
						set((state) => {
							state.projectMessage = `Could not duplicate project: ${errorMessage(error)}`;
						});
					}
				},
				async deleteProject(id) {
					if (
						deferForActiveExport(get().project?.id === id ? get().project : null, async () => {
							await get().deleteProject(id);
						})
					)
						return false;
					try {
						cancelMediaWork(id);
						await deleteProjectDir(id);
						await deleteProjectDerived(id);
						await deleteProjectRecord(id);
						if (get().project?.id === id) {
							mutateProject('Delete active project', null, {
								history: 'skip',
								resetHistory: true
							});
						}
						await refreshProjects();
						set((state) => {
							state.recovery = state.recovery?.projectId === id ? null : state.recovery;
							state.isProjectManagerOpen = !state.project;
							state.projectMessage = '';
							state.media.importQueue = state.media.importQueue.filter(
								(job) => job.projectId !== id
							);
						});
						return true;
					} catch (error) {
						set((state) => {
							state.projectMessage = `Could not delete project: ${errorMessage(error)}`;
						});
						return false;
					}
				},
				async refreshProjects() {
					await refreshProjects();
				},
				async replaceProject(rawProject) {
					if (
						deferForActiveExport(get().project, async () => {
							await get().replaceProject(rawProject);
						})
					)
						return false;
					set((state) => {
						state.projectMessage = '';
					});
					try {
						let project = migrate(rawProject);
						const existing = await getProject(project.id);
						if (existing) {
							const originalName = project.name;
							project = { ...duplicateProjectData(project), name: originalName };
						}
						cancelMediaWork();
						const activeProject = get().project;
						if (activeProject) await collectProjectGarbage(activeProject);
						await collectProjectGarbage(project);
						project = await reconcileProject(project);
						await rememberStorageAvailability(project.id);
						await setLastOpenedId(project.id);
						mutateProject('Replace current project', () => project, {
							initial: project,
							activate: true,
							history: 'skip',
							resetHistory: true
						});
						set((state) => {
							state.isProjectManagerOpen = false;
							state.isNewProjectDialogOpen = false;
						});
						for (const asset of Object.values(project.assets)) scheduleDerived(project.id, asset);
						return true;
					} catch (error) {
						set((state) => {
							state.projectMessage = `Could not open project file: ${errorMessage(error)}`;
						});
						return false;
					}
				},
				async importMedia(files) {
					const project = get().project;
					if (!project) {
						set((state) => {
							state.projectMessage = 'Create or open a project before importing media.';
						});
						return null;
					}
					if (files.length === 0) return { imported: [], failed: [] };
					const jobs = files.map((file) => ({
						id: createAssetId(),
						projectId: project.id,
						name: file.name,
						file,
						status: 'queued' as const,
						progress: 0
					}));
					const controllers = jobs.map(() => new AbortController());
					for (const [index, job] of jobs.entries()) {
						const controller = controllers[index];
						if (controller) {
							importControllers.set(job.id, { projectId: project.id, controller });
						}
					}
					set((state) => {
						state.media.importQueue = [...state.media.importQueue, ...jobs];
						state.projectMessage = '';
					});
					try {
						const result = await runMediaImport(files, {
							projectId: project.id,
							fps: project.settings.fps,
							signalForFile: (index) => controllers[index]?.signal,
							mutateProject(label, recipe) {
								if (get().project?.id !== project.id) {
									throw new Error('The active project changed before media import completed.');
								}
								mutateProject(label, recipe, { history: 'record' });
							},
							onProgress(progress: ImportProgress) {
								const job = jobs[progress.index];
								if (!job) return;
								set((state) => {
									const current = state.media.importQueue.find((entry) => entry.id === job.id);
									if (!current) return;
									current.status = progress.phase;
									current.progress =
										progress.total > 0
											? Math.min(100, (progress.loaded / progress.total) * 100)
											: 100;
									if (progress.reason) current.reason = progress.reason;
								});
							},
							scheduleDerived(asset) {
								scheduleDerived(project.id, asset);
							}
						});
						if (get().project?.id === project.id) {
							set((state) => {
								state.projectMessage =
									result.failed.length === 0
										? `Imported ${result.imported.length} media file(s).`
										: `Imported ${result.imported.length} file(s); ${result.failed.length} failed.`;
							});
						}
						return result;
					} catch (error) {
						set((state) => {
							state.projectMessage = `Media import failed: ${errorMessage(error)}`;
						});
						return null;
					} finally {
						for (const job of jobs) importControllers.delete(job.id);
					}
				},
				cancelImport(jobId) {
					importControllers.get(jobId)?.controller.abort();
					set((state) => {
						const job = state.media.importQueue.find((entry) => entry.id === jobId);
						if (job && job.status !== 'done' && job.status !== 'failed') job.status = 'cancelled';
					});
				},
				async deleteAsset(assetId, options = {}) {
					const project = get().project;
					if (!project) return { deleted: false, usage: [] };
					try {
						const usage = getAssetUsage(project, assetId);
						if (usage.length > 0 && !options.force) return { deleted: false, usage };
						derivedControllers.get(assetId)?.controller.abort();
						derivedControllers.delete(assetId);
						mutateProject(
							'Delete media',
							(current) => removeProjectAsset(current, { assetId, force: options.force }),
							{ history: 'record' }
						);
						set((state) => {
							delete state.media.derivedStatus[assetId];
							state.media.selectedAssetIds = state.media.selectedAssetIds.filter(
								(id) => id !== assetId
							);
							state.media.importQueue = state.media.importQueue.filter(
								(job) => job.name !== project.assets[assetId]?.name
							);
						});
						return { deleted: true, usage };
					} catch (error) {
						set((state) => {
							state.projectMessage = `Could not delete media: ${errorMessage(error)}`;
						});
						return { deleted: false, usage: [] };
					}
				},
				renameAsset(assetId, name) {
					try {
						mutateProject(
							'Rename asset',
							(project) => renameProjectAsset(project, { assetId, name }),
							{ history: 'record', mergeKey: `asset-name:${assetId}` }
						);
						return true;
					} catch (error) {
						set((state) => {
							state.projectMessage = `Could not rename media: ${errorMessage(error)}`;
						});
						return false;
					}
				},
				async relinkAsset(assetId, file, options = {}) {
					const project = get().project;
					const asset = project?.assets[assetId];
					if (!project || !asset) return { relinked: false };
					try {
						if (classifyMime(file.type, file.name) !== asset.kind) {
							throw new Error('Choose a file of the same media type to relink this asset.');
						}
						const metadata = await probeMedia(file, { fps: project.settings.fps });
						const differences: string[] = [];
						if (file.size !== asset.size) differences.push('file size differs');
						if (
							asset.kind !== 'image' &&
							ticksToSeconds(Math.abs(metadata.duration - asset.duration)) > 0.5
						) {
							differences.push('duration differs by more than 0.5 seconds');
						}
						if (differences.length > 0 && !options.acceptMismatch) {
							return {
								relinked: false,
								mismatch: `The selected file's ${differences.join(' and ')}. Relink anyway?`
							};
						}
						const reason = 'Relinking replaces the stored media file and cannot be undone safely.';
						const cleared = projectHistory.barrier(reason);
						if (cleared) {
							set((state) => {
								state.historyMessage = `History cleared — ${reason}`;
							});
						}
						const opfsPath = await writeMedia(project.id, assetId, file);
						if (asset.opfsPath !== opfsPath) await deleteMediaFile(project.id, asset);
						mutateProject(
							'Relink media',
							(current) =>
								relinkProjectAsset(current, {
									assetId,
									opfsPath,
									mimeType: file.type || asset.mimeType,
									size: file.size
								}),
							{ history: 'skip' }
						);
						await deleteDerived(project.id, assetId);
						set((state) => {
							delete state.media.derivedStatus[assetId];
							state.projectMessage = `${asset.name} was relinked.`;
						});
						scheduleDerived(project.id, { ...asset, opfsPath, offline: false });
						return { relinked: true };
					} catch (error) {
						set((state) => {
							state.projectMessage = `Could not relink media: ${errorMessage(error)}`;
						});
						return { relinked: false };
					}
				},
				setMediaView(viewMode) {
					set((state) => {
						state.media.viewMode = viewMode;
					});
				},
				setMediaSearch(search) {
					set((state) => {
						state.media.search = search;
					});
				},
				selectAssets(assetIds) {
					set((state) => {
						state.media.selectedAssetIds = assetIds;
					});
				},
				generateAssetDerived(assetId) {
					const project = get().project;
					const asset = project?.assets[assetId];
					if (!project || !asset || asset.offline || derivedControllers.has(assetId)) return;
					scheduleDerived(project.id, asset);
				},
				openProjectManager() {
					void refreshProjects();
					set((state) => {
						state.isProjectManagerOpen = true;
						state.isFileMenuOpen = false;
					});
				},
				closeProjectManager() {
					if (!get().project) return;
					set((state) => {
						state.isProjectManagerOpen = false;
					});
				},
				openNewProjectDialog() {
					set((state) => {
						state.projectMessage = '';
						state.isProjectManagerOpen = false;
						state.isNewProjectDialogOpen = true;
						state.isFileMenuOpen = false;
					});
				},
				closeNewProjectDialog() {
					set((state) => {
						state.isNewProjectDialogOpen = false;
						state.isProjectManagerOpen = !state.project;
					});
				},
				openSaveCopyPrompt() {
					set((state) => {
						state.isSaveCopyPromptOpen = true;
						state.saveCopyPromptShown = true;
					});
				},
				closeSaveCopyPrompt() {
					set((state) => {
						state.isSaveCopyPromptOpen = false;
					});
				},
				openExportDialog() {
					set((state) => {
						state.isExportDialogOpen = true;
						state.isFileMenuOpen = false;
					});
				},
				closeExportDialog() {
					if (get().isExporting) return;
					set((state) => {
						state.isExportDialogOpen = false;
					});
				},
				setExporting(exporting) {
					set((state) => {
						state.isExporting = exporting;
					});
				},
				async confirmCancelExportAndContinue() {
					const project = get().project;
					if (project) await cancelProjectExport(project.id);
					set((state) => {
						state.isExportClosePromptOpen = false;
						state.isExportDialogOpen = false;
					});
					const action = afterExportAction;
					afterExportAction = null;
					if (action) await action();
				},
				dismissExportClosePrompt() {
					afterExportAction = null;
					set((state) => {
						state.isExportClosePromptOpen = false;
					});
				},
				setProjectMessage(message) {
					set((state) => {
						state.projectMessage = message;
					});
				},
				setSaveStatus(status) {
					set((state) => {
						state.saveStatus = status;
					});
				},
				setAutosaveFlush(flush) {
					autosaveFlush = flush;
				},
				async flushSave() {
					if (!autosaveFlush) {
						throw new Error('Autosave is not ready yet. Try saving again in a moment.');
					}
					await autosaveFlush();
				},
				undo() {
					const project = get().project;
					if (!project || historyActionBlocked()) return false;
					const result = projectHistory.undo(project);
					if (!result) return false;
					const restored = { ...result.project, updatedAt: new Date().toISOString() };
					mutateProject(`Undo ${result.entry.label}`, () => restored, { history: 'skip' });
					restoreHistorySelection(result.entry.selectionBefore, restored);
					set((state) => {
						state.historyMessage = `Undid ${result.entry.label}`;
					});
					return true;
				},
				redo() {
					const project = get().project;
					if (!project || historyActionBlocked()) return false;
					const result = projectHistory.redo(project);
					if (!result) return false;
					const restored = { ...result.project, updatedAt: new Date().toISOString() };
					mutateProject(`Redo ${result.entry.label}`, () => restored, { history: 'skip' });
					restoreHistorySelection(result.entry.selectionAfter, restored);
					set((state) => {
						state.historyMessage = `Redid ${result.entry.label}`;
					});
					return true;
				},
				clearHistory(reason = '') {
					const discarded = reason
						? projectHistory.barrier(reason)
						: (projectHistory.clear(), false);
					if (discarded) {
						set((state) => {
							state.historyMessage = `History cleared — ${reason}`;
						});
					}
				},
				async deleteCorruptProject() {
					const recovery = get().recovery;
					if (!recovery) return;
					const deleted = await get().deleteProject(recovery.projectId);
					if (!deleted) return;
					set((state) => {
						state.recovery = null;
						state.isProjectManagerOpen = true;
					});
				},
				clearRecovery() {
					set((state) => {
						state.recovery = null;
						state.isProjectManagerOpen = true;
					});
				},
				setZoom(pixelsPerSecond, anchor) {
					if (!Number.isFinite(pixelsPerSecond)) return;
					const nextZoom = Math.max(8, Math.min(400, pixelsPerSecond));
					const current = get().timeline;
					const zoomAnchor = anchor ?? {
						time: current.playhead,
						pixel: Math.max(
							0,
							(current.playhead * current.pixelsPerSecond) / 1_000_000 - current.scrollLeft
						)
					};
					set((state) => {
						state.timeline.pixelsPerSecond = nextZoom;
						state.timeline.scrollLeft = Math.max(
							0,
							(zoomAnchor.time / 1_000_000) * nextZoom - zoomAnchor.pixel
						);
					});
				},
				zoomToFit(viewportWidth = 800) {
					const project = get().project;
					if (!project) return;
					const duration = Math.max(
						timelineDuration(project),
						framesToTicks(10, project.settings.fps)
					);
					const usableWidth = Math.max(100, viewportWidth - 180);
					get().setZoom(Math.max(8, Math.min(400, (usableWidth - 40) / (duration / 1_000_000))), {
						time: 0,
						pixel: 0
					});
					set((state) => {
						state.timeline.scrollLeft = 0;
					});
				},
				setScroll(scrollLeft, scrollTop) {
					set((state) => {
						state.timeline.scrollLeft = Math.max(0, scrollLeft);
						state.timeline.scrollTop = Math.max(0, scrollTop);
					});
				},
				setTimelineFollowing(following) {
					set((state) => {
						state.timeline.followPlayhead = following;
					});
				},
				setPlayhead(time) {
					const project = get().project;
					if (!project) return;
					set((state) => {
						state.timeline.playhead = snapToFrame(
							Math.max(0, Math.round(time)),
							project.settings.fps
						);
					});
				},
				selectClips(ids, mode = 'replace') {
					const project = get().project;
					if (!project) return;
					const available = new Set(
						project.tracks.flatMap((track) => track.clips.map((clip) => clip.id))
					);
					const validIds = ids.filter((id) => available.has(id));
					set((state) => {
						if (mode === 'replace') state.timeline.selection.clipIds = [...new Set(validIds)];
						else if (mode === 'add') {
							state.timeline.selection.clipIds = [
								...new Set([...state.timeline.selection.clipIds, ...validIds])
							];
						} else {
							const selected = new Set(state.timeline.selection.clipIds);
							for (const id of validIds) {
								if (selected.has(id)) selected.delete(id);
								else selected.add(id);
							}
							state.timeline.selection.clipIds = [...selected];
						}
					});
				},
				clearSelection() {
					set((state) => {
						state.timeline.selection = { clipIds: [] };
					});
				},
				setTimelineMessage(message) {
					set((state) => {
						state.timeline.message = message;
					});
				},
				toggleSnap() {
					set((state) => {
						state.timeline.snapEnabled = !state.timeline.snapEnabled;
					});
				},
				beginTimelineDrag(session) {
					set((state) => {
						state.timeline.drag = session;
						state.timeline.message = '';
					});
				},
				updateTimelineDrag(pointerTime, options = {}) {
					const drag = get().timeline.drag;
					const project = get().project;
					if (!drag || !project) return;
					const targetTrackId = options.targetTrackId ?? drag.targetTrackId;
					const unlink = options.unlink ?? drag.unlink;
					const snappedTime = snapToFrame(
						Math.max(0, Math.round(pointerTime)),
						project.settings.fps
					);
					try {
						let previewProject = project;
						if (drag.kind === 'asset' && drag.assetId && targetTrackId) {
							previewProject = addClipFromAssetOperation(project, {
								assetId: drag.assetId,
								trackId: targetTrackId,
								start: snappedTime
							});
						} else if (drag.kind === 'move') {
							previewProject = moveClipsOperation(project, {
								clipIds: drag.clipIds,
								deltaTime: snappedTime - drag.pointerStartTime,
								targetTrackId,
								unlink
							});
						} else if (drag.clipIds[0]) {
							const original = drag.original[0];
							const baseTime =
								drag.kind === 'trim-start'
									? original?.start
									: original
										? original.start + original.duration
										: undefined;
							if (baseTime !== undefined) {
								previewProject = trimClipOperation(
									project,
									drag.clipIds[0],
									drag.kind === 'trim-start' ? 'start' : 'end',
									baseTime + snappedTime - drag.pointerStartTime,
									unlink
								);
							}
						}
						const previewIds =
							drag.kind === 'asset'
								? previewProject.tracks
										.flatMap((track) => track.clips)
										.filter(
											(clip) =>
												!project.tracks.some((track) =>
													track.clips.some((old) => old.id === clip.id)
												)
										)
										.map((clip) => clip.id)
								: drag.clipIds.flatMap((id) =>
										drag.unlink ? [id] : groupOf(project, id).map((clip) => clip.id)
									);
						set((state) => {
							if (!state.timeline.drag) return;
							state.timeline.drag.pointerTime = snappedTime;
							state.timeline.drag.targetTrackId = targetTrackId;
							state.timeline.drag.unlink = unlink;
							state.timeline.drag.allowed = true;
							state.timeline.drag.snappedTo = options.snappedTo;
							state.timeline.drag.preview = projectClipPositions(previewProject, previewIds);
							state.timeline.message = '';
						});
					} catch (error) {
						set((state) => {
							if (!state.timeline.drag) return;
							state.timeline.drag.pointerTime = snappedTime;
							state.timeline.drag.targetTrackId = targetTrackId;
							state.timeline.drag.unlink = unlink;
							state.timeline.drag.allowed = false;
							delete state.timeline.drag.snappedTo;
							state.timeline.drag.preview = [];
							state.timeline.message = errorMessage(error);
						});
					}
				},
				cancelTimelineDrag() {
					set((state) => {
						state.timeline.drag = null;
					});
				},
				commitTimelineDrag() {
					const drag = get().timeline.drag;
					if (!drag || !drag.allowed) {
						if (drag) {
							set((state) => {
								state.timeline.drag = null;
							});
						}
						return false;
					}
					try {
						const previousClipIds = new Set(
							get().project?.tracks.flatMap((track) => track.clips.map((clip) => clip.id)) ?? []
						);
						mutateProject(
							drag.kind === 'asset'
								? 'Add clip'
								: drag.kind === 'move'
									? 'Move clips'
									: 'Trim clip',
							(project) => {
								if (drag.kind === 'asset' && drag.assetId && drag.targetTrackId) {
									return addClipFromAssetOperation(project, {
										assetId: drag.assetId,
										trackId: drag.targetTrackId,
										start: drag.pointerTime
									});
								}
								if (drag.kind === 'move') {
									return moveClipsOperation(project, {
										clipIds: drag.clipIds,
										deltaTime: drag.pointerTime - drag.pointerStartTime,
										targetTrackId: drag.targetTrackId,
										unlink: drag.unlink
									});
								}
								const original = drag.original[0];
								const baseTime =
									drag.kind === 'trim-start'
										? original?.start
										: original
											? original.start + original.duration
											: undefined;
								if (!drag.clipIds[0] || baseTime === undefined) return project;
								return trimClipOperation(
									project,
									drag.clipIds[0],
									drag.kind === 'trim-start' ? 'start' : 'end',
									baseTime + drag.pointerTime - drag.pointerStartTime,
									drag.unlink
								);
							},
							{ history: 'record' }
						);
						const committed = get().project;
						if (committed && drag.kind === 'asset') {
							const added = committed.tracks
								.flatMap((track) => track.clips)
								.filter((clip) => !previousClipIds.has(clip.id));
							get().selectClips(added.map((clip) => clip.id));
							projectHistory.updateSelectionAfter(added.map((clip) => clip.id));
						}
						set((state) => {
							state.timeline.drag = null;
							state.timeline.message = 'Timeline edit applied.';
						});
						return true;
					} catch (error) {
						set((state) => {
							state.timeline.drag = null;
							state.timeline.message = errorMessage(error);
						});
						return false;
					}
				},
				addAssetToTimeline(assetId, trackId, time) {
					try {
						const beforeIds = new Set(
							get().project?.tracks.flatMap((track) => track.clips.map((clip) => clip.id)) ?? []
						);
						mutateProject(
							'Add clip',
							(project) =>
								addClipFromAssetOperation(project, {
									assetId,
									trackId,
									start: snapToFrame(time, project.settings.fps)
								}),
							{ history: 'record' }
						);
						const project = get().project;
						if (!project) return false;
						const added = project.tracks.flatMap((track) =>
							track.clips.filter((clip) => !beforeIds.has(clip.id)).map((clip) => clip.id)
						);
						get().selectClips(added);
						projectHistory.updateSelectionAfter(added);
						set((state) => {
							state.timeline.message = 'Clip added to timeline.';
						});
						return true;
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return false;
					}
				},
				addAssetOnNewTrack(assetId, kind, time) {
					try {
						const beforeIds = new Set(
							get().project?.tracks.flatMap((track) => track.clips.map((clip) => clip.id)) ?? []
						);
						mutateProject(
							`${kind === 'video' ? 'Add video' : 'Add audio'} track`,
							(project) => {
								const asset = project.assets[assetId];
								if (!asset) throw new Error(`Media asset “${assetId}” does not exist.`);
								if (
									(kind === 'video' && asset.kind === 'audio') ||
									(kind === 'audio' && asset.kind !== 'audio')
								) {
									throw new Error('The media asset is not compatible with this track.');
								}
								const withTrack = addTrackOperation(project, kind);
								const track = withTrack.tracks.at(-1);
								if (!track) throw new Error('Could not create a timeline track.');
								return addClipFromAssetOperation(withTrack, {
									assetId,
									trackId: track.id,
									start: snapToFrame(time, project.settings.fps)
								});
							},
							{ history: 'record' }
						);
						const project = get().project;
						if (project) {
							const added = project.tracks.flatMap((track) =>
								track.clips.filter((clip) => !beforeIds.has(clip.id)).map((clip) => clip.id)
							);
							get().selectClips(added);
							projectHistory.updateSelectionAfter(added);
						}
						return true;
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return false;
					}
				},
				moveClips(ids, deltaTime, targetTrackId, unlink = false) {
					try {
						mutateProject(
							'Move clips',
							(project) =>
								moveClipsOperation(project, {
									clipIds: ids,
									deltaTime: snapToFrame(deltaTime, project.settings.fps),
									targetTrackId,
									unlink
								}),
							{ history: 'record', mergeKey: `move:${[...ids].toSorted().join(',')}` }
						);
						return true;
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return false;
					}
				},
				trimClip(id, edge, time, unlink = false) {
					try {
						mutateProject(
							'Trim clip',
							(project) =>
								trimClipOperation(
									project,
									id,
									edge,
									snapToFrame(time, project.settings.fps),
									unlink
								),
							{ history: 'record', mergeKey: `trim:${id}:${edge}` }
						);
						return true;
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return false;
					}
				},
				splitAtPlayhead(unlink = false) {
					const project = get().project;
					if (!project) return false;
					const selection = get().timeline.selection.clipIds;
					const ids =
						selection.length > 0
							? selection
							: project.tracks
									.filter((track) => !track.locked)
									.flatMap((track) =>
										track.clips
											.filter(
												(clip) =>
													clip.start < get().timeline.playhead &&
													clip.start + clip.duration > get().timeline.playhead
											)
											.map((clip) => clip.id)
									);
					try {
						const result = splitClipsAt(project, get().timeline.playhead, ids, unlink);
						if (result.splitClipIds.length === 0) {
							set((state) => {
								state.timeline.message = 'No selected clips cross the playhead.';
							});
							return false;
						}
						mutateProject('Split clip', () => result.project, { history: 'record' });
						get().selectClips(result.splitClipIds);
						projectHistory.updateSelectionAfter(result.splitClipIds);
						set((state) => {
							state.timeline.message = 'Split clip.';
						});
						return true;
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return false;
					}
				},
				deleteSelection(unlink = false) {
					const ids = get().timeline.selection.clipIds;
					if (ids.length === 0) return false;
					try {
						mutateProject('Delete clips', (project) => deleteClipsOperation(project, ids, unlink), {
							history: 'record'
						});
						get().clearSelection();
						set((state) => {
							state.timeline.message = 'Deleted selected clips.';
						});
						return true;
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return false;
					}
				},
				rippleDeleteSelection() {
					const ids = get().timeline.selection.clipIds;
					if (ids.length === 0) return false;
					try {
						mutateProject('Ripple delete', (project) => rippleDeleteClipsOperation(project, ids), {
							history: 'record'
						});
						get().clearSelection();
						set((state) => {
							state.timeline.message = 'Ripple deleted selected clips.';
						});
						return true;
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return false;
					}
				},
				duplicateSelection() {
					const ids = get().timeline.selection.clipIds;
					if (ids.length === 0) return false;
					try {
						const beforeIds = new Set(
							get().project?.tracks.flatMap((track) => track.clips.map((clip) => clip.id)) ?? []
						);
						mutateProject('Duplicate clips', (project) => duplicateClipsOperation(project, ids), {
							history: 'record'
						});
						const project = get().project;
						if (project) {
							const added = project.tracks.flatMap((track) =>
								track.clips.filter((clip) => !beforeIds.has(clip.id)).map((clip) => clip.id)
							);
							get().selectClips(added);
							projectHistory.updateSelectionAfter(added);
						}
						return true;
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return false;
					}
				},
				addTimelineTrack(kind) {
					try {
						mutateProject(`Add ${kind} track`, (project) => addTrackOperation(project, kind), {
							history: 'record'
						});
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
					}
				},
				removeTimelineTrack(id, options = {}) {
					const project = get().project;
					const track = project?.tracks.find((item) => item.id === id);
					if (!project || !track) return { removed: false, clipCount: 0 };
					if (track.clips.length > 0 && !options.force) {
						return { removed: false, clipCount: track.clips.length };
					}
					try {
						const result = removeTrackOperation(project, id);
						mutateProject('Remove track', () => result.project, { history: 'record' });
						return { removed: true, clipCount: result.clipCount };
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return { removed: false, clipCount: track.clips.length };
					}
				},
				reorderTimelineTrack(id, targetIndex) {
					try {
						mutateProject(
							'Reorder track',
							(project) => reorderTrackOperation(project, id, targetIndex),
							{ history: 'record' }
						);
						return true;
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return false;
					}
				},
				renameTimelineTrack(id, name) {
					try {
						mutateProject('Rename track', (project) => renameTrackOperation(project, id, name), {
							history: 'record',
							mergeKey: `track-name:${id}`
						});
						return true;
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return false;
					}
				},
				setTimelineTrackFlags(id, flags) {
					try {
						mutateProject(
							flags.muted !== undefined ? 'Mute track' : 'Change track settings',
							(project) => setTrackFlagsOperation(project, id, flags),
							{ history: 'record' }
						);
						return true;
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return false;
					}
				},
				linkSelection() {
					const ids = get().timeline.selection.clipIds;
					if (ids.length < 2) return false;
					try {
						mutateProject('Link clips', (project) => linkClipsOperation(project, ids), {
							history: 'record'
						});
						return true;
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return false;
					}
				},
				unlinkSelection() {
					const ids = get().timeline.selection.clipIds;
					if (!ids.length) return false;
					try {
						mutateProject('Unlink clips', (project) => unlinkClipsOperation(project, ids), {
							history: 'record'
						});
						return true;
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return false;
					}
				}
			};
		})
	);
}

export type EditorStore = ReturnType<typeof createEditorStore>;
