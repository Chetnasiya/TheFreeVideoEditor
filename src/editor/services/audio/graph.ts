import type { Clip, Project, Track, TrackAudio } from '../../core/types';
import { dbToGain, resolveAudibleTracks, fadeGain } from '../../core/audioMath';
import { renderRemappedAudio } from './renderRemappedAudio';
import { defaultAudioDecodeCache } from './decode';

export interface AudioGraphMeterNodes {
	analyserL: AnalyserNode;
	analyserR: AnalyserNode;
}

export interface TrackAudioNodes {
	input: GainNode;
	eqNodes?: BiquadFilterNode[];
	compressorNode?: DynamicsCompressorNode;
	faderGain: GainNode;
	panPanner?: StereoPannerNode;
	splitter?: ChannelSplitterNode;
	panGainL?: GainNode;
	panGainR?: GainNode;
	merger?: ChannelMergerNode;
	muteGain: GainNode;
	meters?: AudioGraphMeterNodes;
	output: GainNode;
}

export interface MasterAudioNodes {
	input: GainNode;
	faderGain: GainNode;
	limiterNode?: DynamicsCompressorNode;
	meters?: AudioGraphMeterNodes;
	output: GainNode;
}

export interface BuiltAudioGraph {
	trackNodes: Map<string, TrackAudioNodes>;
	masterNodes: MasterAudioNodes;
	scheduleClip: (
		clip: Clip,
		track: Track,
		whenSeconds: number,
		offsetSeconds: number,
		durationSeconds: number,
		buffer?: AudioBuffer
	) => AudioBufferSourceNode | null;
	scheduleProject: (
		timeRange?: { startUs: number; durationUs: number },
		buffers?: ReadonlyMap<string, AudioBuffer>
	) => Promise<AudioBufferSourceNode[]>;
	getTrackMeterLevels: (trackId: string) => {
		peakL: number;
		peakR: number;
		rmsL: number;
		rmsR: number;
	};
	getMasterMeterLevels: () => { peakL: number; peakR: number; rmsL: number; rmsR: number };
	updateTrackParams: (trackId: string, audio: TrackAudio, audible: boolean) => void;
	updateMasterParams: (gainDb: number, limiter: boolean) => void;
	dispose: () => void;
}

export interface BuildAudioGraphOptions {
	enableMeters?: boolean;
	destination?: AudioNode;
}

function createMeterPair(ctx: BaseAudioContext): AudioGraphMeterNodes {
	const analyserL = ctx.createAnalyser();
	const analyserR = ctx.createAnalyser();
	analyserL.fftSize = 256;
	analyserR.fftSize = 256;
	analyserL.smoothingTimeConstant = 0.5;
	analyserR.smoothingTimeConstant = 0.5;
	return { analyserL, analyserR };
}

function calculateMeterLevels(analyser: AnalyserNode): { peak: number; rms: number } {
	const buffer = new Float32Array(analyser.fftSize);
	analyser.getFloatTimeDomainData(buffer);
	let peak = 0;
	let sumSq = 0;
	for (let i = 0; i < buffer.length; i++) {
		const abs = Math.abs(buffer[i] ?? 0);
		if (abs > peak) peak = abs;
		sumSq += (buffer[i] ?? 0) * (buffer[i] ?? 0);
	}
	const rms = Math.sqrt(sumSq / buffer.length);
	return { peak, rms };
}

