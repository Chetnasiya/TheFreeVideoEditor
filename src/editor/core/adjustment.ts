import type { Clip, ClipId, Time } from './types';

function randomId(): string {
	const cryptoApi = typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto;
	if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
	const bytes = new Uint8Array(16);
	if (cryptoApi) {
		cryptoApi.getRandomValues(bytes);
	} else {
		for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
	}
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function createAdjustmentClip(
	start: Time,
	duration: Time,
	options: Partial<Clip> = {}
): Clip {
	return {
		id: randomId() as ClipId,
		start,
		duration,
		sourceIn: 0,
		sourceOut: duration,
		speed: 1,
		volume: 0,
		source: { type: 'adjustment' },
		effects: [],
		...options
	};
}

export function createSolidClip(
	start: Time,
	duration: Time,
	color: { r: number; g: number; b: number; a: number } = { r: 0, g: 0, b: 0, a: 1 },
	options: Partial<Clip> = {}
): Clip {
	return {
		id: randomId() as ClipId,
		start,
		duration,
		sourceIn: 0,
		sourceOut: duration,
		speed: 1,
		volume: 0,
		source: { type: 'solid', color },
		effects: [],
		...options
	};
}

export function createTextClip(
	start: Time,
	duration: Time,
	text: string = 'Title Text',
	options: Partial<Clip> = {}
): Clip {
	return {
		id: randomId() as ClipId,
		start,
		duration,
		sourceIn: 0,
		sourceOut: duration,
		speed: 1,
		volume: 0,
		source: {
			type: 'text',
			text,
			style: {
				fontFamily: 'sans-serif',
				alignment: 'center'
			},
			box: {
				autoSize: true,
				verticalAnchor: 'center',
				paddingX: 20,
				paddingY: 16
			}
		},
		properties: {
			'text.fontSize': { value: 64 },
			'text.fillColor': { value: [1, 1, 1, 1] },
			'text.strokeColor': { value: [0, 0, 0, 1] },
			'text.strokeWidth': { value: 0 },
			'text.reveal': { value: 1 }
		},
		effects: [],
		...options
	};
}

export function createShapeClip(
	start: Time,
	duration: Time,
	config: Partial<import('./shapes/shapeTypes').ShapeConfig> = {},
	options: Partial<Clip> = {}
): Clip {
	const shapeType = config.shapeType ?? 'rect';
	const width = config.width ?? 360;
	const height = config.height ?? 240;
	const fillColor = config.fillColor ?? { r: 0.02, g: 0.71, b: 0.83, a: 1 };
	const strokeColor = config.strokeColor ?? { r: 1, g: 1, b: 1, a: 0.8 };
	const strokeWidth = config.strokeWidth ?? 2;
	const strokeStyle = config.strokeStyle ?? 'solid';
	const cornerRadius = config.cornerRadius ?? (shapeType === 'rounded-rect' ? 20 : 0);
	const points = config.points;
	const innerRadius = config.innerRadius;
	const shadowColor = config.shadowColor;
	const shadowBlur = config.shadowBlur;
	const shadowOffsetX = config.shadowOffsetX;
	const shadowOffsetY = config.shadowOffsetY;

	return {
		id: randomId() as ClipId,
		start,
		duration,
		sourceIn: 0,
		sourceOut: duration,
		speed: 1,
		volume: 0,
		source: {
			type: 'shape',
			shapeType,
			width,
			height,
			fillColor,
			strokeColor,
			strokeWidth,
			strokeStyle,
			cornerRadius,
			points,
			innerRadius,
			shadowColor,
			shadowBlur,
			shadowOffsetX,
			shadowOffsetY
		},
		properties: {
			'shape.width': { value: width },
			'shape.height': { value: height },
			'shape.fillColor': { value: [fillColor.r, fillColor.g, fillColor.b, fillColor.a] },
			'shape.strokeColor': { value: [strokeColor.r, strokeColor.g, strokeColor.b, strokeColor.a] },
			'shape.strokeWidth': { value: strokeWidth },
			'shape.cornerRadius': { value: cornerRadius }
		},
		effects: [],
		...options
	};
}
