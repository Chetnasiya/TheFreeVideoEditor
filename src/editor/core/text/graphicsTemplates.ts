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
		id: 'live-love',
		name: 'Live What You Love',
		category: 'minimal',
		description: 'High-contrast bold headline with vibrant lime subtitle highlight',
		tags: ['minimal', 'quote', 'clean', 'bold'],
		defaultText: 'LIVE WHAT\nYOU LOVE',
		primaryLine: 'LIVE WHAT',
		secondaryLine: 'YOU LOVE',
		highlightWord: 'YOU LOVE',
		accentColor: { r: 0.706, g: 1.0, b: 0.0, a: 1.0 },
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'center',
			letterSpacing: 1
		},
		box: {
			autoSize: true,
			verticalAnchor: 'center'
		},
		properties: {
			'text.fontSize': 74,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeWidth': 0,
			'text.letterSpacing': 1,
			'text.lineHeight': 1.05,
			'text.shadowColor': [0, 0, 0, 0.75],
			'text.shadowBlur': 8,
			'text.shadowOffsetY': 4,
			opacity: 1
		},
		animationPresetId: 'pop-in',
		inDurationUs: 500_000,
		outDurationUs: 400_000,
		previewColors: {
			background: '#13141a',
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
		id: 'modern-clean',
		name: 'Modern & Clean',
		category: 'minimal',
		description: 'Two-tone split bold title with giant electric neon ampersand',
		tags: ['minimal', 'split', 'modern', 'clean', 'social'],
		defaultText: 'MODERN &\nCLEAN',
		primaryLine: 'MODERN &',
		secondaryLine: 'CLEAN',
		highlightWord: '&',
		accentColor: { r: 0.706, g: 1.0, b: 0.0, a: 1.0 },
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
			'text.fontSize': 78,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeWidth': 0,
			'text.letterSpacing': 2,
			'text.lineHeight': 1.05,
			opacity: 1
		},
		animationPresetId: 'split-slide',
		inDurationUs: 500_000,
		outDurationUs: 400_000,
		previewColors: {
			background: '#101117',
			primary: '#ffffff',
			accent: '#b4ff00'
		}
	},
	{
		id: 'work-hard',
		name: 'Work Hard Dream Big',
		category: 'kinetic',
		description: 'Stacked left tag and massive impact headline title',
		tags: ['kinetic', 'tag', 'stacked', 'bold'],
		defaultText: 'WORK HARD\nDREAM BIG',
		primaryLine: 'WORK HARD',
		secondaryLine: 'DREAM BIG',
		highlightWord: 'WORK HARD',
		accentColor: { r: 0.706, g: 1.0, b: 0.0, a: 1.0 },
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
			'text.fontSize': 72,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeWidth': 0,
			'text.letterSpacing': 2,
			'text.lineHeight': 1.08,
			opacity: 1
		},
		animationPresetId: 'slide-in-left',
		inDurationUs: 600_000,
		outDurationUs: 400_000,
		previewColors: {
			background: '#121218',
			primary: '#ffffff',
			accent: '#b4ff00'
		}
	},
	{
		id: 'minimal-track',
		name: 'Modern Minimal Track',
		category: 'minimal',
		description: 'Ultra-wide letter spaced clean editorial title',
		tags: ['minimal', 'spaced', 'clean', 'editorial'],
		defaultText: 'MODERN\nCLEAN',
		primaryLine: 'MODERN',
		secondaryLine: 'CLEAN',
		accentColor: { r: 0.9, g: 0.9, b: 0.95, a: 1.0 },
		style: {
			fontFamily: 'Inter',
			fontWeight: '700',
			alignment: 'center',
			letterSpacing: 8
		},
		box: {
			autoSize: true,
			verticalAnchor: 'center'
		},
		properties: {
			'text.fontSize': 56,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeWidth': 0,
			'text.letterSpacing': 8,
			'text.lineHeight': 1.25,
			opacity: 1
		},
		animationPresetId: 'smooth-drift',
		inDurationUs: 750_000,
		outDurationUs: 500_000,
		previewColors: {
			background: '#0d0d12',
			primary: '#ffffff',
			accent: '#a0aab8'
		}
	},
	{
		id: 'creative-motion',
		name: 'Creative Script Mix',
		category: 'social',
		description: 'Bold display block paired with cursive neon green script subtitle',
		tags: ['social', 'script', 'creative', 'display', 'playful'],
		defaultText: 'CREATIVE\nanimation',
		primaryLine: 'CREATIVE',
		secondaryLine: 'animation',
		highlightWord: 'animation',
		accentColor: { r: 0.706, g: 1.0, b: 0.0, a: 1.0 },
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
			'text.lineHeight': 1.15,
			opacity: 1
		},
		animationPresetId: 'bounce-in',
		inDurationUs: 600_000,
		outDurationUs: 400_000,
		previewColors: {
			background: '#13131c',
			primary: '#ffffff',
			accent: '#b4ff00'
		}
	},
	{
		id: 'keep-balance',
		name: 'Keep Your Balance',
		category: 'badge',
		description: 'Vertical tag prefix with high-impact neon condensed title',
		tags: ['badge', 'condensed', 'headline', 'neon', 'urban'],
		defaultText: 'TO KEEP\nYOUR BALANCE',
		primaryLine: 'TO KEEP',
		secondaryLine: 'YOUR BALANCE',
		highlightWord: 'YOUR BALANCE',
		accentColor: { r: 0.706, g: 1.0, b: 0.0, a: 1.0 },
		style: {
			fontFamily: 'Bebas Neue',
			fontWeight: 'bold',
			alignment: 'center',
			letterSpacing: 3
		},
		box: {
			autoSize: true,
			verticalAnchor: 'center'
		},
		properties: {
			'text.fontSize': 84,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeWidth': 0,
			'text.letterSpacing': 3,
			'text.lineHeight': 1.04,
			opacity: 1
		},
		animationPresetId: 'slide-in-up',
		inDurationUs: 550_000,
		outDurationUs: 400_000,
		previewColors: {
			background: '#11131a',
			primary: '#ffffff',
			accent: '#b4ff00'
		}
	},
	{
		id: 'ae-motion-title',
		name: 'After Effects Neon Title',
		category: 'neon',
		description: 'Cyberpunk motion title with electric cyan glowing centerpiece',
		tags: ['neon', 'cyber', 'cyberpunk', 'glow', 'tech'],
		defaultText: 'AFTER EFFECTS\nTEXT\nANIMATION',
		primaryLine: 'AFTER EFFECTS',
		secondaryLine: 'TEXT',
		tertiaryLine: 'ANIMATION',
		highlightWord: 'TEXT',
		accentColor: { r: 0.0, g: 0.96, b: 0.83, a: 1.0 }, // #00f5d4 electric teal
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'center',
			letterSpacing: 3
		},
		box: {
			autoSize: true,
			verticalAnchor: 'center'
		},
		properties: {
			'text.fontSize': 66,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeWidth': 0,
			'text.letterSpacing': 3,
			'text.lineHeight': 1.1,
			'text.shadowColor': [0.0, 0.96, 0.83, 0.65],
			'text.shadowBlur': 12,
			opacity: 1
		},
		animationPresetId: 'glitch-snap',
		inDurationUs: 400_000,
		outDurationUs: 350_000,
		previewColors: {
			background: '#0d1217',
			primary: '#ffffff',
			accent: '#00f5d4'
		}
	},
	{
		id: 'minimal-badge',
		name: 'Minimal Design Badge',
		category: 'badge',
		description: 'Clean headline paired with dark framed badge pill container',
		tags: ['badge', 'boxed', 'clean', 'minimal', 'lower-third'],
		defaultText: 'MINIMAL DESIGN\nNEWEST TITLES',
		primaryLine: 'MINIMAL DESIGN',
		secondaryLine: 'NEWEST TITLES',
		highlightWord: 'NEWEST TITLES',
		accentColor: { r: 0.0, g: 0.96, b: 0.83, a: 1.0 },
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '800',
			alignment: 'center',
			letterSpacing: 2
		},
		box: {
			autoSize: false,
			width: 780,
			verticalAnchor: 'center',
			paddingX: 24,
			paddingY: 18
		},
		properties: {
			'text.fontSize': 54,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeColor': [0.0, 0.96, 0.83, 0.9],
			'text.strokeWidth': 2,
			'text.letterSpacing': 2,
			'text.lineHeight': 1.25,
			'text.backgroundBoxColor': [0.05, 0.07, 0.1, 0.85],
			'text.backgroundBoxRadius': 8,
			'text.backgroundBoxPadding': 16,
			opacity: 1
		},
		animationPresetId: 'slide-in-up',
		inDurationUs: 550_000,
		outDurationUs: 450_000,
		previewColors: {
			background: '#0b1016',
			primary: '#ffffff',
			accent: '#00f5d4',
			badge: '#15222e'
		}
	},
	{
		id: 'music-play',
		name: 'Music Play Header',
		category: 'social',
		description: 'Emerald cyan headline with silver metallic subtitle and divider line',
		tags: ['social', 'music', 'gradient', 'banner', 'play'],
		defaultText: 'MUSIC\nPLAY',
		primaryLine: 'MUSIC',
		secondaryLine: 'PLAY',
		highlightWord: 'MUSIC',
		accentColor: { r: 0.0, g: 0.96, b: 0.83, a: 1.0 },
		style: {
			fontFamily: 'Montserrat',
			fontWeight: '900',
			alignment: 'center',
			letterSpacing: 4
		},
		box: {
			autoSize: true,
			verticalAnchor: 'center'
		},
		properties: {
			'text.fontSize': 76,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeWidth': 0,
			'text.letterSpacing': 4,
			'text.lineHeight': 1.08,
			'text.shadowColor': [0.0, 0.96, 0.83, 0.5],
			'text.shadowBlur': 10,
			opacity: 1
		},
		animationPresetId: 'kinetic-zoom',
		inDurationUs: 450_000,
		outDurationUs: 400_000,
		previewColors: {
			background: '#0c1318',
			primary: '#ffffff',
			accent: '#00f5d4'
		}
	},
	{
		id: 'remember-this',
		name: 'Remember This 3D Outline',
		category: 'kinetic',
		description: 'Curved top tag, hollow stroked outline middle, and solid block base',
		tags: ['kinetic', 'outline', 'stroke', '3d', 'urban'],
		defaultText: 'MOVEMENT LIFE\nREMEMBER\nTHIS',
		primaryLine: 'MOVEMENT LIFE',
		secondaryLine: 'REMEMBER',
		tertiaryLine: 'THIS',
		highlightWord: 'REMEMBER',
		accentColor: { r: 0.0, g: 0.96, b: 0.83, a: 1.0 },
		style: {
			fontFamily: 'Bebas Neue',
			fontWeight: 'bold',
			alignment: 'center',
			letterSpacing: 3
		},
		box: {
			autoSize: true,
			verticalAnchor: 'center'
		},
		properties: {
			'text.fontSize': 88,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeColor': [0.0, 0.96, 0.83, 1],
			'text.strokeWidth': 4,
			'text.letterSpacing': 3,
			'text.lineHeight': 1.02,
			opacity: 1
		},
		animationPresetId: 'bounce-in',
		inDurationUs: 600_000,
		outDurationUs: 450_000,
		previewColors: {
			background: '#0e141a',
			primary: '#ffffff',
			accent: '#00f5d4'
		}
	},
	{
		id: 'wake-shine',
		name: 'Wake Up & Shine',
		category: 'social',
		description: 'Staggered dual-tone bold kinetic title with emerald green accent',
		tags: ['social', 'punchy', 'bold', 'staggered', 'hook'],
		defaultText: 'WAKE UP &\nSHINE',
		primaryLine: 'WAKE UP &',
		secondaryLine: 'SHINE',
		highlightWord: 'SHINE',
		accentColor: { r: 0.0, g: 0.96, b: 0.83, a: 1.0 },
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
			'text.fontSize': 78,
			'text.fillColor': [1, 1, 1, 1],
			'text.strokeWidth': 0,
			'text.letterSpacing': 2,
			'text.lineHeight': 1.05,
			opacity: 1
		},
		animationPresetId: 'pop-in',
		inDurationUs: 500_000,
		outDurationUs: 400_000,
		previewColors: {
			background: '#10141a',
			primary: '#ffffff',
			accent: '#00f5d4'
		}
	},
	{
		id: 'cyber-nights',
		name: 'Cyber Nights Neon Glow',
		category: 'neon',
		description: 'Cyberpunk neon glow with dark outer shadow and electric cyan core',
		tags: ['neon', 'cyberpunk', 'glow', 'night', 'futuristic'],
		defaultText: 'CYBER NIGHTS\n2088 EDITION',
		primaryLine: 'CYBER NIGHTS',
		secondaryLine: '2088 EDITION',
		highlightWord: 'CYBER NIGHTS',
		accentColor: { r: 0.2, g: 0.95, b: 1.0, a: 1.0 }, // #33f3ff
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
			'text.fontSize': 70,
			'text.fillColor': [0.2, 0.95, 1.0, 1.0],
			'text.strokeColor': [0.0, 0.4, 0.9, 0.8],
			'text.strokeWidth': 3,
			'text.letterSpacing': 4,
			'text.lineHeight': 1.1,
			'text.shadowColor': [0.1, 0.8, 1.0, 0.8],
			'text.shadowBlur': 16,
			opacity: 1
		},
		animationPresetId: 'glitch-snap',
		inDurationUs: 400_000,
		outDurationUs: 350_000,
		previewColors: {
			background: '#0a0d16',
			primary: '#33f3ff',
			accent: '#0066ff'
		}
	},
	{
		id: 'breaking-headline',
		name: 'Breaking News Badge',
		category: 'badge',
		description: 'Urgent high-impact yellow headline with dark pill background',
		tags: ['badge', 'news', 'urgent', 'headline', 'pill'],
		defaultText: 'BREAKING NEWS\nLive Update',
		primaryLine: 'BREAKING NEWS',
		secondaryLine: 'Live Update',
		highlightWord: 'BREAKING NEWS',
		accentColor: { r: 1.0, g: 0.88, b: 0.1, a: 1.0 }, // bright yellow
		style: {
			fontFamily: 'Bebas Neue',
			fontWeight: 'bold',
			alignment: 'center',
			letterSpacing: 3
		},
		box: {
			autoSize: false,
			width: 820,
			verticalAnchor: 'center',
			paddingX: 28,
			paddingY: 18
		},
		properties: {
			'text.fontSize': 78,
			'text.fillColor': [1.0, 0.88, 0.1, 1.0],
			'text.strokeColor': [0, 0, 0, 1],
			'text.strokeWidth': 4,
			'text.letterSpacing': 3,
			'text.lineHeight': 1.1,
			'text.backgroundBoxColor': [0.08, 0.08, 0.1, 0.9],
			'text.backgroundBoxRadius': 12,
			'text.backgroundBoxPadding': 18,
			opacity: 1
		},
		animationPresetId: 'slide-in-down',
		inDurationUs: 550_000,
		outDurationUs: 400_000,
		previewColors: {
			background: '#151515',
			primary: '#ffdf1a',
			accent: '#ff4444',
			badge: '#222222'
		}
	},
	{
		id: 'typewriter-tech',
		name: 'Typewriter Terminal',
		category: 'social',
		description: 'Monospaced documentary / coding subtitle with character typewriter reveal',
		tags: ['typewriter', 'terminal', 'coding', 'minimal', 'mono'],
		defaultText: 'SYSTEM ONLINE\n> Initiating kinetic sequence...',
		primaryLine: 'SYSTEM ONLINE',
		secondaryLine: '> Initiating kinetic sequence...',
		highlightWord: 'SYSTEM ONLINE',
		accentColor: { r: 0.3, g: 1.0, b: 0.4, a: 1.0 }, // terminal green
		style: {
			fontFamily: 'Roboto Mono',
			fontWeight: 'normal',
			alignment: 'left',
			letterSpacing: 0
		},
		box: {
			autoSize: false,
			width: 760,
			verticalAnchor: 'center',
			paddingX: 24,
			paddingY: 16
		},
		properties: {
			'text.fontSize': 34,
			'text.fillColor': [0.3, 1.0, 0.4, 1.0],
			'text.strokeWidth': 0,
			'text.lineHeight': 1.4,
			'text.backgroundBoxColor': [0.06, 0.08, 0.06, 0.8],
			'text.backgroundBoxRadius': 6,
			'text.backgroundBoxPadding': 14,
			opacity: 1
		},
		animationPresetId: 'typewriter',
		inDurationUs: 1_200_000,
		outDurationUs: 400_000,
		previewColors: {
			background: '#090e09',
			primary: '#4ef564',
			accent: '#267a33',
			badge: '#111a11'
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
			box: { ...template.box },
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
			box: { ...template.box },
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
