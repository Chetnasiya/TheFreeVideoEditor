import type { AnimatedValue } from '../../types';

export type AudioEffectCategory = 'eq' | 'dynamics' | 'restoration' | 'spatial' | 'utility';

export interface AudioParamSchema {
	id: string;
	name: string;
	type: 'number' | 'boolean' | 'enum';
	min?: number;
	max?: number;
	step?: number;
	default: number | boolean | string;
	unit?: string;
	animatable?: boolean;
	options?: Array<{ label: string; value: string }>;
}

export interface AudioEffectInstance {
	id: string;
	type: string;
	name?: string;
	version?: number;
	enabled?: boolean;
	bypass?: boolean;
	mix?: number; // dry/wet 0..1
	params: Record<string, number | string | boolean | AnimatedValue<unknown>>;
	managedBy?: 'user' | 'essential' | 'ducking';
}

export interface AudioEffectContext {
	sampleRate: number;
	channels: number;
}

export interface AudioEffectDSP {
	reset(): void;
	latencySamples(): number;
	process(channels: Float32Array[], frameCount: number): void;
}

export interface AudioEffectDefinition {
	id: string;
	name: string;
	category: AudioEffectCategory;
	version: number;
	paramSchemas: AudioParamSchema[];
	latencySamples: (params: Record<string, unknown>) => number;
	createDSP: (context: AudioEffectContext, params: Record<string, unknown>) => AudioEffectDSP;
	workletProcessorName?: string;
}

class AudioEffectRegistry {
	private readonly effects = new Map<string, AudioEffectDefinition>();

	public register(definition: AudioEffectDefinition): void {
		this.effects.set(definition.id, definition);
	}

	public get(id: string): AudioEffectDefinition | undefined {
		return this.effects.get(id);
	}

	public list(): AudioEffectDefinition[] {
		return Array.from(this.effects.values());
	}

	public listByCategory(category: AudioEffectCategory): AudioEffectDefinition[] {
		return this.list().filter((fx) => fx.category === category);
	}

	public createDefaultInstance(type: string): AudioEffectInstance {
		const def = this.get(type);
		if (!def) {
			return {
				id: crypto.randomUUID(),
				type,
				enabled: true,
				params: {}
			};
		}
		const params: Record<string, number | string | boolean> = {};
		for (const schema of def.paramSchemas) {
			params[schema.id] = schema.default;
		}
		return {
			id: crypto.randomUUID(),
			type: def.id,
			name: def.name,
			version: def.version,
			enabled: true,
			mix: 1.0,
			params
		};
	}
}

export const audioEffectRegistry = new AudioEffectRegistry();
