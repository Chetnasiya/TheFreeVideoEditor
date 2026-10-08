import { useRef, useEffect, useState } from 'react';
import type { ClipId } from '../../core/types';
import { useEditorStoreApi } from '../../state/EditorProvider';

interface TextInlineEditorProps {
	clipId: ClipId;
	text: string;
	position: { x: number; y: number; width: number; height: number };
	onCommit: (text: string) => void;
	onCancel: () => void;
}

export function TextInlineEditor({ clipId, text, position, onCommit, onCancel }: TextInlineEditorProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [value, setValue] = useState(text);

	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.focus();
			textareaRef.current.select();
		}
	}, []);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		} else if (e.key === 'Enter' && e.ctrlKey) {
			e.preventDefault();
			onCommit(value);
		}
	};

	const handleBlur = () => {
		onCommit(value);
	};

	return (
		<textarea
			ref={textareaRef}
			value={value}
			onChange={(e) => setValue(e.target.value)}
			onKeyDown={handleKeyDown}
			onBlur={handleBlur}
			style={{
				position: 'absolute',
				left: `${position.x}px`,
				top: `${position.y}px`,
				width: `${position.width}px`,
				height: `${position.height}px`,
				padding: '8px',
				fontSize: '14px',
				fontFamily: 'monospace',
				backgroundColor: 'var(--bg-primary)',
				color: 'var(--text-primary)',
				border: '2px solid var(--accent-color)',
				borderRadius: '4px',
				zIndex: 1000,
				resize: 'none',
				boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
			}}
			placeholder="Enter text... (Ctrl+Enter to commit, Esc to cancel)"
		/>
	);
}
