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
	setConstantSpeed,
	reverseClip,
	enableTimeRemap as enableClipTimeRemap,
	disableTimeRemap as disableClipTimeRemap,
	addFreezeFrame as addFreezeFrameOperation,
	freezeFrameToEnd as freezeFrameToEndOperation,
	descriptorFor,
	ANIMATABLE_PROPERTY_IDS,
	propertyCurve,
	isAnimated,
	setPropertyAtTime,
	enableAnimation as enableClipAnimation,
	disableAnimation as disableClipAnimation,
	toggleKeyframe as toggleClipKeyframe,
	nextKeyframeTime,
	prevKeyframeTime,
	moveKeyframes as moveClipKeyframes,
	deleteKeyframes as deleteClipKeyframes,
	setKeyframeInterpolation as setClipKeyframeInterpolation,
	setBezierHandles as setClipBezierHandles,
	copyKeyframes,
	pasteKeyframes,
	createAdjustmentClip,
	createSolidClip,
	createTextClip,
	insertClip,
	createEffectInstance,
	addEffectToClip,
	removeEffectFromClip,
	reorderEffectInClip,
	toggleEffectInClip,
	duplicateEffectInClip,
	copyClipEffects as copyClipEffectsCore,
	pasteClipEffects as pasteClipEffectsCore,
	getEffectDefinition,
	parseCubeLut,
	normalizeProjectTransitions,
	getTransitionDefinition,
	createMask,
	addMaskToClip,
	removeMaskFromClip,
	updateMaskInClip,
	reorderMasksInClip,
	type Mask,
	type ColorRgba,
	type EffectInstance,
	type EffectType,
	type Transition,
	type TransitionType,
	type TransitionAlignment,
	type Asset,
	type AssetId,
	type BezierHandle,
	type Clip,
	type ClipId,
	type DragPosition,
	type DragSession,
	type InterpolationPreset,
	type JsonValue,
	type KeyframeClipboard,
	type KeyframeRef,
	type Project,
	type ProjectId,
	type ProjectSettings,
	type ProjectSummary,
	type PropertyId,
	type PropertyValue,
	type Time,
	type Track,
	type TrackId,
	type TrackEq,
	type TrackCompressor,
	type AnimatedValue
} from '../core';
import { defaultTrackAudio } from '../core/audioMath';
import { generatePresetKeyframes, templates } from '../core/text/presets';
import { ensureLutLoaded, storeParsedLut } from '../services/media/lutCache';
import type { ScopeFrameData } from '../services/render/passes/scopes';
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
import { repairProjectAudioMetadata } from '../services/media/repairAudio';
import { projectNameSchema } from '../services/project/projectName';
import { applyTheme, initializeTheme, type ThemeMode } from '../services/theme/theme';
import { clampPanelSize } from '../ui/shell/panelSizing';
import { createHistory, type HistorySnapshot, type HistoryKeyframeRef } from './history';

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
	transitionId?: string;
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

export interface InspectorState {
	expanded: Record<string, boolean>;
	linkScale: boolean;
}

export interface KeyframeSelectionRef {
	clipId: ClipId;
	propertyId: PropertyId;
	time: Time;
}

export interface GraphViewport {
	minTime: number;
	maxTime: number;
	minValue: number;
	maxValue: number;
}

export interface GraphState {
	open: boolean;
	visibleProperties: PropertyId[];
	viewport?: GraphViewport;
}

export interface KeyframeState {
	selection: KeyframeSelectionRef[];
	clipboard: KeyframeClipboard | null;
	showLanes: 'selected' | 'all' | 'off';
	graph: GraphState;
}

export interface EffectsUiState {
	libraryQuery: string;
	selectedEffectId: string | null;
}

export interface ScopesUiState {
	open: boolean;
	mode: 'waveform' | 'parade' | 'histogram' | 'vectorscope';
	channel: 'luma' | 'rgb';
	lastCapture?: ScopeFrameData | null;
}

export interface ColorUiState {
	activeTab: 'basic' | 'curves' | 'wheels' | 'lut';
}

const INSPECTOR_STORAGE_KEY = 'tfve:inspector-prefs';

function loadInspectorPrefs(): InspectorState {
	const fallback: InspectorState = {
		expanded: { transform: true, crop: false },
		linkScale: true
	};
	if (typeof localStorage === 'undefined') return fallback;
	try {
		const raw = localStorage.getItem(INSPECTOR_STORAGE_KEY);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw);
		return {
			expanded: { ...fallback.expanded, ...(parsed.expanded ?? {}) },
			linkScale: typeof parsed.linkScale === 'boolean' ? parsed.linkScale : true
		};
	} catch {
		return fallback;
	}
}

function persistInspectorPrefs(prefs: InspectorState): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify(prefs));
	} catch {}
}

