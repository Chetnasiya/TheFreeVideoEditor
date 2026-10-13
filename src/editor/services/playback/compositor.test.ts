import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../core/factory';
import { resolveFrame } from '../../core/playback';
import { renderFrame, type CompositionContext, type FrameSource } from './compositor';
import type { ActiveLayer } from '../../core/playback';
import type { Asset, AssetId, ClipId, TrackId } from '../../core/types';

function frame(color: string): FrameSource {
	return { width: 2, height: 1, color } as unknown as HTMLCanvasElement;
}

function layer(id: string, trackOrder: number): ActiveLayer {
	const project = createEmptyProject({ name: 'Compositor test' });
	return {
		clipId: id as ClipId,
		assetId: 'asset' as ActiveLayer['assetId'],
		trackId: project.tracks[0]!.id,
		trackOrder,
		sourceTime: 0,
		kind: 'video',
		opacity: 1
	};
}

function fakeContext() {
	const operations: string[] = [];
	const context: CompositionContext = {
		fillStyle: '#fff',
		globalAlpha: 1,
		clearRect: () => operations.push('clear'),
		fillRect: () => operations.push('black'),
		drawImage: (source) => operations.push((source as HTMLCanvasElement & { color: string }).color),
		save: () => operations.push('save'),
		restore: () => operations.push('restore'),
		translate: () => operations.push('translate'),
		rotate: () => operations.push('rotate'),
		scale: () => operations.push('scale')
	};
	return { context, operations };
}

describe('frame compositor', () => {
	it('clears gaps to black and draws layers in the supplied bottom-to-top order', () => {
		const { context, operations } = fakeContext();
		const bottom = layer('bottom', 1);
		const top = layer('top', 0);
		renderFrame(context, { width: 1920, height: 1080 }, [bottom, top], (item) =>
			item.clipId === bottom.clipId ? frame('blue') : frame('red')
		);

		expect(operations.slice(0, 2)).toEqual(['clear', 'black']);
		expect(operations.slice(2)).toEqual(['blue', 'red']);
	});

	it('keeps the last good frame when the provider has no decoded frame', () => {
		const { context, operations } = fakeContext();
		const clip = layer('clip', 0);
		const frames = new Map<ClipId, FrameSource>();
		renderFrame(context, { width: 100, height: 100 }, [clip], () => frame('green'), frames);
		operations.length = 0;
		renderFrame(context, { width: 100, height: 100 }, [clip], () => null, frames);

		expect(operations).toEqual(['clear', 'black', 'green']);
	});

	it('keeps preview and export compositing in agreement across visible track combinations', () => {
		for (let trackCount = 1; trackCount <= 8; trackCount += 1) {
			const project = createEmptyProject({ name: 'Layer agreement test' });
			const videoTrack = project.tracks.find((track) => track.kind === 'video');
			if (!videoTrack) throw new Error('Expected a default video track.');
			project.tracks = [];
			project.assets = {};

			for (let index = 0; index < trackCount; index += 1) {
				const assetId = `asset-${index}` as AssetId;
				const clipId = `clip-${index}` as ClipId;
				const asset: Asset = {
					id: assetId,
					kind: 'video',
					name: `asset-${index}.mp4`,
					mimeType: 'video/mp4',
					size: 1,
					duration: 2_000_000,
					hasAudio: false,
					opfsPath: `assets/${assetId}`
				};
				project.assets[assetId] = asset;
				project.tracks.push({
					...videoTrack,
					id: `track-${index}` as TrackId,
					hidden: index % 3 === 1,
					clips: [
						{
							id: clipId,
							assetId,
							start: 0,
							duration: 2_000_000,
							sourceIn: 0,
							sourceOut: 2_000_000,
							speed: 1,
							volume: 1
						}
					]
				});
			}

			const resolvedLayers = resolveFrame(project, 500_000).videoLayers;
			const { context, operations } = fakeContext();
			renderFrame(context, { width: 1920, height: 1080 }, resolvedLayers, (item) =>
				frame(item.clipId)
			);

			expect(operations.slice(2)).toEqual(resolvedLayers.map((item) => item.clipId));
		}
	});

	it('applies transform translation and scaling to solid color layers', () => {
		const { context, operations } = fakeContext();
		const solidLayer: ActiveLayer = {
			clipId: 'solid-1' as ClipId,
			trackId: 'track-1' as TrackId,
			trackOrder: 0,
			sourceTime: 0,
			kind: 'solid',
			opacity: 1,
			solidColor: { r: 1, g: 1, b: 1, a: 1 },
			transform: {
				x: 100,
				y: -50,
				scaleX: 0.5,
				scaleY: 0.5,
				rotation: 0,
				opacity: 0.8
			}
		};

		renderFrame(context, { width: 1920, height: 1080 }, [solidLayer], () => null);

		expect(operations).toContain('save');
		expect(operations).toContain('translate');
		expect(operations).toContain('scale');
		expect(operations).toContain('black');
		expect(operations).toContain('restore');
	});
});

