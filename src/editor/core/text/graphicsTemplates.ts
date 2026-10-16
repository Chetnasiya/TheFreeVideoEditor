import type {
	Clip,
	Keyframe,
	PropertyId,
	Time,
	TextStyle,
	TextBox,
	TextColorRun,
	AnimatedValue
} from '../types';
import { TEXT_ANIMATION_PRESETS, type TextAnimationPreset } from './presets';

export type GraphicCategory = 'all' | 'kinetic' | 'minimal' | 'badge' | 'neon' | 'social';

export interface GraphicAnimationPreset extends TextAnimationPreset {
	category?: 'in' | 'out' | 'emphasis';
}

export interface GraphicTemplate {
	id: string;
	name: string;
	category: Exclude<GraphicCategory, 'all'>;
	description: string;
	tags: string[];
	defaultText: string;
	primaryLine: string;
	secondaryLine?: string;
	tertiaryLine?: string;
	highlightWord?: string;
	frameStyle?: import('../types').GraphicFrameStyle;
	badgeText?: string;
	style: TextStyle;
	box: TextBox;
	properties: Record<PropertyId, number | number[]>;
	animationPresetId: string;
	inDurationUs: number;
	outDurationUs?: number;
	accentColor: { r: number; g: number; b: number; a: number };
	previewColors: {
		background: string;
		primary: string;
		accent: string;
		badge?: string;
	};
}

/**
 * Extended Animation Presets for Motion Graphic Titles:
 * Combines core text animation presets with advanced kinetic motion presets
 * (Zoom punch, Bouncy drop, Split slide, Glitch snap, Smooth drift, etc.)
 */
const EXTRA_GRAPHIC_ANIMATIONS: readonly TextAnimationPreset[] = [
	{
		id: 'kinetic-zoom',
		name: 'Kinetic Zoom',
		description: 'Dynamic snap zoom punch (0.3 -> 1.08 -> 1.0) with rapid opacity fade',
		duration: 450_000,
		kind: 'in',
		keyframes: {
			scale: [
				{
					time: 0,
					value: [0.3, 0.3],
					interpolation: 'bezier',
					easeOut: { x: 0.16, y: 1 },
					easeIn: { x: 0.3, y: 1 }
				},
				{
					time: 320_000,
					value: [1.08, 1.08],
					interpolation: 'bezier',
					easeOut: { x: 0.25, y: 0.1 },
					easeIn: { x: 0.25, y: 1 }
				},
				{ time: 450_000, value: [1.0, 1.0], interpolation: 'linear' }
			],
			opacity: [
				{ time: 0, value: 0, interpolation: 'linear' },
				{ time: 180_000, value: 1, interpolation: 'linear' }
			]
		}
	},
	{
		id: 'bounce-in',
		name: 'Bouncy Spring Drop',
		description: 'Playful bouncy drop from top with squash-and-stretch scale settling',
		duration: 600_000,
		kind: 'in',
		keyframes: {
			position: [
				{
					time: 0,
					value: [0, -180],
					interpolation: 'bezier',
					easeOut: { x: 0.34, y: 1.56 },
					easeIn: { x: 0.64, y: 1 }
				},
				{
					time: 420_000,
					value: [0, 15],
					interpolation: 'bezier',
					easeOut: { x: 0.25, y: 0.1 },
					easeIn: { x: 0.25, y: 1 }
				},
				{ time: 600_000, value: [0, 0], interpolation: 'linear' }
			],
			scale: [
				{ time: 0, value: [0.85, 1.15], interpolation: 'linear' },
				{ time: 420_000, value: [1.05, 0.95], interpolation: 'linear' },
				{ time: 600_000, value: [1.0, 1.0], interpolation: 'linear' }
			],
			opacity: [
				{ time: 0, value: 0, interpolation: 'linear' },
				{ time: 200_000, value: 1, interpolation: 'linear' }
			]
		}
	},
	{
		id: 'split-slide',
		name: 'Split Slide & Snap',
		description: 'Sharp horizontal slide with subtle angular rotation snap',
		duration: 500_000,
		kind: 'in',
		keyframes: {
			position: [
				{
					time: 0,
					value: [-180, 0],
					interpolation: 'bezier',
					easeOut: { x: 0.25, y: 0.1 },
					easeIn: { x: 0.25, y: 1 }
				},
				{ time: 500_000, value: [0, 0], interpolation: 'linear' }
			],
			rotation: [
				{ time: 0, value: -3, interpolation: 'bezier' },
				{ time: 500_000, value: 0, interpolation: 'linear' }
			],
			opacity: [
				{ time: 0, value: 0, interpolation: 'linear' },
				{ time: 250_000, value: 1, interpolation: 'linear' }
			]
		}
	},
	{
		id: 'glitch-snap',
		name: 'Glitch Strobe In',
		description: 'Cyberpunk rapid flicker strobe with impact scale punch',
		duration: 350_000,
		kind: 'in',
		keyframes: {
			scale: [
				{ time: 0, value: [1.15, 0.9], interpolation: 'linear' },
				{ time: 100_000, value: [0.95, 1.05], interpolation: 'linear' },
				{ time: 350_000, value: [1.0, 1.0], interpolation: 'linear' }
			],
			opacity: [
				{ time: 0, value: 0, interpolation: 'hold' },
				{ time: 80_000, value: 1, interpolation: 'hold' },
				{ time: 140_000, value: 0.25, interpolation: 'hold' },
				{ time: 200_000, value: 1, interpolation: 'linear' }
			]
		}
	},
	{
		id: 'smooth-drift',
		name: 'Cinematic Drift',
		description: 'Slow elegant drift and opacity dissolve for luxury or documentary',
		duration: 800_000,
		kind: 'in',
		keyframes: {
			scale: [
				{ time: 0, value: [0.95, 0.95], interpolation: 'linear' },
				{ time: 800_000, value: [1.02, 1.02], interpolation: 'linear' }
			],
			opacity: [
				{ time: 0, value: 0, interpolation: 'linear' },
				{ time: 600_000, value: 1, interpolation: 'linear' }
			]
		}
	},
	{
		id: 'pop-out',
		name: 'Pop Out (End)',
		description: 'Punchy scale overshoot pop down and fade out at clip end',
		duration: 400_000,
		kind: 'out',
		keyframes: {
			scale: [
				{ time: 0, value: [1.0, 1.0], interpolation: 'bezier' },
				{ time: 150_000, value: [1.08, 1.08], interpolation: 'linear' },
				{ time: 400_000, value: [0.4, 0.4], interpolation: 'linear' }
			],
			opacity: [
				{ time: 0, value: 1, interpolation: 'linear' },
				{ time: 400_000, value: 0, interpolation: 'linear' }
			]
		}
	},
	{
		id: 'slide-out-down',
		name: 'Slide Out Down (End)',
		description: 'Smooth slide down and fade out at clip end',
		duration: 450_000,
		kind: 'out',
		keyframes: {
			position: [
				{ time: 0, value: [0, 0], interpolation: 'linear' },
				{ time: 450_000, value: [0, 120], interpolation: 'linear' }
			],
			opacity: [
				{ time: 0, value: 1, interpolation: 'linear' },
				{ time: 450_000, value: 0, interpolation: 'linear' }
			]
		}
	}
];

