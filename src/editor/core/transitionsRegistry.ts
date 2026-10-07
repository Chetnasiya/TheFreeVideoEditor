import type { ParamSchema } from './effects/types';

export type TransitionType =
	| 'crossDissolve'
	| 'dipToBlack'
	| 'dipToWhite'
	| 'fade'
	| 'wipe'
	| 'slide'
	| 'push'
	| 'zoomDissolve'
	| 'iris';

export interface TransitionDefinition {
	id: TransitionType;
	name: string;
	description: string;
	category: 'dissolve' | 'wipe' | 'motion';
	params: Record<string, ParamSchema<unknown>>;
	defaultDurationUs: number; // typically 1_000_000 (1 second)
}

export const TRANSITION_DEFINITIONS: Record<TransitionType, TransitionDefinition> = {
	crossDissolve: {
		id: 'crossDissolve',
		name: 'Cross Dissolve',
		description: 'Smooth dissolve from outgoing clip to incoming clip',
		category: 'dissolve',
		params: {},
		defaultDurationUs: 1_000_000
	},
	dipToBlack: {
		id: 'dipToBlack',
		name: 'Dip to Black',
		description: 'Fades outgoing clip to black, then fades up incoming clip',
		category: 'dissolve',
		params: {},
		defaultDurationUs: 1_000_000
	},
	dipToWhite: {
		id: 'dipToWhite',
		name: 'Dip to White',
		description: 'Fades outgoing clip to white flash, then fades to incoming clip',
		category: 'dissolve',
		params: {},
		defaultDurationUs: 1_000_000
	},
	fade: {
		id: 'fade',
		name: 'Fade',
		description: 'Fade to/from transparent so tracks below show through',
		category: 'dissolve',
		params: {},
		defaultDurationUs: 1_000_000
	},
	wipe: {
		id: 'wipe',
		name: 'Wipe',
		description: 'Linear edge wipe across the frame',
		category: 'wipe',
		params: {
			angle: {
				type: 'number',
				name: 'angle',
				label: 'Angle',
				unit: 'deg',
				defaultValue: 0,
				min: 0,
				max: 360,
				step: 1
			},
			softness: {
				type: 'number',
				name: 'softness',
				label: 'Softness',
				defaultValue: 0.05,
				min: 0,
				max: 1,
				step: 0.01
			},
			reverse: {
				type: 'boolean',
				name: 'reverse',
				label: 'Reverse Direction',
				defaultValue: false
			}
		},
		defaultDurationUs: 1_000_000
	},
	slide: {
		id: 'slide',
		name: 'Slide',
		description: 'Incoming clip slides over outgoing clip',
		category: 'motion',
		params: {
			direction: {
				type: 'enum',
				name: 'direction',
				label: 'Direction',
				defaultValue: 'left',
				options: [
					{ label: 'Left', value: 'left' },
					{ label: 'Right', value: 'right' },
					{ label: 'Up', value: 'up' },
					{ label: 'Down', value: 'down' }
				]
			}
		},
		defaultDurationUs: 1_000_000
	},
	push: {
		id: 'push',
		name: 'Push',
		description: 'Incoming clip pushes outgoing clip out of frame',
		category: 'motion',
		params: {
			direction: {
				type: 'enum',
				name: 'direction',
				label: 'Direction',
				defaultValue: 'left',
				options: [
					{ label: 'Left', value: 'left' },
					{ label: 'Right', value: 'right' },
					{ label: 'Up', value: 'up' },
					{ label: 'Down', value: 'down' }
				]
			}
		},
		defaultDurationUs: 1_000_000
	},
	zoomDissolve: {
		id: 'zoomDissolve',
		name: 'Zoom Dissolve',
		description: 'Dissolve combined with continuous zoom scaling',
		category: 'dissolve',
		params: {
			scale: {
				type: 'number',
				name: 'scale',
				label: 'Scale Factor',
				defaultValue: 1.5,
				min: 1.0,
				max: 3.0,
				step: 0.1
			}
		},
		defaultDurationUs: 1_000_000
	},
	iris: {
		id: 'iris',
		name: 'Iris',
		description: 'Expanding or contracting circular iris transition',
		category: 'wipe',
		params: {
			softness: {
				type: 'number',
				name: 'softness',
				label: 'Edge Softness',
				defaultValue: 0.05,
				min: 0,
				max: 1,
				step: 0.01
			},
			reverse: {
				type: 'boolean',
				name: 'reverse',
				label: 'Iris Out (Contracting)',
				defaultValue: false
			}
		},
		defaultDurationUs: 1_000_000
	}
};

export function getTransitionDefinition(type: string): TransitionDefinition | undefined {
	return TRANSITION_DEFINITIONS[type as TransitionType];
}
