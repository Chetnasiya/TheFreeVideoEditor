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
}

export default function TransportBar({ engine, fps, zoom, onZoomChange }: TransportBarProps) {
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
			<div className="preview-transport-group" role="group" aria-label="Timeline navigation">
				<button
					type="button"
					aria-label="Go to start"
					title="Go to start"
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
					title="Go to end"
					disabled={disabled}
					onClick={() => engine?.jumpTo('end')}
				>
					▶|
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
				{snapshot?.error && (
					<span className="preview-playback-error" role="alert">
						{snapshot.error}
					</span>
				)}
			</div>
			<div
				className="preview-transport-group preview-audio-tools"
				role="group"
				aria-label="Audio and zoom"
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
					{snapshot?.muted ? 'Muted' : 'Volume'}
				</button>
				<label className="sr-only" htmlFor="preview-volume">
					Master volume
				</label>
				<input
					id="preview-volume"
					name="preview-volume"
					type="range"
					min="0"
					max="1"
					step="0.01"
					aria-label="Master volume"
					value={snapshot?.volume ?? 1}
					disabled={disabled}
					onChange={(event) => engine?.setVolume(Number(event.currentTarget.value))}
				/>
				<div
					className="preview-level-meter"
					role="meter"
					aria-label="Audio level"
					aria-valuemin={0}
					aria-valuemax={1}
					aria-valuenow={level}
				>
					<span style={{ width: `${level * 100}%` }} />
				</div>
				<button
					type="button"
					aria-label="Toggle playback loop"
					aria-pressed={snapshot?.looping ?? false}
					title="Loop playback (⌘/Ctrl+L)"
					disabled={disabled}
					onClick={() => engine?.setLoop(!snapshot?.looping)}
				>
					Loop
				</button>
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
				<span className="preview-rate" aria-label="Playback speed">
					{snapshot?.rate && snapshot.rate !== 1
						? `${Math.abs(snapshot.rate)}× ${snapshot.rate < 0 ? 'reverse' : 'forward'}`
						: ''}
				</span>
			</div>
		</div>
	);
}
