import {
	useEffect,
	useRef,
	useState,
	type PointerEvent,
	type KeyboardEvent,
	type MouseEvent
} from 'react';
import { ticksToTimecode, timeToPixels } from '../../core';
import type { Asset, Clip, ClipId, Project, Track } from '../../core';
import { getDerived, type DerivedData } from '../../services/storage/mediaCache';

interface ClipViewProps {
	clip: Clip;
	asset: Asset;
	track: Track;
	project: Project;
	pixelsPerSecond: number;
	selected: boolean;
	tabIndex: number;
	ghost?: boolean;
	onPointerDown: (event: PointerEvent<HTMLElement>, clip: Clip, edge?: 'start' | 'end') => void;
	onKeyboardTrim: (clip: Clip, edge: 'start' | 'end', frameDelta: number) => void;
	onSelect: (
		clipId: ClipId,
		modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }
	) => void;
	onContextMenu: (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, clip: Clip) => void;
}

function ClipArtwork({ project, asset, track }: { project: Project; asset: Asset; track: Track }) {
	const [derived, setDerived] = useState<DerivedData | null>(null);
	const [poster, setPoster] = useState('');
	useEffect(() => {
		let active = true;
		let objectUrl = '';
		void getDerived(project.id, asset.id)
			.then((data) => {
				if (!active || !data) return;
				setDerived(data);
				if (data.poster.size > 0) {
					objectUrl = URL.createObjectURL(data.poster);
					setPoster(objectUrl);
				}
			})
			.catch((error: unknown) => console.error(`Could not load preview for ${asset.name}.`, error));
		return () => {
			active = false;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [asset.id, asset.name, project.id]);

	if (track.kind === 'audio') {
		const peak = derived?.peaks;
		if (peak) {
			const count = Math.min(160, Math.max(1, Math.floor(peak.max.length / 5)));
			return (
				<div className="timeline-waveform" aria-hidden="true">
					{Array.from({ length: count }, (_, index) => {
						const sample = Math.floor((index / count) * peak.max.length);
						const top = peak.max[sample] ?? 0;
						const bottom = peak.min[sample] ?? 0;
						return <i key={index} style={{ height: `${Math.max(2, top - bottom)}%` }} />;
					})}
				</div>
			);
		}
	}
	if (poster)
		return <img className="timeline-thumbnail" src={poster} alt="" width="120" height="68" />;
	return (
		<span className="timeline-clip-placeholder" aria-hidden="true">
			{asset.kind === 'audio' ? '♫' : '▧'}
		</span>
	);
}

export default function ClipView({
	clip,
	asset,
	track,
	project,
	pixelsPerSecond,
	selected,
	tabIndex,
	ghost = false,
	onPointerDown,
	onKeyboardTrim,
	onSelect,
	onContextMenu
}: ClipViewProps) {
	const start = timeToPixels(clip.start, pixelsPerSecond);
	const width = Math.max(12, timeToPixels(clip.duration, pixelsPerSecond));
	const startLabel = ticksToTimecode(clip.start, project.settings.fps);
	const durationLabel = ticksToTimecode(clip.duration, project.settings.fps);
	const clipRef = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);
	useEffect(() => {
		const element = clipRef.current;
		if (!element || ghost) return;
		if (!('IntersectionObserver' in window)) {
			setVisible(true);
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
			{ rootMargin: '80px' }
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [ghost]);
	return (
		<div
			ref={clipRef}
			className={`timeline-clip ${track.kind === 'audio' ? 'is-audio' : 'is-video'} ${selected ? 'is-selected' : ''} ${asset.offline ? 'is-offline' : ''} ${ghost ? 'is-ghost' : ''}`}
			data-clip-id={clip.id}
			data-track-id={track.id}
			role="group"
			tabIndex={ghost ? -1 : tabIndex}
			aria-label={`Clip: ${asset.name}, ${track.name}, starts ${startLabel}, duration ${durationLabel}${clip.linkId ? ', linked' : ''}${asset.offline ? ', offline' : ''}${selected ? ', selected' : ''}`}
			draggable={false}
			style={{ left: start, width }}
			onPointerDown={(event) => {
				if (ghost) return;
				onSelect(clip.id, event);
				if (!(event.target instanceof HTMLElement && event.target.closest('.clip-trim-handle'))) {
					onPointerDown(event, clip);
				}
			}}
			onContextMenu={(event) => {
				if (!ghost) onContextMenu(event, clip);
			}}
			onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
				if (ghost) return;
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					onSelect(clip.id, event);
				}
				if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
					event.preventDefault();
					onContextMenu(event, clip);
				}
			}}
		>
			{!ghost && (
				<>
					<button
						type="button"
						className="clip-trim-handle clip-trim-start"
						aria-label={`Trim start of ${asset.name}`}
						title="Use Left/Right Arrow to trim by 1 frame; Shift for 10 frames."
						onPointerDown={(event) => {
							event.stopPropagation();
							onPointerDown(event, clip, 'start');
						}}
						onKeyDown={(event) => {
							if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
							event.preventDefault();
							event.stopPropagation();
							const multiplier = event.shiftKey ? 10 : 1;
							onKeyboardTrim(clip, 'start', (event.key === 'ArrowLeft' ? -1 : 1) * multiplier);
						}}
					/>
					<button
						type="button"
						className="clip-trim-handle clip-trim-end"
						aria-label={`Trim end of ${asset.name}`}
						title="Use Left/Right Arrow to trim by 1 frame; Shift for 10 frames."
						onPointerDown={(event) => {
							event.stopPropagation();
							onPointerDown(event, clip, 'end');
						}}
						onKeyDown={(event) => {
							if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
							event.preventDefault();
							event.stopPropagation();
							const multiplier = event.shiftKey ? 10 : 1;
							onKeyboardTrim(clip, 'end', (event.key === 'ArrowLeft' ? -1 : 1) * multiplier);
						}}
					/>
				</>
			)}
			{visible && <ClipArtwork project={project} asset={asset} track={track} />}
			<span className="timeline-clip-name">
				{asset.offline && <b>Offline · </b>}
				{asset.name}
			</span>
			{clip.linkId && (
				<span className="clip-link-mark" aria-label="Linked clip">
					↔
				</span>
			)}
			<span className="timeline-clip-duration">{durationLabel}</span>
		</div>
	);
}
