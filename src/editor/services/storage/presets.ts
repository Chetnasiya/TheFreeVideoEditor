import type { EffectInstance } from '../../core/types';
import { openProjectDatabase } from './projectDb';

export interface EffectPreset {
	id: string;
	name: string;
	builtIn: boolean;
	effect: {
		type: string;
		params: Record<string, unknown>;
	};
}

export const BUILT_IN_PRESETS: EffectPreset[] = [
	{
		id: 'preset:warm-cinematic',
		name: 'Warm Cinematic',
		builtIn: true,
		effect: {
			type: 'colorCorrection',
			params: {
				temperature: 0.25,
				contrast: 0.15,
				exposure: 0.1,
				saturation: 0.1,
				mix: 1
			}
		}
	},
	{
		id: 'preset:cool-bleach',
		name: 'Cool Bleach',
		builtIn: true,
		effect: {
			type: 'colorCorrection',
			params: {
				temperature: -0.2,
				contrast: 0.3,
				saturation: -0.35,
				mix: 1
			}
		}
	},
	{
		id: 'preset:pop-colors',
		name: 'Pop Colors',
		builtIn: true,
		effect: {
			type: 'colorCorrection',
			params: {
				vibrance: 0.4,
				contrast: 0.1,
				saturation: 0.2,
				mix: 1
			}
		}
	},
	{
		id: 'preset:vintage-film',
		name: 'Vintage Film Grain',
		builtIn: true,
		effect: {
			type: 'filmGrain',
			params: {
				amount: 0.45,
				speed: 1.5,
				mix: 1
			}
		}
	},
	{
		id: 'preset:subtle-sharpen',
		name: 'Subtle Sharpen',
		builtIn: true,
		effect: {
			type: 'sharpen',
			params: {
				amount: 25,
				radius: 1,
				mix: 1
			}
		}
	},
	{
		id: 'preset:heavy-vignette',
		name: 'Heavy Vignette',
		builtIn: true,
		effect: {
			type: 'vignette',
			params: {
				amount: 0.65,
				radius: 0.7,
				softness: 0.4,
				mix: 1
			}
		}
	},
	{
		id: 'preset:dream-glow',
		name: 'Dream Glow',
		builtIn: true,
		effect: {
			type: 'glow',
			params: {
				threshold: 0.6,
				radius: 18,
				intensity: 1.2,
				mix: 1
			}
		}
	}
];

const PRESETS_META_KEY = 'user_effect_presets';

export async function listUserPresets(): Promise<EffectPreset[]> {
	try {
		const db = await openProjectDatabase();
		const record = await db.get('meta', PRESETS_META_KEY);
		if (record && Array.isArray(record.value)) {
			return record.value as EffectPreset[];
		}
	} catch (e) {
		console.warn('Could not load user presets from database:', e);
	}
	return [];
}

export async function saveUserPreset(name: string, effect: EffectInstance): Promise<EffectPreset> {
	const params: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(effect.params)) {
		params[k] = structuredClone(v);
	}

	const newPreset: EffectPreset = {
		id: `user:${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
		name: name.trim(),
		builtIn: false,
		effect: {
			type: effect.type,
			params
		}
	};

	try {
		const db = await openProjectDatabase();
		const existing = await listUserPresets();
		existing.push(newPreset);
		await db.put('meta', { key: PRESETS_META_KEY, value: existing });
	} catch (e) {
		console.warn('Could not save user preset to database:', e);
	}

	return newPreset;
}

export async function deleteUserPreset(id: string): Promise<void> {
	try {
		const db = await openProjectDatabase();
		const existing = await listUserPresets();
		const filtered = existing.filter((p) => p.id !== id);
		await db.put('meta', { key: PRESETS_META_KEY, value: filtered });
	} catch (e) {
		console.warn('Could not delete user preset:', e);
	}
}
