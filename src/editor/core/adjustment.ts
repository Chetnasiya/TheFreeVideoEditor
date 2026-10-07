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
