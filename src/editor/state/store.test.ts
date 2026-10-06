import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../core';
import type { AssetId, ClipId, DragPosition, ProjectId, ProjectSummary } from '../core';
import { registerProjectExport } from '../services/export/session';
import { createEditorStore } from './store';

const services = vi.hoisted(() => ({
	getProject: vi.fn(),
	listProjects: vi.fn(),
	saveProject: vi.fn(),
	setLastOpenedId: vi.fn(),
	getLastOpenedId: vi.fn(),
	deleteProject: vi.fn(),
	deleteProjectDir: vi.fn(),
	ensureProjectDir: vi.fn(),
	copyProjectMedia: vi.fn(),
	reconcileProjectMedia: vi.fn(),
	deleteMedia: vi.fn(),
	deleteMediaFile: vi.fn(),
	collectMediaGarbage: vi.fn(),
	writeMedia: vi.fn(),
	deleteDerived: vi.fn(),
	deleteProjectDerived: vi.fn()
}));

vi.mock('../services/storage/projectDb', () => ({
	CorruptProjectError: class CorruptProjectError extends Error {
		projectId: ProjectId;
		rawJson: string;

		constructor(projectId: ProjectId, _raw: unknown, cause: unknown) {
			super('This saved project is corrupt and could not be opened.', { cause });
			this.projectId = projectId;
			this.rawJson = '{}';
		}
	},
	getProject: services.getProject,
	listProjects: services.listProjects,
	saveProject: services.saveProject,
	setLastOpenedId: services.setLastOpenedId,
	getLastOpenedId: services.getLastOpenedId,
	deleteProject: services.deleteProject
}));

vi.mock('../services/storage/opfs', () => ({
	deleteProjectDir: services.deleteProjectDir,
	ensureProjectDir: services.ensureProjectDir,
	copyProjectMedia: services.copyProjectMedia,
	reconcileProjectMedia: services.reconcileProjectMedia,
	deleteMedia: services.deleteMedia,
	deleteMediaFile: services.deleteMediaFile,
	collectMediaGarbage: services.collectMediaGarbage,
	writeMedia: services.writeMedia,
	isSupported: vi.fn(() => true)
}));

vi.mock('../services/storage/mediaCache', () => ({
	deleteDerived: services.deleteDerived,
	deleteProjectDerived: services.deleteProjectDerived
}));

vi.mock('../services/media/derived', () => ({
	generateDerived: vi.fn().mockResolvedValue({
		poster: new Blob(),
		thumbs: [],
		waveformStatus: 'none'
	})
}));

vi.mock('../services/theme/theme', () => ({
	applyTheme: vi.fn().mockReturnValue(true),
	initializeTheme: vi.fn().mockReturnValue({ mode: 'dark', persistenceAvailable: true })
}));

