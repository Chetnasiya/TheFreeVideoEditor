import { describe, expect, it } from 'vitest';
import { ACCEPTED_TYPES, assetDefaults, classifyMime, isAcceptedFile } from './media';

describe('media classification', () => {
	it.each([
		['video/mp4', 'clip.mp4', 'video'],
		['audio/wav', 'sound.wav', 'audio'],
		['image/png', 'still.png', 'image'],
		['application/octet-stream', 'movie.MKV', 'video'],
		['', 'animation.gif', 'image']
	] as const)('classifies %s / %s as %s', (mime, filename, kind) => {
		expect(classifyMime(mime, filename)).toBe(kind);
	});

	it('rejects unsupported file types and accepts extensions when MIME is missing', () => {
		expect(isAcceptedFile({ name: 'clip.mov', type: '' })).toBe(true);
		expect(isAcceptedFile({ name: 'document.pdf', type: 'application/pdf' })).toBe(false);
		expect(ACCEPTED_TYPES).toContain('.flac');
	});

	it('assigns still images a five-second default duration', () => {
		expect(assetDefaults('image').duration).toBe(5_000_000);
		expect(assetDefaults('video').duration).toBe(0);
	});
});
