import { describe, it, expect } from 'vitest';
import {
	TOOL_GUIDES,
	GUIDE_CATEGORIES,
	extractYoutubeId,
	getGuideById,
	getRelatedGuides
} from './guides';

describe('Tool Guides Registry', () => {
	it('contains at least 18 comprehensive tool guides', () => {
		expect(TOOL_GUIDES.length).toBeGreaterThanOrEqual(18);
	});

	it('ensures all guide IDs (slugs) are unique and url-safe', () => {
		const ids = TOOL_GUIDES.map((g) => g.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);

		for (const id of ids) {
			expect(id).toMatch(/^[a-z0-9-]+$/);
		}
	});

	it('ensures all categories exist in GUIDE_CATEGORIES', () => {
		const validCategories = Object.keys(GUIDE_CATEGORIES);
		for (const guide of TOOL_GUIDES) {
			expect(validCategories).toContain(guide.category);
			expect(guide.categoryLabel).toBe(GUIDE_CATEGORIES[guide.category].label);
		}
	});

	it('ensures all guides have required in-depth documentation content', () => {
		for (const guide of TOOL_GUIDES) {
			expect(guide.title.trim().length).toBeGreaterThan(0);
			expect(guide.subtitle.trim().length).toBeGreaterThan(0);
			expect(guide.overview.trim().length).toBeGreaterThan(50);
			expect(guide.whenToUse.length).toBeGreaterThanOrEqual(3);
			expect(guide.anatomy.length).toBeGreaterThanOrEqual(2);
			expect(guide.steps.length).toBeGreaterThanOrEqual(3);
			expect(guide.quickTips.length).toBeGreaterThanOrEqual(2);
			expect(guide.keyboardShortcuts.length).toBeGreaterThanOrEqual(1);
			expect(guide.faq.length).toBeGreaterThanOrEqual(2);
			expect(guide.readingTimeMinutes).toBeGreaterThan(0);
			expect(typeof guide.youtubeVideoId === 'string' || guide.youtubeVideoId === null).toBe(true);

			// Steps must have sequential step numbers
			guide.steps.forEach((step, idx) => {
				expect(step.stepNumber).toBe(idx + 1);
				expect(step.title.trim().length).toBeGreaterThan(0);
				expect(step.description.trim().length).toBeGreaterThan(0);
			});
		}
	});

	it('resolves related guides correctly', () => {
		for (const guide of TOOL_GUIDES) {
			const related = getRelatedGuides(guide);
			expect(Array.isArray(related)).toBe(true);
			for (const rel of related) {
				expect(rel).toBeDefined();
				expect(rel.id).not.toBe(guide.id);
			}
		}
	});

	it('fetches guide by ID', () => {
		const selection = getGuideById('selection-tool');
		expect(selection).toBeDefined();
		expect(selection?.title).toBe('Selection Tool');
		expect(selection?.shortcut).toBe('V');

		const nonexistent = getGuideById('unknown-tool-xyz');
		expect(nonexistent).toBeUndefined();
	});
});

describe('YouTube ID Extraction Helper', () => {
	it('handles 11-character video IDs directly', () => {
		expect(extractYoutubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
		expect(extractYoutubeId('7wtfhZwyrcc')).toBe('7wtfhZwyrcc');
	});

	it('extracts ID from standard watch URLs', () => {
		expect(extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
		expect(extractYoutubeId('https://youtube.com/watch?v=dQw4w9WgXcQ&t=120s')).toBe('dQw4w9WgXcQ');
	});

	it('extracts ID from short youtu.be URLs', () => {
		expect(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
		expect(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ?t=45')).toBe('dQw4w9WgXcQ');
	});

	it('extracts ID from embed and nocookie URLs', () => {
		expect(extractYoutubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
		expect(extractYoutubeId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
	});

	it('returns null for null, empty, whitespace, or invalid inputs', () => {
		expect(extractYoutubeId(null)).toBeNull();
		expect(extractYoutubeId(undefined)).toBeNull();
		expect(extractYoutubeId('')).toBeNull();
		expect(extractYoutubeId('   ')).toBeNull();
		expect(extractYoutubeId('invalid-string-too-short')).toBeNull();
	});
});

