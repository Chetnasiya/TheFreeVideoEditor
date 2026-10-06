import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './factory';
import { resolveFrame } from './playback';
import type { AssetId, ClipId, Project } from './types';

function animated(): Project {
	const project = createEmptyProject({ name: 'props' });
	const assetId = 'a' as AssetId;
	project.assets[assetId] = {
		id: assetId,
		kind: 'video',
		name: 'a.mp4',
		mimeType: 'video/mp4',
		size: 1,
		duration: 10_000_000,
		hasAudio: false,
		opfsPath: 'x'
	};
	const track = project.tracks.find((item) => item.kind === 'video')!;
	track.clips.push({
		id: 'c' as ClipId,
		assetId,
		start: 1_000_000,
		duration: 4_000_000,
		sourceIn: 0,
		sourceOut: 4_000_000,
		speed: 1,
		volume: 1,
		properties: {
			position: {
				keyframes: [
					{ time: 0, value: [0, 0], interpolation: 'linear' },
					{ time: 2_000_000, value: [100, 40], interpolation: 'linear' }
				]
			},
			opacity: { value: 0.5 },
			anchor: { value: [10, 0] }
		},
		blendMode: 'screen'
	});
	return project;
}

describe('resolveFrame animated properties', () => {
	it('evaluates keyframes at clip-local time and hands renderers plain values', () => {
		const layer = resolveFrame(animated(), 2_000_000).videoLayers[0]!;
		expect(layer.transform).toEqual({
			x: 50,
			y: 20,
			scaleX: 1,
			scaleY: 1,
			rotation: 0,
			opacity: 0.5
		});
		expect(layer.anchor).toEqual({ x: 10, y: 0 });
		expect(layer.blendMode).toBe('screen');
	});

	it('holds the end value after the last keyframe', () => {
		const layer = resolveFrame(animated(), 4_500_000).videoLayers[0]!;
		expect(layer.transform?.x).toBe(100);
	});

	it('leaves Phase 1 clips untouched', () => {
		const project = animated();
		const clip = project.tracks.find((item) => item.kind === 'video')!.clips[0]!;
		delete clip.properties;
		delete clip.blendMode;
		const layer = resolveFrame(project, 2_000_000).videoLayers[0]!;
		expect(layer.transform).toBeUndefined();
		expect(layer.blendMode).toBeUndefined();
		expect(layer.anchor).toBeUndefined();
	});

	it('uses the time remap for the source time', () => {
		const project = animated();
		const clip = project.tracks.find((item) => item.kind === 'video')!.clips[0]!;
		clip.timeRemap = { value: 2 };
		expect(resolveFrame(project, 2_000_000).videoLayers[0]!.sourceTime).toBe(2_000_000);
	});
});
