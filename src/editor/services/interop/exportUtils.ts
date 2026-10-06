import type { Asset, AssetId, Project, Time } from '../../core';
import { frameAtTime } from '../export/plan';
import { sanitizeFilename } from '../export/presets';

export interface InteropOptions {
	mediaPaths?: ReadonlyMap<AssetId, string>;
}

export function mediaPath(project: Project, asset: Asset, options: InteropOptions = {}): string {
	if (!project.assets[asset.id]) throw new Error(`Project asset “${asset.id}” is missing.`);
	return options.mediaPaths?.get(asset.id) ?? `media/${sanitizeFilename(asset.name, '')}`;
}

export function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

export function frames(time: Time, project: Project): number {
	return frameAtTime(time, project.settings.fps);
}

export function framesToTimecode(frame: number, fps: number): string {
	const wholeSeconds = Math.floor(frame / fps);
	const frameNumber = frame - wholeSeconds * fps;
	const hours = Math.floor(wholeSeconds / 3600);
	const minutes = Math.floor((wholeSeconds % 3600) / 60);
	const seconds = wholeSeconds % 60;
	return [hours, minutes, seconds, frameNumber]
		.map((value) => String(value).padStart(2, '0'))
		.join(':');
}

export function trackAsset(project: Project, assetId: AssetId): Asset {
	const asset = project.assets[assetId];
	if (!asset) throw new Error(`Project asset “${assetId}” is missing.`);
	return asset;
}

export function uniqueMediaPaths(project: Project): Map<AssetId, string> {
	const result = new Map<AssetId, string>();
	const used = new Set<string>();
	for (const asset of Object.values(project.assets)) {
		const base = sanitizeFilename(asset.name, '');
		const dot = base.lastIndexOf('.');
		const stem = dot > 0 ? base.slice(0, dot) : base;
		const extension = dot > 0 ? base.slice(dot) : '';
		let candidate = `${stem}${extension}`;
		for (let suffix = 2; used.has(candidate.toLocaleLowerCase()); suffix += 1) {
			candidate = `${stem} (${suffix})${extension}`;
		}
		used.add(candidate.toLocaleLowerCase());
		result.set(asset.id, `media/${candidate}`);
	}
	return result;
}

export function secondsAsRational(framesCount: number, fps: number): string {
	return `${framesCount}/${fps}s`;
}
