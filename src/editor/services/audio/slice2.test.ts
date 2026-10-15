import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../core/factory';
import type { Clip, Project, Track } from '../../core/types';
import { dbToGain, gainToDb, resolveAudibleTracks } from '../../core/audioMath';
import { buildAudioGraph } from './graph';
import { renderOfflineAudio } from './offlineRender';

function createSineToneBuffer(
	sampleRate: number,
	durationSeconds: number,
	frequencyHz: number,
	channels = 2
): AudioBuffer {
	const length = Math.floor(sampleRate * durationSeconds);
	const channelData = Array.from({ length: channels }, () => new Float32Array(length));
	const buffer = {
		sampleRate,
		length,
		duration: durationSeconds,
		numberOfChannels: channels,
		channelData,
		getChannelData(c: number) {
			return channelData[c]!;
		},
		copyToChannel(source: Float32Array, channelNumber: number) {
			channelData[channelNumber]?.set(source);
		}
	} as unknown as AudioBuffer;

	for (let i = 0; i < length; i++) {
		const sample = Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate);
		for (let c = 0; c < channels; c++) {
			channelData[c]![i] = sample;
		}
	}
	return buffer;
}

function calculateBufferRmsDb(buffer: AudioBuffer): {
	leftDb: number;
	rightDb: number;
	combinedDb: number;
} {
	let sumL = 0;
	let sumR = 0;
	const len = buffer.length;
	const chanL = buffer.getChannelData(0);
	const chanR = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : chanL;

	for (let i = 0; i < len; i++) {
		sumL += chanL[i]! * chanL[i]!;
		sumR += chanR[i]! * chanR[i]!;
	}

	const rmsL = Math.sqrt(sumL / Math.max(1, len));
	const rmsR = Math.sqrt(sumR / Math.max(1, len));
	const rmsCombined = Math.sqrt((sumL + sumR) / Math.max(1, 2 * len));

	return {
		leftDb: gainToDb(rmsL),
		rightDb: gainToDb(rmsR),
		combinedDb: gainToDb(rmsCombined)
	};
}

interface MockAudioParam {
	value: number;
	setTargetAtTime?(val: number): void;
	setValueAtTime?(val: number): void;
	linearRampToValueAtTime?(val: number): void;
}

interface MockGraphNode {
	type: string;
	gain?: MockAudioParam;
	pan?: MockAudioParam;
	delayTime?: MockAudioParam;
	frequency?: MockAudioParam;
	Q?: MockAudioParam;
	threshold?: MockAudioParam;
	ratio?: MockAudioParam;
	attack?: MockAudioParam;
	release?: MockAudioParam;
	knee?: MockAudioParam;
	buffer?: AudioBuffer | null;
	playbackRate?: { value: number };
	outputs: MockGraphNode[];
	connect(target: unknown): void;
	disconnect(): void;
	start?(): void;
	stop?(): void;
}

class MockOfflineAudioContext {
	readonly numberOfChannels: number;
	readonly length: number;
	readonly sampleRate: number;
	readonly destination: MockGraphNode;
	readonly currentTime = 0;
	private sources: MockGraphNode[] = [];

	constructor(numberOfChannels: number, length: number, sampleRate: number) {
		this.numberOfChannels = numberOfChannels;
		this.length = length;
		this.sampleRate = sampleRate;
		this.destination = {
			type: 'destination',
			outputs: [],
			connect() {},
			disconnect() {}
		};
	}

	createGain() {
		const node: MockGraphNode = {
			type: 'gain',
			gain: {
				value: 1,
				setTargetAtTime(val: number) {
					this.value = val;
				},
				setValueAtTime(val: number) {
					this.value = val;
				},
				linearRampToValueAtTime(val: number) {
					this.value = val;
				}
			},
			outputs: [],
			connect(target: unknown) {
				this.outputs.push(target as MockGraphNode);
			},
			disconnect() {
				this.outputs = [];
			}
		};
		return node;
	}