export const GRAPHIC_ANIMATION_PRESETS: readonly TextAnimationPreset[] = [
	...TEXT_ANIMATION_PRESETS,
	...EXTRA_GRAPHIC_ANIMATIONS
];

/**
 * 16 Curated Editable Motion Graphic Templates
 * Modeled after professional kinetic typography & After Effects motion design packages
 */
export const GRAPHIC_TEMPLATES: readonly GraphicTemplate[] = [
	{
		id: 'trendy-typography-card',
		name: 'Trendy Typography Card',
		category: 'badge',
		description: 'Solid high-contrast white card with tracked header tag and bold year impact text',
		tags: ['card', 'inverted', 'bold', 'modern', 'clean', 'badge', 'white'],
		defaultText: 'TRENDY TYPOGRAPHY\n2022 YEAR!',
		primaryLine: 'TRENDY TYPOGRAPHY',
		secondaryLine: '2022 YEAR!',
		frameStyle: 'card',
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'center',
			letterSpacing: 2
		},
		box: {
			autoSize: true,
			paddingX: 36,
			paddingY: 22,
			verticalAnchor: 'center',
			frameStyle: 'card'
		},
		properties: {
			'text.fontSize': 54,
			'text.fillColor': [0.06, 0.06, 0.08, 1.0],
			'text.strokeWidth': 0,
			'text.backgroundBoxColor': [1.0, 1.0, 1.0, 1.0],
			'text.backgroundBoxRadius': 4,
			'text.backgroundBoxPadding': 24,
			'text.letterSpacing': 2,
			'text.lineHeight': 1.15,
			'text.reveal': 1,
			opacity: 1
		},
		animationPresetId: 'kinetic-zoom',
		inDurationUs: 450_000,
		outDurationUs: 400_000,
		accentColor: { r: 0.06, g: 0.06, b: 0.08, a: 1.0 },
		previewColors: {
			background: '#0a0a0c',
			primary: '#0a0a0c',
			accent: '#ffffff',
			badge: '#ffffff'
		}
	},
	{
		id: 'modern-title-split',
		name: 'Modern Title Split',
		category: 'kinetic',
		description:
			'Top badge header over bold uppercase title with sharp cut-through accent underline',
		tags: ['split', 'badge', 'underline', 'modern', 'kinetic', 'title'],
		defaultText: 'NEW TREND\nMODERN TITLE;',
		primaryLine: 'MODERN TITLE;',
		secondaryLine: 'NEW TREND',
		frameStyle: 'badge-header',
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'center',
			letterSpacing: 3
		},
		box: {
			autoSize: true,
			paddingX: 32,
			paddingY: 24,
			verticalAnchor: 'center',
			frameStyle: 'badge-header'
		},
		properties: {
			'text.fontSize': 56,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeWidth': 0,
			'text.accentBarColor': [1, 1, 1, 1],
			'text.accentBarWidth': 3,
			'text.letterSpacing': 3,
			'text.lineHeight': 1.25,
			'text.reveal': 1,
			opacity: 1
		},
		animationPresetId: 'split-slide',
		inDurationUs: 500_000,
		outDurationUs: 400_000,
		accentColor: { r: 1, g: 1, b: 1, a: 1 },
		previewColors: {
			background: '#08080a',
			primary: '#ffffff',
			accent: '#ffffff',
			badge: '#ffffff'
		}
	},
	{
		id: 'run-wild-side',
		name: 'Run Wild Side',
		category: 'kinetic',
		description:
			'Solid bold headline overlaid on stroked outline typography with sharp diagonal cut slash',
		tags: ['slash', 'stroke', 'outline', 'kinetic', 'cyber', 'impact'],
		defaultText: 'RUN ON THE\nWILD SIDE.',
		primaryLine: 'RUN ON THE',
		secondaryLine: 'WILD SIDE.',
		frameStyle: 'split-slash',
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'left',
			letterSpacing: 2
		},
		box: {
			autoSize: true,
			paddingX: 28,
			paddingY: 20,
			verticalAnchor: 'center',
			frameStyle: 'split-slash'
		},
		properties: {
			'text.fontSize': 60,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeColor': [1, 1, 1, 0.9],
			'text.strokeWidth': 2,
			'text.letterSpacing': 2,
			'text.lineHeight': 1.15,
			'text.reveal': 1,
			opacity: 1
		},
		animationPresetId: 'glitch-snap',
		inDurationUs: 400_000,
		outDurationUs: 400_000,
		accentColor: { r: 1, g: 1, b: 1, a: 1 },
		previewColors: {
			background: '#08080a',
			primary: '#ffffff',
			accent: '#ffffff'
		}
	},
	{
		id: 'tutorial-video-badge',
		name: 'Tutorial Video Badge',
		category: 'badge',
		description: 'Extra bold title with an anchored top-right inverted pill badge',
		tags: ['badge', 'tutorial', 'pill', 'bold', 'youtube', 'clean'],
		defaultText: 'TUTORIAL\nVIDEO',
		primaryLine: 'TUTORIAL',
		secondaryLine: 'VIDEO',
		badgeText: 'VIDEO',
		frameStyle: 'title-badge',
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'center',
			letterSpacing: 3
		},
		box: {
			autoSize: true,
			paddingX: 32,
			paddingY: 20,
			verticalAnchor: 'center',
			frameStyle: 'title-badge'
		},
		properties: {
			'text.fontSize': 68,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeWidth': 0,
			'text.letterSpacing': 3,
			'text.lineHeight': 1.1,
			'text.reveal': 1,
			opacity: 1
		},
		animationPresetId: 'pop-in',
		inDurationUs: 450_000,
		outDurationUs: 400_000,
		accentColor: { r: 1, g: 1, b: 1, a: 1 },
		previewColors: {
			background: '#0a0a0d',
			primary: '#ffffff',
			accent: '#ffffff',
			badge: '#ffffff'
		}
	},
	{
		id: 'new-trend-diagonal-repeat',
		name: 'Diagonal Repeat Marquee',
		category: 'kinetic',
		description:
			'Full kinetic marquee tilted 25° alternating solid filled and stroked outline typography',
		tags: ['marquee', 'repeat', 'diagonal', 'kinetic', 'fullscreen', 'hype'],
		defaultText: 'NEW NEW NEW\nTREND TREND TREND',
		primaryLine: 'NEW NEW NEW',
		secondaryLine: 'TREND TREND TREND',
		frameStyle: 'diagonal-repeat',
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'center',
			letterSpacing: 3
		},
		box: {
			autoSize: true,
			paddingX: 20,
			paddingY: 20,
			verticalAnchor: 'center',
			frameStyle: 'diagonal-repeat'
		},
		properties: {
			'text.fontSize': 72,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeColor': [1, 1, 1, 0.85],
			'text.strokeWidth': 2,
			'text.letterSpacing': 3,
			'text.lineHeight': 1.1,
			rotation: -18,
			opacity: 1
		},
		animationPresetId: 'kinetic-zoom',
		inDurationUs: 500_000,
		outDurationUs: 400_000,
		accentColor: { r: 1, g: 1, b: 1, a: 1 },
		previewColors: {
			background: '#090a0f',
			primary: '#ffffff',
			accent: '#ffffff'
		}
	},
	{
		id: 'new-cubed-box',
		name: 'New Cubed Box',
		category: 'minimal',
		description:
			'Solid white square card containing clean 3-line stacked black bold uppercase typography',
		tags: ['square', 'box', 'stack', 'minimal', 'bold', 'card', 'white'],
		defaultText: 'NEW\nNEW\nNEW',
		primaryLine: 'NEW',
		secondaryLine: 'NEW',
		tertiaryLine: 'NEW',
		frameStyle: 'card',
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'center',
			letterSpacing: 3
		},
		box: {
			width: 280,
			height: 280,
			autoSize: false,
			paddingX: 32,
			paddingY: 32,
			verticalAnchor: 'center',
			frameStyle: 'card'
		},
		properties: {
			'text.fontSize': 56,
			'text.fillColor': [0.06, 0.06, 0.08, 1.0],
			'text.strokeWidth': 0,
			'text.backgroundBoxColor': [1.0, 1.0, 1.0, 1.0],
			'text.backgroundBoxRadius': 2,
			'text.backgroundBoxPadding': 32,
			'text.letterSpacing': 3,
			'text.lineHeight': 1.05,
			'text.reveal': 1,
			opacity: 1
		},
		animationPresetId: 'bounce-in',
		inDurationUs: 550_000,
		outDurationUs: 400_000,
		accentColor: { r: 0.06, g: 0.06, b: 0.08, a: 1.0 },
		previewColors: {
			background: '#09090b',
			primary: '#0a0a0c',
			accent: '#ffffff',
			badge: '#ffffff'
		}
	},
	{
		id: 'circular-titles-4k',
		name: 'Circular Titles 4K',
		category: 'badge',
		description: 'Double-ring circular emblem badge with centered stacked modern typography',
		tags: ['circle', 'badge', 'emblem', '4k', 'seal', 'logo'],
		defaultText: 'TITLES\n4 K',
		primaryLine: 'TITLES',
		secondaryLine: '4 K',
		frameStyle: 'circle',
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'center',
			letterSpacing: 4
		},
		box: {
			width: 260,
			height: 260,
			autoSize: false,
			paddingX: 20,
			paddingY: 20,
			verticalAnchor: 'center',
			frameStyle: 'circle'
		},
		properties: {
			'text.fontSize': 44,
			'text.fillColor': [1, 1, 1, 1],
			'text.boxBorderColor': [1, 1, 1, 1],
			'text.boxBorderWidth': 6,
			'text.letterSpacing': 4,
			'text.lineHeight': 1.2,
			'text.reveal': 1,
			opacity: 1
		},
		animationPresetId: 'kinetic-zoom',
		inDurationUs: 450_000,
		outDurationUs: 400_000,
		accentColor: { r: 1, g: 1, b: 1, a: 1 },
		previewColors: {
			background: '#090a0f',
			primary: '#ffffff',
			accent: '#ffffff',
			badge: '#ffffff'
		}
	},
	{
		id: 'kinetic-typography-bar',
		name: 'Kinetic Typography Bar',
		category: 'kinetic',
		description: 'Vertical solid accent bar on left edge with clean stacked bold modern typography',
		tags: ['bar', 'accent', 'kinetic', 'bold', 'modern', 'headline'],
		defaultText: 'KINETIC\nTYPOGRAPHY',
		primaryLine: 'KINETIC',
		secondaryLine: 'TYPOGRAPHY',
		frameStyle: 'accent-bar',
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'left',
			letterSpacing: 2
		},
		box: {
			autoSize: true,
			paddingX: 30,
			paddingY: 20,
			verticalAnchor: 'center',
			frameStyle: 'accent-bar'
		},
		properties: {
			'text.fontSize': 52,
			'text.fillColor': [1, 1, 1, 1],
			'text.accentBarColor': [1, 1, 1, 1],
			'text.accentBarWidth': 6,
			'text.letterSpacing': 2,
			'text.lineHeight': 1.15,
			'text.reveal': 1,
			opacity: 1
		},
		animationPresetId: 'split-slide',
		inDurationUs: 500_000,
		outDurationUs: 400_000,
		accentColor: { r: 1, g: 1, b: 1, a: 1 },
		previewColors: {
			background: '#090a0d',
			primary: '#ffffff',
			accent: '#ffffff'
		}
	},
	{
		id: 'stylish-boxed-frame',
		name: 'Stylish Boxed Frame',
		category: 'minimal',
		description: 'Solid white rectangular border frame enclosing high-impact bold uppercase title',
		tags: ['frame', 'border', 'box', 'stylish', 'impact', 'minimal'],
		defaultText: 'STYLISH!',
		primaryLine: 'STYLISH!',
		frameStyle: 'frame',
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'center',
			letterSpacing: 3
		},
		box: {
			autoSize: true,
			paddingX: 38,
			paddingY: 18,
			verticalAnchor: 'center',
			frameStyle: 'frame'
		},
		properties: {
			'text.fontSize': 60,
			'text.fillColor': [1, 1, 1, 1],
			'text.boxBorderColor': [1, 1, 1, 1],
			'text.boxBorderWidth': 4,
			'text.letterSpacing': 3,
			'text.lineHeight': 1.1,
			'text.reveal': 1,
			opacity: 1
		},
		animationPresetId: 'pop-in',
		inDurationUs: 400_000,
		outDurationUs: 400_000,
		accentColor: { r: 1, g: 1, b: 1, a: 1 },
		previewColors: {
			background: '#0a0a0e',
			primary: '#ffffff',
			accent: '#ffffff'
		}
	},
	{
		id: 'trends-af-circle',
		name: 'Trends AF Circle Seal',
		category: 'badge',
		description: 'Concentric bold circular seal badge emblem with stacked centered typography',
		tags: ['circle', 'seal', 'emblem', 'badge', 'stamp', 'bold'],
		defaultText: 'TRENDS\nAF',
		primaryLine: 'TRENDS',
		secondaryLine: 'AF',
		frameStyle: 'circle',
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'center',
			letterSpacing: 3
		},
		box: {
			width: 240,
			height: 240,
			autoSize: false,
			paddingX: 20,
			paddingY: 20,
			verticalAnchor: 'center',
			frameStyle: 'circle'
		},
		properties: {
			'text.fontSize': 46,
			'text.fillColor': [1, 1, 1, 1],
			'text.boxBorderColor': [1, 1, 1, 1],
			'text.boxBorderWidth': 7,
			'text.letterSpacing': 3,
			'text.lineHeight': 1.15,
			'text.reveal': 1,
			opacity: 1
		},
		animationPresetId: 'bounce-in',
		inDurationUs: 550_000,
		outDurationUs: 400_000,
		accentColor: { r: 1, g: 1, b: 1, a: 1 },
		previewColors: {
			background: '#0a0a0f',
			primary: '#ffffff',
			accent: '#ffffff',
			badge: '#ffffff'
		}
	},
	{
		id: 'universal-slanted-box',
		name: 'Universal Slanted Box',
		category: 'kinetic',
		description:
			'Slanted / rotated -8° rectangular outline border enclosing bold uppercase typography',
		tags: ['slanted', 'rotated', 'angle', 'frame', 'kinetic', 'box'],
		defaultText: 'UNIVERSAL',
		primaryLine: 'UNIVERSAL',
		frameStyle: 'frame',
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'center',
			letterSpacing: 3
		},
		box: {
			autoSize: true,
			paddingX: 34,
			paddingY: 16,
			verticalAnchor: 'center',
			frameStyle: 'frame'
		},
		properties: {
			'text.fontSize': 54,
			'text.fillColor': [1, 1, 1, 1],
			'text.boxBorderColor': [1, 1, 1, 1],
			'text.boxBorderWidth': 4,
			'text.letterSpacing': 3,
			'text.lineHeight': 1.1,
			rotation: -8,
			'text.reveal': 1,
			opacity: 1
		},
		animationPresetId: 'split-slide',
		inDurationUs: 450_000,
		outDurationUs: 400_000,
		accentColor: { r: 1, g: 1, b: 1, a: 1 },
		previewColors: {
			background: '#08080b',
			primary: '#ffffff',
			accent: '#ffffff'
		}
	},
	{
		id: 'new-trend-italic-slash',
		name: 'Italic Kinetic Lockup',
		category: 'kinetic',
		description:
			'Dynamic angled upward italic kinetic lockup with alternating outline and solid typography',
		tags: ['italic', 'skew', 'kinetic', 'outline', 'bold', 'speed'],
		defaultText: 'NEW TREND\nTREND NEW',
		primaryLine: 'NEW TREND',
		secondaryLine: 'TREND NEW',
		frameStyle: 'split-slash',
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			fontStyle: 'italic',
			alignment: 'center',
			letterSpacing: 2
		},
		box: {
			autoSize: true,
			paddingX: 32,
			paddingY: 20,
			verticalAnchor: 'center',
			frameStyle: 'split-slash'
		},
		properties: {
			'text.fontSize': 56,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeColor': [1, 1, 1, 0.85],
			'text.strokeWidth': 2,
			'text.letterSpacing': 2,
			'text.lineHeight': 1.15,
			rotation: -12,
			'text.reveal': 1,
			opacity: 1
		},
		animationPresetId: 'kinetic-zoom',
		inDurationUs: 450_000,
		outDurationUs: 400_000,
		accentColor: { r: 1, g: 1, b: 1, a: 1 },
		previewColors: {
			background: '#090a0e',
			primary: '#ffffff',
			accent: '#ffffff'
		}
	},
	{
		id: 'typography-titles-multiline',
		name: 'Framed Multiline Titles',
		category: 'minimal',
		description:
			'Framed rectangular box with top header, horizontal divider line, and multi-tier titles',
		tags: ['multiline', 'divider', 'frame', 'box', 'editorial', 'clean'],
		defaultText: 'NEW TREND\nTYPOGRAPHY\nTITLES',
		primaryLine: 'NEW TREND',
		secondaryLine: 'TYPOGRAPHY',
		tertiaryLine: 'TITLES',
		frameStyle: 'divided-box',
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'left',
			letterSpacing: 2
		},
		box: {
			autoSize: true,
			paddingX: 32,
			paddingY: 22,
			verticalAnchor: 'center',
			frameStyle: 'divided-box'
		},
		properties: {
			'text.fontSize': 46,
			'text.fillColor': [1, 1, 1, 1],
			'text.boxBorderColor': [1, 1, 1, 1],
			'text.boxBorderWidth': 3,
			'text.letterSpacing': 2,
			'text.lineHeight': 1.2,
			'text.reveal': 1,
			opacity: 1
		},
		animationPresetId: 'slide-in-up',
		inDurationUs: 500_000,
		outDurationUs: 400_000,
		accentColor: { r: 1, g: 1, b: 1, a: 1 },
		previewColors: {
			background: '#08080a',
			primary: '#ffffff',
			accent: '#ffffff'
		}
	},
	{
		id: 'dream-big',
		name: 'Dream Big Kinetic',
		category: 'kinetic',
		description: 'Stacked 3-line kinetic typography with electric neon lime punch',
		tags: ['kinetic', 'headline', 'neon', 'modern', 'bold'],
		defaultText: 'DREAM BIG\nAND DARE\nTO FAIL',
		primaryLine: 'DREAM BIG',
		secondaryLine: 'AND DARE',
		tertiaryLine: 'TO FAIL',
		highlightWord: 'TO FAIL',
		accentColor: { r: 0.706, g: 1.0, b: 0.0, a: 1.0 }, // #b4ff00
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'center',
			letterSpacing: 2
		},
		box: {
			autoSize: true,
			verticalAnchor: 'center'
		},
		properties: {
			'text.fontSize': 68,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeWidth': 0,
			'text.letterSpacing': 2,
			'text.lineHeight': 1.05,
			'text.reveal': 1,
			opacity: 1
		},
		animationPresetId: 'slide-in-up',
		inDurationUs: 600_000,
		outDurationUs: 450_000,
		previewColors: {
			background: '#111218',
			primary: '#ffffff',
			accent: '#b4ff00'
		}
	},
	{
		id: 'imagine-real',
		name: 'Imagine Real',
		category: 'kinetic',
		description: 'Header tag, condensed italic neon centerpiece, and clean anchor',
		tags: ['kinetic', 'condensed', 'italic', 'neon', 'impact'],
		defaultText: 'EVERYTHING YOU CAN\nIMAGINE\nIS REAL',
		primaryLine: 'EVERYTHING YOU CAN',
		secondaryLine: 'IMAGINE',
		tertiaryLine: 'IS REAL',
		highlightWord: 'IMAGINE',
		accentColor: { r: 0.706, g: 1.0, b: 0.0, a: 1.0 },
		style: {
			fontFamily: 'Bebas Neue',
			fontWeight: 'bold',
			fontStyle: 'italic',
			alignment: 'center',
			letterSpacing: 3
		},
		box: {
			autoSize: true,
			verticalAnchor: 'center'
		},
		properties: {
			'text.fontSize': 80,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeWidth': 0,
			'text.letterSpacing': 3,
			'text.lineHeight': 1.02,
			opacity: 1
		},
		animationPresetId: 'kinetic-zoom',
		inDurationUs: 450_000,
		outDurationUs: 400_000,
		previewColors: {
			background: '#12131b',
			primary: '#ffffff',
			accent: '#b4ff00'
		}
	},
	{
		id: 'cyber-nights',
		name: 'Cyberpunk Glitch',
		category: 'neon',
		description: 'High-energy cyber aesthetic with neon cyan / magenta edge punch',
		tags: ['neon', 'cyberpunk', 'glitch', 'retro', 'gaming', 'bold'],
		defaultText: 'CYBER\nNIGHTS',
		primaryLine: 'CYBER',
		secondaryLine: 'NIGHTS',
		highlightWord: 'NIGHTS',
		accentColor: { r: 0.0, g: 0.94, b: 1.0, a: 1.0 }, // #00f0ff
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			fontStyle: 'italic',
			alignment: 'center',
			letterSpacing: 4
		},
		box: {
			autoSize: true,
			verticalAnchor: 'center'
		},
		properties: {
			'text.fontSize': 78,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeWidth': 0,
			'text.letterSpacing': 4,
			'text.lineHeight': 1.05,
			'text.shadowColor': [0.0, 0.94, 1.0, 0.85],
			'text.shadowBlur': 20,
			'text.shadowOffsetY': 0,
			opacity: 1
		},
		animationPresetId: 'glitch-snap',
		inDurationUs: 350_000,
		outDurationUs: 350_000,
		previewColors: {
			background: '#0d0b18',
			primary: '#ffffff',
			accent: '#00f0ff',
			badge: '#ff007f'
		}
	},
	{
		id: 'modern-clean',
		name: 'Modern & Clean',
		category: 'minimal',
		description: 'Minimalist editorial lockup with tracked tagline and bold center title',
		tags: ['minimal', 'clean', 'corporate', 'editorial', 'modern'],
		defaultText: 'CREATE WITH PASSION\nTHE FREE VIDEO EDITOR',
		primaryLine: 'CREATE WITH PASSION',
		secondaryLine: 'THE FREE VIDEO EDITOR',
		highlightWord: 'THE FREE VIDEO EDITOR',
		accentColor: { r: 0.22, g: 0.74, b: 0.97, a: 1.0 }, // #38bdf8
		style: {
			fontFamily: 'Montserrat',
			fontWeight: 'bold',
			alignment: 'center',
			letterSpacing: 3
		},
		box: {
			autoSize: true,
			verticalAnchor: 'center'
		},
		properties: {
			'text.fontSize': 48,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeWidth': 0,
			'text.letterSpacing': 3,
			'text.lineHeight': 1.3,
			opacity: 1
		},
		animationPresetId: 'smooth-drift',
		inDurationUs: 800_000,
		outDurationUs: 500_000,
		previewColors: {
			background: '#0f141c',
			primary: '#ffffff',
			accent: '#38bdf8'
		}
	},
	{
		id: 'ae-motion-title',
		name: 'AE Motion Title',
		category: 'social',
		description: 'Dynamic YouTuber/Creator title badge with punchy entrance and modern typography',
		tags: ['social', 'youtube', 'creator', 'motion', 'aftereffects', 'impact'],
		defaultText: 'EPISODE 01\nMOTION GRAPHICS MASTERCLASS',
		primaryLine: 'EPISODE 01',
		secondaryLine: 'MOTION GRAPHICS MASTERCLASS',
		highlightWord: 'EPISODE 01',
		accentColor: { r: 1.0, g: 0.35, b: 0.2, a: 1.0 },
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'center',
			letterSpacing: 2
		},
		box: {
			autoSize: true,
			verticalAnchor: 'center'
		},
		properties: {
			'text.fontSize': 52,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeWidth': 0,
			'text.letterSpacing': 2,
			'text.lineHeight': 1.15,
			opacity: 1
		},
		animationPresetId: 'split-slide',
		inDurationUs: 500_000,
		outDurationUs: 400_000,
		previewColors: {
			background: '#140f0f',
			primary: '#ffffff',
			accent: '#ff5a33',
			badge: '#2d1410'
		}
	}
];
export function getGraphicTemplate(id: string): GraphicTemplate | undefined {
	return GRAPHIC_TEMPLATES.find((t) => t.id === id);
}

