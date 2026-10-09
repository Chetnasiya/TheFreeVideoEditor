import {
	useRef,
	useState,
	useEffect,
	type PointerEvent as ReactPointerEvent,
	type KeyboardEvent,
	type MouseEvent
} from 'react';
import { timeToPixels, type CaptionSegment, type Time, type Track } from '../../core';
import { useEditorStoreApi } from '../../state/EditorProvider';

export interface CaptionSegmentViewProps {
	segment: CaptionSegment;
	track: Track;
	pixelsPerSecond: number;
	selected: boolean;
	tabIndex?: number;
	onSelect?: (segmentId: string, event: MouseEvent | ReactPointerEvent) => void;
}

export function CaptionSegmentView({
	segment,
	track,
	pixelsPerSecond,
	selected,
	tabIndex = 0,
	onSelect
}: CaptionSegmentViewProps) {
	const store = useEditorStoreApi();
	const [editing, setEditing] = useState(false);
	const [text, setText] = useState(segment.text);
	const inputRef = useRef<HTMLInputElement>(null);

	// Dragging / trimming state
	const [dragEdge, setDragEdge] = useState<'move' | 'start' | 'end' | null>(null);
	const dragStartPointerX = useRef<number>(0);
	const originalStart = useRef<Time>(segment.start);
	const originalEnd = useRef<Time>(segment.end);

	useEffect(() => {
		setText(segment.text);
	}, [segment.text]);

	useEffect(() => {
		if (editing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [editing]);

	const leftPx = timeToPixels(segment.start, pixelsPerSecond);
	const widthPx = Math.max(14, timeToPixels(segment.end - segment.start, pixelsPerSecond));

	const handlePointerDown = (
		e: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>,
		edge: 'move' | 'start' | 'end'
	) => {
		if (editing) return;
		e.stopPropagation();
		e.preventDefault();

		setDragEdge(edge);
		dragStartPointerX.current = e.clientX;
		originalStart.current = segment.start;
		originalEnd.current = segment.end;

		store.getState().selectCaption(track.id, segment.id);
		onSelect?.(segment.id, e);

		const handlePointerMove = (moveEv: PointerEvent) => {
			const deltaPx = moveEv.clientX - dragStartPointerX.current;
			const deltaUs = Math.round((deltaPx / pixelsPerSecond) * 1_000_000);

			if (edge === 'move') {
				const duration = originalEnd.current - originalStart.current;
				const newStart = Math.max(0, originalStart.current + deltaUs);
				const newEnd = newStart + duration;
				store.getState().updateCaptionSegment(track.id, segment.id, {
					start: newStart,
					end: newEnd
				});
			} else if (edge === 'start') {
				const minDur = 200_000; // 200ms
				const newStart = Math.max(
					0,
					Math.min(originalEnd.current - minDur, originalStart.current + deltaUs)
				);
				store.getState().updateCaptionSegment(track.id, segment.id, {
					start: newStart
				});
			} else if (edge === 'end') {
				const minDur = 200_000;
				const newEnd = Math.max(originalStart.current + minDur, originalEnd.current + deltaUs);
				store.getState().updateCaptionSegment(track.id, segment.id, {
					end: newEnd
				});
			}
		};

		const handlePointerUp = () => {
			setDragEdge(null);
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', handlePointerUp);
		};

		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp);
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		if (editing) return;
		if (e.key === 'Enter') {
			e.preventDefault();
			setEditing(true);
		} else if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			store.getState().deleteCaptionSegment(track.id, segment.id);
		}
	};

	return (
		<div
			className={`caption-segment-view group ${selected ? 'is-selected' : ''} ${dragEdge ? `is-dragging is-dragging-${dragEdge}` : ''}`}
			style={{
				left: `${leftPx}px`,
				width: `${widthPx}px`
			}}
			tabIndex={tabIndex}
			role="button"
			aria-label={`Caption: ${segment.text}`}
			title={segment.text}
			onClick={(e) => {
				e.stopPropagation();
				store.getState().selectCaption(track.id, segment.id);
				onSelect?.(segment.id, e);
			}}
			onDoubleClick={(e) => {
				e.stopPropagation();
				setEditing(true);
			}}
			onKeyDown={handleKeyDown}
			onPointerDown={(e) => handlePointerDown(e, 'move')}
		>
			{/* Left trim handle */}
			<button
				type="button"
				className="caption-trim-handle caption-trim-start"
				aria-label="Trim caption start"
				onPointerDown={(e) => handlePointerDown(e, 'start')}
			/>

			{/* Caption content */}
			<div className="caption-content">
				{segment.speaker && (
					<span className="caption-speaker" title={`Speaker: ${segment.speaker}`}>
						{segment.speaker}:
					</span>
				)}
				{editing ? (
					<input
						ref={inputRef}
						className="caption-inline-input"
						value={text}
						onChange={(e) => setText(e.target.value)}
						onBlur={() => {
							setEditing(false);
							if (text.trim() && text !== segment.text) {
								store.getState().updateCaptionSegment(track.id, segment.id, { text: text.trim() });
							}
						}}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								setEditing(false);
								if (text.trim() && text !== segment.text) {
									store
										.getState()
										.updateCaptionSegment(track.id, segment.id, { text: text.trim() });
								}
							} else if (e.key === 'Escape') {
								setText(segment.text);
								setEditing(false);
							}
						}}
						onClick={(e) => e.stopPropagation()}
					/>
				) : (
					<span className="caption-text">{segment.text}</span>
				)}
			</div>

			{/* Right trim handle */}
			<button
				type="button"
				className="caption-trim-handle caption-trim-end"
				aria-label="Trim caption end"
				onPointerDown={(e) => handlePointerDown(e, 'end')}
			/>
		</div>
	);
}
