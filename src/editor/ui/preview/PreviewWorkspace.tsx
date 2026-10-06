import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../../core';
import { createPlaybackEngine, type PlaybackEngine } from '../../services/playback/engine';
import { selectRenderer } from '../../services/render';
import { attachPlaybackTestHooks } from '../../services/playback/testHooks';
import { useEditorStoreApi } from '../../state/EditorProvider';
import PreviewPlayer from './PreviewPlayer';
import TransportBar from './TransportBar';
import './preview.css';

interface PreviewWorkspaceProps {
	project: Project | null;
	revision: number;
	onEngineChange: (engine: PlaybackEngine | null) => void;
}

export default function PreviewWorkspace({
	project,
	revision,
	onEngineChange
}: PreviewWorkspaceProps) {
	const store = useEditorStoreApi();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const currentProject = useRef(project);
	const engineChange = useRef(onEngineChange);
	const [engine, setEngine] = useState<PlaybackEngine | null>(null);
	const [zoom, setZoom] = useState('fit');
	// Chosen once per opened project: a canvas can only ever hold one context type.
	const renderer = useMemo(
		() => selectRenderer(currentProject.current),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[project?.id]
	);
	currentProject.current = project;
	engineChange.current = onEngineChange;

	useEffect(() => {
		const initialProject = currentProject.current;
		const canvas = canvasRef.current;
		if (!initialProject || !canvas) {
			setEngine(null);
			engineChange.current(null);
			return;
		}
		const playback = createPlaybackEngine(store, initialProject);
		playback.attach(canvas, renderer);
		const detachTestHooks = attachPlaybackTestHooks(playback);
		setEngine(playback);
		engineChange.current(playback);
		return () => {
			engineChange.current(null);
			detachTestHooks();
			playback.dispose();
		};
	}, [project?.id, renderer, store]);

	useEffect(() => {
		if (project && engine?.projectId === project.id) engine.setProject(project);
	}, [engine, project, revision]);

	return (
		<div className="preview-panel-content">
			<PreviewPlayer
				project={project}
				engine={engine}
				zoom={zoom}
				canvasRef={canvasRef}
				renderer={renderer}
			/>
			{project && (
				<TransportBar
					engine={engine?.projectId === project.id ? engine : null}
					fps={project.settings.fps}
					zoom={zoom}
					onZoomChange={setZoom}
				/>
			)}
		</div>
	);
}
