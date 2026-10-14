import type { Project } from '../../core';
import type { ExportSettings } from './plan';

export type ResolutionPreset = 'project' | '4k' | '1440p' | '1080p' | '720p' | '480p';
export type ExportQuality = 'low' | 'medium' | 'high' | 'pro' | 'custom';

const HEIGHTS: Record<Exclude<ResolutionPreset, 'project'>, number> = {
	'4k': 2160,
	'1440p': 1440,
	'1080p': 1080,
	'720p': 720,
	'480p': 480
};

const QUALITY_MULTIPLIER: Record<ExportQuality, number> = {
	low: 0.55,
	medium: 1,
	high: 1.6,
	pro: 2.8,
	custom: 1
};

export function dimensionsForPreset(
	project: Project,
	preset: ResolutionPreset,
	format: ExportSettings['format']
): { width: number; height: number } {
	let width = project.settings.width;
	let height = project.settings.height;
	if (preset !== 'project') {
		height = HEIGHTS[preset];
		width = Math.max(2, Math.round((height * project.settings.width) / project.settings.height));
	}
	if (format === 'mp4' || format === 'mov') {
		width -= width % 2;
		height -= height % 2;
	} else if (format === 'wav') {
		width = 2;
		height = 2;
	}
	return { width, height };
}

export function bitrateFor(
	width: number,
	height: number,
	fps: number,
	quality: ExportQuality
): number {
	const pixelsPerSecond = width * height * fps;
	const base = Math.round(pixelsPerSecond * 0.085);
	return Math.max(500_000, Math.round(base * QUALITY_MULTIPLIER[quality]));
}

export function sanitizeFilename(name: string, extension: string): string {
	const explicitExtension = extension
		.replace(/^\.+/, '')
		.replace(/[^a-z0-9]/gi, '')
		.toLowerCase();
	const sourceExtension = /\.[^.]+$/.exec(name.trim())?.[0]?.slice(1) ?? '';
	const safeExtension =
		explicitExtension || sourceExtension.replace(/[^a-z0-9]/gi, '').toLowerCase();
	const basename = name
		.trim()
		.replace(/\.[^.]*$/, '')
		.normalize('NFKC')
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
		.replace(/\s+/g, ' ')
		.replace(/[. ]+$/g, '')
		.slice(0, 120);
	return `${basename || 'untitled'}${safeExtension ? `.${safeExtension}` : ''}`;
}

export function settingsForPreset(
	project: Project,
	options: {
		format: ExportSettings['format'];
		preset: ResolutionPreset;
		quality: ExportQuality;
		audio: boolean;
		filename: string;
		codecId?: string;
		audioCodecId?: string;
		colorSpaceTag?: string;
		bitDepth?: number;
		alpha?: boolean;
		customBitrateBps?: number;
	}
): ExportSettings {
	const { width, height } = dimensionsForPreset(project, options.preset, options.format);
	const videoBitrate =
		options.quality === 'custom' && options.customBitrateBps
			? options.customBitrateBps
			: bitrateFor(width, height, project.settings.fps, options.quality);

	return {
		format: options.format,
		codecId: options.codecId,
		width,
		height,
		fps: project.settings.fps,
		videoBitrate,
		audio: options.audio,
		audioBitrate: 192_000,
		audioCodecId: options.audioCodecId,
		colorSpaceTag: options.colorSpaceTag,
		bitDepth: options.bitDepth,
		alpha: options.alpha,
		filename: sanitizeFilename(options.filename, options.format),
		range: 'timeline'
	};
}
