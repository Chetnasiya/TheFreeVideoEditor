import type { MotionGraphicTemplate, TemplateCategory } from './templateTypes';
import { convertAllGraphicTemplates } from './templateConverter';
import { getCustomTemplates } from './templateService';

/**
 * Built-in Motion Graphic Templates (.tfvetemplate).
 */
export const BUILTIN_MOTION_TEMPLATES: MotionGraphicTemplate[] = convertAllGraphicTemplates();

const BUILTIN_MAP = new Map<string, MotionGraphicTemplate>();
for (const tpl of BUILTIN_MOTION_TEMPLATES) {
	BUILTIN_MAP.set(tpl.id, tpl);
}

/**
 * Returns a built-in Motion Graphic Template by ID.
 */
export function getBuiltinMotionTemplate(id: string): MotionGraphicTemplate | undefined {
	return BUILTIN_MAP.get(id);
}

/**
 * Resolves a template id against the built-in library, then the user's saved custom templates.
 * Returns undefined for an unknown id so callers never silently substitute a different template.
 */
export function resolveMotionTemplate(id: string): MotionGraphicTemplate | undefined {
	return BUILTIN_MAP.get(id) ?? getCustomTemplates().find((template) => template.id === id);
}

/**
 * Filters built-in templates by category and search query.
 */
export function filterBuiltinTemplates(
	category: string = 'all',
	searchQuery: string = ''
): MotionGraphicTemplate[] {
	const query = searchQuery.toLowerCase().trim();
	const catLower = category.toLowerCase();

	return BUILTIN_MOTION_TEMPLATES.filter((tpl) => {
		if (catLower !== 'all') {
			const tplCat = tpl.category.toLowerCase();
			if (catLower === 'titles' && tplCat !== 'titles') return false;
			if (catLower === 'lower-third' || catLower === 'lower thirds') {
				if (tplCat !== 'lower thirds') return false;
			} else if (catLower === 'badge' || catLower === 'badges') {
				if (tplCat !== 'badges') return false;
			} else if (catLower === 'kinetic' && tplCat !== 'kinetic') return false;
			else if (catLower === 'callouts' && tplCat !== 'callouts') return false;
			else if (catLower === 'social' && tplCat !== 'social') return false;
			else if (tplCat !== catLower) return false;
		}

		if (!query) return true;

		return (
			tpl.name.toLowerCase().includes(query) ||
			(tpl.description && tpl.description.toLowerCase().includes(query)) ||
			tpl.publishedParams.some(
				(p) => typeof p.defaultValue === 'string' && p.defaultValue.toLowerCase().includes(query)
			)
		);
	});
}
