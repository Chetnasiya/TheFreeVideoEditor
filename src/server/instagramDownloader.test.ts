import { describe, expect, it, beforeEach } from 'vitest';
import {
	extractShortcode,
	isInstagramUrl,
	getCachedInstagramDetails,
	setCachedInstagramDetails,
	clearInstagramCache
} from './instagramDownloader.mjs';

describe('instagramDownloader', () => {
	beforeEach(() => {
		clearInstagramCache();
	});

	describe('isInstagramUrl', () => {
		it('accepts instagram reels and posts URLs', () => {
			expect(isInstagramUrl('https://www.instagram.com/reel/DOvzTywjPGN/')).toBe(true);
			expect(isInstagramUrl('https://instagram.com/reel/DOvzTywjPGN')).toBe(true);
			expect(isInstagramUrl('https://www.instagram.com/reels/DOvzTywjPGN/')).toBe(true);
			expect(isInstagramUrl('https://www.instagram.com/p/DOvzTywjPGN/')).toBe(true);
			expect(isInstagramUrl('https://www.instagram.com/tv/DOvzTywjPGN/')).toBe(true);
			expect(isInstagramUrl('https://instagr.am/p/DOvzTywjPGN/')).toBe(true);
		});

		it('accepts instagram share links and user profile paths', () => {
			expect(isInstagramUrl('https://www.instagram.com/oxford.mathematics/reel/DOvzTywjPGN/')).toBe(
				true
			);
			expect(isInstagramUrl('https://www.instagram.com/share/reel/DOvzTywjPGN/')).toBe(true);
			expect(isInstagramUrl('https://www.instagram.com/share/p/DOvzTywjPGN/')).toBe(true);
		});

		it('rejects invalid or non-instagram URLs', () => {
			expect(isInstagramUrl('')).toBe(false);
			expect(isInstagramUrl('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
			expect(isInstagramUrl('https://vimeo.com/123456')).toBe(false);
			expect(isInstagramUrl('https://google.com')).toBe(false);
			expect(isInstagramUrl('https://instagram.com/about')).toBe(false);
			expect(isInstagramUrl('not-a-url')).toBe(false);
		});
	});

	describe('extractShortcode', () => {
		it('extracts clean shortcodes from reel, post, and share links', () => {
			expect(extractShortcode('https://www.instagram.com/reel/DOvzTywjPGN/')).toBe('DOvzTywjPGN');
			expect(extractShortcode('https://www.instagram.com/p/DZxvMgyH8yR/?igsh=123')).toBe(
				'DZxvMgyH8yR'
			);
			expect(
				extractShortcode('https://www.instagram.com/natgeo/reel/DOvzTywjPGN?utm_source=ig_web')
			).toBe('DOvzTywjPGN');
			expect(extractShortcode('https://instagr.am/p/DOvzTywjPGN')).toBe('DOvzTywjPGN');
		});

		it('returns null for non-instagram links', () => {
			expect(extractShortcode('')).toBeNull();
			expect(extractShortcode('https://youtube.com')).toBeNull();
			expect(extractShortcode('invalid')).toBeNull();
		});
	});

	describe('mediaDetailsCache', () => {
		it('caches and retrieves details by shortcode', () => {
			const mockDetails = {
				id: 'test_code',
				title: 'Test Reel',
				uploader: 'test_user',
				duration: 15,
				thumbnail: 'https://example.com/thumb.jpg',
				mediaType: 'video',
				videoVersions: [{ url: 'https://example.com/vid.mp4', width: 720, height: 1280 }],
				availableQualities: [1280]
			};

			expect(getCachedInstagramDetails('test_code')).toBeNull();
			setCachedInstagramDetails('test_code', mockDetails);
			expect(getCachedInstagramDetails('test_code')).toEqual(mockDetails);
		});

		it('clears cache on clearInstagramCache', () => {
			setCachedInstagramDetails('abc', { id: 'abc' });
			expect(getCachedInstagramDetails('abc')).not.toBeNull();
			clearInstagramCache();
			expect(getCachedInstagramDetails('abc')).toBeNull();
		});
	});
});
