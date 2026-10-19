import { describe, expect, it, vi } from 'vitest';
import type { ActiveLayer, ClipId, TrackId } from '../../core';
import { createEmptyProject } from '../../core/factory';
import { CompatibilityFrameProvider } from './compatibilityFrameProvider';

const rasterized = vi.hoisted(() => ({ canvas: { width: 10, height: 10 } as unknown }));

vi.mock('../render/text/rasterizer', () => ({
	rasterizeText: () => rasterized.canvas
}));
vi.mock('../render/text/fontLoader', () => ({ ensureFontLoaded: vi.fn() }));
vi.mock('../render/shapes/shapeRasterizer', () => ({
	rasterizeShape: () => ({ canvas: rasterized.canvas })
}));
vi.mock('../storage/opfs', () => ({ getMediaFile: vi.fn() }));

function textLayer(instanceKey?: string): ActiveLayer {
	return {
		clipId: 'text-clip' as ClipId,
		instanceKey,
		trackId: 'track' as TrackId,
		trackOrder: 0,
		sourceTime: 0,
		kind: 'text',
		opacity: 1,
		textData: {
			text: 'Hello',
			style: { fontFamily: 'sans-serif' },
			box: {}
		}
	} as unknown as ActiveLayer;
}

describe('CompatibilityFrameProvider', () => {
	it('returns a prepared text frame for a layer inside a template instance', async () => {
		const provider = new CompatibilityFrameProvider(createEmptyProject({ name: 'Compat' }));
		const layer = textLayer('instance-a/text-clip');

		await provider.prepare([layer]);

		expect(provider.getFrame(layer)).toBe(rasterized.canvas);
	});

	it('keeps two instances of the same template apart', async () => {
		const provider = new CompatibilityFrameProvider(createEmptyProject({ name: 'Compat' }));
		const first = textLayer('instance-a/text-clip');
		const second = textLayer('instance-b/text-clip');

		await provider.prepare([first, second]);

		expect(provider.getFrame(first)).not.toBeNull();
		expect(provider.getFrame(second)).not.toBeNull();
	});

	it('still serves a top-level text layer that has no instance key', async () => {
		const provider = new CompatibilityFrameProvider(createEmptyProject({ name: 'Compat' }));
		const layer = textLayer();

		await provider.prepare([layer]);

		expect(provider.getFrame(layer)).toBe(rasterized.canvas);
	});
});
