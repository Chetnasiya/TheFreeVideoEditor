import { useCallback, useMemo, useRef, useState } from 'react';
import type { PlaybackEngine } from '../../services/playback/engine';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import { TICKS_PER_SECOND } from '../../core/time';

interface YouTubeTimelineScrubberProps {
	engine: PlaybackEngine | null;
	time: number;
	duration: number;
	fps: number;
	isFullscreen?: boolean;
}

function formatPlayerTime(ticks: number): string {
	const totalSecs = Math.max(0, Math.floor(ticks / TICKS_PER_SECOND));
	const hours = Math.floor(totalSecs / 3600);
	const mins = Math.floor((totalSecs % 3600) / 60);
	const secs = totalSecs % 60;
	if (hours > 0) {
		return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	}
	return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function YouTubeTimelineScrubber({
	engine,
	time,
	duration,
	isFullscreen = false
}: YouTubeTimelineScrubberProps) {
	const store = useEditorStoreApi();
	const project = useEditorStore((state) => state.project);
	const scrubberRef = useRef<HTMLDivElement>(null);
	const [hoverRatio, setHoverRatio] = useState<number | null>(null);
	const [hoverClientX, setHoverClientX] = useState<number>(0);
	const [isScrubbing, setIsScrubbing] = useState(false);
	const [scrubTime, setScrubTime] = useState<number | null>(null);

	// Collect edit cut points across tracks to show subtle chapter ticks like YouTube
	const chapterCuts = useMemo(() => {
		if (!project || duration <= 0) return [];
		const cuts = new Set<number>();
		for (const track of project.tracks) {
			for (const clip of track.clips) {
				if (clip.start > 0 && clip.start < duration) {
					cuts.add(clip.start);
				}
				const end = clip.start + clip.duration;
				if (end > 0 && end < duration) {
					cuts.add(end);
				}
			}
		}
		return Array.from(cuts).sort((a, b) => a - b);
	}, [project, duration]);

	const displayTime = isScrubbing && scrubTime !== null ? scrubTime : time;
	const progressPercent =
		duration > 0 ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0;
	const hoverPercent = hoverRatio !== null ? Math.min(100, Math.max(0, hoverRatio * 100)) : null;

	const seekToRatio = useCallback(
		(ratio: number) => {
			if (duration <= 0) return;
			const targetTicks = Math.round(ratio * duration);
			setScrubTime(targetTicks);
			engine?.seek(targetTicks);
			store.getState().setPlayhead(targetTicks);
		},
		[duration, engine, store]
	);

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (duration <= 0) return;
		const bar = scrubberRef.current;
		if (!bar) return;
		bar.setPointerCapture(e.pointerId);
		setIsScrubbing(true);

		const rect = bar.getBoundingClientRect();
		const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		setHoverRatio(ratio);
		setHoverClientX(e.clientX - rect.left);
		seekToRatio(ratio);
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		const bar = scrubberRef.current;
		if (!bar || duration <= 0) return;
		const rect = bar.getBoundingClientRect();
		const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		setHoverRatio(ratio);
		setHoverClientX(e.clientX - rect.left);

		if (isScrubbing) {
			seekToRatio(ratio);
		}
	};

	const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (isScrubbing) {
			setIsScrubbing(false);
			setScrubTime(null);
			try {
				scrubberRef.current?.releasePointerCapture(e.pointerId);
			} catch {}
		}
	};

	const handlePointerLeave = () => {
		if (!isScrubbing) {
			setHoverRatio(null);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (duration <= 0) return;
		const stepTicks = TICKS_PER_SECOND; // 1 second
		const largeStepTicks = TICKS_PER_SECOND * 5; // 5 seconds
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			const nextTime = Math.max(0, time - (e.shiftKey ? largeStepTicks : stepTicks));
			engine?.seek(nextTime);
			store.getState().setPlayhead(nextTime);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			const nextTime = Math.min(duration, time + (e.shiftKey ? largeStepTicks : stepTicks));
			engine?.seek(nextTime);
			store.getState().setPlayhead(nextTime);
		}
	};

	const tooltipTicks = hoverRatio !== null ? Math.round(hoverRatio * duration) : displayTime;

	return (
		<div
			ref={scrubberRef}
			className={`yt-scrubber-wrap ${isFullscreen ? 'is-fullscreen' : ''} ${isScrubbing ? 'is-scrubbing' : ''}`}
			role="slider"
			tabIndex={0}
			aria-label="Video timeline scrubber"
			aria-valuemin={0}
			aria-valuemax={duration}
			aria-valuenow={displayTime}
			aria-valuetext={formatPlayerTime(displayTime)}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			onPointerLeave={handlePointerLeave}
			onKeyDown={handleKeyDown}
		>
			{/* Hover tooltip */}
			{hoverRatio !== null && duration > 0 && (
				<div
					className="yt-scrubber-tooltip"
					style={{
						left: `${Math.max(24, Math.min((scrubberRef.current?.clientWidth ?? 200) - 24, hoverClientX))}px`
					}}
				>
					{formatPlayerTime(tooltipTicks)}
				</div>
			)}

			{/* Interactive Track Area */}
			<div className="yt-scrubber-track">
				{/* Hover ghost preview bar */}
				{hoverPercent !== null && (
					<div
						className="yt-scrubber-hover-ghost"
						style={{ width: `${hoverPercent}%` }}
						aria-hidden="true"
					/>
				)}

				{/* Played progress bar (YouTube Red) */}
				<div
					className="yt-scrubber-progress"
					style={{ width: `${progressPercent}%` }}
					aria-hidden="true"
				/>

				{/* Chapter cut ticks */}
				{chapterCuts.map((cut, idx) => (
					<div
						key={idx}
						className="yt-scrubber-chapter-tick"
						style={{ left: `${(cut / duration) * 100}%` }}
						aria-hidden="true"
					/>
				))}

				{/* Playhead thumb (Red Dot) */}
				<div
					className="yt-scrubber-thumb"
					style={{ left: `${progressPercent}%` }}
					aria-hidden="true"
				/>
			</div>
		</div>
	);
}
