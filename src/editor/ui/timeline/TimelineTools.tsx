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
				{/* Premiere Pro standard pointer cursor */}
				<path d="M2.5 1.5l10 6.5-4.8.8 2.6 4.7-1.8 1-2.6-4.7-3.4 3.2V1.5z" />
			</svg>
		)
	},
	{
		id: 'track-select',
		label: 'Track Select Forward Tool',
		shortcut: 'A',
		description: 'Select all clips forward (to the right) across all tracks',
		icon: (
			<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
				{/* Vertical track bar with double forward arrows */}
				<rect x="2" y="2.5" width="2" height="11" rx="0.5" />
				<path d="M6 4.5l4 3.5-4 3.5V4.5zM10.5 4.5l4 3.5-4 3.5V4.5z" />
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
				{/* Premiere Ripple Edit bracket with inward directional arrows */}
				<path d="M4 3h3v2H6v6h1v2H4V3zm5 2.5l3.5 2.5-3.5 2.5v-5z" />
			</svg>
		)
	},
	{
		id: 'razor',
		label: 'Razor Tool',
		shortcut: 'C',
		description: 'Make precise cuts and split clips into separate sections',
		icon: (
			<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
				{/* Premiere Pro classic angled razor blade */}
				<g transform="rotate(45 8 8)">
					<path
						fillRule="evenodd"
						clipRule="evenodd"
						d="M2.5 4.5h11l1 1.5v1.2h-1.2v1.6h1.2v1.2l-1 1.5h-11l-1-1.5V8.8h1.2V7.2H1.5V6l1-1.5zm2 3h7v1h-7v-1zm3.5-1.5a1 1 0 100 2 1 1 0 000-2z"
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
				{/* Two boundary brackets with inward slip arrows */}
				<path d="M2 3h2v10H2V3zm10 0h2v10h-2V3zM7.5 5.5L5 8l2.5 2.5V5.5zm1 5L11 8 8.5 5.5v5z" />
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
				{/* Fountain pen nib with slit and breather hole */}
				<path d="M12.8 1.8a1.5 1.5 0 012.1 2.1l-6.9 6.9-2.8.7.7-2.8 6.9-6.9zm-4.7 9.8l-4.5 1.2a.5.5 0 01-.6-.6l1.2-4.5 3.9 3.9zm-1.8.4l-.8.8-1.5-.4.4-1.5.8.8.7.1-.6.2z" />
				<circle cx="9.2" cy="6.8" r="0.8" fill="currentColor" />
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
				{/* Hand tool palm */}
				<path d="M6 1.5a.75.75 0 01.75.75v4.5h.5V1a.75.75 0 011.5 0v5.75h.5V1.75a.75.75 0 011.5 0v5h.5v-3.5a.75.75 0 011.5 0v6.25c0 3-2 5-4.5 5S3.5 12.5 3.5 10V5.75a.75.75 0 011.5 0V7.5h.5V2.25A.75.75 0 016 1.5z" />
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
				{/* Clean bold capital T */}
				<path d="M2.5 3.5V2h11v1.5H9.5v10.5H6.5V3.5H2.5z" />
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