describe('editor store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		services.getProject.mockResolvedValue(null);
		services.listProjects.mockResolvedValue([]);
		services.saveProject.mockResolvedValue(undefined);
		services.setLastOpenedId.mockResolvedValue(undefined);
		services.getLastOpenedId.mockResolvedValue(null);
		services.deleteProject.mockResolvedValue(undefined);
		services.deleteProjectDir.mockResolvedValue(undefined);
		services.ensureProjectDir.mockResolvedValue(null);
		services.copyProjectMedia.mockImplementation(async (_source, destination) => destination);
		services.reconcileProjectMedia.mockImplementation(async (project) => ({
			assets: project.assets,
			unknownFiles: [],
			changed: false
		}));
		services.deleteMedia.mockResolvedValue(undefined);
		services.deleteMediaFile.mockResolvedValue(undefined);
		services.collectMediaGarbage.mockResolvedValue({
			removedFiles: [],
			removedCacheAssetIds: [],
			foreignFiles: []
		});
		services.writeMedia.mockResolvedValue('projects/project/media/asset.mp4');
		services.deleteDerived.mockResolvedValue(undefined);
		services.deleteProjectDerived.mockResolvedValue(undefined);
	});

	it('provides one default editor state for each editor instance', () => {
		const store = createEditorStore();

		expect(store.getState().projectName).toBe('Untitled Project');
		expect(store.getState().theme).toBe('dark');
		expect(store.getState().project).toBeNull();
		expect(store.getState().revision).toBe(0);
	});

	it('keeps rename draft changes in the shared store and can cancel them', () => {
		const store = createEditorStore();

		store.getState().beginRename();
		store.getState().setProjectNameDraft('Unsaved Name');
		expect(store.getState().projectNameDraft).toBe('Unsaved Name');

		store.getState().cancelRename();
		expect(store.getState().projectName).toBe('Untitled Project');
		expect(store.getState().projectNameDraft).toBe('Untitled Project');
		expect(store.getState().isRenaming).toBe(false);
	});

	it('clamps panel resizing through a store action', () => {
		const store = createEditorStore();

		store.getState().resizePanel('media', 24);
		expect(store.getState().mediaWidth).toBe(288);

		store.getState().resizePanel('media', 1000);
		expect(store.getState().mediaWidth).toBe(420);
	});

	it('creates and renames the active project through the shared mutation path', async () => {
		const store = createEditorStore();
		await store.getState().createProject({ name: 'First cut', settings: { fps: 30 } });

		const firstId = store.getState().project?.id;
		expect(store.getState().project?.name).toBe('First cut');
		expect(store.getState().project?.settings.width).toBe(1920);
		expect(store.getState().revision).toBe(1);

		store.getState().renameProject('Final cut');
		expect(store.getState().project?.name).toBe('Final cut');
		expect(store.getState().projectName).toBe('Final cut');
		expect(store.getState().revision).toBe(2);
		expect(store.getState().project?.id).toBe(firstId);
	});

	it('undoes and redoes project mutations while revisions continue to advance', async () => {
		const store = createEditorStore();
		await store.getState().createProject({ name: 'History test' });
		store.getState().renameProject('Renamed');
		expect(store.getState().history.undoLabel).toBe('Rename project');

		expect(store.getState().undo()).toBe(true);
		expect(store.getState().project?.name).toBe('History test');
		expect(store.getState().revision).toBe(3);
		expect(store.getState().history.redoLabel).toBe('Rename project');

		expect(store.getState().redo()).toBe(true);
		expect(store.getState().project?.name).toBe('Renamed');
		expect(store.getState().revision).toBe(4);
	});

	it('blocks history while a timeline drag or project manager is active', async () => {
		const store = createEditorStore();
		await store.getState().createProject({ name: 'Blocked history' });
		store.getState().renameProject('Changed');
		store.getState().beginTimelineDrag({
			kind: 'move',
			clipIds: [],
			original: [],
			preview: [],
			pointerStartTime: 0,
			pointerTime: 0,
			allowed: true,
			unlink: false
		});

		expect(store.getState().undo()).toBe(false);
		store.getState().cancelTimelineDrag();
		store.getState().openProjectManager();
		expect(store.getState().undo()).toBe(false);
	});

	it('clears session history when switching projects', async () => {
		const store = createEditorStore();
		await store.getState().createProject({ name: 'First project' });
		store.getState().renameProject('Edited first project');
		const nextProject = createEmptyProject({ name: 'Second project' });
		services.getProject.mockResolvedValue(nextProject);

		await store.getState().openProject(nextProject.id);

		expect(store.getState().project?.id).toBe(nextProject.id);
		expect(store.getState().history.canUndo).toBe(false);
		expect(store.getState().history.canRedo).toBe(false);
	});

	it('opens a saved project without marking it dirty', async () => {
		const store = createEditorStore();
		const project = createEmptyProject({ name: 'Previously saved' });
		services.getProject.mockResolvedValue(project);

		await store.getState().openProject(project.id);

		expect(store.getState().project).toEqual(project);
		expect(store.getState().revision).toBe(0);
		expect(store.getState().saveStatus).toBe('saved');
		expect(services.setLastOpenedId).toHaveBeenCalledWith(project.id);
	});

	it('duplicates the project with a new id and an incremented revision', async () => {
		const store = createEditorStore();
		await store.getState().createProject({ name: 'My First Cut' });
		const firstId = store.getState().project?.id;

		await store.getState().duplicateProject(firstId as ProjectId);

		expect(store.getState().project?.id).not.toBe(firstId);
		expect(store.getState().project?.name).toBe('My First Cut copy');
		expect(store.getState().revision).toBe(2);
	});

	it('deletes the active project and returns to the manager', async () => {
		const store = createEditorStore();
		await store.getState().createProject({ name: 'Delete me' });
		const id = store.getState().project?.id;
		const deleted = await store.getState().deleteProject(id as ProjectId);

		expect(deleted).toBe(true);
		expect(store.getState().project).toBeNull();
		expect(store.getState().isProjectManagerOpen).toBe(true);
		expect(services.deleteProjectDir).toHaveBeenCalledWith(id);
		expect(services.deleteProject).toHaveBeenCalledWith(id);
	});

	it('keeps project summaries in the store after refresh', async () => {
		const store = createEditorStore();
		const summary: ProjectSummary = {
			id: 'summary' as ProjectId,
			name: 'Listed',
			updatedAt: new Date().toISOString(),
			duration: 0,
			assetCount: 0
		};
		services.listProjects.mockResolvedValue([summary]);

		await store.getState().refreshProjects();

		expect(store.getState().projects).toEqual([summary]);
	});

	it('shows a recovery state instead of throwing for a corrupt last-opened project', async () => {
		const store = createEditorStore();
		const project = createEmptyProject({ name: 'Corrupt' });
		services.getLastOpenedId.mockResolvedValue(project.id);
		const { CorruptProjectError } = await import('../services/storage/projectDb');
		services.getProject.mockRejectedValue(
			new CorruptProjectError(project.id, { invalid: true }, new Error('invalid'))
		);

		await store.getState().initialize();

		expect(store.getState().project).toBeNull();
		expect(store.getState().recovery?.projectId).toBe(project.id);
	});

	it('adds a linked clip and commits a drag as exactly one project revision', async () => {
		const store = createEditorStore();
		await store.getState().createProject({ name: 'Timeline editing' });
		const project = store.getState().project!;
		const assetId = 'timeline-store-asset' as AssetId;
		const withAsset = {
			...project,
			assets: {
				[assetId]: {
					id: assetId,
					kind: 'video' as const,
					name: 'sample.mp4',
					mimeType: 'video/mp4',
					size: 100,
					duration: 5_000_000,
					hasAudio: true,
					opfsPath: `projects/${project.id}/media/${assetId}.mp4`
				}
			}
		};
		await store.getState().replaceProject(withAsset);
		const videoTrack = store.getState().project!.tracks.find((track) => track.kind === 'video')!;
		expect(store.getState().addAssetToTimeline(assetId, videoTrack.id, 0)).toBe(true);
		const state = store.getState();
		const clips = state.project!.tracks.flatMap((track) => track.clips);
		expect(clips).toHaveLength(2);
		expect(clips[0]?.linkId).toBe(clips[1]?.linkId);
		const revision = state.revision;
		const original: DragPosition[] = clips.map((clip) => ({
			clipId: clip.id,
			trackId: state.project!.tracks.find((track) => track.clips.includes(clip))!.id,
			start: clip.start,
			duration: clip.duration,
			sourceIn: clip.sourceIn,
			sourceOut: clip.sourceOut
		}));
		store.getState().beginTimelineDrag({
			kind: 'move',
			clipIds: [clips[0]!.id],
			original,
			preview: original,
			pointerStartTime: 0,
			pointerTime: 0,
			allowed: true,
			unlink: false
		});
		store.getState().updateTimelineDrag(1_000_000);
		expect(store.getState().revision).toBe(revision);
		expect(store.getState().timeline.drag?.preview.map((entry) => entry.start)).toEqual([
			1_000_000, 1_000_000
		]);
		expect(store.getState().commitTimelineDrag()).toBe(true);
		expect(store.getState().revision).toBe(revision + 1);
		expect(
			store
				.getState()
				.project?.tracks.flatMap((track) => track.clips)
				.map((clip) => clip.start)
		).toEqual([1_000_000, 1_000_000]);
	});

	it('cancels a drag without changing the project and resets timeline on close', async () => {
		const store = createEditorStore();
		await store.getState().createProject({ name: 'Cancel drag' });
		const revision = store.getState().revision;
		store.getState().setPlayhead(2_000_000);
		store.getState().setZoom(100);
		store.getState().beginTimelineDrag({
			kind: 'move',
			clipIds: [],
			original: [],
			preview: [],
			pointerStartTime: 0,
			pointerTime: 0,
			allowed: true,
			unlink: false
		});
		store.getState().cancelTimelineDrag();
		expect(store.getState().project?.tracks).toHaveLength(2);
		expect(store.getState().revision).toBe(revision);
		expect(store.getState().timeline.drag).toBeNull();
		await store.getState().closeProject();
		expect(store.getState().timeline.playhead).toBe(0);
		expect(store.getState().timeline.pixelsPerSecond).toBe(64);
		expect(store.getState().timeline.selection.clipIds).toEqual([]);
	});

	it('prunes deleted clips and restores the selection on undo', async () => {
		const store = createEditorStore();
		await store.getState().createProject({ name: 'Prune selection' });
		const project = store.getState().project!;
		const assetId = 'selection-asset' as AssetId;
		const clipId = 'selection-clip' as ClipId;
		const projectWithClip = {
			...project,
			assets: {
				[assetId]: {
					id: assetId,
					kind: 'audio' as const,
					name: 'tone.wav',
					mimeType: 'audio/wav',
					size: 10,
					duration: 1_000_000,
					hasAudio: true,
					opfsPath: `projects/${project.id}/media/${assetId}.wav`
				}
			},
			tracks: project.tracks.map((track) =>
				track.kind === 'audio'
					? {
							...track,
							clips: [
								{
									id: clipId,
									assetId,
									start: 0,
									duration: 1_000_000,
									sourceIn: 0,
									sourceOut: 1_000_000,
									speed: 1,
									volume: 1
								}
							]
						}
					: track
			)
		};
		await store.getState().replaceProject(projectWithClip);
		store.getState().selectClips([clipId]);
		expect(store.getState().deleteSelection()).toBe(true);
		expect(store.getState().timeline.selection.clipIds).toEqual([]);
		expect(store.getState().undo()).toBe(true);
		expect(store.getState().timeline.selection.clipIds).toEqual([clipId]);
		expect(
			store
				.getState()
				.project?.tracks.flatMap((track) => track.clips)
				.map((clip) => clip.id)
		).toContain(clipId);
	});

	it('asks before switching projects during export and waits for cancellation', async () => {
		const store = createEditorStore();
		await store.getState().createProject({ name: 'Current export project' });
		const currentProject = store.getState().project;
		if (!currentProject) throw new Error('Project was not created.');
		const nextProject = createEmptyProject({ name: 'Next project' });
		services.getProject.mockResolvedValueOnce(nextProject);

		const controller = new AbortController();
		const unregister = registerProjectExport(currentProject.id, controller);
		await store.getState().openProject(nextProject.id);
		expect(store.getState().isExportClosePromptOpen).toBe(true);
		expect(store.getState().project?.id).toBe(currentProject.id);

		const switching = store.getState().confirmCancelExportAndContinue();
		expect(controller.signal.aborted).toBe(true);
		unregister();
		await switching;
		expect(store.getState().isExportClosePromptOpen).toBe(false);
		expect(store.getState().project?.id).toBe(nextProject.id);
	});
});
