import type { AnimatedValue, Time } from '../types';

export type EffectParamType =
	'number' | 'boolean' | 'enum' | 'color' | 'point' | 'angle' | 'curve' | 'lut';

export type EffectType = string;

export type EffectCategory = 'blur' | 'stylize' | 'color' | 'keying' | 'distort';

export interface ParamOption {
	value: string;
	label: string;
}

export interface CurvePoint {
	x: number;
	y: number;
}

export interface ColorRgba {
	r: number;
	g: number;
	b: number;
	a?: number;
}

export interface ParamSchema<T = unknown> {
	type: EffectParamType;
	name: string;
	label: string;
	description?: string;
	defaultValue: T;
	min?: number;
	max?: number;
	step?: number;
	unit?: string;
	options?: ParamOption[];
	animatable?: boolean;
}

export interface EffectDefinition {
	id: string;
	name: string;
	category: EffectCategory;
	version: number;
	description?: string;
	params: Record<string, ParamSchema>;
	isNeutral: (params: Record<string, unknown>) => boolean;
	migrate?: (oldParams: Record<string, unknown>, fromVersion: number) => Record<string, unknown>;
}

export interface EvaluatedEffect {
	id: string;
	type: string;
	enabled: boolean;
	params: Record<string, unknown>;
	isNeutral: boolean;
}