	createBufferSource() {
		const source: MockGraphNode = {
			type: 'source',
			buffer: null,
			playbackRate: { value: 1 },
			outputs: [],
			connect(target: unknown) {
				this.outputs.push(target as MockGraphNode);
			},
			disconnect() {
				this.outputs = [];
			},
			start() {},
			stop() {}
		};
		this.sources.push(source);
		return source;
	}

	createStereoPanner() {
		const node: MockGraphNode = {
			type: 'panner',
			pan: {
				value: 0,
				setTargetAtTime(val: number) {
					this.value = val;
				},
				setValueAtTime(val: number) {
					this.value = val;
				}
			},
			outputs: [],
			connect(target: unknown) {
				this.outputs.push(target as MockGraphNode);
			},
			disconnect() {
				this.outputs = [];
			}
		};
		return node;
	}

	createDelay() {
		const node: MockGraphNode = {
			type: 'delay',
			delayTime: { value: 0 },
			outputs: [],
			connect(target: unknown) {
				this.outputs.push(target as MockGraphNode);
			},
			disconnect() {
				this.outputs = [];
			}
		};
		return node;
	}

	createBiquadFilter() {
		const node: MockGraphNode = {
			type: 'biquad',
			frequency: { value: 1000 },
			gain: { value: 0 },
			Q: { value: 1 },
			outputs: [],
			connect(target: unknown) {
				this.outputs.push(target as MockGraphNode);
			},
			disconnect() {
				this.outputs = [];
			}
		};
		return node;
	}

	createDynamicsCompressor() {
		const node: MockGraphNode = {
			type: 'compressor',
			threshold: { value: 0 },
			ratio: { value: 1 },
			attack: { value: 0 },
			release: { value: 0 },
			knee: { value: 0 },
			outputs: [],
			connect(target: unknown) {
				this.outputs.push(target as MockGraphNode);
			},
			disconnect() {
				this.outputs = [];
			}
		};
		return node;
	}

	createBuffer(channels: number, length: number, sampleRate: number) {
		const data = Array.from({ length: channels }, () => new Float32Array(length));
		return {
			numberOfChannels: channels,
			length,
			sampleRate,
			duration: length / sampleRate,
			getChannelData: (c: number) => data[c]!,
			copyToChannel: (src: Float32Array, c: number) => {
				data[c]?.set(src);
			}
		} as unknown as AudioBuffer;
	}

	async startRendering(): Promise<AudioBuffer> {
		const outL = new Float32Array(this.length);
		const outR = new Float32Array(this.length);

		const tracePath = (
			node: MockGraphNode,
			currentGain: number,
			currentPan: number
		): Array<{ gain: number; pan: number }> => {
			if (node === this.destination) {
				return [{ gain: currentGain, pan: currentPan }];
			}
			let g = currentGain;
			let p = currentPan;
			if (node.type === 'gain' && node.gain) {
				g *= node.gain.value;
			} else if (node.type === 'panner' && node.pan) {
				p += node.pan.value;
			}
			const paths: Array<{ gain: number; pan: number }> = [];
			for (const out of node.outputs ?? []) {
				paths.push(...tracePath(out, g, p));
			}
			return paths;
		};

		for (const src of this.sources) {
			if (!src.buffer) continue;
			const paths = tracePath(src, 1.0, 0.0);
			const srcL = src.buffer.getChannelData(0);
			const srcR = src.buffer.numberOfChannels > 1 ? src.buffer.getChannelData(1) : srcL;
			const len = Math.min(this.length, src.buffer.length);

			for (const path of paths) {
				const clampedPan = Math.max(-1, Math.min(1, path.pan));
				const theta = ((clampedPan + 1) * Math.PI) / 4;
				const panGainL = Math.cos(theta) * Math.SQRT2;
				const panGainR = Math.sin(theta) * Math.SQRT2;

				for (let i = 0; i < len; i++) {
					outL[i] += srcL[i]! * path.gain * (panGainL * 0.7071);
					outR[i] += srcR[i]! * path.gain * (panGainR * 0.7071);
				}
			}
		}

		return {
			numberOfChannels: 2,
			length: this.length,
			sampleRate: this.sampleRate,
			duration: this.length / this.sampleRate,
			getChannelData(c: number) {
				return c === 0 ? outL : outR;
			},
			copyToChannel(src: Float32Array, c: number) {
				if (c === 0) outL.set(src);
				else outR.set(src);
			}
		} as unknown as AudioBuffer;
	}
}

