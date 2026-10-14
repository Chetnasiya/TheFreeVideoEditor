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
	| 'iris'
	| 'glitch'
	| 'lightLeak'
	| 'radialWipe'
	| 'blinds'
	| 'diamond'
	| 'whipPan'
	| 'pixelize'
	| 'swirl'
	| 'ripple'
	| 'blurDissolve';

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
	},
	glitch: {
		id: 'glitch',
		name: 'Digital Glitch',
		description: 'Horizontal scanline jitter and RGB chromatic aberration split',
		category: 'dissolve',
		params: {
			intensity: {
				type: 'number',
				name: 'intensity',
				label: 'Glitch Intensity',
				defaultValue: 0.8,
				min: 0.1,
				max: 2.0,
				step: 0.05
			},
			colorShift: {
				type: 'boolean',
				name: 'colorShift',
				label: 'Chromatic Split',
				defaultValue: true
			}
		},
		defaultDurationUs: 1_000_000
	},
	lightLeak: {
		id: 'lightLeak',
		name: 'Light Leak',
		description: 'Warm organic film burn and exposure bloom across the cut',
		category: 'dissolve',
		params: {
			intensity: {
				type: 'number',
				name: 'intensity',
				label: 'Bloom Intensity',
				defaultValue: 1.2,
				min: 0.2,
				max: 2.5,
				step: 0.1
			},
			warmth: {
				type: 'number',
				name: 'warmth',
				label: 'Color Warmth',
				defaultValue: 1.0,
				min: 0.0,
				max: 2.0,
				step: 0.1
			}
		},
		defaultDurationUs: 1_000_000
	},
	radialWipe: {
		id: 'radialWipe',
		name: 'Radial Wipe',
		description: 'Clockwise or counter-clockwise sweep around center',
		category: 'wipe',
		params: {
			startAngle: {
				type: 'number',
				name: 'startAngle',
				label: 'Start Angle',
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
				defaultValue: 0.02,
				min: 0.001,
				max: 0.2,
				step: 0.005
			},
			reverse: {
				type: 'boolean',
				name: 'reverse',
				label: 'Reverse Sweep',
				defaultValue: false
			}
		},
		defaultDurationUs: 1_000_000
	},
	blinds: {
		id: 'blinds',
		name: 'Venetian Blinds',
		description: 'Simultaneous wiping slat blinds across the frame',
		category: 'wipe',
		params: {
			count: {
				type: 'number',
				name: 'count',
				label: 'Slats Count',
				defaultValue: 10,
				min: 2,
				max: 40,
				step: 1
			},
			direction: {
				type: 'enum',
				name: 'direction',
				label: 'Orientation',
				defaultValue: 'horizontal',
				options: [
					{ label: 'Horizontal', value: 'horizontal' },
					{ label: 'Vertical', value: 'vertical' }
				]
			},
			softness: {
				type: 'number',
				name: 'softness',
				label: 'Softness',
				defaultValue: 0.03,
				min: 0.001,
				max: 0.2,
				step: 0.005
			}
		},
		defaultDurationUs: 1_000_000
	},
	diamond: {
		id: 'diamond',
		name: 'Diamond Wipe',
		description: 'Expanding or contracting geometric diamond shape wipe',
		category: 'wipe',
		params: {
			softness: {
				type: 'number',
				name: 'softness',
				label: 'Edge Softness',
				defaultValue: 0.05,
				min: 0.001,
				max: 0.4,
				step: 0.01
			},
			reverse: {
				type: 'boolean',
				name: 'reverse',
				label: 'Contracting (Inward)',
				defaultValue: false
			}
		},
		defaultDurationUs: 1_000_000
	},
	whipPan: {
		id: 'whipPan',
		name: 'Whip Pan',
		description: 'Fast camera swish pan with high-speed directional motion streaks',
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
			},
			blur: {
				type: 'number',
				name: 'blur',
				label: 'Motion Blur',
				defaultValue: 0.6,
				min: 0.1,
				max: 1.5,
				step: 0.05
			}
		},
		defaultDurationUs: 800_000
	},
	pixelize: {
		id: 'pixelize',
		name: 'Pixelize',
		description: 'Retro pixel blocks that enlarge and dissolve into the next clip',
		category: 'dissolve',
		params: {
			maxBlockSize: {
				type: 'number',
				name: 'maxBlockSize',
				label: 'Peak Block Size',
				defaultValue: 32.0,
				min: 4.0,
				max: 128.0,
				step: 2.0
			}
		},
		defaultDurationUs: 1_000_000
	},
	swirl: {
		id: 'swirl',
		name: 'Swirl',
		description: 'Rotational vortex distortion spinning between outgoing and incoming clips',
		category: 'motion',
		params: {
			turns: {
				type: 'number',
				name: 'turns',
				label: 'Rotations',
				defaultValue: 3.0,
				min: -8.0,
				max: 8.0,
				step: 0.5
			},
			radius: {
				type: 'number',
				name: 'radius',
				label: 'Vortex Radius',
				defaultValue: 0.8,
				min: 0.2,
				max: 1.5,
				step: 0.05
			}
		},
		defaultDurationUs: 1_000_000
	},
	ripple: {
		id: 'ripple',
		name: 'Water Ripple',
		description: 'Concentric water shockwaves radiating outward from center',
		category: 'motion',
		params: {
			frequency: {
				type: 'number',
				name: 'frequency',
				label: 'Wave Frequency',
				defaultValue: 25.0,
				min: 5.0,
				max: 50.0,
				step: 1.0
			},
			amplitude: {
				type: 'number',
				name: 'amplitude',
				label: 'Wave Height',
				defaultValue: 0.06,
				min: 0.01,
				max: 0.2,
				step: 0.01
			},
			speed: {
				type: 'number',
				name: 'speed',
				label: 'Wave Speed',
				defaultValue: 2.0,
				min: 0.5,
				max: 5.0,
				step: 0.1
			}
		},
		defaultDurationUs: 1_000_000
	},
	blurDissolve: {
		id: 'blurDissolve',
		name: 'Blur Dissolve',
		description: 'Directional motion blur dissolve between outgoing and incoming clips',
		category: 'dissolve',
		params: {
			angle: {
				type: 'number',
				name: 'angle',
				label: 'Angle',
				unit: 'deg',
				defaultValue: 0,
				min: 0,
				max: 360,
				step: 5
			},
			strength: {
				type: 'number',
				name: 'strength',
				label: 'Blur Strength',
				defaultValue: 0.5,
				min: 0.1,
				max: 2.0,
				step: 0.05
			}
		},
		defaultDurationUs: 1_000_000
	}
};

export function getTransitionDefinition(type: string): TransitionDefinition | undefined {
	return TRANSITION_DEFINITIONS[type as TransitionType];
}