export function buildAudioGraph(
	ctx: BaseAudioContext,
	project: Project,
	options: BuildAudioGraphOptions = {}
): BuiltAudioGraph {
	const enableMeters = options.enableMeters ?? false;
	const destination = options.destination ?? ctx.destination;

	// Master Chain
	const masterInput = ctx.createGain();
	const masterFader = ctx.createGain();
	const masterDb = project.masterAudio?.gainDb ?? 0;
	masterFader.gain.value = dbToGain(masterDb);

	let masterLimiter: DynamicsCompressorNode | undefined;
	if (project.masterAudio?.limiter) {
		masterLimiter = ctx.createDynamicsCompressor();
		masterLimiter.threshold.value = -0.5;
		masterLimiter.knee.value = 0;
		masterLimiter.ratio.value = 20;
		masterLimiter.attack.value = 0.001;
		masterLimiter.release.value = 0.05;
	}

	const masterOutput = ctx.createGain();
	let masterMeters: AudioGraphMeterNodes | undefined;

	masterInput.connect(masterFader);
	let currentMasterTail: AudioNode = masterFader;
	if (masterLimiter) {
		currentMasterTail.connect(masterLimiter);
		currentMasterTail = masterLimiter;
	}

	if (enableMeters) {
		masterMeters = createMeterPair(ctx);
		const splitter = ctx.createChannelSplitter(2);
		currentMasterTail.connect(splitter);
		splitter.connect(masterMeters.analyserL, 0);
		splitter.connect(masterMeters.analyserR, 1);
	}

	currentMasterTail.connect(masterOutput);
	masterOutput.connect(destination);

	const masterNodes: MasterAudioNodes = {
		input: masterInput,
		faderGain: masterFader,
		limiterNode: masterLimiter,
		meters: masterMeters,
		output: masterOutput
	};

	// Track Chains
	const trackNodes = new Map<string, TrackAudioNodes>();
	const audibleTracks = resolveAudibleTracks(project.tracks);

	for (const track of project.tracks) {
		if (track.kind !== 'audio') continue;

		const tAudio = track.audio ?? { gainDb: 0, pan: 0, solo: false };
		const trackIn = ctx.createGain();
		let trackTail: AudioNode = trackIn;

		// 1. EQ
		let eqFilters: BiquadFilterNode[] | undefined;
		if (tAudio.eq?.enabled) {
			eqFilters = tAudio.eq.bands.map((band) => {
				const filter = ctx.createBiquadFilter();
				filter.type = band.type;
				filter.frequency.value = band.frequencyHz;
				filter.gain.value = band.gainDb;
				filter.Q.value = band.q;
				return filter;
			});
			for (const f of eqFilters) {
				trackTail.connect(f);
				trackTail = f;
			}
		}

		// 2. Compressor
		let compNode: DynamicsCompressorNode | undefined;
		if (tAudio.compressor?.enabled) {
			compNode = ctx.createDynamicsCompressor();
			compNode.threshold.value = tAudio.compressor.thresholdDb;
			compNode.ratio.value = tAudio.compressor.ratio;
			compNode.attack.value = tAudio.compressor.attackMs / 1000;
			compNode.release.value = tAudio.compressor.releaseMs / 1000;
			compNode.knee.value = tAudio.compressor.kneeDb;
			trackTail.connect(compNode);
			trackTail = compNode;
		}

		// 3. Track Gain
		const fader = ctx.createGain();
		fader.gain.value = dbToGain(tAudio.gainDb);
		trackTail.connect(fader);
		trackTail = fader;

		// 4. Track Pan (using StereoPannerNode or splitter/merger fallback)
		let panner: StereoPannerNode | undefined;
		if (typeof ctx.createStereoPanner === 'function') {
			panner = ctx.createStereoPanner();
			panner.pan.value = tAudio.pan;
			trackTail.connect(panner);
			trackTail = panner;
		}

		// 5. Mute/Solo Gate
		const muteGain = ctx.createGain();
		const isAudible = audibleTracks.has(track.id);
		muteGain.gain.value = isAudible ? 1.0 : 0.0;
		trackTail.connect(muteGain);
		trackTail = muteGain;

		// 6. Track Meters
		let trackMeters: AudioGraphMeterNodes | undefined;
		if (enableMeters) {
			trackMeters = createMeterPair(ctx);
			const splitter = ctx.createChannelSplitter(2);
			trackTail.connect(splitter);
			splitter.connect(trackMeters.analyserL, 0);
			splitter.connect(trackMeters.analyserR, 1);
		}

		// 7. Track Output -> Master Input
		const trackOut = ctx.createGain();
		trackTail.connect(trackOut);
		trackOut.connect(masterInput);

		trackNodes.set(track.id, {
			input: trackIn,
			eqNodes: eqFilters,
			compressorNode: compNode,
			faderGain: fader,
			panPanner: panner,
			muteGain,
			meters: trackMeters,
			output: trackOut
		});
	}

	const activeSources: AudioBufferSourceNode[] = [];

	const scheduleClip = (
		clip: Clip,
		track: Track,
		whenSeconds: number,
		offsetSeconds: number,
		durationSeconds: number,
		buffer?: AudioBuffer
	): AudioBufferSourceNode | null => {
		const tNode = trackNodes.get(track.id);
		if (!tNode || !buffer) return null;

		let playBuffer = buffer;
		let playRate = clip.speed ?? 1;

		// Remapped or reverse audio
		if (clip.timeRemap || clip.speed !== 1 || clip.maintainPitch !== undefined) {
			const sourceChannels: Float32Array[] = [];
			for (let c = 0; c < buffer.numberOfChannels; c++) {
				sourceChannels.push(buffer.getChannelData(c));
			}
			const remapped = renderRemappedAudio({
				clip,
				sourceChannels,
				sourceSampleRate: buffer.sampleRate,
				timelineStartTicks: Math.max(0, offsetSeconds * 1_000_000),
				timelineDurationTicks: Math.max(1, durationSeconds * 1_000_000)
			});
			if (remapped.channels[0]?.length) {
				const numChan = remapped.channels.length;
				playBuffer = ctx.createBuffer(numChan, remapped.channels[0].length, remapped.sampleRate);
				for (let c = 0; c < numChan; c++) {
					playBuffer.copyToChannel(remapped.channels[c] as unknown as Float32Array<ArrayBuffer>, c);
				}
				playRate = 1.0;
				offsetSeconds = 0;
			}
		}

		// Clip-level chain: source -> clipGain -> clipPan -> trackInput
		const source = ctx.createBufferSource();
		source.buffer = playBuffer;
		source.playbackRate.value = playRate;

		const clipGain = ctx.createGain();
		const volProp = clip.properties?.['audio.volume'];
		const volDb = volProp && 'value' in volProp ? Number(volProp.value) || 0 : 0;
		const baseGain = volProp ? dbToGain(volDb) : (clip.volume ?? 1);
		clipGain.gain.value = baseGain;

		// Fade automation if present
		if (clip.fadeInUs || clip.fadeOutUs) {
			const fadeCurve = clip.fadeCurve ?? 'equalPower';
			const steps = 32;
			const gainValues = new Float32Array(steps);
			for (let i = 0; i < steps; i++) {
				const relTimeTicks = (i / (steps - 1)) * clip.duration;
				gainValues[i] =
					baseGain *
					fadeGain(relTimeTicks, clip.duration, clip.fadeInUs ?? 0, clip.fadeOutUs ?? 0, fadeCurve);
			}
			clipGain.gain.setValueCurveAtTime(gainValues, whenSeconds, durationSeconds);
		}

		let clipTail: AudioNode = clipGain;
		if (typeof ctx.createStereoPanner === 'function') {
			const clipPanner = ctx.createStereoPanner();
			const panProp = clip.properties?.['audio.pan'];
			const panVal = panProp && 'value' in panProp ? Number(panProp.value) || 0 : 0;
			clipPanner.pan.value = panVal;
			clipGain.connect(clipPanner);
			clipTail = clipPanner;
		}

		source.connect(clipGain);
		clipTail.connect(tNode.input);

		source.start(whenSeconds, offsetSeconds, durationSeconds);
		activeSources.push(source);
		return source;
	};

	const scheduleProject = async (
		timeRange?: { startUs: number; durationUs: number },
		providedBuffers?: ReadonlyMap<string, AudioBuffer>
	): Promise<AudioBufferSourceNode[]> => {
		const startUs = timeRange?.startUs ?? 0;
		const durationUs = timeRange?.durationUs ?? 100_000_000;
		const endUs = startUs + durationUs;
		const sources: AudioBufferSourceNode[] = [];

		for (const track of project.tracks) {
			if (track.kind !== 'audio') continue;
			for (const clip of track.clips) {
				if (!clip.assetId) continue;
				const clipEndUs = clip.start + clip.duration;
				if (clipEndUs <= startUs || clip.start >= endUs) continue;

				let buffer = providedBuffers?.get(clip.assetId);
				const ctxWithDecode = ctx as unknown as {
					decodeAudioData?: (b: ArrayBuffer) => Promise<AudioBuffer>;
				};
				if (!buffer && typeof ctxWithDecode.decodeAudioData === 'function') {
					buffer =
						(await defaultAudioDecodeCache.getOrDecode(
							clip.assetId,
							project,
							ctxWithDecode as Pick<AudioContext, 'decodeAudioData'>
						)) ?? undefined;
				}
				if (!buffer) continue;

				const overlapStartUs = Math.max(startUs, clip.start);
				const overlapEndUs = Math.min(endUs, clipEndUs);
				const overlapDurUs = overlapEndUs - overlapStartUs;

				const whenSec = (overlapStartUs - startUs) / 1_000_000;
				const offsetSec =
					(clip.sourceIn + (overlapStartUs - clip.start) * (clip.speed || 1)) / 1_000_000;
				const durSec = overlapDurUs / 1_000_000;

				const srcNode = scheduleClip(clip, track, whenSec, offsetSec, durSec, buffer);
				if (srcNode) sources.push(srcNode);
			}
		}
		return sources;
	};

	const getTrackMeterLevels = (trackId: string) => {
		const node = trackNodes.get(trackId);
		if (!node?.meters) return { peakL: 0, peakR: 0, rmsL: 0, rmsR: 0 };
		const l = calculateMeterLevels(node.meters.analyserL);
		const r = calculateMeterLevels(node.meters.analyserR);
		return { peakL: l.peak, peakR: r.peak, rmsL: l.rms, rmsR: r.rms };
	};

	const getMasterMeterLevels = () => {
		if (!masterNodes.meters) return { peakL: 0, peakR: 0, rmsL: 0, rmsR: 0 };
		const l = calculateMeterLevels(masterNodes.meters.analyserL);
		const r = calculateMeterLevels(masterNodes.meters.analyserR);
		return { peakL: l.peak, peakR: r.peak, rmsL: l.rms, rmsR: r.rms };
	};

	const updateTrackParams = (trackId: string, audio: TrackAudio, audible: boolean) => {
		const node = trackNodes.get(trackId);
		if (!node) return;
		node.faderGain.gain.value = dbToGain(audio.gainDb);
		if (node.panPanner) {
			node.panPanner.pan.value = audio.pan;
		}
		node.muteGain.gain.value = audible ? 1.0 : 0.0;
	};

	const updateMasterParams = (gainDb: number, limiter?: boolean) => {
		masterNodes.faderGain.gain.value = dbToGain(gainDb);
		if (masterNodes.limiterNode && limiter !== undefined) {
			masterNodes.limiterNode.threshold.value = limiter ? -0.5 : 0;
		}
	};

	const dispose = () => {
		for (const src of activeSources) {
			try {
				src.stop();
				src.disconnect();
			} catch {}
		}
		activeSources.length = 0;
		for (const tNode of trackNodes.values()) {
			tNode.input.disconnect();
			tNode.faderGain.disconnect();
			tNode.output.disconnect();
		}
		trackNodes.clear();
		masterInput.disconnect();
		masterFader.disconnect();
		masterOutput.disconnect();
	};

	return {
		trackNodes,
		masterNodes,
		scheduleClip,
		scheduleProject,
		getTrackMeterLevels,
		getMasterMeterLevels,
		updateTrackParams,
		updateMasterParams,
		dispose
	};
}
