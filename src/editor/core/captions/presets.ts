import type { CaptionStyle } from '../types';

export interface CaptionPresetDefinition {
	id: string;
	name: string;
	description: string;
	style: CaptionStyle;
}

export const CAPTION_PRESETS: Record<string, CaptionPresetDefinition> = {
	classic: {
		id: 'classic',
		name: 'Classic Box',
		description: 'Clean subtitle with semi-transparent dark background box',
		style: {
			fontFamily: 'Inter, system-ui, sans-serif',
			fontSize: 36,
			fontWeight: '600',
			fontStyle: 'normal',
			color: { r: 1, g: 1, b: 1, a: 1 },
			backgroundColor: { r: 0, g: 0, b: 0, a: 0.75 },
			strokeWidth: 0,
			positionPreset: 'bottom',
			alignment: 'center',
			marginPercent: 7,
			maxLines: 2,
			maxCharsPerLine: 42,
			highlightMode: 'none'
		}
	},
	outline: {
		id: 'outline',
		name: 'Bold Outline',
		description: 'High-contrast text with bold black stroke and drop shadow',
		style: {
			fontFamily: 'Inter, system-ui, sans-serif',
			fontSize: 38,
			fontWeight: '700',
			fontStyle: 'normal',
			color: { r: 1, g: 1, b: 1, a: 1 },
			strokeColor: { r: 0, g: 0, b: 0, a: 1 },
			strokeWidth: 4,
			shadowColor: { r: 0, g: 0, b: 0, a: 0.8 },
			shadowBlur: 4,
			shadowOffsetY: 2,
			positionPreset: 'bottom',
			alignment: 'center',
			marginPercent: 7,
			maxLines: 2,
			maxCharsPerLine: 40,
			highlightMode: 'none'
		}
	},
	social: {
		id: 'social',
		name: 'Social Pop',
		description: 'Punchy center captions with bold outline and word-level karaoke highlight',
		style: {
			fontFamily: 'Inter, system-ui, sans-serif',
			fontSize: 44,
			fontWeight: '800',
			fontStyle: 'normal',
			color: { r: 1, g: 0.95, b: 0.2, a: 1 },
			strokeColor: { r: 0, g: 0, b: 0, a: 1 },
			strokeWidth: 5,
			shadowColor: { r: 0, g: 0, b: 0, a: 0.9 },
			shadowBlur: 6,
			shadowOffsetY: 3,
			positionPreset: 'center',
			alignment: 'center',
			marginPercent: 12,
			maxLines: 2,
			maxCharsPerLine: 28,
			highlightMode: 'word',
			highlightColor: { r: 0.25, g: 1, b: 0.35, a: 1 }
		}
	},
	minimal: {
		id: 'minimal',
		name: 'Minimal Clean',
		description: 'Subtle, elegant subtitle with soft drop shadow',
		style: {
			fontFamily: 'Inter, system-ui, sans-serif',
			fontSize: 32,
			fontWeight: '500',
			fontStyle: 'normal',
			color: { r: 0.95, g: 0.95, b: 0.95, a: 1 },
			strokeWidth: 0,
			shadowColor: { r: 0, g: 0, b: 0, a: 0.6 },
			shadowBlur: 6,
			shadowOffsetY: 2,
			positionPreset: 'bottom',
			alignment: 'center',
			marginPercent: 6,
			maxLines: 2,
			maxCharsPerLine: 44,
			highlightMode: 'none'
		}
	}
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = CAPTION_PRESETS.classic.style;

export function getCaptionPreset(id: string): CaptionPresetDefinition | undefined {
	return CAPTION_PRESETS[id];
}
