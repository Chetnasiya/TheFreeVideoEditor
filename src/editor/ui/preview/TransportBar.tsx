import { useEffect, useRef, useState } from 'react';
import { ticksToTimecode } from '../../core';
import type { PlaybackEngine, PlaybackSnapshot } from '../../services/playback/engine';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';

const ZOOM_OPTIONS = [
	{ label: 'Fit', value: 'fit' },
	{ label: '25%', value: '0.25' },
	{ label: '50%', value: '0.5' },
	{ label: '75%', value: '0.75' },
	{ label: '100%', value: '1' },
	{ label: '125%', value: '1.25' },
	{ label: '150%', value: '1.5' },
	{ label: '200%', value: '2' }
] as const;

interface TransportBarProps {
	engine: PlaybackEngine | null;
	fps: number;
	zoom: string;
	onZoomChange: (value: string) => void;
	isFullscreen?: boolean;
	onToggleFullscreen?: () => void;
}

export default function TransportBar({
	engine,
	fps,
	zoom,
	onZoomChange,
	isFullscreen = false,
	onToggleFullscreen
}: TransportBarProps) {
	const store = useEditorStoreApi();
	const scopesOpen = useEditorStore((state) => state.scopes.open);
	const [snapshot, setSnapshot] = useState<PlaybackSnapshot | null>(engine?.snapshot ?? null);
	const [playAnnouncement, setPlayAnnouncement] = useState('');
	const previousPlaying = useRef<boolean | null>(null);
	useEffect(() => {
		setSnapshot(engine?.snapshot ?? null);
		previousPlaying.current = engine?.snapshot.playing ?? null;
		if (!engine) return;
		return engine.subscribe((next) => {
			setSnapshot(next);
			if (previousPlaying.current !== null && previousPlaying.current !== next.playing) {
				setPlayAnnouncement(next.playing ? 'Playback started.' : 'Playback paused.');
			}
			previousPlaying.current = next.playing;
		});
	}, [engine]);

	const time = snapshot?.time ?? 0;
	const duration = snapshot?.duration ?? 0;
	const disabled = !engine;
	const level = Math.max(0, Math.min(1, snapshot?.meter ?? 0));
	const currentTime = ticksToTimecode(time, fps);
	const totalTime = ticksToTimecode(duration, fps);

	return (
		<div className="preview-transport" role="toolbar" aria-label="Program playback controls">
			{/* Row 1: Primary transport navigation, playhead, timecode */}
			<div className="preview-transport-row preview-transport-row-primary">
				<div className="preview-transport-group" role="group" aria-label="Timeline navigation">
					<button
						type="button"
						aria-label="Go to start"
						title="Go to start (Home)"
						disabled={disabled}
						onClick={() => engine?.jumpTo('start')}
					>
						|◀
					</button>
					<button
						type="button"
						aria-label="Previous edit"
						title="Previous edit (↑)"
						disabled={disabled}
						onClick={() => engine?.jumpTo('prevEdge')}
					>
						◀|
					</button>
					<button
						type="button"
						aria-label="Step back one frame"
						title="Step back one frame (←)"
						disabled={disabled}
						onClick={() => engine?.stepFrames(-1)}
					>
						◀
					</button>
					<button
						className="preview-play-button"
						type="button"
						aria-label={snapshot?.playing ? 'Pause' : 'Play'}
						title="Play / Pause (Space)"
						disabled={disabled}
						onClick={() => engine?.toggle()}
					>
						{snapshot?.playing ? '❚❚' : '▶'}
					</button>
					<button
						type="button"
						aria-label="Step forward one frame"
						title="Step forward one frame (→)"
						disabled={disabled}
						onClick={() => engine?.stepFrames(1)}
					>
						▶
					</button>
					<button
						type="button"
						aria-label="Next edit"
						title="Next edit (↓)"
						disabled={disabled}
						onClick={() => engine?.jumpTo('nextEdge')}
					>
						|▶
					</button>
					<button
						type="button"
						aria-label="Go to end"
						title="Go to end (End)"
						disabled={disabled}
						onClick={() => engine?.jumpTo('end')}
					>
						▶|
					</button>
					<button
						type="button"
						aria-label="Toggle playback loop"
						aria-pressed={snapshot?.looping ?? false}
						title="Loop playback (⌘/Ctrl+L)"
						className={snapshot?.looping ? 'is-active' : ''}
						disabled={disabled}
						onClick={() => engine?.setLoop(!snapshot?.looping)}
					>
						Loop
					</button>
				</div>
				<div className="preview-timecode-group">
					<output
						className="preview-timecode"
						aria-label="Current timecode and duration"
						aria-live="off"
					>
						{currentTime} / {totalTime}
					</output>
					<span className="sr-only" role="status" aria-live="polite">
						{playAnnouncement}
					</span>
					{snapshot?.rate && snapshot.rate !== 1 && (
						<span className="preview-rate" aria-label="Playback speed">
							{`${Math.abs(snapshot.rate)}× ${snapshot.rate < 0 ? 'reverse' : 'forward'}`}
						</span>
					)}
					{snapshot?.error && (
						<span className="preview-playback-error" role="alert">
							{snapshot.error}
						</span>
					)}
				</div>
			</div>

			{/* Row 2: Audio status, meter, zoom, full screen preview */}
			<div className="preview-transport-row preview-transport-row-secondary">
				<div
					className="preview-transport-group preview-audio-tools"
					role="group"
					aria-label="Audio controls"
				>
					<button
						type="button"
						className="preview-mute-button"
						aria-label={snapshot?.muted ? 'Unmute audio' : 'Mute audio'}
						aria-pressed={snapshot?.muted ?? false}
						title="Mute / unmute (M)"
						disabled={disabled}
						onClick={() => engine?.setMuted(!snapshot?.muted)}
					>
						<svg
							viewBox="0 0 16 16"
							width="13"
							height="13"
							fill="currentColor"
							aria-hidden="true"
							style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'text-bottom' }}
						>
							{snapshot?.muted ? (
								<path d="M6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06zm7.137 2.096a.5.5 0 0 1 0 .708L12.207 8l1.647 1.646a.5.5 0 0 1-.708.708L11.5 8.707l-1.646 1.647a.5.5 0 0 1-.708-.708L10.793 8 9.146 6.354a.5.5 0 1 1 .708-.708L11.5 7.293l1.646-1.647a.5.5 0 0 1 .708 0z" />
							) : (
								<path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-.708.707A7.476 7.476 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303l.708.707zM10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.482 5.482 0 0 1 11.025 8a5.482 5.482 0 0 1-1.611 3.889l.707.707zM8.707 11.182A4.486 4.486 0 0 0 10.025 8a4.486 4.486 0 0 0-1.318-3.182L8 5.525A3.489 3.489 0 0 1 9.025 8 3.49 3.49 0 0 1 8 10.475l.707.707zM6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06z" />
							)}
						</svg>
						{snapshot?.muted ? 'Muted' : 'Audio'}
					</button>
					<div
						className="preview-level-meter"
						role="meter"
						aria-label="Audio level"
						aria-valuemin={0}
						aria-valuemax={1}
						aria-valuenow={level}
						title={`Level: ${Math.round(level * 100)}%`}
					>
						<span style={{ width: `${level * 100}%` }} />
					</div>
				</div>

				<div
					className="preview-transport-group preview-view-tools"
					role="group"
					aria-label="View options"
				>
					<label className="sr-only" htmlFor="preview-zoom">
						Preview zoom
					</label>
					<select
						id="preview-zoom"
						name="preview-zoom"
						aria-label="Preview zoom"
						value={zoom}
						onChange={(event) => onZoomChange(event.currentTarget.value)}
					>
						{ZOOM_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
					<button
						type="button"
						aria-label="Toggle scopes"
						aria-pressed={scopesOpen}
						title="Video scopes"
						className={scopesOpen ? 'is-active' : ''}
						onClick={() => store.getState().toggleScopesOpen()}
					>
						Scopes
					</button>
					{onToggleFullscreen && (
						<button
							type="button"
							className="preview-fullscreen-button"
							aria-label={isFullscreen ? 'Exit preview full screen' : 'Full screen preview'}
							title={isFullscreen ? 'Exit preview full screen (Esc)' : 'Full screen preview'}
							onClick={onToggleFullscreen}
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
								{isFullscreen ? (
									<path d="M5.5 0a.5.5 0 0 1 .5.5v4A1.5 1.5 0 0 1 4.5 6h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5zm5 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 10 4.5v-4a.5.5 0 0 1 .5-.5zM0 10.5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 6 11.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zm10 1a1.5 1.5 0 0 1 1.5-1.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4z" />
								) : (
									<path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zm10-1a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1 0-1h4zm-10 15a.5.5 0 0 1-.5-.5v-4a.5.5 0 0 1 1 0v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5zm14.5 0a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 1 0v4z" />
								)}
							</svg>
							{isFullscreen ? 'Windowed' : 'Fullscreen'}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
