import type { ReactNode } from 'react';
import type { TimelineTool } from '../../state/store';

interface ToolItem {
	id: TimelineTool;
	label: string;
	shortcut?: string;
	description: string;
	icon: ReactNode;
}

const TOOLS: ToolItem[] = [
	{
		id: 'select',
		label: 'Selection Tool',
		shortcut: 'V',
		description: 'Select, move, and trim individual clips on the timeline',
		icon: (
			<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
				<path d="M2.5 1.5l10.5 7.5-5 1-2.5 4.5-2-1 2.5-4.5-3.5-0.5V1.5z" />
			</svg>
		)
	},
	{
		id: 'track-select',
		label: 'Track Select Forward Tool',
		shortcut: 'A',
		description: 'Select all clips forward (to the right) across all tracks',
		icon: (
			<svg
				viewBox="0 0 16 16"
				width="15"
				height="15"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M2.5 3v10M6 8h7.5M10.5 5l3 3-3 3" />
				<path d="M5.5 5.5v5" strokeDasharray="1 1.5" />
			</svg>
		)
	},
	{
		id: 'ripple',
		label: 'Ripple Edit Tool',
		shortcut: 'B',
		description: 'Trim a clip while automatically adjusting the rest of the timeline',
		icon: (
			<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
				<path d="M8 2v12M5 5L2 8l3 3V5zm6 0l3 3-3 3V5z" />
			</svg>
		)
	},
	{
		id: 'razor',
		label: 'Razor Tool',
		shortcut: 'C',
		description: 'Make precise cuts and split clips into separate sections',
		icon: (
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
				<g transform="rotate(45 12 12)">
					<path
						fill="currentColor"
						fillRule="evenodd"
						clipRule="evenodd"
						d="M 4.5 7 h 15 l 1.5 1.5 v 2 h -1.5 v 3 H 21 v 2 l -1.5 1.5 h -15 L 3 15.5 v -2 h 1.5 v -3 H 3 V 8.5 L 4.5 7 Z M 12 9.8 a 2.2 2.2 0 1 0 0.001 0 Z M 5.5 11.3 h 13 v 1.4 h -13 Z M 5.5 10.4 h 1.5 v 3.2 h -1.5 Z M 17 10.4 h 1.5 v 3.2 h -1.5 Z"
					/>
				</g>
			</svg>
		)
	},
	{
		id: 'slip',
		label: 'Slip Tool',
		shortcut: 'Y',
		description: "Shift clip's internal in and out points without moving its position",
		icon: (
			<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
				<path d="M1.5 3v10H3V3H1.5zm11.5 0v10h1.5V3H13zM7 6L4.5 8 7 10V6zm2 0v4l2.5-2L9 6z" />
			</svg>
		)
	},
	{
		id: 'pen',
		label: 'Pen Tool',
		shortcut: 'P',
		description: 'Create and adjust keyframes and bezier masks directly on clips',
		icon: (
			<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
				<path d="M3 13l1-3.5 7.5-7.5a1.5 1.5 0 0 1 2 2L6 11.5 2.5 13.5 3 13zm7-8.5l1.5 1.5M4 11l1 1" />
				<circle cx="8" cy="8" r="0.6" fill="currentColor" />
			</svg>
		)
	},
	{
		id: 'rect',
		label: 'Rectangle Tool',
		description: 'Draw shapes and graphics overlays inside the program monitor',
		icon: (
			<svg
				viewBox="0 0 16 16"
				width="15"
				height="15"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<rect x="2.5" y="3.5" width="11" height="9" rx="1.2" />
			</svg>
		)
	},
	{
		id: 'hand',
		label: 'Hand Tool',
		shortcut: 'H',
		description: 'Click and drag to pan across the timeline',
		icon: (
			<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
				<path d="M6 1.5a.75.75 0 0 1 .75.75v4.5h.5V1a.75.75 0 0 1 1.5 0v5.75h.5V1.75a.75.75 0 0 1 1.5 0v5h.5v-3.5a.75.75 0 0 1 1.5 0v6.25c0 3-2 5-4.5 5S3.5 12.5 3.5 10V5.75a.75.75 0 0 1 1.5 0V7.5h.5V2.25A.75.75 0 0 1 6 1.5z" />
			</svg>
		)
	},
	{
		id: 'type',
		label: 'Type Tool',
		shortcut: 'T',
		description: 'Create horizontal text layers and titles over your video track',
		icon: (
			<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
				<path d="M2.5 3.5V2h11v1.5H9.5v9h1.5V14H5v-1.5h1.5v-9H2.5z" />
			</svg>
		)
	}
];

interface TimelineToolsProps {
	activeTool: TimelineTool;
	onSelectTool: (tool: TimelineTool) => void;
}

export function TimelineTools({ activeTool, onSelectTool }: TimelineToolsProps) {
	return (
		<aside
			className="timeline-toolstrip"
			role="toolbar"
			aria-label="Timeline editing tools"
			aria-orientation="vertical"
		>
			{TOOLS.map((tool) => {
				const isActive = activeTool === tool.id;
				const title = tool.shortcut
					? `${tool.label} (${tool.shortcut}) – ${tool.description}`
					: `${tool.label} – ${tool.description}`;
				return (
					<button
						key={tool.id}
						type="button"
						className={`timeline-toolstrip-button ${isActive ? 'is-active' : ''}`}
						aria-pressed={isActive}
						aria-label={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
						title={title}
						onClick={() => onSelectTool(tool.id)}
					>
						{tool.icon}
					</button>
				);
			})}
		</aside>
	);
}

export default TimelineTools;