/**
 * Computes TextColorRun[] so that designated highlight words or lines
 * automatically receive the template's accent color in the canvas rasterizer!
 */
export function computeColorRuns(
	text: string,
	template: GraphicTemplate,
	accentColor: { r: number; g: number; b: number; a: number } = template.accentColor
): TextColorRun[] {
	if (!template.highlightWord || !text) return [];

	const target = template.highlightWord.toLowerCase();
	const lower = text.toLowerCase();
	const index = lower.indexOf(target);

	if (index === -1) {
		// If exact phrase not found, highlight secondary line if present
		if (template.secondaryLine) {
			const secIdx = lower.indexOf(template.secondaryLine.toLowerCase());
			if (secIdx !== -1) {
				return [
					{
						startIndex: secIdx,
						endIndex: secIdx + template.secondaryLine.length,
						fillColor: accentColor
					}
				];
			}
		}

		// Fallback for custom text: if multi-line text, highlight the accent / secondary line
		const lines = text.split('\n');
		if (lines.length > 1) {
			const targetLineIdx = lines.length === 2 ? 1 : 1;
			let charCount = 0;
			for (let i = 0; i < targetLineIdx; i++) {
				charCount += lines[i]!.length + 1; // +1 for \n
			}
			const lineLen = lines[targetLineIdx]!.length;
			if (lineLen > 0) {
				return [
					{
						startIndex: charCount,
						endIndex: charCount + lineLen,
						fillColor: accentColor
					}
				];
			}
		}

		return [];
	}

	return [
		{
			startIndex: index,
			endIndex: index + template.highlightWord.length,
			fillColor: accentColor
		}
	];
}

