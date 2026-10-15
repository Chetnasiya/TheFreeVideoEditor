import { describe, expect, it } from 'vitest';
import { isYoutubeUrl } from './youtubeDownloader.mjs';

describe('youtubeDownloader', () => {
	describe('isYoutubeUrl', () => {
		it('accepts standard youtube watch URLs', () => {
			expect(isYoutubeUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw')).toBe(true);
			expect(isYoutubeUrl('http://youtube.com/watch?v=jNQXAC9IVRw')).toBe(true);
			expect(isYoutubeUrl('https://m.youtube.com/watch?v=jNQXAC9IVRw')).toBe(true);
		});

		it('accepts short youtube youtu.be URLs', () => {
			expect(isYoutubeUrl('https://youtu.be/jNQXAC9IVRw')).toBe(true);
			expect(isYoutubeUrl('http://youtu.be/jNQXAC9IVRw?t=10')).toBe(true);
		});

		it('accepts youtube shorts and embed URLs', () => {
			expect(isYoutubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(true);
			expect(isYoutubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(true);
			expect(isYoutubeUrl('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe(true);
		});

		it('rejects invalid or non-youtube URLs', () => {
			expect(isYoutubeUrl('')).toBe(false);
			expect(isYoutubeUrl('https://instagram.com/p/C-123456')).toBe(false);
			expect(isYoutubeUrl('https://vimeo.com/123456')).toBe(false);
			expect(isYoutubeUrl('https://google.com')).toBe(false);
			expect(isYoutubeUrl('https://youtube.com/about')).toBe(false);
			expect(isYoutubeUrl('not-a-url')).toBe(false);
		});
	});
});