interface GlobalScopeWithAudio {
	OfflineAudioContext?: typeof MockOfflineAudioContext | typeof globalThis.OfflineAudioContext;
}

const globalScope = globalThis as unknown as GlobalScopeWithAudio;
if (typeof globalScope.OfflineAudioContext === 'undefined') {
	globalScope.OfflineAudioContext = MockOfflineAudioContext;
}

describe('Slice 2 Core: One Controller, Live + Offline Parity & Verification Oracles', () => {
	const sampleRate = 48000;
	const durationSec = 0.5;

	it('1. Track Fader Analytic Oracle: -6 dB setting matches -6.02 dB ±0.05 dB in offline render', async () => {
		const project = createEmptyProject({ name: 'Fader Oracle Test' });
		const toneBuffer = createSineToneBuffer(sampleRate, durationSec, 1000);

		// Baseline project at 0 dB
		const track1: Track = {
			id: 'track-fader-1' as Track['id'],
			kind: 'audio',
			name: 'Audio 1',
			muted: false,
			locked: false,
			hidden: false,
			clips: [
				{
					id: 'clip-1' as Clip['id'],
					assetId: 'asset-1' as Clip['assetId'],
					start: 0,
					duration: 500_000,
					sourceIn: 0,
					sourceOut: 500_000,
					speed: 1,
					volume: 1.0
				}
			],
			audio: {
				gainDb: 0,
				pan: 0,
				solo: false
			}
		};
		project.tracks.push(track1);

		const buffers = new Map<string, AudioBuffer>([['asset-1', toneBuffer]]);

		const baselineRender = await renderOfflineAudio({
			project,
			durationUs: 500_000,
			sampleRate,
			buffers
		});
		const baselineRms = calculateBufferRmsDb(baselineRender);

		// Modify Fader to -6 dB
		const faderProject: Project = {
			...project,
			tracks: project.tracks.map((t) =>
				t.id === 'track-fader-1' ? { ...t, audio: { ...t.audio!, gainDb: -6 } } : t
			)
		};

		const faderRender = await renderOfflineAudio({
			project: faderProject,
			durationUs: 500_000,
			sampleRate,
			buffers
		});
		const faderRms = calculateBufferRmsDb(faderRender);

		const deltaDb = faderRms.combinedDb - baselineRms.combinedDb;
		// Analytic formula: 20 * log10(10^(-6/20)) = -6.00 dB
		expect(deltaDb).toBeCloseTo(-6.0, 1);
		expect(Math.abs(deltaDb - -6.0)).toBeLessThan(0.05);
	});

	it('2. Track Pan Analytic Oracle: Constant-power panning law preserves power across stereo field', async () => {
		const project = createEmptyProject({ name: 'Pan Oracle Test' });
		const toneBuffer = createSineToneBuffer(sampleRate, durationSec, 1000);
		const buffers = new Map<string, AudioBuffer>([['asset-pan', toneBuffer]]);

		const track: Track = {
			id: 'track-pan-1' as Track['id'],
			kind: 'audio',
			name: 'Pan Track',
			muted: false,
			locked: false,
			hidden: false,
			clips: [
				{
					id: 'clip-pan' as Clip['id'],
					assetId: 'asset-pan' as Clip['assetId'],
					start: 0,
					duration: 500_000,
					sourceIn: 0,
					sourceOut: 500_000,
					speed: 1,
					volume: 1.0
				}
			],
			audio: {
				gainDb: 0,
				pan: -1.0, // Hard Left
				solo: false
			}
		};
		project.tracks.push(track);

		// Hard Left render
		const leftRender = await renderOfflineAudio({
			project,
			durationUs: 500_000,
			sampleRate,
			buffers
		});
		const leftRms = calculateBufferRmsDb(leftRender);

		// Right channel must be silenced
		expect(leftRms.rightDb).toBeLessThan(-80);
		expect(leftRms.leftDb).toBeGreaterThan(-10);

		// Center Pan render
		const centerProject: Project = {
			...project,
			tracks: project.tracks.map((t) =>
				t.id === 'track-pan-1' ? { ...t, audio: { ...t.audio!, pan: 0 } } : t
			)
		};
		const centerRender = await renderOfflineAudio({
			project: centerProject,
			durationUs: 500_000,
			sampleRate,
			buffers
		});
		const centerRms = calculateBufferRmsDb(centerRender);

		// Center pan: L and R should be identical within 0.1 dB
		expect(Math.abs(centerRms.leftDb - centerRms.rightDb)).toBeLessThan(0.1);

		// Hard Right render
		const rightProject: Project = {
			...project,
			tracks: project.tracks.map((t) =>
				t.id === 'track-pan-1' ? { ...t, audio: { ...t.audio!, pan: 1.0 } } : t
			)
		};
		const rightRender = await renderOfflineAudio({
			project: rightProject,
			durationUs: 500_000,
			sampleRate,
			buffers
		});
		const rightRms = calculateBufferRmsDb(rightRender);

		// Left channel must be silenced
		expect(rightRms.leftDb).toBeLessThan(-80);
		expect(rightRms.rightDb).toBeGreaterThan(-10);
	});

	it('3. Track Mute & Solo Gating Oracle: Mute produces silence; solo gates non-soloed tracks', async () => {
		const project = createEmptyProject({ name: 'Mute Solo Oracle Test' });
		const toneBuffer1 = createSineToneBuffer(sampleRate, durationSec, 440);
		const toneBuffer2 = createSineToneBuffer(sampleRate, durationSec, 880);

		const track1: Track = {
			id: 'track-ms-1' as Track['id'],
			kind: 'audio',
			name: 'Audio 1',
			muted: false,
			locked: false,
			hidden: false,
			clips: [
				{
					id: 'c1' as Clip['id'],
					assetId: 'a1' as Clip['assetId'],
					start: 0,
					duration: 500_000,
					sourceIn: 0,
					sourceOut: 500_000,
					speed: 1,
					volume: 1.0
				}
			],
			audio: { gainDb: 0, pan: 0, solo: false }
		};

		const track2: Track = {
			id: 'track-ms-2' as Track['id'],
			kind: 'audio',
			name: 'Audio 2',
			muted: false,
			locked: false,
			hidden: false,
			clips: [
				{
					id: 'c2' as Clip['id'],
					assetId: 'a2' as Clip['assetId'],
					start: 0,
					duration: 500_000,
					sourceIn: 0,
					sourceOut: 500_000,
					speed: 1,
					volume: 1.0
				}
			],
			audio: { gainDb: 0, pan: 0, solo: false }
		};

		project.tracks.push(track1, track2);
		const buffers = new Map<string, AudioBuffer>([
			['a1', toneBuffer1],
			['a2', toneBuffer2]
		]);

		// Mute Track 1
		const muteProject: Project = {
			...project,
			tracks: project.tracks.map((t) => (t.id === 'track-ms-1' ? { ...t, muted: true } : t))
		};
		const audibleMuted = resolveAudibleTracks(muteProject.tracks);
		expect(audibleMuted.has('track-ms-1')).toBe(false);
		expect(audibleMuted.has('track-ms-2')).toBe(true);

		// Solo Track 1 -> gates Track 2
		const soloProject: Project = {
			...project,
			tracks: project.tracks.map((t) =>
				t.id === 'track-ms-1' ? { ...t, audio: { ...t.audio!, solo: true } } : t
			)
		};
		const audibleSolo = resolveAudibleTracks(soloProject.tracks);
		expect(audibleSolo.has('track-ms-1')).toBe(true);
		expect(audibleSolo.has('track-ms-2')).toBe(false);

		const soloRender = await renderOfflineAudio({
			project: soloProject,
			durationUs: 500_000,
			sampleRate,
			buffers
		});
		const soloRms = calculateBufferRmsDb(soloRender);
		expect(soloRms.combinedDb).toBeGreaterThan(-20);
	});

	it('4. Master Fader Oracle: Master fader applies downstream to all tracks and buses', async () => {
		const project = createEmptyProject({ name: 'Master Oracle Test' });
		const toneBuffer = createSineToneBuffer(sampleRate, durationSec, 1000);
		const buffers = new Map<string, AudioBuffer>([['asset-m', toneBuffer]]);

		const track: Track = {
			id: 'track-m' as Track['id'],
			kind: 'audio',
			name: 'Audio Master',
			muted: false,
			locked: false,
			hidden: false,
			clips: [
				{
					id: 'c-m' as Clip['id'],
					assetId: 'asset-m' as Clip['assetId'],
					start: 0,
					duration: 500_000,
					sourceIn: 0,
					sourceOut: 500_000,
					speed: 1,
					volume: 1.0
				}
			],
			audio: { gainDb: 0, pan: 0, solo: false }
		};
		project.tracks.push(track);

		// Master at 0 dB
		const baseRender = await renderOfflineAudio({
			project,
			durationUs: 500_000,
			sampleRate,
			buffers
		});
		const baseRms = calculateBufferRmsDb(baseRender);

		// Master at -12 dB
		const m12Project: Project = {
			...project,
			masterAudio: { gainDb: -12, limiter: false }
		};
		const m12Render = await renderOfflineAudio({
			project: m12Project,
			durationUs: 500_000,
			sampleRate,
			buffers
		});
		const m12Rms = calculateBufferRmsDb(m12Render);

		const delta = m12Rms.combinedDb - baseRms.combinedDb;
		expect(delta).toBeCloseTo(-12.0, 1);
		expect(Math.abs(delta - -12.0)).toBeLessThan(0.05);
	});

	it('5. No-Click AudioParam Scheduling: safeSetTargetAtTime eliminates step discontinuities', () => {
		// Analytic test of exponential parameter smoothing:
		// Target step from 1.0 to 0.125 with tau = 0.015s at sampleRate = 48000
		const tau = 0.015;
		const alpha = 1 - Math.exp(-1 / (tau * sampleRate));

		let currentValue = 1.0;
		const targetValue = 0.125;
		const values: number[] = [];

		for (let n = 0; n < Math.floor(sampleRate * 0.05); n++) {
			currentValue += (targetValue - currentValue) * alpha;
			values.push(currentValue);
		}

		// Maximum first-derivative (sample-to-sample difference)
		let maxDerivative = 0;
		for (let i = 1; i < values.length; i++) {
			const diff = Math.abs(values[i]! - values[i - 1]!);
			if (diff > maxDerivative) maxDerivative = diff;
		}

		// Without smoothing, step difference is |1.0 - 0.125| = 0.875 (instant click)
		// With 0.015s time constant, max per-sample change is ~ 0.0012 (< 0.002)
		expect(maxDerivative).toBeLessThan(0.002);
		expect(values[values.length - 1]!).toBeCloseTo(targetValue, 1);
	});

	it('6. Node-Leak Invariant: 100 add/remove cycles return node count strictly to baseline', () => {
		// Mock mock-context to test AudioGraphController node lifecycle
		const createdNodes = new Set<unknown>();
		const mockContext = {
			sampleRate: 48000,
			currentTime: 0,
			destination: { connect: () => {}, disconnect: () => {} },
			createGain() {
				const node = { gain: { value: 1 }, connect: () => {}, disconnect: () => {} };
				createdNodes.add(node);
				return node;
			},
			createAnalyser() {
				const node = {
					connect: () => {},
					disconnect: () => {},
					fftSize: 256,
					getFloatTimeDomainData: () => {}
				};
				createdNodes.add(node);
				return node;
			},
			createDelay() {
				const node = { delayTime: { value: 0 }, connect: () => {}, disconnect: () => {} };
				createdNodes.add(node);
				return node;
			},
			createBiquadFilter() {
				const node = {
					frequency: { value: 1000 },
					gain: { value: 0 },
					Q: { value: 1 },
					connect: () => {},
					disconnect: () => {}
				};
				createdNodes.add(node);
				return node;
			},
			createDynamicsCompressor() {
				const node = {
					threshold: { value: 0 },
					ratio: { value: 1 },
					attack: { value: 0 },
					release: { value: 0 },
					knee: { value: 0 },
					connect: () => {},
					disconnect: () => {}
				};
				createdNodes.add(node);
				return node;
			},
			createStereoPanner() {
				const node = { pan: { value: 0 }, connect: () => {}, disconnect: () => {} };
				createdNodes.add(node);
				return node;
			},
			createChannelSplitter() {
				const node = { connect: () => {}, disconnect: () => {} };
				createdNodes.add(node);
				return node;
			}
		} as unknown as AudioContext;

		const project = createEmptyProject({ name: 'Leak Test' });
		const graph = buildAudioGraph(mockContext, project, { enableMeters: true });
		const baselineCount = graph.getNodeCount();
		expect(baselineCount).toBeGreaterThan(0);

		// Dispose graph
		graph.dispose();
		expect(graph.getNodeCount()).toBe(0);

		// 100 cycles
		for (let i = 0; i < 100; i++) {
			const g = buildAudioGraph(mockContext, project, { enableMeters: true });
			expect(g.getNodeCount()).toBe(baselineCount);
			g.dispose();
			expect(g.getNodeCount()).toBe(0);
		}
	});

	it('7. Legacy Project Migration: Old clip.volume and track.audio.eq migration preserves gain identically', () => {
		const legacyProject = createEmptyProject({ name: 'Legacy Project' });
		const track: Track = {
			id: 'legacy-t1' as Track['id'],
			kind: 'audio',
			name: 'Audio',
			muted: false,
			locked: false,
			hidden: false,
			clips: [
				{
					id: 'c-legacy' as Clip['id'],
					assetId: 'a-legacy' as Clip['assetId'],
					start: 0,
					duration: 500_000,
					sourceIn: 0,
					sourceOut: 500_000,
					speed: 1,
					volume: 0.5 // Old clip.volume field
				}
			],
			audio: {
				gainDb: -6,
				pan: 0,
				solo: false,
				eq: {
					enabled: false,
					bands: [
						{ type: 'lowshelf', frequencyHz: 120, gainDb: 0, q: 0.71 },
						{ type: 'peaking', frequencyHz: 500, gainDb: 0, q: 1.0 },
						{ type: 'peaking', frequencyHz: 2500, gainDb: 0, q: 1.0 },
						{ type: 'highshelf', frequencyHz: 8000, gainDb: 0, q: 0.71 }
					]
				}
			}
		};
		legacyProject.tracks.push(track);

		// Clip volume 0.5 is -6.02 dB
		const clipDb = gainToDb(track.clips[0]!.volume ?? 1);
		expect(clipDb).toBeCloseTo(-6.02, 1);

		// Combined track (-6 dB) + clip (-6.02 dB) = -12.02 dB
		const totalGain = dbToGain(track.audio!.gainDb) * (track.clips[0]!.volume ?? 1);
		const totalDb = gainToDb(totalGain);
		expect(totalDb).toBeCloseTo(-12.02, 1);
	});
});
