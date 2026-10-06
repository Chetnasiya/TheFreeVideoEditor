import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../../core/factory';
import { AudioEngine } from './audioEngine';
import type { ActiveAudio } from '../../core/playback';
import type { Asset, AssetId, Project } from '../../core/types';
import type { MediaPool } from './mediaPool';

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function setLocalStorage(): void {
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: {
			getItem: () => null,
			setItem: vi.fn()
		}
	});
}

function makeAudioElement(): HTMLAudioElement {
	return {
		paused: true,
		volume: 1,
		playbackRate: 1,
		currentTime: 0,
		pause: vi.fn(function (this: { paused: boolean }) {
			this.paused = true;
		}),
		play: vi.fn(function (this: { paused: boolean }) {
			this.paused = false;
			return Promise.resolve();
		})
	} as unknown as HTMLAudioElement;
}

function makeContext() {
	const gains: Array<{
		gain: {
			value: number;
			cancelScheduledValues: ReturnType<typeof vi.fn>;
			setValueAtTime: ReturnType<typeof vi.fn>;
			linearRampToValueAtTime: ReturnType<typeof vi.fn>;
		};
		connect: ReturnType<typeof vi.fn>;
		disconnect: ReturnType<typeof vi.fn>;
	}> = [];
	const samples = new Float32Array(256);
	samples[0] = 0.5;
	let sourceCount = 0;
	let state: AudioContextState = 'suspended';
	const destination = { connect: vi.fn() };
	const context = {
		get state() {
			return state;
		},
		currentTime: 0,
		destination,
		createGain() {
			const gain = {
				value: 1,
				cancelScheduledValues: vi.fn(),
				setValueAtTime: vi.fn(function (this: { value: number }, value: number) {
					this.value = value;
				}),
				linearRampToValueAtTime: vi.fn(function (this: { value: number }, value: number) {
					this.value = value;
				})
			};
			const node = { gain, connect: vi.fn(), disconnect: vi.fn() };
			gains.push(node);
			return node;
		},
		createAnalyser() {
			return {
				fftSize: 256,
				connect: vi.fn(),
				getFloatTimeDomainData: (data: Float32Array) => data.set(samples)
			};
		},
		createMediaElementSource: vi.fn(() => {
			sourceCount += 1;
			return { connect: vi.fn(), disconnect: vi.fn() };
		}),
		resume: vi.fn(async () => {
			state = 'running';
		}),
		close: vi.fn(async () => {
			state = 'closed';
		})
	};
	return {
		context: context as unknown as AudioContext,
		gains,
		get sourceCount() {
			return sourceCount;
		},
		get state() {
			return state;
		}
	};
}

function makeProject(): { project: Project; source: ActiveAudio } {
	const base = createEmptyProject({ name: 'Audio engine test' });
	const asset: Asset = {
		id: 'audio' as AssetId,
		kind: 'audio',
		name: 'tone.wav',
		mimeType: 'audio/wav',
		size: 10,
		duration: 1_000_000,
		hasAudio: true,
		opfsPath: `projects/${base.id}/media/audio.wav`
	};
	return {
		project: { ...base, assets: { [asset.id]: asset } },
		source: {
			clipId: 'clip' as ActiveAudio['clipId'],
			assetId: asset.id,
			trackId: base.tracks[1]!.id,
			trackOrder: 1,
			sourceTime: 0,
			volume: 0.5
		}
	};
}

afterEach(() => {
	if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
	else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('audio engine', () => {
	it('builds a single source graph per media element and ramps track/master volume', async () => {
		setLocalStorage();
		const audioElement = makeAudioElement();
		const pool = { getAudioElement: () => audioElement } as unknown as Pick<
			MediaPool,
			'getAudioElement'
		>;
		const harness = makeContext();
		const audio = new AudioEngine(pool, { createContext: () => harness.context });
		const { project, source } = makeProject();

		await audio.sync([source], project, true, 1);
		await audio.sync([{ ...source, volume: 0.75 }], project, true, 1);
		expect(harness.sourceCount).toBe(1);
		expect(harness.context.createMediaElementSource).toHaveBeenCalledTimes(1);
		expect(harness.gains[1]?.gain.value).toBe(0.75);
		expect(audio.getLevel()).toBeGreaterThan(0);

		audio.setMuted(true);
		expect(harness.gains[0]?.gain.value).toBe(0);
		audio.setMuted(false);
		audio.setVolume(0.6);
		expect(harness.gains[0]?.gain.value).toBe(0.6);

		await audio.sync([], project, false, 1);
		expect(audioElement.pause).toHaveBeenCalled();
		audio.releaseElement(audioElement);
		expect(harness.gains[1]?.disconnect).toHaveBeenCalledTimes(1);
		await audio.dispose();
		expect(harness.state).toBe('closed');
	});

	it('keeps audio silent for reverse or shuttle playback', async () => {
		setLocalStorage();
		const audioElement = makeAudioElement();
		const pool = { getAudioElement: () => audioElement } as unknown as Pick<
			MediaPool,
			'getAudioElement'
		>;
		const harness = makeContext();
		const audio = new AudioEngine(pool, { createContext: () => harness.context });
		const { project, source } = makeProject();

		await audio.sync([source], project, true, -1);
		expect(audioElement.play).not.toHaveBeenCalled();
		await audio.dispose();
	});

	it('restores track gain when playback resumes after a pause', async () => {
		setLocalStorage();
		const audioElement = makeAudioElement();
		const pool = { getAudioElement: () => audioElement } as unknown as Pick<
			MediaPool,
			'getAudioElement'
		>;
		const harness = makeContext();
		const audio = new AudioEngine(pool, { createContext: () => harness.context });
		const { project, source } = makeProject();

		await audio.sync([source], project, true, 1);
		await audio.sync([], project, false, 1);
		expect(harness.gains[1]?.gain.value).toBe(0);
		await audio.sync([source], project, true, 1);
		expect(harness.gains[1]?.gain.value).toBe(0.5);
		await audio.sync([], project, true, 1);
		await audio.sync([source], project, true, 1);
		expect(harness.gains[1]?.gain.value).toBe(0.5);
		await audio.dispose();
	});
});
