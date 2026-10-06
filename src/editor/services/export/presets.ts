import type { Project } from '../../core';
import type { ExportSettings } from './plan';

export type ResolutionPreset = 'project' | '1080p' | '720p' | '480p';
export type ExportQuality = 'low' | 'medium' | 'high';

const HEIGHTS: Record<Exclude<ResolutionPreset, 'project'>, number> = {
	'1080p': 1080,
	'720p': 720,
	'480p': 480
};

const QUALITY_MULTIPLIER: Record<ExportQuality, number> = {
	low: 0.55,
	medium: 1,
	high: 1.6
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
	if (format === 'mp4') {
		width -= width % 2;
		height -= height % 2;
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
	}
): ExportSettings {
	const { width, height } = dimensionsForPreset(project, options.preset, options.format);
	return {
		format: options.format,
		width,
		height,
		fps: project.settings.fps,
		videoBitrate: bitrateFor(width, height, project.settings.fps, options.quality),
		audio: options.audio,
		audioBitrate: 192_000,
		filename: sanitizeFilename(options.filename, options.format),
		range: 'timeline'
	};
}
