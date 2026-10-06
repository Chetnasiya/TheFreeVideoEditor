import { useEffect, useRef, useState, type RefObject } from 'react';
import { resolveFrame } from '../../core';
import type { Project } from '../../core';
import type { PlaybackEngine, PlaybackSnapshot } from '../../services/playback/engine';
import { observePreviewScale } from '../../services/playback/previewLayout';

interface PreviewPlayerProps {
	project: Project | null;
	engine: PlaybackEngine | null;
	zoom: string;
	canvasRef: RefObject<HTMLCanvasElement | null>;
}

interface PreviewState {
	hasVideo: boolean;
	hasAudio: boolean;
	missing: string[];
	loading: boolean;
	error: string;
	unsupported: string;
}

export default function PreviewPlayer({ project, engine, zoom, canvasRef }: PreviewPlayerProps) {
	const viewportRef = useRef<HTMLDivElement>(null);
	const [fitScale, setFitScale] = useState(0);
	const scale = Number(zoom) || 1;
	const projectWidth = project?.settings.width;
	const projectHeight = project?.settings.height;

	useEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport || !projectWidth || !projectHeight) return;
		return observePreviewScale(
			viewport,
			{ width: projectWidth, height: projectHeight },
			setFitScale
		);
	}, [projectHeight, projectWidth]);

	const renderedWidth = Math.max(1, project?.settings.width ?? 1) * fitScale * scale;
	const renderedHeight = Math.max(1, project?.settings.height ?? 1) * fitScale * scale;

	return (
		<div className="preview-workspace">
			<div className="preview-canvas-viewport" ref={viewportRef}>
				{project ? (
					<div
						className="preview-canvas-frame"
						style={{ width: renderedWidth, height: renderedHeight }}
					>
						<canvas
							ref={canvasRef}
							className="preview-canvas"
							width={project.settings.width}
							height={project.settings.height}
							role="img"
							tabIndex={0}
							aria-label="Preview"
							data-testid="preview-canvas"
						/>
						<PreviewNotice project={project} engine={engine} />
					</div>
				) : (
					<div className="preview-empty-state">
						<p>No project open</p>
						<span>Create or open a project to preview its timeline.</span>
					</div>
				)}
			</div>
			{project && (
				<div className="preview-project-status">
					<span>
						{project.settings.width} × {project.settings.height}
					</span>
				</div>
			)}
		</div>
	);
}

function PreviewNotice({ project, engine }: { project: Project; engine: PlaybackEngine | null }) {
	const [state, setState] = useState<PreviewState>({
		hasVideo: false,
		hasAudio: false,
		missing: [],
		loading: false,
		error: '',
		unsupported: ''
	});

	useEffect(() => {
		if (!engine) return;
		const update = (snapshot: PlaybackSnapshot) => {
			const resolved = resolveFrame(project, snapshot.time);
			const names = [...new Set(snapshot.missing.map((id) => project.assets[id]?.name ?? id))];
			const unsupportedAsset = resolved.videoLayers
				.map((layer) => project.assets[layer.assetId])
				.find((asset) => asset?.videoDecodable === false);
			const nextState: PreviewState = {
				hasVideo: resolved.videoLayers.some((layer) => !snapshot.missing.includes(layer.assetId)),
				hasAudio: resolved.audioSources.length > 0,
				missing: names,
				loading: snapshot.loading,
				error: snapshot.error,
				unsupported: unsupportedAsset
					? `${unsupportedAsset.name}${unsupportedAsset.videoCodec ? ` (${unsupportedAsset.videoCodec})` : ''}`
					: ''
			};
			setState((previous) =>
				previous.hasVideo === nextState.hasVideo &&
				previous.hasAudio === nextState.hasAudio &&
				previous.loading === nextState.loading &&
				previous.error === nextState.error &&
				previous.unsupported === nextState.unsupported &&
				previous.missing.join('\0') === nextState.missing.join('\0')
					? previous
					: nextState
			);
		};
		return engine.subscribe(update);
	}, [engine, project]);

	if (state.missing.length > 0) {
		return (
			<div className="preview-warning-overlay" role="status" aria-live="polite">
				<strong>Offline media</strong>
				<span>{state.missing.join(', ')}</span>
			</div>
		);
	}
	if (state.error) {
		return (
			<div className="preview-warning-overlay" role="alert">
				<strong>Playback error</strong>
				<span>{state.error}</span>
			</div>
		);
	}
	if (state.unsupported) {
		return (
			<div className="preview-warning-overlay" role="alert">
				<strong>Unsupported video codec</strong>
				<span>This browser cannot decode “{state.unsupported}”.</span>
			</div>
		);
	}
	if (!state.hasVideo && !state.hasAudio) {
		return (
			<div className="preview-empty-overlay">
				<span>Nothing at playhead</span>
			</div>
		);
	}
	if (state.loading) {
		return (
			<div className="preview-loading-indicator" role="status" aria-live="polite">
				Decoding frame…
			</div>
		);
	}
	return null;
}
