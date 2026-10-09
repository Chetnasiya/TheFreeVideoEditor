import type { KeyboardEvent, PointerEvent } from 'react';
import { rulerTickStep, rulerLabel, timeToPixels } from '../../core';
import type { Project, Time } from '../../core';

interface TimelineRulerProps {
	project: Project;
	duration: Time;
	playhead: Time;
	pixelsPerSecond: number;
	headerWidth: number;
	visibleStart?: number;
	visibleEnd?: number;
	onScrub: (event: PointerEvent<HTMLDivElement>) => void;
	onScrubEnd: () => void;
	onRulerKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

export default function TimelineRuler({
	project,
	duration,
	playhead,
	pixelsPerSecond,
	headerWidth,
	visibleStart,
	visibleEnd,
	onScrub,
	onScrubEnd,
	onRulerKeyDown
}: TimelineRulerProps) {
	const step = rulerTickStep(pixelsPerSecond, project.settings.fps);
	const count = Math.ceil(duration / step);

	// Virtualize ruler ticks if visible pixel range is provided
	let firstIndex = 0;
	let lastIndex = count;
	if (visibleStart !== undefined && visibleEnd !== undefined) {
		const stepPixels = timeToPixels(step, pixelsPerSecond);
		if (stepPixels > 0) {
			firstIndex = Math.max(0, Math.floor(visibleStart / stepPixels) - 2);
			lastIndex = Math.min(count, Math.ceil(visibleEnd / stepPixels) + 2);
		}
	}
	const tickIndices: number[] = [];
	for (let i = firstIndex; i <= lastIndex; i++) {
		tickIndices.push(i);
	}

	return (
		<div className="timeline-ruler-row">
			<div className="timeline-ruler-corner" style={{ width: headerWidth }}>
				Timecode
			</div>
			<div
				className="timeline-ruler"
				role="slider"
				tabIndex={0}
				aria-label="Timeline playhead"
				aria-orientation="horizontal"
				aria-valuemin={0}
				aria-valuemax={duration}
				aria-valuenow={playhead}
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					onScrub(event);
				}}
				onPointerMove={(event) => {
					if (event.currentTarget.hasPointerCapture(event.pointerId)) onScrub(event);
				}}
				onPointerUp={onScrubEnd}
				onPointerCancel={onScrubEnd}
				onClick={(event) => {
					onScrub(event as unknown as PointerEvent<HTMLDivElement>);
				}}
				onKeyDown={onRulerKeyDown}
				style={{ width: Math.max(1, timeToPixels(duration, pixelsPerSecond)) }}
			>
				{tickIndices.map((index) => {
					const time = index * step;
					return (
						<span
							className="timeline-ruler-tick"
							key={time}
							style={{ left: timeToPixels(time, pixelsPerSecond) }}
						>
							<span>{rulerLabel(time, project.settings.fps)}</span>
						</span>
					);
				})}
			</div>
		</div>
	);
}
