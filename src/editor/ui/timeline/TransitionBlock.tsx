import { useCallback, type KeyboardEvent } from 'react';
import {
	clipEnd,
	timeToPixels,
	transitionWindow,
	getTransitionDefinition,
	type Track,
	type Transition
} from '../../core';
import { useEditorStoreApi } from '../../state/EditorProvider';

interface TransitionBlockProps {
	transition: Transition;
	track: Track;
	pixelsPerSecond: number;
	selected: boolean;
	onSelect: (transitionId: string) => void;
}

export function TransitionBlock({
	transition,
	track,
	pixelsPerSecond,
	selected,
	onSelect
}: TransitionBlockProps) {
	const store = useEditorStoreApi();
	const def = getTransitionDefinition(transition.type);

	// Find the cut time
	let cutTime = 0;
	const edge = transition.edge;
	if (edge.kind === 'cut') {
		const cA = track.clips.find((c) => c.id === edge.fromClipId);
		if (cA) cutTime = clipEnd(cA);
	} else if (edge.kind === 'head') {
		const c = track.clips.find((c) => c.id === edge.clipId);
		if (c) cutTime = c.start;
	} else {
		const c = track.clips.find((c) => c.id === edge.clipId);
		if (c) cutTime = clipEnd(c);
	}

	const win = transitionWindow(cutTime, transition.duration, transition.alignment);
	const leftPx = timeToPixels(win.start, pixelsPerSecond);
	const widthPx = Math.max(16, timeToPixels(win.duration, pixelsPerSecond));

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === 'Delete' || e.key === 'Backspace') {
				e.stopPropagation();
				e.preventDefault();
				store.getState().removeTransition(transition.id);
			}
		},
		[store, transition.id]
	);

	return (
		<div
			className={`timeline-transition-block ${selected ? 'is-selected' : ''}`}
			style={{
				left: `${leftPx}px`,
				width: `${widthPx}px`
			}}
			tabIndex={0}
			role="button"
			aria-label={`${def?.name ?? transition.type} transition, duration ${(transition.duration / 1_000_000).toFixed(2)}s`}
			onPointerDown={(e) => {
				e.stopPropagation();
				onSelect(transition.id);
			}}
			onKeyDown={handleKeyDown}
		>
			<span className="timeline-transition-title">{def?.name ?? transition.type}</span>
			<div
				className="timeline-transition-handle start"
				title="Trim transition duration"
				onPointerDown={(e) => {
					e.stopPropagation();
					e.preventDefault();
					const startX = e.clientX;
					const initialDur = transition.duration;
					const onMove = (ev: globalThis.PointerEvent) => {
						const dx = ev.clientX - startX;
						const dt = Math.round((dx / pixelsPerSecond) * 1_000_000);
						const newDur = Math.max(100_000, initialDur - dt * 2);
						store.getState().updateTransition(transition.id, { duration: newDur });
					};
					const onUp = () => {
						window.removeEventListener('pointermove', onMove);
						window.removeEventListener('pointerup', onUp);
					};
					window.addEventListener('pointermove', onMove);
					window.addEventListener('pointerup', onUp);
				}}
			/>
			<div
				className="timeline-transition-handle end"
				title="Trim transition duration"
				onPointerDown={(e) => {
					e.stopPropagation();
					e.preventDefault();
					const startX = e.clientX;
					const initialDur = transition.duration;
					const onMove = (ev: globalThis.PointerEvent) => {
						const dx = ev.clientX - startX;
						const dt = Math.round((dx / pixelsPerSecond) * 1_000_000);
						const newDur = Math.max(100_000, initialDur + dt * 2);
						store.getState().updateTransition(transition.id, { duration: newDur });
					};
					const onUp = () => {
						window.removeEventListener('pointermove', onMove);
						window.removeEventListener('pointerup', onUp);
					};
					window.addEventListener('pointermove', onMove);
					window.addEventListener('pointerup', onUp);
				}}
			/>
		</div>
	);
}