function createKeyframeState(): KeyframeState {
	return {
		selection: [],
		clipboard: null,
		showLanes: 'selected',
		graph: {
			open: false,
			visibleProperties: ['position', 'scale', 'rotation', 'opacity', 'crop']
		}
	};
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
	isSpeedDialogOpen: boolean;
	speedDialogClipId: ClipId | null;
	recovery: RecoveryState | null;
	media: MediaState;
	timeline: TimelineState;
	inspector: InspectorState;
	keyframes: KeyframeState;
	effectsUi: EffectsUiState;
	scopes: ScopesUiState;
	colorUi: ColorUiState;
	effectsClipboard: EffectInstance[] | null;
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
	repairAudioMetadata: () => Promise<{ project: Project | null; warnings: string[] }>;
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
	openSpeedDialog: (clipId?: ClipId) => void;
	closeSpeedDialog: () => void;
	setClipSpeed: (
		clipIds: ClipId[],
		speedMultiplier: number,
		options?: { ripple?: boolean; maintainPitch?: boolean }
	) => boolean;
	reverseClips: (clipIds: ClipId[]) => boolean;
	enableTimeRemap: (clipId: ClipId) => boolean;
	disableTimeRemap: (clipId: ClipId, mode?: 'average' | 'initial') => boolean;
	setClipTimeRemap: (clipId: ClipId, timeRemap: AnimatedValue<number>) => boolean;
	addFreezeFrame: (clipId: ClipId, duration?: Time, options?: { ripple?: boolean }) => boolean;
	freezeFrameToEnd: (clipId: ClipId) => boolean;
	setMaintainPitch: (clipIds: ClipId[], maintainPitch: boolean) => boolean;
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
	setInspectorExpanded: (sectionId: string, expanded: boolean) => void;
	setInspectorLinkScale: (link: boolean) => void;
	setKeyframeSelection: (selection: KeyframeSelectionRef[]) => void;
	selectKeyframe: (ref: KeyframeSelectionRef, mode?: 'set' | 'toggle' | 'extend') => void;
	clearKeyframeSelection: () => void;
	setShowKeyframeLanes: (mode: 'selected' | 'all' | 'off') => void;
	toggleKeyframeLanes: () => void;
	setGraphOpen: (open: boolean) => void;
	toggleGraphEditor: () => void;
	setGraphVisibleProperties: (properties: PropertyId[]) => void;
	setGraphViewport: (viewport: GraphViewport) => void;
	setProperty: (
		clipId: ClipId,
		propertyId: PropertyId,
		value: PropertyValue,
		options?: { autoKey?: boolean; editedChannel?: number; coalesce?: boolean }
	) => void;
	enableAnimation: (clipId: ClipId, propertyId: PropertyId) => void;
	disableAnimation: (
		clipId: ClipId,
		propertyId: PropertyId,
		mode?: 'flatten-current' | 'discard'
	) => void;
	toggleKeyframe: (clipId: ClipId, propertyId: PropertyId) => void;
	deleteSelectedKeyframes: () => void;
	moveSelectedKeyframes: (deltaTime: Time, commit?: boolean) => void;
	setKeyframeInterpolation: (preset: Exclude<InterpolationPreset, 'bezier'>) => void;
	setBezierHandles: (
		clipId: ClipId,
		propertyId: PropertyId,
		time: Time,
		handles: { easeIn?: BezierHandle; easeOut?: BezierHandle }
	) => void;
	copySelectedKeyframes: () => void;
	pasteKeyframes: (targetClipId?: ClipId, targetPropertyId?: PropertyId) => void;
	nextKeyframe: () => void;
	prevKeyframe: () => void;
	easyEase: () => void;
	setEffectsLibraryQuery: (query: string) => void;
	setSelectedEffectId: (effectId: string | null) => void;
	setScopesOpen: (open: boolean) => void;
	toggleScopesOpen: () => void;
	setScopesMode: (mode: ScopesUiState['mode']) => void;
	setScopesChannel: (channel: ScopesUiState['channel']) => void;
	setColorTab: (tab: ColorUiState['activeTab']) => void;
	addEffect: (
		clipId: ClipId,
		effectType: EffectType,
		initialParams?: Record<string, unknown>
	) => EffectInstance | null;
	removeEffect: (clipId: ClipId, effectId: string) => boolean;
	reorderEffect: (clipId: ClipId, effectId: string, toIndex: number) => boolean;
	toggleEffect: (clipId: ClipId, effectId: string, enabled?: boolean) => boolean;
	duplicateEffect: (clipId: ClipId, effectId: string) => EffectInstance | null;
	resetEffect: (clipId: ClipId, effectId: string) => boolean;
	setEffectParam: (
		clipId: ClipId,
		effectId: string,
		paramName: string,
		value: unknown,
		options?: { autoKey?: boolean; coalesce?: boolean }
	) => void;
	copyClipEffects: (clipId: ClipId) => void;
	pasteClipEffects: (clipId: ClipId) => boolean;
	ensureColorCorrection: (clipId: ClipId) => EffectInstance | null;
	addAdjustmentLayer: (trackId?: TrackId, start?: Time, duration?: Time) => ClipId | null;
	addSolidLayer: (
		color?: ColorRgba | string,
		trackId?: TrackId,
		start?: Time,
		duration?: Time
	) => ClipId | null;
	addTextLayer: (text?: string, trackId?: TrackId, start?: Time, duration?: Time) => ClipId | null;
	setTextContent: (clipId: ClipId, text: string) => void;
	setTextFillColor: (clipId: ClipId, color: ColorRgba) => void;
	setTextFontSize: (clipId: ClipId, fontSize: number) => void;
	applyTextAnimationPreset: (clipId: ClipId, preset: 'fade-in' | 'fade-out' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'pop-in' | 'pop-out' | 'typewriter-in' | 'typewriter-out') => void;
	importLut: (name: string, cubeText: string) => Promise<AssetId | null>;
	// Transition actions
	addTransition: (
		trackId: TrackId,
		type: TransitionType,
		edge: Transition['edge'],
		duration?: Time,
		alignment?: TransitionAlignment,
		params?: Record<string, JsonValue>
	) => string | null;
	updateTransition: (
		transitionId: string,
		updates: Partial<
			Pick<Transition, 'type' | 'duration' | 'alignment' | 'easing' | 'audioCrossfade' | 'params'>
		>
	) => boolean;
	removeTransition: (transitionId: string) => boolean;
	selectTransition: (transitionId: string | null) => void;
	applyDefaultTransition: (type?: TransitionType) => boolean;
	// Mask actions
	maskTool: {
		activeTool: 'select' | 'pen' | 'rect' | 'ellipse';
		selectedMaskId: string | null;
		selectedPointIndex: number | null;
		selectedPoints: number[];
		showOverlay: boolean;
		blockedMessage: string | null;
	};
	setMaskTool: (tool: 'select' | 'pen' | 'rect' | 'ellipse') => void;
	selectMask: (maskId: string | null) => void;
	selectMaskPoint: (index: number | null) => void;
	selectMaskPoints: (indices: number[]) => void;
	toggleMaskPoint: (index: number, multiSelect?: boolean) => void;
	setMaskOverlayVisible: (visible: boolean) => void;
	setMaskBlockedMessage: (message: string | null) => void;
	addMask: (
		clipId: ClipId,
		type: 'rect' | 'ellipse' | 'path',
		overrides?: Partial<Mask>
	) => string | null;
	removeMask: (clipId: ClipId, maskId: string) => boolean;
	updateMask: (
		clipId: ClipId,
		maskId: string,
		patch: Partial<Mask>,
		options?: { coalesce?: boolean }
	) => boolean;
	reorderMask: (clipId: ClipId, fromIndex: number, toIndex: number) => boolean;
	setMaskParam: (
		clipId: ClipId,
		maskId: string,
		param: string,
		value: unknown,
		options?: { autoKey?: boolean; coalesce?: boolean }
	) => void;
	// Audio actions
	isMixerOpen: boolean;
	toggleMixer: () => void;
	setTrackAudioGain: (trackId: TrackId, gainDb: number, coalesce?: boolean) => boolean;
	setTrackAudioPan: (trackId: TrackId, pan: number, coalesce?: boolean) => boolean;
	setTrackAudioSolo: (trackId: TrackId, solo?: boolean) => boolean;
	setTrackAudioEq: (trackId: TrackId, eq: TrackEq) => boolean;
	setTrackAudioCompressor: (trackId: TrackId, compressor: TrackCompressor) => boolean;
	resetTrackAudio: (trackId: TrackId) => boolean;
	setMasterAudioGain: (gainDb: number, coalesce?: boolean) => boolean;
	setMasterAudioLimiter: (limiter: boolean) => boolean;
	setClipFade: (
		clipId: ClipId,
		fade: { fadeInUs?: Time; fadeOutUs?: Time; fadeCurve?: 'equalPower' | 'linear' }
	) => boolean;
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
				const keyframeSelectionBefore = [...get().keyframes.selection];
				const [updated, patches, inversePatches] = produceWithPatches(current, () => {
					const res = recipe(current);
					return normalizeProjectTransitions(res);
				});
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
						if (switchedProject) {
							state.timeline = createTimelineState();
							state.keyframes = createKeyframeState();
							state.effectsUi.selectedEffectId = null;
						} else {
							const clipsMap = new Map<ClipId, Clip>();
							for (const track of project.tracks) {
								for (const clip of track.clips) {
									clipsMap.set(clip.id, clip);
								}
							}
							state.timeline.selection.clipIds = state.timeline.selection.clipIds.filter((id) =>
								clipsMap.has(id)
							);
							if (
								state.timeline.selection.trackId &&
								!project.tracks.some((track) => track.id === state.timeline.selection.trackId)
							) {
								delete state.timeline.selection.trackId;
							}
							state.keyframes.selection = state.keyframes.selection.filter((ref) => {
								const clip = clipsMap.get(ref.clipId);
								if (!clip) return false;
								const curve = propertyCurve(clip, ref.propertyId);
								return (
									curve && isAnimated(curve) && curve.keyframes.some((k) => k.time === ref.time)
								);
							});
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
							selectionAfter: [...state.timeline.selection.clipIds],
							keyframeSelectionBefore,
							keyframeSelectionAfter: [...state.keyframes.selection]
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

			function restoreHistorySelection(
				ids: readonly ClipId[],
				keyframeRefs: readonly HistoryKeyframeRef[] | undefined,
				project: Project
			): void {
				const clipsMap = new Map<ClipId, Clip>();
				for (const track of project.tracks) {
					for (const clip of track.clips) {
						clipsMap.set(clip.id, clip);
					}
				}
				const tracks = new Set(project.tracks.map((track) => track.id));
				set((state) => {
					state.timeline.selection.clipIds = ids.filter((id) => clipsMap.has(id));
					if (state.timeline.selection.trackId && !tracks.has(state.timeline.selection.trackId)) {
						delete state.timeline.selection.trackId;
					}
					if (keyframeRefs) {
						state.keyframes.selection = keyframeRefs.filter((ref) => {
							const clip = clipsMap.get(ref.clipId);
							if (!clip) return false;
							const curve = propertyCurve(clip, ref.propertyId);
							return curve && isAnimated(curve) && curve.keyframes.some((k) => k.time === ref.time);
						});
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
				let reconciled: Project;
				if (!isOpfsSupported()) {
					set((state) => {
						state.projectMessage =
							'Persistent media storage is unavailable in this browser. Media assets are marked offline.';
					});
					const assets = Object.fromEntries(
						Object.values(project.assets).map((asset) => [asset.id, { ...asset, offline: true }])
					) as Project['assets'];
					reconciled = { ...project, assets };
				} else {
					const result = await reconcileProjectMedia(project);
					if (result.unknownFiles.length > 0) {
						set((state) => {
							state.projectMessage = `Found ${result.unknownFiles.length} untracked file(s) in this project's media folder. They were preserved.`;
						});
					}
					reconciled = result.changed ? { ...project, assets: result.assets } : project;
				}
				const audioRepair = await repairProjectAudioMetadata(reconciled);
				if (audioRepair.warnings.length > 0) {
					set((state) => {
						state.projectMessage = audioRepair.warnings.join(' ');
					});
				}
				return audioRepair.project;
			}

			function scheduleDerived(projectId: ProjectId, asset: Asset): void {
				if (asset.offline) return;
				if (asset.kind === 'lut') {
					void ensureLutLoaded(projectId, asset);
					return;
				}
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
				isSpeedDialogOpen: false,
				speedDialogClipId: null,
				recovery: null,
				media: {
					importQueue: [],
					derivedStatus: {},
					viewMode: 'list',
					search: '',
					selectedAssetIds: []
				},
				timeline: createTimelineState(),
				inspector: loadInspectorPrefs(),
				keyframes: createKeyframeState(),
				effectsUi: {
					libraryQuery: '',
					selectedEffectId: null
				},
				scopes: {
					open: false,
					mode: 'waveform',
					channel: 'luma'
				},
				colorUi: {
					activeTab: 'basic'
				},
				maskTool: {
					activeTool: 'select',
					selectedMaskId: null,
					selectedPointIndex: null,
					selectedPoints: [],
					showOverlay: true,
					blockedMessage: null
				},
				isMixerOpen: false,
				effectsClipboard: null,
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
				async repairAudioMetadata() {
					const project = get().project;
					if (!project) return { project: null, warnings: [] };
					const result = await repairProjectAudioMetadata(project);
					if (result.project !== project) {
						mutateProject('Repair audio metadata', () => result.project, {
							target: project,
							dirty: true,
							history: 'skip'
						});
					}
					if (result.warnings.length > 0) {
						set((state) => {
							state.projectMessage = result.warnings.join(' ');
						});
					}
					return { project: get().project, warnings: result.warnings };
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
				openSpeedDialog(clipId) {
					const targetId = clipId ?? get().timeline.selection.clipIds[0];
					if (!targetId) return;
					set((state) => {
						state.isSpeedDialogOpen = true;
						state.speedDialogClipId = targetId;
						state.isFileMenuOpen = false;
					});
				},
				closeSpeedDialog() {
					set((state) => {
						state.isSpeedDialogOpen = false;
						state.speedDialogClipId = null;
					});
				},
				setClipSpeed(clipIds, speedMultiplier, options) {
					const project = get().project;
					if (!project || clipIds.length === 0) return false;
					const allIds = new Set<ClipId>();
					for (const id of clipIds) {
						for (const member of groupOf(project, id)) {
							allIds.add(member.id);
						}
					}
					return Boolean(
						mutateProject('Change clip speed', (current) => {
							let updated = setConstantSpeed(current, Array.from(allIds), speedMultiplier, options);
							if (options?.maintainPitch !== undefined) {
								updated = {
									...updated,
									tracks: updated.tracks.map((track) => ({
										...track,
										clips: track.clips.map((clip) => {
											if (allIds.has(clip.id)) {
												return { ...clip, maintainPitch: options.maintainPitch };
											}
											return clip;
										})
									}))
								};
							}
							return updated;
						})
					);
				},
				reverseClips(clipIds) {
					const project = get().project;
					if (!project || clipIds.length === 0) return false;
					const allIds = new Set<ClipId>();
					for (const id of clipIds) {
						for (const member of groupOf(project, id)) {
							allIds.add(member.id);
						}
					}
					return Boolean(
						mutateProject('Reverse clip', (current) => {
							return {
								...current,
								tracks: current.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) => {
										if (allIds.has(clip.id)) {
											return reverseClip(clip);
										}
										return clip;
									})
								}))
							};
						})
					);
				},
				enableTimeRemap(clipId) {
					const project = get().project;
					if (!project) return false;
					const allIds = new Set<ClipId>(groupOf(project, clipId).map((m) => m.id));
					return Boolean(
						mutateProject('Enable time remapping', (current) => {
							return {
								...current,
								tracks: current.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) => {
										if (allIds.has(clip.id)) {
											return enableClipTimeRemap(clip);
										}
										return clip;
									})
								}))
							};
						})
					);
				},
				disableTimeRemap(clipId, mode = 'average') {
					const project = get().project;
					if (!project) return false;
					const allIds = new Set<ClipId>(groupOf(project, clipId).map((m) => m.id));
					return Boolean(
						mutateProject('Disable time remapping', (current) => {
							return {
								...current,
								tracks: current.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) => {
										if (allIds.has(clip.id)) {
											return disableClipTimeRemap(clip, mode);
										}
										return clip;
									})
								}))
							};
						})
					);
				},
				setClipTimeRemap(clipId, timeRemap) {
					return Boolean(
						mutateProject('Set time remapping curve', (current) => ({
							...current,
							tracks: current.tracks.map((track) => ({
								...track,
								clips: track.clips.map((clip) => {
									if (clip.id === clipId) {
										return { ...clip, timeRemap };
									}
									return clip;
								})
							}))
						}))
					);
				},
				addFreezeFrame(clipId, duration, options) {
					const playhead = get().timeline.playhead;
					return Boolean(
						mutateProject('Add freeze frame', (current) => {
							return addFreezeFrameOperation(current, clipId, playhead, duration, options);
						})
					);
				},
				freezeFrameToEnd(clipId) {
					const playhead = get().timeline.playhead;
					return Boolean(
						mutateProject('Freeze frame to end', (current) => {
							return freezeFrameToEndOperation(current, clipId, playhead);
						})
					);
				},
				setMaintainPitch(clipIds, maintainPitch) {
					const project = get().project;
					if (!project || clipIds.length === 0) return false;
					const allIds = new Set<ClipId>();
					for (const id of clipIds) {
						for (const member of groupOf(project, id)) {
							allIds.add(member.id);
						}
					}
					return Boolean(
						mutateProject('Toggle maintain pitch', (current) => {
							return {
								...current,
								tracks: current.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) => {
										if (allIds.has(clip.id)) {
											return { ...clip, maintainPitch };
										}
										return clip;
									})
								}))
							};
						})
					);
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
					restoreHistorySelection(
						result.entry.selectionBefore,
						result.entry.keyframeSelectionBefore,
						restored
					);
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
					restoreHistorySelection(
						result.entry.selectionAfter,
						result.entry.keyframeSelectionAfter,
						restored
					);
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
								const track = withTrack.tracks.find(
									(candidate) => !project.tracks.some((existing) => existing.id === candidate.id)
								);
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
				},
				setInspectorExpanded(sectionId, expanded) {
					set((state) => {
						state.inspector.expanded[sectionId] = expanded;
						persistInspectorPrefs(state.inspector);
					});
				},
				setInspectorLinkScale(link) {
					set((state) => {
						state.inspector.linkScale = link;
						persistInspectorPrefs(state.inspector);
					});
				},
				setKeyframeSelection(selection) {
					set((state) => {
						state.keyframes.selection = [...selection];
					});
				},
				selectKeyframe(ref, mode = 'set') {
					set((state) => {
						if (mode === 'set') {
							state.keyframes.selection = [ref];
						} else if (mode === 'toggle') {
							const idx = state.keyframes.selection.findIndex(
								(s) =>
									s.clipId === ref.clipId && s.propertyId === ref.propertyId && s.time === ref.time
							);
							if (idx >= 0) {
								state.keyframes.selection.splice(idx, 1);
							} else {
								state.keyframes.selection.push(ref);
							}
						} else if (mode === 'extend') {
							const exists = state.keyframes.selection.some(
								(s) =>
									s.clipId === ref.clipId && s.propertyId === ref.propertyId && s.time === ref.time
							);
							if (!exists) {
								state.keyframes.selection.push(ref);
							}
						}
						if (!state.timeline.selection.clipIds.includes(ref.clipId)) {
							state.timeline.selection.clipIds = [ref.clipId];
						}
					});
				},
				clearKeyframeSelection() {
					set((state) => {
						state.keyframes.selection = [];
					});
				},
				setShowKeyframeLanes(mode) {
					set((state) => {
						state.keyframes.showLanes = mode;
					});
				},
				toggleKeyframeLanes() {
					set((state) => {
						state.keyframes.showLanes =
							state.keyframes.showLanes === 'off'
								? 'selected'
								: state.keyframes.showLanes === 'selected'
									? 'all'
									: 'off';
					});
				},
				setGraphOpen(open) {
					set((state) => {
						state.keyframes.graph.open = open;
					});
				},
				toggleGraphEditor() {
					set((state) => {
						state.keyframes.graph.open = !state.keyframes.graph.open;
					});
				},
				setGraphVisibleProperties(properties) {
					set((state) => {
						state.keyframes.graph.visibleProperties = properties;
					});
				},
				setGraphViewport(viewport) {
					set((state) => {
						state.keyframes.graph.viewport = viewport;
					});
				},
				setProperty(clipId, propertyId, value, options) {
					const project = get().project;
					if (!project) return;
					try {
						mutateProject(
							`Change ${descriptorFor(propertyId)?.label ?? propertyId}`,
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) => {
										if (clip.id !== clipId) return clip;
										const localTime = get().timeline.playhead - clip.start;
										return setPropertyAtTime(clip, propertyId, localTime, value, {
											autoKey: options?.autoKey ?? true,
											fps: proj.settings.fps,
											editedChannel: options?.editedChannel
										});
									})
								}))
							}),
							{
								history: 'record',
								mergeKey: options?.coalesce ? `set-prop:${clipId}:${propertyId}` : undefined
							}
						);
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
					}
				},
				enableAnimation(clipId, propertyId) {
					const project = get().project;
					if (!project) return;
					try {
						let addedKeyTime: Time | null = null;
						mutateProject(
							`Animate ${descriptorFor(propertyId)?.label ?? propertyId}`,
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) => {
										if (clip.id !== clipId) return clip;
										const localTime = get().timeline.playhead - clip.start;
										const updatedClip = enableClipAnimation(
											clip,
											propertyId,
											localTime,
											proj.settings.fps
										);
										const curve = propertyCurve(updatedClip, propertyId);
										if (curve && isAnimated(curve) && curve.keyframes.length > 0) {
											addedKeyTime = curve.keyframes[0]!.time;
										}
										return updatedClip;
									})
								}))
							}),
							{ history: 'record' }
						);
						if (addedKeyTime !== null) {
							set((state) => {
								state.keyframes.selection = [{ clipId, propertyId, time: addedKeyTime! }];
							});
						}
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
					}
				},
				disableAnimation(clipId, propertyId, mode = 'flatten-current') {
					const project = get().project;
					if (!project) return;
					try {
						mutateProject(
							`Remove animation from ${descriptorFor(propertyId)?.label ?? propertyId}`,
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) => {
										if (clip.id !== clipId) return clip;
										const localTime = get().timeline.playhead - clip.start;
										return disableClipAnimation(clip, propertyId, localTime, mode);
									})
								}))
							}),
							{ history: 'record' }
						);
						set((state) => {
							state.keyframes.selection = state.keyframes.selection.filter(
								(ref) => !(ref.clipId === clipId && ref.propertyId === propertyId)
							);
						});
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
					}
				},
				toggleKeyframe(clipId, propertyId) {
					const project = get().project;
					if (!project) return;
					try {
						mutateProject(
							`Toggle ${descriptorFor(propertyId)?.label ?? propertyId} keyframe`,
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) => {
										if (clip.id !== clipId) return clip;
										const localTime = get().timeline.playhead - clip.start;
										return toggleClipKeyframe(clip, propertyId, localTime, proj.settings.fps);
									})
								}))
							}),
							{ history: 'record' }
						);
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
					}
				},
				deleteSelectedKeyframes() {
					const project = get().project;
					const selection = get().keyframes.selection;
					if (!project || selection.length === 0) return;
					const byClip = new Map<ClipId, KeyframeRef[]>();
					for (const ref of selection) {
						const list = byClip.get(ref.clipId) ?? [];
						list.push({ propertyId: ref.propertyId, time: ref.time });
						byClip.set(ref.clipId, list);
					}
					try {
						mutateProject(
							selection.length === 1 ? 'Delete keyframe' : `Delete ${selection.length} keyframes`,
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) => {
										const clipKeys = byClip.get(clip.id);
										return clipKeys && clipKeys.length > 0
											? deleteClipKeyframes(clip, clipKeys)
											: clip;
									})
								}))
							}),
							{ history: 'record' }
						);
						set((state) => {
							state.keyframes.selection = [];
						});
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
					}
				},
				moveSelectedKeyframes(deltaTime, commit = true) {
					const project = get().project;
					const selection = get().keyframes.selection;
					if (!project || selection.length === 0 || deltaTime === 0) return;
					const byClip = new Map<ClipId, KeyframeRef[]>();
					for (const ref of selection) {
						const list = byClip.get(ref.clipId) ?? [];
						list.push({ propertyId: ref.propertyId, time: ref.time });
						byClip.set(ref.clipId, list);
					}
					try {
						let appliedDelta: Time = 0;
						mutateProject(
							'Move keyframes',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) => {
										const clipKeys = byClip.get(clip.id);
										if (clipKeys && clipKeys.length > 0) {
											const res = moveClipKeyframes(clip, clipKeys, deltaTime);
											appliedDelta = res.appliedDelta;
											return res.clip;
										}
										return clip;
									})
								}))
							}),
							{
								history: commit ? 'record' : 'skip',
								mergeKey: !commit ? 'move-keyframes' : undefined
							}
						);
						if (appliedDelta !== 0) {
							set((state) => {
								state.keyframes.selection = state.keyframes.selection.map((ref) => ({
									...ref,
									time: ref.time + appliedDelta
								}));
							});
						}
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
					}
				},
				setKeyframeInterpolation(preset) {
					const project = get().project;
					const selection = get().keyframes.selection;
					if (!project || selection.length === 0) return;
					const byClip = new Map<ClipId, KeyframeRef[]>();
					for (const ref of selection) {
						const list = byClip.get(ref.clipId) ?? [];
						list.push({ propertyId: ref.propertyId, time: ref.time });
						byClip.set(ref.clipId, list);
					}
					try {
						mutateProject(
							`Set keyframe interpolation: ${preset}`,
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) => {
										const clipKeys = byClip.get(clip.id);
										return clipKeys && clipKeys.length > 0
											? setClipKeyframeInterpolation(clip, clipKeys, preset)
											: clip;
									})
								}))
							}),
							{ history: 'record' }
						);
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
					}
				},
				setBezierHandles(clipId, propertyId, time, handles) {
					const project = get().project;
					if (!project) return;
					try {
						mutateProject(
							'Adjust bezier handles',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) =>
										clip.id === clipId
											? setClipBezierHandles(clip, propertyId, time, handles)
											: clip
									)
								}))
							}),
							{ history: 'record', mergeKey: `bezier:${clipId}:${propertyId}:${time}` }
						);
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
					}
				},
				copySelectedKeyframes() {
					const project = get().project;
					const selection = get().keyframes.selection;
					if (!project || selection.length === 0) return;
					const clipId = selection[0]!.clipId;
					let targetClip: Clip | null = null;
					for (const track of project.tracks) {
						const clip = track.clips.find((c) => c.id === clipId);
						if (clip) {
							targetClip = clip;
							break;
						}
					}
					if (!targetClip) return;
					const clipSelection = selection
						.filter((ref) => ref.clipId === clipId)
						.map((ref) => ({ propertyId: ref.propertyId, time: ref.time }));
					try {
						const clipboard = copyKeyframes(targetClip, clipSelection);
						set((state) => {
							state.keyframes.clipboard = clipboard;
						});
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
					}
				},
				pasteKeyframes(targetClipId, targetPropertyId) {
					const project = get().project;
					const clipboard = get().keyframes.clipboard;
					if (!project || !clipboard || clipboard.entries.length === 0) return;
					const clipId = targetClipId ?? get().timeline.selection.clipIds[0];
					if (!clipId) return;
					try {
						let pastedRefs: KeyframeRef[] = [];
						mutateProject(
							'Paste keyframes',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) => {
										if (clip.id !== clipId) return clip;
										const localTime = get().timeline.playhead - clip.start;
										const res = pasteKeyframes(clip, clipboard, localTime, targetPropertyId);
										pastedRefs = res.pasted;
										return res.clip;
									})
								}))
							}),
							{ history: 'record' }
						);
						if (pastedRefs.length > 0) {
							set((state) => {
								state.keyframes.selection = pastedRefs.map((r) => ({
									clipId,
									propertyId: r.propertyId,
									time: r.time
								}));
							});
						}
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
					}
				},
				nextKeyframe() {
					const project = get().project;
					if (!project) return;
					const playhead = get().timeline.playhead;
					const selectedIds = new Set(get().timeline.selection.clipIds);
					const targetClips = project.tracks.flatMap((track) =>
						track.clips.filter((clip) => selectedIds.size === 0 || selectedIds.has(clip.id))
					);
					let nextGlobalTime: Time | null = null;
					for (const clip of targetClips) {
						const localTime = playhead - clip.start;
						const nextLocal = nextKeyframeTime(clip, ANIMATABLE_PROPERTY_IDS, localTime);
						if (nextLocal !== null) {
							const globalTime = clip.start + nextLocal;
							if (
								globalTime > playhead &&
								(nextGlobalTime === null || globalTime < nextGlobalTime)
							) {
								nextGlobalTime = globalTime;
							}
						}
					}
					if (nextGlobalTime !== null) {
						set((state) => {
							state.timeline.playhead = nextGlobalTime!;
						});
					}
				},
				prevKeyframe() {
					const project = get().project;
					if (!project) return;
					const playhead = get().timeline.playhead;
					const selectedIds = new Set(get().timeline.selection.clipIds);
					const targetClips = project.tracks.flatMap((track) =>
						track.clips.filter((clip) => selectedIds.size === 0 || selectedIds.has(clip.id))
					);
					let prevGlobalTime: Time | null = null;
					for (const clip of targetClips) {
						const localTime = playhead - clip.start;
						const prevLocal = prevKeyframeTime(clip, ANIMATABLE_PROPERTY_IDS, localTime);
						if (prevLocal !== null) {
							const globalTime = clip.start + prevLocal;
							if (
								globalTime < playhead &&
								(prevGlobalTime === null || globalTime > prevGlobalTime)
							) {
								prevGlobalTime = globalTime;
							}
						}
					}
					if (prevGlobalTime !== null) {
						set((state) => {
							state.timeline.playhead = prevGlobalTime!;
						});
					}
				},
				easyEase() {
					get().setKeyframeInterpolation('ease-in-out');
				},
				setEffectsLibraryQuery(query) {
					set((state) => {
						state.effectsUi.libraryQuery = query;
					});
				},
				setSelectedEffectId(effectId) {
					set((state) => {
						state.effectsUi.selectedEffectId = effectId;
					});
				},
				setScopesOpen(open) {
					set((state) => {
						state.scopes.open = open;
					});
				},
				toggleScopesOpen() {
					set((state) => {
						state.scopes.open = !state.scopes.open;
					});
				},
				setScopesMode(mode) {
					set((state) => {
						state.scopes.mode = mode;
					});
				},
				setScopesChannel(channel) {
					set((state) => {
						state.scopes.channel = channel;
					});
				},
				setColorTab(tab) {
					set((state) => {
						state.colorUi.activeTab = tab;
					});
				},
				addEffect(clipId, effectType, initialParams) {
					const project = get().project;
					if (!project) return null;
					let instance: EffectInstance | null = null;
					try {
						instance = createEffectInstance(effectType, initialParams);
						const created = instance;
						mutateProject(
							`Add ${instance.type} effect`,
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) =>
										clip.id === clipId ? addEffectToClip(clip, created) : clip
									)
								}))
							}),
							{ history: 'record' }
						);
						set((state) => {
							state.effectsUi.selectedEffectId = created.id;
						});
						return created;
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
						return null;
					}
				},
				removeEffect(clipId, effectId) {
					const project = get().project;
					if (!project) return false;
					try {
						mutateProject(
							'Remove effect',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) =>
										clip.id === clipId ? removeEffectFromClip(clip, effectId) : clip
									)
								}))
							}),
							{ history: 'record' }
						);
						set((state) => {
							if (state.effectsUi.selectedEffectId === effectId) {
								state.effectsUi.selectedEffectId = null;
							}
						});
						return true;
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
						return false;
					}
				},
				reorderEffect(clipId, effectId, toIndex) {
					const project = get().project;
					if (!project) return false;
					try {
						mutateProject(
							'Reorder effects',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) =>
										clip.id === clipId ? reorderEffectInClip(clip, effectId, toIndex) : clip
									)
								}))
							}),
							{ history: 'record' }
						);
						return true;
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
						return false;
					}
				},
				toggleEffect(clipId, effectId, enabled) {
					const project = get().project;
					if (!project) return false;
					try {
						mutateProject(
							'Toggle effect',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) =>
										clip.id === clipId ? toggleEffectInClip(clip, effectId, enabled) : clip
									)
								}))
							}),
							{ history: 'record' }
						);
						return true;
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
						return false;
					}
				},
				duplicateEffect(clipId, effectId) {
					const project = get().project;
					if (!project) return null;
					let dup: EffectInstance | null = null;
					try {
						mutateProject(
							'Duplicate effect',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) => {
										if (clip.id !== clipId) return clip;
										const updated = duplicateEffectInClip(clip, effectId);
										const idx = (clip.effects ?? []).findIndex((e) => e.id === effectId);
										if (idx !== -1 && updated.effects?.[idx + 1]) {
											dup = updated.effects[idx + 1]!;
										}
										return updated;
									})
								}))
							}),
							{ history: 'record' }
						);
						if (dup) {
							const dupId = (dup as EffectInstance).id;
							set((state) => {
								state.effectsUi.selectedEffectId = dupId;
							});
						}
						return dup;
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
						return null;
					}
				},
				resetEffect(clipId, effectId) {
					const project = get().project;
					if (!project) return false;
					try {
						mutateProject(
							'Reset effect',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) => {
										if (clip.id !== clipId) return clip;
										const effects = (clip.effects ?? []).map((eff) => {
											if (eff.id !== effectId) return eff;
											const fresh = createEffectInstance(eff.type);
											return {
												...fresh,
												id: eff.id,
												enabled: eff.enabled
											};
										});
										return { ...clip, effects };
									})
								}))
							}),
							{ history: 'record' }
						);
						return true;
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
						return false;
					}
				},
				setEffectParam(clipId, effectId, paramName, value, options) {
					const project = get().project;
					if (!project) return;
					let targetClip: Clip | undefined;
					let effectType: EffectType | undefined;
					for (const track of project.tracks) {
						const clip = track.clips.find((c) => c.id === clipId);
						if (clip) {
							targetClip = clip;
							const eff = (clip.effects ?? []).find((e) => e.id === effectId);
							if (eff) effectType = eff.type;
							break;
						}
					}
					if (!effectType || !targetClip) return;
					const propertyId = `effect:${effectType}:${effectId}:${paramName}` as PropertyId;
					const curve = propertyCurve(targetClip, propertyId);
					const def = getEffectDefinition(effectType);
					const paramDef = def?.params[paramName];
					const isAnimatable = Boolean(
						paramName === 'mix' || (paramDef?.animatable && paramDef.type !== 'color')
					);
					if ((curve && isAnimated(curve)) || isAnimatable) {
						get().setProperty(clipId, propertyId, value as PropertyValue, options);
						return;
					}
					try {
						mutateProject(
							`Change ${paramName}`,
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((c) => {
										if (c.id !== clipId) return c;
										return {
											...c,
											effects: (c.effects ?? []).map((eff) => {
												if (eff.id !== effectId) return eff;
												return {
													...eff,
													params: {
														...eff.params,
														[paramName]: value as JsonValue
													}
												};
											})
										};
									})
								}))
							}),
							{
								history: 'record',
								mergeKey: options?.coalesce
									? `set-effect-param:${clipId}:${effectId}:${paramName}`
									: undefined
							}
						);
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
					}
				},
				copyClipEffects(clipId) {
					const project = get().project;
					if (!project) return;
					for (const track of project.tracks) {
						const clip = track.clips.find((c) => c.id === clipId);
						if (clip) {
							const copied = copyClipEffectsCore(clip);
							set((state) => {
								state.effectsClipboard = copied;
								state.projectMessage = `Copied ${copied.length} effect(s).`;
							});
							return;
						}
					}
				},
				pasteClipEffects(clipId) {
					const project = get().project;
					const clipboard = get().effectsClipboard;
					if (!project || !clipboard || clipboard.length === 0) return false;
					try {
						mutateProject(
							`Paste ${clipboard.length} effect(s)`,
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((track) => ({
									...track,
									clips: track.clips.map((clip) =>
										clip.id === clipId ? pasteClipEffectsCore(clip, clipboard) : clip
									)
								}))
							}),
							{ history: 'record' }
						);
						set((state) => {
							state.projectMessage = `Pasted ${clipboard.length} effect(s).`;
						});
						return true;
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
						return false;
					}
				},
				ensureColorCorrection(clipId) {
					const project = get().project;
					if (!project) return null;
					for (const track of project.tracks) {
						const clip = track.clips.find((c) => c.id === clipId);
						if (clip) {
							const existing = (clip.effects ?? []).find((e) => e.type === 'colorCorrection');
							if (existing) return existing;
							break;
						}
					}
					return get().addEffect(clipId, 'colorCorrection');
				},
				addAdjustmentLayer(trackId, start, duration) {
					const project = get().project;
					if (!project) return null;
					const clipStart = snapToFrame(start ?? get().timeline.playhead, project.settings.fps);
					const clipDuration =
						duration ?? framesToTicks(5 * project.settings.fps, project.settings.fps);

					let targetTrackId = trackId;
					if (!targetTrackId) {
						const selTrackId = get().timeline.selection.trackId;
						const selTrack = project.tracks.find(
							(t) => t.id === selTrackId && t.kind === 'video' && !t.locked
						);
						if (selTrack) {
							targetTrackId = selTrack.id;
						} else {
							const videoTracks = project.tracks.filter((t) => t.kind === 'video' && !t.locked);
							if (videoTracks.length > 0) {
								targetTrackId = videoTracks[0]!.id;
							}
						}
					}

					let createdClipId: ClipId | null = null;
					try {
						mutateProject(
							'Add adjustment layer',
							(proj) => {
								let currentProj = proj;
								let trackToUse = targetTrackId
									? currentProj.tracks.find(
											(t) => t.id === targetTrackId && t.kind === 'video' && !t.locked
										)
									: undefined;
								if (!trackToUse) {
									const prevIds = new Set(currentProj.tracks.map((t) => t.id));
									currentProj = addTrackOperation(currentProj, 'video');
									trackToUse = currentProj.tracks.find(
										(t) => !prevIds.has(t.id) && t.kind === 'video'
									);
								}
								const clip = createAdjustmentClip(clipStart, clipDuration);
								createdClipId = clip.id;
								return insertClip(currentProj, trackToUse!.id, clip);
							},
							{ history: 'record' }
						);
						if (createdClipId) {
							get().selectClips([createdClipId]);
						}
						return createdClipId;
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return null;
					}
				},
				addSolidLayer(color = '#000000', trackId, start, duration) {
					const project = get().project;
					if (!project) return null;
					const clipStart = snapToFrame(start ?? get().timeline.playhead, project.settings.fps);
					const clipDuration =
						duration ?? framesToTicks(5 * project.settings.fps, project.settings.fps);

					let rgba: ColorRgba = { r: 0, g: 0, b: 0, a: 1 };
					if (typeof color === 'string') {
						const hex = color.replace('#', '');
						if (hex.length === 6) {
							rgba = {
								r: parseInt(hex.slice(0, 2), 16) / 255,
								g: parseInt(hex.slice(2, 4), 16) / 255,
								b: parseInt(hex.slice(4, 6), 16) / 255,
								a: 1
							};
						}
					} else if (typeof color === 'object' && color !== null) {
						rgba = color;
					}

					let targetTrackId = trackId;
					if (!targetTrackId) {
						const selTrackId = get().timeline.selection.trackId;
						const selTrack = project.tracks.find(
							(t) => t.id === selTrackId && t.kind === 'video' && !t.locked
						);
						if (selTrack) {
							targetTrackId = selTrack.id;
						} else {
							const videoTracks = project.tracks.filter((t) => t.kind === 'video' && !t.locked);
							if (videoTracks.length > 0) {
								targetTrackId = videoTracks[0]!.id;
							}
						}
					}

					let createdClipId: ClipId | null = null;
					try {
						mutateProject(
							'Add solid color',
							(proj) => {
								let currentProj = proj;
								let trackToUse = targetTrackId
									? currentProj.tracks.find(
											(t) => t.id === targetTrackId && t.kind === 'video' && !t.locked
										)
									: undefined;
								if (!trackToUse) {
									const prevIds = new Set(currentProj.tracks.map((t) => t.id));
									currentProj = addTrackOperation(currentProj, 'video');
									trackToUse = currentProj.tracks.find(
										(t) => !prevIds.has(t.id) && t.kind === 'video'
									);
								}
								const clip = createSolidClip(clipStart, clipDuration, {
									r: rgba.r,
									g: rgba.g,
									b: rgba.b,
									a: rgba.a ?? 1
								});
								createdClipId = clip.id;
								return insertClip(currentProj, trackToUse!.id, clip);
							},
							{ history: 'record' }
						);
						if (createdClipId) {
							get().selectClips([createdClipId]);
						}
						return createdClipId;
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return null;
					}
				},
				addTextLayer(text = 'Text', trackId, start, duration) {
					const project = get().project;
					if (!project) return null;
					const clipStart = snapToFrame(start ?? get().timeline.playhead, project.settings.fps);
					const clipDuration =
						duration ?? framesToTicks(5 * project.settings.fps, project.settings.fps);

					let targetTrackId = trackId;
					if (!targetTrackId) {
						const selTrackId = get().timeline.selection.trackId;
						const selTrack = project.tracks.find(
							(t) => t.id === selTrackId && t.kind === 'video' && !t.locked
						);
						if (selTrack) {
							targetTrackId = selTrack.id;
						} else {
							const videoTracks = project.tracks.filter((t) => t.kind === 'video' && !t.locked);
							if (videoTracks.length > 0) {
								targetTrackId = videoTracks[0]!.id;
							}
						}
					}

					let createdClipId: ClipId | null = null;
					try {
						mutateProject(
							'Add text layer',
							(proj) => {
								let currentProj = proj;
								let trackToUse = targetTrackId
									? currentProj.tracks.find(
											(t) => t.id === targetTrackId && t.kind === 'video' && !t.locked
										)
									: undefined;
								if (!trackToUse) {
									const prevIds = new Set(currentProj.tracks.map((t) => t.id));
									currentProj = addTrackOperation(currentProj, 'video');
									trackToUse = currentProj.tracks.find(
										(t) => !prevIds.has(t.id) && t.kind === 'video'
									);
								}
								const clip = createTextClip(clipStart, clipDuration, text);
								createdClipId = clip.id;
								return insertClip(currentProj, trackToUse!.id, clip);
							},
							{ history: 'record' }
						);
						if (createdClipId) {
							get().selectClips([createdClipId]);
						}
						return createdClipId;
					} catch (error) {
						set((state) => {
							state.timeline.message = errorMessage(error);
						});
						return null;
					}
				},
				setTextContent(clipId, text) {
					const project = get().project;
					if (!project) return;
					mutateProject(
						'Set text content',
						(proj) => ({
							...proj,
							tracks: proj.tracks.map((track) => ({
								...track,
								clips: track.clips.map((clip) =>
									clip.id === clipId && clip.source?.type === 'text'
										? {
												...clip,
												source: {
													...clip.source,
													text
												}
											}
										: clip
								)
							}))
						}),
						{ history: 'record' }
					);
				},
				setTextFillColor(clipId, color) {
					const project = get().project;
					if (!project) return;
					// Color animation is handled via keyframes on text.fillColor property
				},
				setTextFontSize(clipId, fontSize) {
					const project = get().project;
					if (!project) return;
					// Font size animation is handled via keyframes on text.fontSize property
				},
				applyTextAnimationPreset(clipId, preset) {
					const project = get().project;
					if (!project) return;
					const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
					if (!clip) return;
					const keyframes = generatePresetKeyframes(preset, clip.duration);
					mutateProject(
						`Apply ${preset} preset`,
						(proj) => ({
							...proj,
							tracks: proj.tracks.map((track) => ({
								...track,
								clips: track.clips.map((c) => {
									if (c.id !== clipId) return c;
									const newProperties = { ...c.properties } || {};
									for (const [propId, frames] of Object.entries(keyframes)) {
										newProperties[propId] = frames as any;
									}
									return {
										...c,
										properties: newProperties
									};
								})
							}))
						}),
						{ history: 'record' }
					);
				},
				async importLut(name, cubeText) {
					const project = get().project;
					if (!project) return null;
					try {
						const parsed = parseCubeLut(cubeText);
						const assetId = createAssetId();
						storeParsedLut(assetId, parsed);
						const cleanName = name.endsWith('.cube') ? name : `${name}.cube`;
						const file = new File([cubeText], cleanName, { type: 'text/plain' });
						const opfsPath = await writeMedia(project.id, assetId, file);
						const asset: Asset = {
							id: assetId,
							name: cleanName,
							kind: 'lut',
							duration: 0,
							size: file.size,
							mimeType: 'text/plain',
							hasAudio: false,
							opfsPath
						};
						mutateProject(
							'Import LUT',
							(proj) => ({
								...proj,
								assets: {
									...proj.assets,
									[assetId]: asset
								}
							}),
							{ history: 'record' }
						);
						set((state) => {
							state.projectMessage = `Imported LUT "${cleanName}".`;
						});
						return assetId;
					} catch (error) {
						set((state) => {
							state.projectMessage = `Could not import LUT: ${errorMessage(error)}`;
						});
						return null;
					}
				},

				addTransition(trackId, type, edge, duration, alignment = 'center', params = {}) {
					const project = get().project;
					if (!project) return null;
					const track = project.tracks.find((t) => t.id === trackId);
					if (!track) return null;

					const def = getTransitionDefinition(type);
					const effectiveDur = duration ?? def?.defaultDurationUs ?? 1_000_000;
					const id = `tr_${crypto.randomUUID().slice(0, 8)}`;

					const newTransition: Transition = {
						id,
						type,
						duration: effectiveDur,
						alignment,
						edge,
						params
					};

					mutateProject(
						`Add Transition (${def?.name ?? type})`,
						(proj) => ({
							...proj,
							tracks: proj.tracks.map((t) =>
								t.id === trackId
									? {
											...t,
											transitions: [...(t.transitions ?? []), newTransition]
										}
									: t
							)
						}),
						{ history: 'record' }
					);

					set((state) => {
						state.timeline.selection.transitionId = id;
						state.timeline.message = `Added ${def?.name ?? type} transition.`;
					});

					return id;
				},

				updateTransition(transitionId, updates) {
					const project = get().project;
					if (!project) return false;

					let found = false;
					mutateProject(
						'Edit Transition',
						(proj) => ({
							...proj,
							tracks: proj.tracks.map((t) => ({
								...t,
								transitions: (t.transitions ?? []).map((tr) => {
									if (tr.id === transitionId) {
										found = true;
										return {
											...tr,
											...updates,
											params: {
												...tr.params,
												...(updates.params ?? {})
											}
										};
									}
									return tr;
								})
							}))
						}),
						{ history: 'record', mergeKey: `transition:${transitionId}` }
					);

					return found;
				},

				removeTransition(transitionId) {
					const project = get().project;
					if (!project) return false;

					let removed = false;
					mutateProject(
						'Remove Transition',
						(proj) => ({
							...proj,
							tracks: proj.tracks.map((t) => ({
								...t,
								transitions: (t.transitions ?? []).filter((tr) => {
									if (tr.id === transitionId) {
										removed = true;
										return false;
									}
									return true;
								})
							}))
						}),
						{ history: 'record' }
					);

					if (removed) {
						set((state) => {
							if (state.timeline.selection.transitionId === transitionId) {
								delete state.timeline.selection.transitionId;
							}
						});
					}

					return removed;
				},

				selectTransition(transitionId) {
					set((state) => {
						if (transitionId) {
							state.timeline.selection.transitionId = transitionId;
							state.timeline.selection.clipIds = [];
						} else {
							delete state.timeline.selection.transitionId;
						}
					});
				},

				applyDefaultTransition(type: TransitionType = 'crossDissolve') {
					const state = get();
					const project = state.project;
					if (!project) return false;

					// If two adjacent clips are selected, or playhead is near an edit point:
					const selectedIds = state.timeline.selection.clipIds;
					const fps = project.settings.fps || 30;
					const tolerance = Math.round(1_000_000 / fps);

					if (selectedIds.length === 2) {
						// Look for track containing both
						for (const track of project.tracks) {
							const cA = track.clips.find((c) => c.id === selectedIds[0]);
							const cB = track.clips.find((c) => c.id === selectedIds[1]);
							if (cA && cB) {
								const [first, second] = cA.start < cB.start ? [cA, cB] : [cB, cA];
								if (Math.abs(first.start + first.duration - second.start) <= tolerance) {
									state.addTransition(track.id, type, {
										kind: 'cut',
										fromClipId: first.id,
										toClipId: second.id
									});
									return true;
								}
							}
						}
					} else if (selectedIds.length === 1) {
						// Head or tail fade or cut near playhead
						const clipId = selectedIds[0];
						for (const track of project.tracks) {
							const c = track.clips.find((clip) => clip.id === clipId);
							if (c) {
								// Check if adjacent clip exists on same track
								const prevClip = track.clips.find(
									(clip) => Math.abs(clip.start + clip.duration - c.start) <= tolerance
								);
								const nextClip = track.clips.find(
									(clip) => Math.abs(c.start + c.duration - clip.start) <= tolerance
								);
								const playhead = state.timeline.playhead;

								if (prevClip && Math.abs(c.start - playhead) <= tolerance * 2) {
									state.addTransition(track.id, type, {
										kind: 'cut',
										fromClipId: prevClip.id,
										toClipId: c.id
									});
									return true;
								}
								if (nextClip && Math.abs(c.start + c.duration - playhead) <= tolerance * 2) {
									state.addTransition(track.id, type, {
										kind: 'cut',
										fromClipId: c.id,
										toClipId: nextClip.id
									});
									return true;
								}

								// Fallback: head fade if playhead near start, else tail fade
								if (Math.abs(playhead - c.start) < Math.abs(playhead - (c.start + c.duration))) {
									state.addTransition(track.id, type, {
										kind: 'head',
										clipId: c.id
									});
								} else {
									state.addTransition(track.id, type, {
										kind: 'tail',
										clipId: c.id
									});
								}
								return true;
							}
						}
					}
					return false;
				},

				setMaskTool(tool) {
					set((state) => {
						state.maskTool.activeTool = tool;
					});
				},

				selectMask(maskId) {
					set((state) => {
						state.maskTool.selectedMaskId = maskId;
						state.maskTool.selectedPointIndex = null;
					});
				},

				selectMaskPoint(index) {
					set((state) => {
						state.maskTool.selectedPointIndex = index;
						state.maskTool.selectedPoints = index !== null ? [index] : [];
					});
				},

				selectMaskPoints(indices) {
					set((state) => {
						state.maskTool.selectedPoints = [...indices];
						state.maskTool.selectedPointIndex = indices.length > 0 ? indices[0] : null;
					});
				},

				toggleMaskPoint(index, multiSelect) {
					set((state) => {
						if (!multiSelect) {
							state.maskTool.selectedPoints = [index];
							state.maskTool.selectedPointIndex = index;
							return;
						}
						const exists = state.maskTool.selectedPoints.includes(index);
						if (exists) {
							state.maskTool.selectedPoints = state.maskTool.selectedPoints.filter(
								(i) => i !== index
							);
							state.maskTool.selectedPointIndex = state.maskTool.selectedPoints[0] ?? null;
						} else {
							state.maskTool.selectedPoints = [...state.maskTool.selectedPoints, index];
							state.maskTool.selectedPointIndex = index;
						}
					});
				},

				setMaskBlockedMessage(message) {
					set((state) => {
						state.maskTool.blockedMessage = message;
					});
				},

				setMaskOverlayVisible(visible) {
					set((state) => {
						state.maskTool.showOverlay = visible;
					});
				},

				addMask(clipId, type, overrides) {
					const mask = createMask(type, overrides);
					let added = false;
					try {
						mutateProject(
							`Add ${type} mask`,
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((t) => ({
									...t,
									clips: t.clips.map((c) => {
										if (c.id !== clipId) return c;
										added = true;
										return addMaskToClip(c, mask);
									})
								}))
							}),
							{ history: 'record' }
						);
						if (added) {
							set((state) => {
								state.maskTool.selectedMaskId = mask.id;
								state.maskTool.selectedPointIndex = null;
								state.maskTool.selectedPoints = [];
								state.maskTool.blockedMessage = null;
							});
							return mask.id;
						}
						return null;
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
						return null;
					}
				},

				removeMask(clipId, maskId) {
					let removed = false;
					try {
						mutateProject(
							'Remove mask',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((t) => ({
									...t,
									clips: t.clips.map((c) => {
										if (c.id !== clipId) return c;
										removed = true;
										return removeMaskFromClip(c, maskId);
									})
								}))
							}),
							{ history: 'record' }
						);
						if (removed) {
							set((state) => {
								if (state.maskTool.selectedMaskId === maskId) {
									state.maskTool.selectedMaskId = null;
									state.maskTool.selectedPointIndex = null;
									state.maskTool.selectedPoints = [];
									state.maskTool.blockedMessage = null;
								}
							});
						}
						return removed;
					} catch (error) {
						set((state) => {
							state.projectMessage = errorMessage(error);
						});
						return false;
					}
				},

				updateMask(clipId, maskId, patch, options) {
					const project = get().project;
					if (project) {
						const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
						const mask = clip?.masks?.find((m) => m.id === maskId);
						if (clip && mask) {
							const shapePropId = `mask:${maskId}:shape` as PropertyId;
							const shapeCurve = propertyCurve(clip, shapePropId);
							const shapeAnimated = shapeCurve && isAnimated(shapeCurve);

							// If shape is updated and it is animated, check point count enforcement or auto-key
							if (patch.points && shapeAnimated) {
								const currentPoints = mask.points ?? [];
								if (patch.points.length !== currentPoints.length) {
									get().setMaskBlockedMessage(
										'Cannot add or remove points while mask shape is animated.'
									);
									return false;
								}
								// Same point count: auto-key shape property
								const coords: number[] = [];
								for (const pt of patch.points) {
									coords.push(
										pt.x,
										pt.y,
										pt.inHandle?.x ?? pt.x,
										pt.inHandle?.y ?? pt.y,
										pt.outHandle?.x ?? pt.x,
										pt.outHandle?.y ?? pt.y
									);
								}
								get().setProperty(clipId, shapePropId, coords, { autoKey: true });
							}
						}
					}

					const coalesceKey = options?.coalesce ? `mask-update:${clipId}:${maskId}` : undefined;
					try {
						mutateProject(
							'Update mask',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((t) => ({
									...t,
									clips: t.clips.map((c) => {
										if (c.id !== clipId) return c;
										return updateMaskInClip(c, maskId, patch);
									})
								}))
							}),
							{
								history: 'record',
								mergeKey: coalesceKey
							}
						);
						return true;
					} catch {
						return false;
					}
				},

				reorderMask(clipId, fromIndex, toIndex) {
					try {
						mutateProject(
							'Reorder masks',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((t) => ({
									...t,
									clips: t.clips.map((c) => {
										if (c.id !== clipId) return c;
										return reorderMasksInClip(c, fromIndex, toIndex);
									})
								}))
							}),
							{ history: 'record' }
						);
						return true;
					} catch {
						return false;
					}
				},

				setMaskParam(clipId, maskId, param, value, options) {
					const project = get().project;
					if (!project) return;
					const propertyId = `mask:${maskId}:${param}` as PropertyId;
					const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
					const mask = clip?.masks?.find((m) => m.id === maskId);
					if (!clip || !mask) return;

					const curve = propertyCurve(clip, propertyId);
					const isAnimatable = param === 'feather' || param === 'expansion' || param === 'opacity';
					if ((curve && isAnimated(curve)) || (isAnimatable && options?.autoKey)) {
						get().setProperty(clipId, propertyId, value as PropertyValue, options);
						return;
					}

					get().updateMask(clipId, maskId, { [param]: value } as Partial<Mask>, options);
				},

				toggleMixer() {
					set((state) => {
						state.isMixerOpen = !state.isMixerOpen;
					});
				},

				setTrackAudioGain(trackId, gainDb, coalesce = false) {
					try {
						mutateProject(
							'Change track gain',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((t) => {
									if (t.id !== trackId) return t;
									const curAudio = t.audio ?? defaultTrackAudio();
									return {
										...t,
										audio: { ...curAudio, gainDb: Math.max(-96, Math.min(24, gainDb)) }
									};
								})
							}),
							{ history: 'record', mergeKey: coalesce ? `track-gain-${trackId}` : undefined }
						);
						return true;
					} catch {
						return false;
					}
				},

				setTrackAudioPan(trackId, pan, coalesce = false) {
					try {
						mutateProject(
							'Change track pan',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((t) => {
									if (t.id !== trackId) return t;
									const curAudio = t.audio ?? defaultTrackAudio();
									return {
										...t,
										audio: { ...curAudio, pan: Math.max(-1, Math.min(1, pan)) }
									};
								})
							}),
							{ history: 'record', mergeKey: coalesce ? `track-pan-${trackId}` : undefined }
						);
						return true;
					} catch {
						return false;
					}
				},

				setTrackAudioSolo(trackId, solo) {
					try {
						mutateProject(
							'Toggle track solo',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((t) => {
									if (t.id !== trackId) return t;
									const curAudio = t.audio ?? defaultTrackAudio();
									const nextSolo = solo !== undefined ? solo : !curAudio.solo;
									return {
										...t,
										audio: { ...curAudio, solo: nextSolo }
									};
								})
							}),
							{ history: 'record' }
						);
						return true;
					} catch {
						return false;
					}
				},

				setTrackAudioEq(trackId, eq) {
					try {
						mutateProject(
							'Update track EQ',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((t) => {
									if (t.id !== trackId) return t;
									const curAudio = t.audio ?? defaultTrackAudio();
									return {
										...t,
										audio: { ...curAudio, eq }
									};
								})
							}),
							{ history: 'record' }
						);
						return true;
					} catch {
						return false;
					}
				},

				setTrackAudioCompressor(trackId, compressor) {
					try {
						mutateProject(
							'Update track compressor',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((t) => {
									if (t.id !== trackId) return t;
									const curAudio = t.audio ?? defaultTrackAudio();
									return {
										...t,
										audio: { ...curAudio, compressor }
									};
								})
							}),
							{ history: 'record' }
						);
						return true;
					} catch {
						return false;
					}
				},

				resetTrackAudio(trackId) {
					try {
						mutateProject(
							'Reset track audio',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((t) => {
									if (t.id !== trackId) return t;
									return {
										...t,
										audio: defaultTrackAudio()
									};
								})
							}),
							{ history: 'record' }
						);
						return true;
					} catch {
						return false;
					}
				},

				setMasterAudioGain(gainDb, coalesce = false) {
					try {
						mutateProject(
							'Change master gain',
							(proj) => ({
								...proj,
								masterAudio: {
									gainDb: Math.max(-96, Math.min(24, gainDb)),
									limiter: proj.masterAudio?.limiter ?? false,
									loudnessTargetLufs: proj.masterAudio?.loudnessTargetLufs
								}
							}),
							{ history: 'record', mergeKey: coalesce ? 'master-gain' : undefined }
						);
						return true;
					} catch {
						return false;
					}
				},

				setMasterAudioLimiter(limiter) {
					try {
						mutateProject(
							'Toggle master limiter',
							(proj) => ({
								...proj,
								masterAudio: {
									gainDb: proj.masterAudio?.gainDb ?? 0,
									limiter,
									loudnessTargetLufs: proj.masterAudio?.loudnessTargetLufs
								}
							}),
							{ history: 'record' }
						);
						return true;
					} catch {
						return false;
					}
				},

				setClipFade(clipId, fade) {
					try {
						mutateProject(
							'Update clip fade',
							(proj) => ({
								...proj,
								tracks: proj.tracks.map((t) => ({
									...t,
									clips: t.clips.map((c) => {
										if (c.id !== clipId) return c;
										return {
											...c,
											...(fade.fadeInUs !== undefined ? { fadeInUs: fade.fadeInUs } : {}),
											...(fade.fadeOutUs !== undefined ? { fadeOutUs: fade.fadeOutUs } : {}),
											...(fade.fadeCurve !== undefined ? { fadeCurve: fade.fadeCurve } : {})
										};
									})
								}))
							}),
							{ history: 'record' }
						);
						return true;
					} catch {
						return false;
					}
				}
			};
		})
	);
}

export type EditorStore = ReturnType<typeof createEditorStore>;
