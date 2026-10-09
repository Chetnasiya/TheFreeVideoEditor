import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../core/factory';
import { MediaPool, needsDriftCorrection } from './mediaPool';
import type { Asset, AssetId, Clip, Project } from '../../core/types';

function asset(id: string): Asset {
	return {
		id: id as AssetId,
		kind: 'video',
		name: `${id}.mp4`,
		mimeType: 'video/mp4',
		size: 10,
		duration: 1_000_000,
		hasAudio: false,
		opfsPath: `projects/project/media/${id}.mp4`
	};
}

function clip(id: string, assetId: AssetId, start: number): Clip {
	return {
		id: id as Clip['id'],
		assetId,
		start,
		duration: 500_000,
		sourceIn: 0,
		sourceOut: 500_000,
		speed: 1,
		volume: 1
	};
}

function makeProject(count: number, existing?: Project): Project {
	const base = existing ?? createEmptyProject({ name: 'Media pool test' });
	const assets = Array.from({ length: count }, (_, index) => asset(`asset-${index}`));
	const clips = assets.map((item, index) => clip(`clip-${index}`, item.id, (index + 1) * 100_000));
	const videoTrack = base.tracks.find((track) => track.kind === 'video')!;
	return {
		...base,
		assets: Object.fromEntries(assets.map((item) => [item.id, item])),
		tracks: base.tracks.map((track) => (track.id === videoTrack.id ? { ...track, clips } : track))
	};
}

function fakeVideo(): HTMLVideoElement {
	const listeners = new Map<string, EventListener[]>();
	const element = {
		tagName: 'VIDEO',
		preload: 'none',
		muted: false,
		playsInline: false,
		playbackRate: 1,
		currentTime: 0,
		readyState: 0,
		paused: true,
		src: '',
		addEventListener(type: string, listener: EventListener) {
			const handlers = listeners.get(type) ?? [];
			handlers.push(listener);
			listeners.set(type, handlers);
		},
		pause() {
			this.paused = true;
		},
		load() {},
		removeAttribute() {},
		play() {
			this.paused = false;
			return Promise.resolve();
		}
	};
	return element as unknown as HTMLVideoElement;
}

function layers(project: Project, indices: number[]) {
	const track = project.tracks.find((item) => item.kind === 'video')!;
	return indices.map((index) => {
		const item = track.clips[index]!;
		return {
			clipId: item.id,
			assetId: item.assetId,
			trackId: track.id,
			trackOrder: 0,
			sourceTime: 0,
			kind: 'video' as const,
			opacity: 1 as const
		};
	});
}

describe('media pool', () => {
	it('applies the 80 ms drift correction threshold', () => {
		expect(needsDriftCorrection(1, 1.08)).toBe(false);
		expect(needsDriftCorrection(1, 1.081)).toBe(true);
		expect(needsDriftCorrection(0.9, 1)).toBe(true);
	});

	it('releases the least-recently-used preloaded clip at the hard element cap', async () => {
		const project = makeProject(2);
		let now = 0;
		const created: HTMLVideoElement[] = [];
		const released: AssetId[] = [];
		const pool = new MediaPool(project, {
			maxElements: 2,
			now: () => now,
			createVideo: () => {
				const element = fakeVideo();
				created.push(element);
				return element;
			},
			getUrl: async (_projectId, item) => ({
				url: `blob:${item.id}`,
				release: () => released.push(item.id)
			})
		});
		await pool.reconcile({ videoLayers: [], audioSources: [] }, 0, false, 1);
		expect(pool.elementCount).toBe(2);

		now = 10;
		const firstLayer = layers(project, [0])[0]!;
		pool.getFrameSource(firstLayer, false, 1);
		const expanded = makeProject(3, project);
		pool.setProject(expanded);
		now = 20;
		await pool.reconcile({ videoLayers: [], audioSources: [] }, 0, false, 1);

		expect(pool.elementCount).toBe(2);
		expect(released).toContain('asset-1');
		expect(created).toHaveLength(3);
		pool.dispose();
		expect(pool.elementCount).toBe(0);
	});

	it('routes to proxy URL when project proxy is enabled and asset proxy is ready', async () => {
		const base = makeProject(1);
		const targetAsset = base.assets['asset-0' as AssetId]!;
		targetAsset.proxy = {
			opfsPath: 'projects/p/proxies/asset-0.mp4',
			width: 960,
			height: 540,
			status: 'ready'
		};
		const projectWithProxy: Project = {
			...base,
			proxy: {
				enabled: true,
				targetHeight: 540,
				auto: 'large'
			}
		};

		const urlsLoaded: string[] = [];
		const pool = new MediaPool(projectWithProxy, {
			maxElements: 2,
			createVideo: () => fakeVideo(),
			getUrl: async (_p, item) => {
				urlsLoaded.push(`original:${item.id}`);
				return { url: `blob:orig-${item.id}`, release: () => {} };
			},
			getProxyUrl: async (_p, item) => {
				urlsLoaded.push(`proxy:${item.id}`);
				return { url: `blob:proxy-${item.id}`, release: () => {} };
			}
		});

		try {
			const layer = layers(projectWithProxy, [0])[0]!;
			pool.getFrameSource(layer, false, 1);
			expect(pool.isUsingProxy(layer)).toBe(true);
			expect(urlsLoaded).toEqual(['proxy:asset-0']);

			// Now disable proxies and update project
			const disabledProject: Project = {
				...projectWithProxy,
				proxy: { ...projectWithProxy.proxy!, enabled: false }
			};
			pool.setProject(disabledProject);

			// Entry should be removed / re-created as original
			pool.getFrameSource(layer, false, 1);
			expect(pool.isUsingProxy(layer)).toBe(false);
			expect(urlsLoaded).toEqual(['proxy:asset-0', 'original:asset-0']);
		} finally {
			pool.dispose();
		}
	});
});