function randomId(): string {
	const cryptoApi = typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto;
	if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
	const bytes = new Uint8Array(16);
	if (cryptoApi) {
		cryptoApi.getRandomValues(bytes);
	} else {
		for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
	}
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Builds a complete animated graphic clip ready for insertion on the timeline.
 */
export function createGraphicClip(
	templateId: string,
	start: Time,
	duration: Time = 5_000_000,
	customText?: string
): Clip {
	const template = getGraphicTemplate(templateId) ?? GRAPHIC_TEMPLATES[0]!;
	const text = customText ?? template.defaultText;
	const colorRuns = computeColorRuns(text, template);

	const clipId = randomId() as Clip['id'];
	const properties: Record<PropertyId, AnimatedValue<unknown>> = {};

	// Base static template properties
	for (const [propId, val] of Object.entries(template.properties)) {
		properties[propId] = { value: val };
	}

	let clip: Clip = {
		id: clipId,
		start,
		duration,
		sourceIn: 0,
		sourceOut: duration,
		speed: 1,
		volume: 0,
		source: {
			type: 'text',
			text,
			style: { ...template.style },
			box: {
				...template.box,
				frameStyle: template.frameStyle,
				badgeText: template.secondaryLine
			},
			colorRuns,
			graphicTemplateId: template.id,
			animationPresetId: template.animationPresetId
		},
		properties,
		effects: []
	};

	// Apply In animation preset
	const animPreset = GRAPHIC_ANIMATION_PRESETS.find((a) => a.id === template.animationPresetId);
	if (animPreset) {
		clip = applyAnimationPresetToClip(clip, animPreset, 0);
	}

	// Apply Out fade out animation if clip duration allows
	if (duration >= 2_000_000) {
		const outPreset = GRAPHIC_ANIMATION_PRESETS.find((a) => a.id === 'fade-out');
		if (outPreset) {
			const outStart = Math.max(0, duration - outPreset.duration);
			clip = applyAnimationPresetToClip(clip, outPreset, outStart);
		}
	}

	return clip;
}

/**
 * Applies a GraphicTemplate to an existing text clip on the timeline,
 * keeping existing text if desired or adopting the template text.
 */
export function applyGraphicTemplateToClip(
	clip: Clip,
	templateId: string,
	customText?: string
): Clip {
	const template = getGraphicTemplate(templateId);
	if (!template || clip.source?.type !== 'text') return clip;

	const text = customText !== undefined ? customText : clip.source.text || template.defaultText;
	const colorRuns = computeColorRuns(text, template);

	const properties = { ...(clip.properties ?? {}) };
	for (const [propId, val] of Object.entries(template.properties)) {
		properties[propId] = { value: val };
	}

	let updated: Clip = {
		...clip,
		source: {
			...clip.source,
			text,
			style: { ...template.style },
			box: {
				...(clip.source.box ?? {}),
				...template.box,
				frameStyle: template.frameStyle,
				badgeText: template.secondaryLine
			},
			colorRuns,
			graphicTemplateId: template.id,
			animationPresetId: template.animationPresetId
		},
		properties
	};

	// Apply in-animation
	const animPreset = GRAPHIC_ANIMATION_PRESETS.find((a) => a.id === template.animationPresetId);
	if (animPreset) {
		updated = applyAnimationPresetToClip(updated, animPreset, 0);
	}

	return updated;
}

/**
 * Applies animation preset keyframes offset by baseTime.
 */
export function applyAnimationPresetToClip(
	clip: Clip,
	preset: TextAnimationPreset,
	baseTime: number = 0
): Clip {
	const properties = { ...(clip.properties ?? {}) };

	for (const [propId, keyframes] of Object.entries(preset.keyframes)) {
		const offsetKeyframes = keyframes.map((kf) => ({
			...kf,
			time: baseTime + kf.time
		}));

		const existing = properties[propId];
		let survivingKeyframes: Keyframe<unknown>[] = [];
		if (existing && 'keyframes' in existing && Array.isArray(existing.keyframes)) {
			const presetStart = baseTime;
			const presetEnd = baseTime + preset.duration;
			survivingKeyframes = (existing.keyframes as Keyframe<unknown>[]).filter(
				(k) => k.time < presetStart || k.time > presetEnd
			);
		}

		const mergedKeyframes = [...survivingKeyframes, ...offsetKeyframes].sort(
			(a, b) => a.time - b.time
		);

		properties[propId] = {
			keyframes: mergedKeyframes as unknown as Keyframe<number | number[]>[]
		};
	}

	return {
		...clip,
		properties
	};
}
