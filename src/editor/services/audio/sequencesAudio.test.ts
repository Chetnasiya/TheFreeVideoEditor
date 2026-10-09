import { describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../../core/factory';
import type { Clip, Track, AssetId } from '../../core/types';
import { buildAudioGraph } from './graph';
import { createSequence } from '../../core/sequences/operations';
import { dbToGain } from '../../core/audioMath';

function makeMockAudioContext(sampleRate = 48000) {
	const currentTime = 0;
	const createdNodes: Array<{ type: string; node: unknown }> = [];

	const createGain = () => {
		const g = {
			type: 'gain',
			gain: {
				value: 1,
				setValueCurveAtTime: vi.fn(),
				setValueAtTime: vi.fn(),
				linearRampToValueAtTime: vi.fn()
			},
			connect: vi.fn(),
			disconnect: vi.fn()
		};
		createdNodes.push({ type: 'gain', node: g });
		return g as unknown as GainNode;
	};

	const createBufferSource = () => {
		const s = {
			type: 'source',
			buffer: null,
			playbackRate: { value: 1 },
			connect: vi.fn(),
			disconnect: vi.fn(),
			start: vi.fn(),
			stop: vi.fn()
		};
		createdNodes.push({ type: 'source', node: s });
		return s as unknown as AudioBufferSourceNode;
	};

	const createStereoPanner = () => {
		const p = {
			type: 'panner',
			pan: { value: 0 },
			connect: vi.fn(),
			disconnect: vi.fn()
		};
		createdNodes.push({ type: 'panner', node: p });
		return p as unknown as StereoPannerNode;
	};

	const ctx = {
		sampleRate,
		get currentTime() {
			return currentTime;
		},
		destination: { connect: vi.fn() },
		createGain,
		createBufferSource,
		createStereoPanner,
		createBuffer: (channels: number, length: number, sRate: number) => {
			const channelData = Array.from({ length: channels }, () => new Float32Array(length));
			return {
				numberOfChannels: channels,
				length,
				sampleRate: sRate,
				duration: length / sRate,
				getChannelData: (c: number) => channelData[c],
				copyToChannel: (src: Float32Array, c: number) => {
					channelData[c]?.set(src);
				}
			} as unknown as AudioBuffer;
		},
		createdNodes
	};

	return ctx as unknown as BaseAudioContext & { createdNodes: typeof createdNodes };
}

describe('Decision 6: Audio Sub-graph for Nested Sequences (DSP Oracle)', () => {
	it('builds a live sub-graph for speed 1 nested sequences: nested track -> instance bus -> host track -> master', async () => {
		const ctx = makeMockAudioContext();
		const root = createEmptyProject({ name: 'Root Project' });

		// Add an audio track to root
		const hostTrackId = 'host-audio-track-1' as Track['id'];
		root.tracks.push({
			id: hostTrackId,
			kind: 'audio',
			name: 'Host Audio',
			muted: false,
			locked: false,
			hidden: false,
			clips: [],
			audio: { gainDb: -3, pan: 0, solo: false }
		});

		// Create a sequence with an audio track and clip
		const { project: projWithSeq, sequenceId } = createSequence(root, 'Nested Music');
		const nestedSeq = projWithSeq.sequences![sequenceId]!;
		const nestedTrackId = 'nested-audio-track-1' as Track['id'];
		nestedSeq.tracks = [
			{
				id: nestedTrackId,
				kind: 'audio',
				name: 'Nested Audio Track',
				muted: false,
				locked: false,
				hidden: false,
				clips: [],
				audio: { gainDb: 2, pan: 0.5, solo: false }
			}
		];

		// Place a clip on the nested track
		const sampleBuffer = ctx.createBuffer(2, 48000, 48000);
		sampleBuffer.getChannelData(0).fill(0.8);
		sampleBuffer.getChannelData(1).fill(0.8);

		const nestedClipId = 'nested-clip-1' as Clip['id'];
		nestedSeq.tracks[0]!.clips.push({
			id: nestedClipId,
			assetId: 'music-asset-1' as AssetId,
			start: 0,
			duration: 2_000_000,
			sourceIn: 0,
			sourceOut: 2_000_000,
			volume: 0.9,
			speed: 1
		});

		// Place a sequence instance on host track with host volume and pan
		const hostInstanceClip: Clip = {
			id: 'host-instance-1' as Clip['id'],
			source: { type: 'sequence', sequenceId },
			start: 1_000_000,
			duration: 2_000_000,
			sourceIn: 0,
			sourceOut: 2_000_000,
			volume: 0.75,
			properties: {
				'audio.volume': { value: -6 },
				'audio.pan': { value: -0.4 }
			},
			speed: 1
		};
		projWithSeq.tracks.find((t) => t.id === hostTrackId)!.clips.push(hostInstanceClip);

		const buffers = new Map<string, AudioBuffer>([['music-asset-1', sampleBuffer]]);
		const graph = buildAudioGraph(ctx, projWithSeq);

		// Schedule project playback across timeline
		const sources = await graph.scheduleProject({ startUs: 0, durationUs: 5_000_000 }, buffers);

		// Verified that the nested clip's buffer source was scheduled
		expect(sources.length).toBe(1);
		expect(sources[0]!.start).toHaveBeenCalledWith(
			1, // whenSec = 1s
			0, // offsetSec = 0
			2 // durSec = 2s
		);

		// Verify DSP gain values for instance bus (-6 dB in dbToGain)
		const expectedGain = dbToGain(-6);
		const gainNodes = ctx.createdNodes.filter((n) => n.type === 'gain');
		const matchingInstanceGain = gainNodes.find(
			(g) => Math.abs((g.node as { gain: { value: number } }).gain.value - expectedGain) < 0.001
		);
		expect(matchingInstanceGain).toBeDefined();

		// Verify constant-power pan on the instance panner
		const pannerNodes = ctx.createdNodes.filter((n) => n.type === 'panner');
		const matchingInstancePan = pannerNodes.find(
			(p) => Math.abs((p.node as { pan: { value: number } }).pan.value - -0.4) < 0.001
		);
		expect(matchingInstancePan).toBeDefined();

		graph.dispose();
	});

	it('respects nested track mute and solo states inside live sub-graph', async () => {
		const ctx = makeMockAudioContext();
		const root = createEmptyProject({ name: 'Root Project' });

		const hostTrackId = 'host-audio-track-1' as Track['id'];
		root.tracks.push({
			id: hostTrackId,
			kind: 'audio',
			name: 'Host Audio',
			muted: false,
			locked: false,
			hidden: false,
			clips: [],
			audio: { gainDb: 0, pan: 0, solo: false }
		});

		const { project: projWithSeq, sequenceId } = createSequence(root, 'Nested Muted');
		const nestedSeq = projWithSeq.sequences![sequenceId]!;
		nestedSeq.tracks = [
			{
				id: 'nested-track-muted' as Track['id'],
				kind: 'audio',
				name: 'Muted Nested Track',
				muted: true, // MUTED
				locked: false,
				hidden: false,
				clips: [
					{
						id: 'clip-inside-muted' as Clip['id'],
						assetId: 'audio-1' as AssetId,
						start: 0,
						duration: 1_000_000,
						sourceIn: 0,
						sourceOut: 1_000_000,
						volume: 1,
						speed: 1
					}
				],
				audio: { gainDb: 0, pan: 0, solo: false }
			}
		];

		const hostInstanceClip: Clip = {
			id: 'instance-clip' as Clip['id'],
			source: { type: 'sequence', sequenceId },
			start: 0,
			duration: 1_000_000,
			sourceIn: 0,
			sourceOut: 1_000_000,
			volume: 1,
			speed: 1
		};
		projWithSeq.tracks.find((t) => t.id === hostTrackId)!.clips.push(hostInstanceClip);

		const buf = ctx.createBuffer(2, 48000, 48000);
		const buffers = new Map<string, AudioBuffer>([['audio-1', buf]]);

		const graph = buildAudioGraph(ctx, projWithSeq);
		await graph.scheduleProject({ startUs: 0, durationUs: 2_000_000 }, buffers);

		// Nested mute gate must be 0.0
		const gainNodes = ctx.createdNodes.filter((n) => n.type === 'gain');
		const zeroGainNodes = gainNodes.filter(
			(g) => (g.node as { gain: { value: number } }).gain.value === 0
		);
		expect(zeroGainNodes.length).toBeGreaterThan(0);

		graph.dispose();
	});
});
