import { secondsToTicks } from './time';
import type { AssetKind, Time } from './types';

export type MediaKind = AssetKind;

const EXTENSION_KIND: Record<string, MediaKind> = {
	mp4: 'video',
	mov: 'video',
	webm: 'video',
	mkv: 'video',
	m4v: 'video',
	mp3: 'audio',
	wav: 'audio',
	aac: 'audio',
	m4a: 'audio',
	ogg: 'audio',
	flac: 'audio',
	png: 'image',
	jpg: 'image',
	jpeg: 'image',
	webp: 'image',
	gif: 'image',
	ttf: 'font',
	otf: 'font',
	woff: 'font',
	woff2: 'font',
	cube: 'lut'
};

export const ACCEPTED_TYPES = [
	'.mp4',
	'.mov',
	'.webm',
	'.mkv',
	'.m4v',
	'.mp3',
	'.wav',
	'.aac',
	'.m4a',
	'.ogg',
	'.flac',
	'.png',
	'.jpg',
	'.jpeg',
	'.webp',
	'.gif',
	'.ttf',
	'.otf',
	'.woff',
	'.woff2',
	'.cube'
] as const;

export function classifyMime(mime: string, filename: string): MediaKind | null {
	const normalizedMime = mime.toLowerCase().split(';', 1)[0]?.trim() ?? '';
	if (normalizedMime.startsWith('video/')) return 'video';
	if (normalizedMime.startsWith('audio/')) return 'audio';
	if (normalizedMime.startsWith('image/')) return 'image';

	const extension = filename.split('.').at(-1)?.toLowerCase();
	return extension ? (EXTENSION_KIND[extension] ?? null) : null;
}

export function isAcceptedFile(file: Pick<File, 'type' | 'name'>): boolean {
	return classifyMime(file.type, file.name) !== null;
}

export function assetDefaults(kind: MediaKind): { duration: Time } {
	return { duration: kind === 'image' ? secondsToTicks(5) : 0 };
}
