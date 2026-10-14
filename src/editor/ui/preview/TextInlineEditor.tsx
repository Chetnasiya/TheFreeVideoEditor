import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../core';
import { readProperty } from '../../core';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';

interface TextInlineEditorProps {
	project: Project;
	renderedWidth: number;
	renderedHeight: number;
}

export default function TextInlineEditor({
	project,
	renderedWidth,
	renderedHeight
}: TextInlineEditorProps) {
	const store = useEditorStoreApi();
	const editingClipId = useEditorStore((state) => state.editingTextClipId);
	const playhead = useEditorStore((state) => state.timeline.playhead);

	let clip = editingClipId
		? (project.tracks.flatMap((t) => t.clips).find((c) => c.id === editingClipId) ?? null)
		: null;
	if (!clip && editingClipId && project.sequences) {
		for (const seq of Object.values(project.sequences)) {
			const found = seq.tracks.flatMap((t) => t.clips).find((c) => c.id === editingClipId);
			if (found) {
				clip = found;
				break;
			}
		}
	}

	const textSource = clip?.source?.type === 'text' ? clip.source : null;
	const [textValue, setTextValue] = useState(textSource?.text ?? '');
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (textSource) {
			setTextValue(textSource.text);
			// Auto focus and select all
			setTimeout(() => {
				if (textareaRef.current) {
					textareaRef.current.focus();
					textareaRef.current.select();
				}
			}, 10);
		}
	}, [clip?.id, textSource]);

	if (!clip || !textSource) return null;

	const monitorScale = renderedWidth / Math.max(1, project.settings.width);
	const localTime = playhead - clip.start;
	const position = (readProperty(clip, 'position', localTime) as [number, number]) ?? [0, 0];
	const fontSize =
		((readProperty(clip, 'text.fontSize', localTime) as number) ?? 48) * monitorScale;
	const letterSpacing =
		((readProperty(clip, 'text.letterSpacing', localTime) as number) ??
			textSource.style?.letterSpacing ??
			0) * monitorScale;
	const lineHeight =
		(readProperty(clip, 'text.lineHeight', localTime) as number) ??
		textSource.style?.lineHeight ??
		1.2;

	// Base anchor point in preview plus clip position offset
	const centerX = renderedWidth / 2 + position[0] * monitorScale;
	const centerY = renderedHeight / 2 + position[1] * monitorScale;

	const isAutoSize = textSource.box?.autoSize !== false;
	const alignment = textSource.style?.alignment || 'center';
	const verticalAnchor = textSource.box?.verticalAnchor || 'center';

	let transformTranslate = 'translate(-50%, -50%)';
	if (isAutoSize) {
		const translateX = alignment === 'left' ? '0%' : alignment === 'right' ? '-100%' : '-50%';
		const translateY =
			verticalAnchor === 'top' ? '0%' : verticalAnchor === 'bottom' ? '-100%' : '-50%';
		transformTranslate = `translate(${translateX}, ${translateY})`;
	}

	const handleCommit = () => {
		if (clip) {
			store.getState().setTextContent(clip.id, textValue);
		}
		store.getState().setEditingTextClipId(null);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			store.getState().setEditingTextClipId(null);
		} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			e.stopPropagation();
			handleCommit();
		}
	};

	return (
		<div
			className="text-inline-editor-backdrop"
			style={{
				position: 'absolute',
				inset: 0,
				pointerEvents: 'auto',
				zIndex: 20
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) handleCommit();
			}}
		>
			<textarea
				ref={textareaRef}
				value={textValue}
				onChange={(e) => setTextValue(e.target.value)}
				onBlur={handleCommit}
				onKeyDown={handleKeyDown}
				aria-label="Edit text on canvas"
				style={{
					position: 'absolute',
					left: `${centerX}px`,
					top: `${centerY}px`,
					transform: transformTranslate,
					minWidth: '200px',
					maxWidth: '80%',
					minHeight: '60px',
					fontSize: `${Math.max(14, fontSize)}px`,
					letterSpacing: `${letterSpacing}px`,
					lineHeight: `${lineHeight}`,
					fontFamily: textSource.style?.fontFamily || 'sans-serif',
					fontWeight: textSource.style?.fontWeight || 'normal',
					textAlign: textSource.style?.alignment || 'center',
					color: 'var(--color-ink, #ffffff)',
					backgroundColor: 'rgba(0, 0, 0, 0.75)',
					border: '1px solid var(--color-link, #0070f3)',
					borderRadius: '4px',
					padding: '8px 12px',
					outline: 'none',
					resize: 'both',
					overflow: 'hidden'
				}}
			/>
		</div>
	);
}
