import type { ReactElement } from 'react';
import type { ShapeKind } from '../../core/shapes/shapeTypes';

interface IconProps {
	size?: number;
	className?: string;
	strokeWidth?: number;
}

export function ShapeIcon({
	type,
	size = 16,
	className,
	strokeWidth = 1.75
}: {
	type: ShapeKind;
	size?: number;
	className?: string;
	strokeWidth?: number;
}): ReactElement {
	switch (type) {
		case 'rect':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					strokeLinejoin="round"
					className={className}
					aria-hidden="true"
				>
					<rect x="3" y="4" width="14" height="12" rx="1.5" />
				</svg>
			);
		case 'rounded-rect':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					strokeLinejoin="round"
					className={className}
					aria-hidden="true"
				>
					<rect x="3" y="4" width="14" height="12" rx="4" />
				</svg>
			);
		case 'circle':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					strokeLinejoin="round"
					className={className}
					aria-hidden="true"
				>
					<circle cx="10" cy="10" r="7" />
				</svg>
			);
		case 'ellipse':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					strokeLinejoin="round"
					className={className}
					aria-hidden="true"
				>
					<ellipse cx="10" cy="10" rx="7.5" ry="4.5" />
				</svg>
			);
		case 'triangle':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					strokeLinejoin="round"
					className={className}
					aria-hidden="true"
				>
					<polygon points="10 3 17 16 3 16" />
				</svg>
			);
		case 'star':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					strokeLinejoin="round"
					className={className}
					aria-hidden="true"
				>
					<polygon points="10 2.5 12.3 7.2 17.5 7.9 13.8 11.5 14.7 16.6 10 14.1 5.3 16.6 6.2 11.5 2.5 7.9 7.7 7.2" />
				</svg>
			);
		case 'polygon':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					strokeLinejoin="round"
					className={className}
					aria-hidden="true"
				>
					<polygon points="10 3 16.5 6.75 16.5 14.25 10 18 3.5 14.25 3.5 6.75" />
				</svg>
			);
		case 'heart':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					strokeLinejoin="round"
					className={className}
					aria-hidden="true"
				>
					<path d="M10 17.2s-6.5-4.2-6.5-8.8a4.2 4.2 0 0 1 7.2-2.9L10 6l-.7-.5a4.2 4.2 0 0 1 7.2 2.9c0 4.6-6.5 8.8-6.5 8.8z" />
				</svg>
			);
		case 'arrow':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					strokeLinejoin="round"
					className={className}
					aria-hidden="true"
				>
					<line x1="3.5" y1="10" x2="16.5" y2="10" />
					<polyline points="11.5 5 16.5 10 11.5 15" />
				</svg>
			);
		case 'line':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth + 0.5}
					strokeLinecap="round"
					strokeLinejoin="round"
					className={className}
					aria-hidden="true"
				>
					<line x1="3" y1="10" x2="17" y2="10" />
				</svg>
			);
		case 'diamond':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					strokeLinejoin="round"
					className={className}
					aria-hidden="true"
				>
					<polygon points="10 3 17 10 10 17 3 10" />
				</svg>
			);
		case 'callout':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					strokeLinejoin="round"
					className={className}
					aria-hidden="true"
				>
					<path d="M3.5 5.5A2.5 2.5 0 0 1 6 3h8a2.5 2.5 0 0 1 2.5 2.5v6A2.5 2.5 0 0 1 14 14H8.5L4.5 17.5V14H4A2.5 2.5 0 0 1 3.5 11.5v-6z" />
				</svg>
			);
		case 'badge':
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					strokeLinejoin="round"
					className={className}
					aria-hidden="true"
				>
					<path d="M10 2.5l1.6 1.8 2.4-.4.8 2.3 2.3.8-.4 2.4 1.8 1.6-1.8 1.6.4 2.4-2.3.8-.8 2.3-2.4-.4L10 17.5l-1.6-1.8-2.4.4-.8-2.3-2.3-.8.4-2.4L1.5 9l1.8-1.6-.4-2.4 2.3-.8.8-2.3 2.4.4z" />
				</svg>
			);
		default:
			return (
				<svg
					width={size}
					height={size}
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					className={className}
					aria-hidden="true"
				>
					<rect x="3" y="4" width="14" height="12" rx="1.5" />
				</svg>
			);
	}
}

export function LinkAspectIcon({ size = 14, className }: IconProps): ReactElement {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
			<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
		</svg>
	);
}

export function UnlinkAspectIcon({ size = 14, className }: IconProps): ReactElement {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			<path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
			<path d="m5.16 11.75-1.72 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71" />
			<line x1="2" y1="2" x2="22" y2="22" />
		</svg>
	);
}

export const SHAPE_GEOMETRIES: ReadonlyArray<{ type: ShapeKind; label: string }> = [
	{ type: 'rect', label: 'Rectangle' },
	{ type: 'rounded-rect', label: 'Rounded Rect' },
	{ type: 'circle', label: 'Circle' },
	{ type: 'ellipse', label: 'Ellipse' },
	{ type: 'triangle', label: 'Triangle' },
	{ type: 'star', label: 'Star' },
	{ type: 'polygon', label: 'Hexagon' },
	{ type: 'heart', label: 'Heart' },
	{ type: 'arrow', label: 'Arrow' },
	{ type: 'line', label: 'Line' },
	{ type: 'diamond', label: 'Diamond' },
	{ type: 'callout', label: 'Speech' },
	{ type: 'badge', label: 'Badge' }
];

