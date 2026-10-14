import type { CurvePoint, EffectDefinition, ParamSchema } from './types';

const UNIVERSAL_MIX_PARAM: ParamSchema<number> = {
	type: 'number',
	name: 'mix',
	label: 'Mix',
	description: 'Wet / dry blend amount',
	defaultValue: 1,
	min: 0,
	max: 1,
	step: 0.01,
	animatable: true
};

const DEFAULT_CURVE: CurvePoint[] = [
	{ x: 0, y: 0 },
	{ x: 1, y: 1 }
];

function isIdentityCurve(points: unknown): boolean {
	if (!Array.isArray(points)) return true;
	if (points.length !== 2) return false;
	const p0 = points[0];
	const p1 = points[1];
	return (
		p0 &&
		p1 &&
		Math.abs(p0.x - 0) < 1e-4 &&
		Math.abs(p0.y - 0) < 1e-4 &&
		Math.abs(p1.x - 1) < 1e-4 &&
		Math.abs(p1.y - 1) < 1e-4
	);
}

export const EFFECT_DEFINITIONS: Record<string, EffectDefinition> = {
	gaussianBlur: {
		id: 'gaussianBlur',
		name: 'Gaussian Blur',
		category: 'blur',
		version: 1,
		description: 'High quality separable gaussian blur',
		params: {
			radius: {
				type: 'number',
				name: 'radius',
				label: 'Radius',
				unit: 'px',
				defaultValue: 0,
				min: 0,
				max: 100,
				step: 0.5,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => ((p.radius as number) ?? 0) <= 0 || ((p.mix as number) ?? 1) <= 0
	},

	sharpen: {
		id: 'sharpen',
		name: 'Sharpen',
		category: 'stylize',
		version: 1,
		description: 'Enhances fine edges and textures',
		params: {
			amount: {
				type: 'number',
				name: 'amount',
				label: 'Amount',
				defaultValue: 0,
				min: 0,
				max: 100,
				step: 1,
				animatable: true
			},
			radius: {
				type: 'number',
				name: 'radius',
				label: 'Radius',
				defaultValue: 1,
				min: 0.5,
				max: 5,
				step: 0.1,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => ((p.amount as number) ?? 0) <= 0 || ((p.mix as number) ?? 1) <= 0
	},

	vignette: {
		id: 'vignette',
		name: 'Vignette',
		category: 'stylize',
		version: 1,
		description: 'Darkens or lightens image perimeters',
		params: {
			amount: {
				type: 'number',
				name: 'amount',
				label: 'Amount',
				defaultValue: 0,
				min: 0,
				max: 1,
				step: 0.01,
				animatable: true
			},
			radius: {
				type: 'number',
				name: 'radius',
				label: 'Radius',
				defaultValue: 0.8,
				min: 0.1,
				max: 2,
				step: 0.05,
				animatable: true
			},
			softness: {
				type: 'number',
				name: 'softness',
				label: 'Softness',
				defaultValue: 0.5,
				min: 0.01,
				max: 1,
				step: 0.05,
				animatable: true
			},
			center: {
				type: 'point',
				name: 'center',
				label: 'Center',
				defaultValue: [0.5, 0.5],
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => ((p.amount as number) ?? 0) <= 0 || ((p.mix as number) ?? 1) <= 0
	},

	mosaic: {
		id: 'mosaic',
		name: 'Mosaic',
		category: 'stylize',
		version: 1,
		description: 'Pixelates the image into discrete blocks',
		params: {
			blockSize: {
				type: 'number',
				name: 'blockSize',
				label: 'Block Size',
				unit: 'px',
				defaultValue: 1,
				min: 1,
				max: 100,
				step: 1,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => ((p.blockSize as number) ?? 1) <= 1 || ((p.mix as number) ?? 1) <= 0
	},

	filmGrain: {
		id: 'filmGrain',
		name: 'Film Grain',
		category: 'stylize',
		version: 1,
		description: 'Simulated photographic film noise',
		params: {
			amount: {
				type: 'number',
				name: 'amount',
				label: 'Amount',
				defaultValue: 0,
				min: 0,
				max: 1,
				step: 0.01,
				animatable: true
			},
			speed: {
				type: 'number',
				name: 'speed',
				label: 'Speed',
				defaultValue: 1,
				min: 0,
				max: 5,
				step: 0.1,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => ((p.amount as number) ?? 0) <= 0 || ((p.mix as number) ?? 1) <= 0
	},

	invert: {
		id: 'invert',
		name: 'Invert',
		category: 'stylize',
		version: 1,
		description: 'Inverts color channels',
		params: {
			amount: {
				type: 'number',
				name: 'amount',
				label: 'Amount',
				defaultValue: 0,
				min: 0,
				max: 1,
				step: 0.01,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => ((p.amount as number) ?? 0) <= 0 || ((p.mix as number) ?? 1) <= 0
	},

	mirror: {
		id: 'mirror',
		name: 'Mirror',
		category: 'distort',
		version: 1,
		description: 'Mirrors video along axes',
		params: {
			mode: {
				type: 'enum',
				name: 'mode',
				label: 'Mode',
				defaultValue: 'horizontal',
				options: [
					{ value: 'horizontal', label: 'Horizontal' },
					{ value: 'vertical', label: 'Vertical' },
					{ value: 'quad', label: 'Quad' }
				]
			},
			amount: {
				type: 'number',
				name: 'amount',
				label: 'Amount',
				defaultValue: 0,
				min: 0,
				max: 1,
				step: 1,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => ((p.amount as number) ?? 0) <= 0 || ((p.mix as number) ?? 1) <= 0
	},

	glow: {
		id: 'glow',
		name: 'Glow',
		category: 'stylize',
		version: 1,
		description: 'Bloom and radiant aura on bright areas',
		params: {
			threshold: {
				type: 'number',
				name: 'threshold',
				label: 'Threshold',
				defaultValue: 0.7,
				min: 0,
				max: 1,
				step: 0.01,
				animatable: true
			},
			radius: {
				type: 'number',
				name: 'radius',
				label: 'Radius',
				unit: 'px',
				defaultValue: 0,
				min: 0,
				max: 50,
				step: 1,
				animatable: true
			},
			intensity: {
				type: 'number',
				name: 'intensity',
				label: 'Intensity',
				defaultValue: 1,
				min: 0,
				max: 5,
				step: 0.1,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) =>
			((p.radius as number) ?? 0) <= 0 ||
			((p.intensity as number) ?? 0) <= 0 ||
			((p.mix as number) ?? 1) <= 0
	},

	chromaKey: {
		id: 'chromaKey',
		name: 'Chroma Key',
		category: 'keying',
		version: 1,
		description: 'Green / blue screen transparency removal',
		params: {
			color: {
				type: 'color',
				name: 'color',
				label: 'Key Color',
				defaultValue: [0, 1, 0],
				animatable: true
			},
			tolerance: {
				type: 'number',
				name: 'tolerance',
				label: 'Tolerance',
				defaultValue: 0,
				min: 0,
				max: 1,
				step: 0.01,
				animatable: true
			},
			softness: {
				type: 'number',
				name: 'softness',
				label: 'Softness',
				defaultValue: 0.1,
				min: 0,
				max: 1,
				step: 0.01,
				animatable: true
			},
			spill: {
				type: 'number',
				name: 'spill',
				label: 'Spill Suppression',
				defaultValue: 0.5,
				min: 0,
				max: 1,
				step: 0.01,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => ((p.tolerance as number) ?? 0) <= 0 || ((p.mix as number) ?? 1) <= 0
	},

	colorCorrection: {
		id: 'colorCorrection',
		name: 'Color Correction',
		category: 'color',
		version: 1,
		description: 'Primary tonal and color grade adjustments',
		params: {
			exposure: {
				type: 'number',
				name: 'exposure',
				label: 'Exposure',
				unit: 'EV',
				defaultValue: 0,
				min: -5,
				max: 5,
				step: 0.05,
				animatable: true
			},
			contrast: {
				type: 'number',
				name: 'contrast',
				label: 'Contrast',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.02,
				animatable: true
			},
			highlights: {
				type: 'number',
				name: 'highlights',
				label: 'Highlights',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.02,
				animatable: true
			},
			shadows: {
				type: 'number',
				name: 'shadows',
				label: 'Shadows',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.02,
				animatable: true
			},
			whites: {
				type: 'number',
				name: 'whites',
				label: 'Whites',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.02,
				animatable: true
			},
			blacks: {
				type: 'number',
				name: 'blacks',
				label: 'Blacks',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.02,
				animatable: true
			},
			temperature: {
				type: 'number',
				name: 'temperature',
				label: 'Temperature',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.02,
				animatable: true
			},
			tint: {
				type: 'number',
				name: 'tint',
				label: 'Tint',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.02,
				animatable: true
			},
			saturation: {
				type: 'number',
				name: 'saturation',
				label: 'Saturation',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.02,
				animatable: true
			},
			vibrance: {
				type: 'number',
				name: 'vibrance',
				label: 'Vibrance',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.02,
				animatable: true
			},
			liftR: {
				type: 'number',
				name: 'liftR',
				label: 'Lift Red',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.01,
				animatable: true
			},
			liftG: {
				type: 'number',
				name: 'liftG',
				label: 'Lift Green',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.01,
				animatable: true
			},
			liftB: {
				type: 'number',
				name: 'liftB',
				label: 'Lift Blue',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.01,
				animatable: true
			},
			gammaR: {
				type: 'number',
				name: 'gammaR',
				label: 'Gamma Red',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.01,
				animatable: true
			},
			gammaG: {
				type: 'number',
				name: 'gammaG',
				label: 'Gamma Green',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.01,
				animatable: true
			},
			gammaB: {
				type: 'number',
				name: 'gammaB',
				label: 'Gamma Blue',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.01,
				animatable: true
			},
			gainR: {
				type: 'number',
				name: 'gainR',
				label: 'Gain Red',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.01,
				animatable: true
			},
			gainG: {
				type: 'number',
				name: 'gainG',
				label: 'Gain Green',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.01,
				animatable: true
			},
			gainB: {
				type: 'number',
				name: 'gainB',
				label: 'Gain Blue',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.01,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => {
			if (((p.mix as number) ?? 1) <= 0) return true;
			const zero = (v: unknown) => Math.abs(typeof v === 'number' ? v : 0) < 1e-4;
			return (
				zero(p.exposure) &&
				zero(p.contrast) &&
				zero(p.highlights) &&
				zero(p.shadows) &&
				zero(p.whites) &&
				zero(p.blacks) &&
				zero(p.temperature) &&
				zero(p.tint) &&
				zero(p.saturation) &&
				zero(p.vibrance) &&
				zero(p.liftR) &&
				zero(p.liftG) &&
				zero(p.liftB) &&
				zero(p.gammaR) &&
				zero(p.gammaG) &&
				zero(p.gammaB) &&
				zero(p.gainR) &&
				zero(p.gainG) &&
				zero(p.gainB)
			);
		}
	},

	curves: {
		id: 'curves',
		name: 'Curves',
		category: 'color',
		version: 1,
		description: 'RGB tonal curves',
		params: {
			rgb: {
				type: 'curve',
				name: 'rgb',
				label: 'Master (RGB)',
				defaultValue: DEFAULT_CURVE
			},
			red: {
				type: 'curve',
				name: 'red',
				label: 'Red',
				defaultValue: DEFAULT_CURVE
			},
			green: {
				type: 'curve',
				name: 'green',
				label: 'Green',
				defaultValue: DEFAULT_CURVE
			},
			blue: {
				type: 'curve',
				name: 'blue',
				label: 'Blue',
				defaultValue: DEFAULT_CURVE
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => {
			if (((p.mix as number) ?? 1) <= 0) return true;
			return (
				isIdentityCurve(p.rgb) &&
				isIdentityCurve(p.red) &&
				isIdentityCurve(p.green) &&
				isIdentityCurve(p.blue)
			);
		}
	},

	lut3d: {
		id: 'lut3d',
		name: '3D LUT',
		category: 'color',
		version: 1,
		description: 'Applies .cube 3D color lookup table',
		params: {
			lutAssetId: {
				type: 'lut',
				name: 'lutAssetId',
				label: 'LUT',
				defaultValue: ''
			},
			intensity: {
				type: 'number',
				name: 'intensity',
				label: 'Intensity',
				defaultValue: 1,
				min: 0,
				max: 1,
				step: 0.01,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) =>
			!p.lutAssetId || ((p.intensity as number) ?? 1) <= 0 || ((p.mix as number) ?? 1) <= 0
	},

	rgbSplit: {
		id: 'rgbSplit',
		name: 'RGB Split',
		category: 'stylize',
		version: 1,
		description: 'Separates RGB channels along an angle for chromatic aberration and glitch aesthetics',
		params: {
			amount: {
				type: 'number',
				name: 'amount',
				label: 'Amount',
				unit: 'px',
				defaultValue: 10,
				min: 0,
				max: 100,
				step: 0.5,
				animatable: true
			},
			angle: {
				type: 'angle',
				name: 'angle',
				label: 'Angle',
				unit: '°',
				defaultValue: 0,
				min: 0,
				max: 360,
				step: 1,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => ((p.amount as number) ?? 0) <= 0 || ((p.mix as number) ?? 1) <= 0
	},

	directionalBlur: {
		id: 'directionalBlur',
		name: 'Directional Blur',
		category: 'blur',
		version: 1,
		description: 'Linear directional motion blur along a specified angle',
		params: {
			length: {
				type: 'number',
				name: 'length',
				label: 'Length',
				unit: 'px',
				defaultValue: 15,
				min: 0,
				max: 100,
				step: 1,
				animatable: true
			},
			angle: {
				type: 'angle',
				name: 'angle',
				label: 'Angle',
				unit: '°',
				defaultValue: 0,
				min: 0,
				max: 360,
				step: 1,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => ((p.length as number) ?? 0) <= 0 || ((p.mix as number) ?? 1) <= 0
	},

	zoomBlur: {
		id: 'zoomBlur',
		name: 'Zoom Blur',
		category: 'blur',
		version: 1,
		description: 'Dynamic radial blur bursting outward from a focal center point',
		params: {
			strength: {
				type: 'number',
				name: 'strength',
				label: 'Strength',
				defaultValue: 0.2,
				min: 0,
				max: 1,
				step: 0.01,
				animatable: true
			},
			center: {
				type: 'point',
				name: 'center',
				label: 'Center',
				defaultValue: [0.5, 0.5],
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => ((p.strength as number) ?? 0) <= 0 || ((p.mix as number) ?? 1) <= 0
	},

	scanlines: {
		id: 'scanlines',
		name: 'CRT Scanlines',
		category: 'stylize',
		version: 1,
		description: 'Retro cathode-ray tube raster scanlines with roll and phosphorescent glow',
		params: {
			count: {
				type: 'number',
				name: 'count',
				label: 'Line Density',
				defaultValue: 300,
				min: 50,
				max: 1200,
				step: 10,
				animatable: true
			},
			intensity: {
				type: 'number',
				name: 'intensity',
				label: 'Intensity',
				defaultValue: 0.35,
				min: 0,
				max: 1,
				step: 0.01,
				animatable: true
			},
			speed: {
				type: 'number',
				name: 'speed',
				label: 'Roll Speed',
				defaultValue: 1,
				min: 0,
				max: 5,
				step: 0.1,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => ((p.intensity as number) ?? 0) <= 0 || ((p.mix as number) ?? 1) <= 0
	},

	neonEdges: {
		id: 'neonEdges',
		name: 'Neon Edges',
		category: 'stylize',
		version: 1,
		description: 'Sobel outline detector with vivid neon edge luminescence',
		params: {
			color: {
				type: 'color',
				name: 'color',
				label: 'Glow Color',
				defaultValue: [0, 0.9, 1],
				animatable: true
			},
			threshold: {
				type: 'number',
				name: 'threshold',
				label: 'Threshold',
				defaultValue: 0.15,
				min: 0.01,
				max: 1,
				step: 0.01,
				animatable: true
			},
			brightness: {
				type: 'number',
				name: 'brightness',
				label: 'Brightness',
				defaultValue: 2.0,
				min: 0.5,
				max: 5,
				step: 0.1,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => ((p.mix as number) ?? 1) <= 0
	},

	duotone: {
		id: 'duotone',
		name: 'Duotone Tint',
		category: 'color',
		version: 1,
		description: 'Maps luminance tones across two customizable shadow and highlight colors',
		params: {
			shadowColor: {
				type: 'color',
				name: 'shadowColor',
				label: 'Shadows Color',
				defaultValue: [0.05, 0.05, 0.2],
				animatable: true
			},
			highlightColor: {
				type: 'color',
				name: 'highlightColor',
				label: 'Highlights Color',
				defaultValue: [1, 0.85, 0.6],
				animatable: true
			},
			contrast: {
				type: 'number',
				name: 'contrast',
				label: 'Contrast',
				defaultValue: 0,
				min: -1,
				max: 1,
				step: 0.02,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => ((p.mix as number) ?? 1) <= 0
	},

	waveDistort: {
		id: 'waveDistort',
		name: 'Wave Distortion',
		category: 'distort',
		version: 1,
		description: 'Simulates underwater fluid ripples, heat haze, or psychedelic sine wave warp',
		params: {
			amplitude: {
				type: 'number',
				name: 'amplitude',
				label: 'Amplitude',
				unit: 'px',
				defaultValue: 15,
				min: 0,
				max: 100,
				step: 1,
				animatable: true
			},
			frequency: {
				type: 'number',
				name: 'frequency',
				label: 'Frequency',
				defaultValue: 20,
				min: 1,
				max: 100,
				step: 1,
				animatable: true
			},
			speed: {
				type: 'number',
				name: 'speed',
				label: 'Speed',
				defaultValue: 1.5,
				min: 0,
				max: 5,
				step: 0.1,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => ((p.amplitude as number) ?? 0) <= 0 || ((p.mix as number) ?? 1) <= 0
	},

	sepia: {
		id: 'sepia',
		name: 'Vintage Sepia',
		category: 'color',
		version: 1,
		description: 'Warm nostalgic sepia tone photographic wash',
		params: {
			amount: {
				type: 'number',
				name: 'amount',
				label: 'Amount',
				defaultValue: 0.8,
				min: 0,
				max: 1,
				step: 0.01,
				animatable: true
			},
			mix: UNIVERSAL_MIX_PARAM
		},
		isNeutral: (p) => ((p.amount as number) ?? 0) <= 0 || ((p.mix as number) ?? 1) <= 0
	}
};

export function getEffectDefinition(type: string): EffectDefinition | null {
	return EFFECT_DEFINITIONS[type] ?? null;
}

export function listEffectDefinitions(): EffectDefinition[] {
	return Object.values(EFFECT_DEFINITIONS);
}
