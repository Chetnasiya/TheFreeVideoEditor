import type { Keyframe } from '../types';

export type PresetName = 'fade-in' | 'fade-out' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'pop-in' | 'pop-out' | 'typewriter-in' | 'typewriter-out';

export type TemplateName = 'title' | 'subtitle' | 'lower-third' | 'outline' | 'neon-glow' | 'typewriter-caption' | 'pop-caption';

/**
 * Animation preset generators for text clips.
 * Each preset returns keyframes for specific properties it owns.
 * Applying a preset replaces keyframes only on those properties; other animations remain unchanged.
 */

export function generatePresetKeyframes(
	preset: PresetName,
	durationUs: number,
	inDurationUs: number = 500_000,
	outDurationUs: number = 500_000
): Record<string, Keyframe<any>[]> {
	switch (preset) {
		case 'fade-in':
			return {
				'opacity': [
					{ time: 0, value: 0, interpolation: 'linear' },
					{ time: inDurationUs, value: 1, interpolation: 'linear' }
				]
			};

		case 'fade-out':
			return {
				'opacity': [
					{ time: durationUs - outDurationUs, value: 1, interpolation: 'linear' },
					{ time: durationUs, value: 0, interpolation: 'linear' }
				]
			};

		case 'slide-up':
			return {
				'opacity': [
					{ time: 0, value: 0, interpolation: 'linear' },
					{ time: inDurationUs, value: 1, interpolation: 'linear' }
				],
				'position.y': [
					{ time: 0, value: 50, interpolation: 'linear' },
					{ time: inDurationUs, value: 0, interpolation: 'linear' }
				]
			};

		case 'slide-down':
			return {
				'opacity': [
					{ time: 0, value: 0, interpolation: 'linear' },
					{ time: inDurationUs, value: 1, interpolation: 'linear' }
				],
				'position.y': [
					{ time: 0, value: -50, interpolation: 'linear' },
					{ time: inDurationUs, value: 0, interpolation: 'linear' }
				]
			};

		case 'slide-left':
			return {
				'opacity': [
					{ time: 0, value: 0, interpolation: 'linear' },
					{ time: inDurationUs, value: 1, interpolation: 'linear' }
				],
				'position.x': [
					{ time: 0, value: 50, interpolation: 'linear' },
					{ time: inDurationUs, value: 0, interpolation: 'linear' }
				]
			};

		case 'slide-right':
			return {
				'opacity': [
					{ time: 0, value: 0, interpolation: 'linear' },
					{ time: inDurationUs, value: 1, interpolation: 'linear' }
				],
				'position.x': [
					{ time: 0, value: -50, interpolation: 'linear' },
					{ time: inDurationUs, value: 0, interpolation: 'linear' }
				]
			};

		case 'pop-in':
			return {
				'scale': [
					{ time: 0, value: 0.6, interpolation: 'bezier', easeOut: { x: 0.25, y: 0.46 }, easeIn: { x: 0.3, y: 1 } },
					{ time: inDurationUs * 0.7, value: 1.05, interpolation: 'bezier', easeOut: { x: 0.25, y: 0.46 }, easeIn: { x: 0.3, y: 1 } },
					{ time: inDurationUs, value: 1, interpolation: 'linear' }
				],
				'opacity': [
					{ time: 0, value: 0, interpolation: 'linear' },
					{ time: inDurationUs, value: 1, interpolation: 'linear' }
				]
			};

		case 'pop-out':
			return {
				'scale': [
					{ time: durationUs - outDurationUs, value: 1, interpolation: 'bezier', easeOut: { x: 0.25, y: 0.46 }, easeIn: { x: 0.3, y: 1 } },
					{ time: durationUs, value: 0.6, interpolation: 'linear' }
				],
				'opacity': [
					{ time: durationUs - outDurationUs, value: 1, interpolation: 'linear' },
					{ time: durationUs, value: 0, interpolation: 'linear' }
				]
			};

		case 'typewriter-in':
			return {
				'text.reveal': [
					{ time: 0, value: 0, interpolation: 'linear' },
					{ time: inDurationUs, value: 1, interpolation: 'linear' }
				]
			};

		case 'typewriter-out':
			return {
				'text.reveal': [
					{ time: durationUs - outDurationUs, value: 1, interpolation: 'linear' },
					{ time: durationUs, value: 0, interpolation: 'linear' }
				]
			};

		default:
			return {};
	}
}

export interface TemplateConfig {
	style: {
		fontFamily: string;
		fontWeight?: string;
		fontSize?: number;
		alignment?: 'left' | 'center' | 'right';
		lineHeight?: number;
	};
	box?: {
		width?: number;
		autoSize?: boolean;
	};
	defaultText: string;
	keyframes?: Record<string, Keyframe<any>[]>;
}

/**
 * Template presets combine static style and optional animation keyframes.
 * Used when creating new text clips from templates.
 */
export const templates: Record<TemplateName, TemplateConfig> = {
	'title': {
		style: {
			fontFamily: 'Oswald, sans-serif',
			fontWeight: 'bold',
			fontSize: 72,
			alignment: 'center',
			lineHeight: 1.2
		},
		box: { autoSize: true },
		defaultText: 'Title Text',
		keyframes: generatePresetKeyframes('fade-in', 5_000_000, 500_000, 500_000)
	},

	'subtitle': {
		style: {
			fontFamily: 'Inter, sans-serif',
			fontWeight: 'normal',
			fontSize: 48,
			alignment: 'center',
			lineHeight: 1.4
		},
		box: { autoSize: true },
		defaultText: 'Subtitle Text',
		keyframes: generatePresetKeyframes('fade-in', 5_000_000, 400_000, 400_000)
	},

	'lower-third': {
		style: {
			fontFamily: 'Inter, sans-serif',
			fontWeight: 'bold',
			fontSize: 32,
			alignment: 'left'
		},
		box: { width: 600 },
		defaultText: 'Lower Third',
		keyframes: generatePresetKeyframes('slide-left', 5_000_000, 300_000, 300_000)
	},

	'outline': {
		style: {
			fontFamily: 'Bebas Neue, sans-serif',
			fontWeight: 'bold',
			fontSize: 64,
			alignment: 'center'
		},
		box: { autoSize: true },
		defaultText: 'Outlined Text',
		keyframes: generatePresetKeyframes('fade-in', 5_000_000, 500_000, 500_000)
	},

	'neon-glow': {
		style: {
			fontFamily: 'Oswald, sans-serif',
			fontWeight: 'bold',
			fontSize: 56,
			alignment: 'center'
		},
		box: { autoSize: true },
		defaultText: 'Neon Glow',
		keyframes: generatePresetKeyframes('fade-in', 5_000_000, 500_000, 500_000)
	},

	'typewriter-caption': {
		style: {
			fontFamily: 'Roboto Mono, monospace',
			fontWeight: 'normal',
			fontSize: 24,
			alignment: 'left',
			lineHeight: 1.6
		},
		box: { width: 800 },
		defaultText: 'Type in your caption here...',
		keyframes: generatePresetKeyframes('typewriter-in', 5_000_000, 3_000_000)
	},

	'pop-caption': {
		style: {
			fontFamily: 'Caveat, cursive',
			fontWeight: 'normal',
			fontSize: 48,
			alignment: 'center'
		},
		box: { autoSize: true },
		defaultText: 'Pop!',
		keyframes: generatePresetKeyframes('pop-in', 5_000_000, 400_000)
	}
};
