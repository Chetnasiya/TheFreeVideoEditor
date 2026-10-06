import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createEditorStore, type EditorStore, type EditorState } from './store';
import { attachAutosave } from '../services/storage/autosave';

const EditorStoreContext = createContext<EditorStore | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
	const [store] = useState(createEditorStore);

	useEffect(() => {
		if (import.meta.env.DEV) {
			window.__TFVE_EXPORT_TEST_HOOKS__ ??= {};
			window.__TFVE_EXPORT_TEST_HOOKS__.hideFirstVideoTrack = (hidden) => {
				const state = store.getState();
				const videoTrack = state.project?.tracks.find((track) => track.kind === 'video');
				return videoTrack ? state.setTimelineTrackFlags(videoTrack.id, { hidden }) : false;
			};
			window.__TFVE_EXPORT_TEST_HOOKS__.addSecondClipAfterGap = () => {
				const state = store.getState();
				const videoTrack = state.project?.tracks.find((track) => track.kind === 'video');
				const clip = videoTrack?.clips[0];
				return clip
					? state.addAssetToTimeline(
							clip.assetId,
							videoTrack.id,
							clip.start + clip.duration + 2_000_000
						)
					: false;
			};
			window.__TFVE_EXPORT_TEST_HOOKS__.addSampleOverlay = () => {
				const state = store.getState();
				const project = state.project;
				const videoTrack = project?.tracks.find((track) => track.kind === 'video');
				const clip = videoTrack?.clips[0];
				const sample = Object.values(project?.assets ?? {}).find(
					(asset) => asset.name === 'sample.mp4'
				);
				if (!clip || !sample || !state.addAssetOnNewTrack(sample.id, 'video', clip.start)) {
					return false;
				}
				const overlayTrack = store
					.getState()
					.project?.tracks.find((track) =>
						track.clips.some((overlayClip) => overlayClip.assetId === sample.id)
					);
				return overlayTrack ? state.reorderTimelineTrack(overlayTrack.id, 0) : false;
			};
			window.__TFVE_EXPORT_TEST_HOOKS__.hideTopVideoTrack = (hidden) => {
				const state = store.getState();
				const videoTracks = state.project?.tracks.filter((track) => track.kind === 'video') ?? [];
				const topTrack = videoTracks[0];
				return topTrack ? state.setTimelineTrackFlags(topTrack.id, { hidden }) : false;
			};
		}
		const autosave = attachAutosave(store);
		store.getState().setAutosaveFlush(autosave.flush);
		void store.getState().initialize();
		return () => {
			store.getState().setAutosaveFlush(null);
			autosave.dispose();
			if (import.meta.env.DEV && window.__TFVE_EXPORT_TEST_HOOKS__) {
				delete window.__TFVE_EXPORT_TEST_HOOKS__.hideFirstVideoTrack;
				delete window.__TFVE_EXPORT_TEST_HOOKS__.addSecondClipAfterGap;
				delete window.__TFVE_EXPORT_TEST_HOOKS__.addSampleOverlay;
				delete window.__TFVE_EXPORT_TEST_HOOKS__.hideTopVideoTrack;
			}
		};
	}, [store]);

	return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>;
}

export function useEditorStore<T>(selector: (state: EditorState) => T): T {
	const store = useContext(EditorStoreContext);
	if (!store) throw new Error('useEditorStore must be used inside EditorProvider.');

	return useStore(store, selector);
}

export function useEditorStoreApi(): EditorStore {
	const store = useContext(EditorStoreContext);
	if (!store) throw new Error('useEditorStoreApi must be used inside EditorProvider.');
	return store;
}
