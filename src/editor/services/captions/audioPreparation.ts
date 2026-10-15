import type { Project, Time } from '../../core/types';
import { renderOfflineAudio } from '../audio/offlineRender';
import { getMediaFile } from '../storage/opfs';

export interface PreparedAudioForStt {
	samples: Float32Array; // 16kHz mono PCM Float32 [-1.0, 1.0]
	sampleRate: 16000;
	durationUs: Time;
	startOffsetUs: Time;
}

/**
 * Resamples an AudioBuffer to 16,000 Hz single-channel mono Float32Array suitable for Whisper STT models.
 */
export async function resampleTo16kMono(buffer: AudioBuffer): Promise<Float32Array> {
	const targetSampleRate = 16000;
	const durationSeconds = buffer.duration;
	const targetLength = Math.max(1, Math.round(durationSeconds * targetSampleRate));

	const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);
	const source = offlineCtx.createBufferSource();
	source.buffer = buffer;
	source.connect(offlineCtx.destination);
	source.start(0);

	const resampled = await offlineCtx.startRendering();
	return resampled.getChannelData(0);
}

/**
 * Extracts and mixes audio from either the whole project timeline, a specific track, selected clips, or in/out range,
 * producing 16kHz mono Float32 PCM samples with exact microsecond mapping.
 */
export async function prepareProjectAudioForStt(
	project: Project,
	options: {
		trackId?: string;
		trackIds?: string[];
		clipIds?: string[];
		range?: { start: Time; end: Time };
		onProgress?: (progress: number) => void;
	} = {}
): Promise<PreparedAudioForStt> {
	// Pre-load audio buffers for project assets
	const buffers = new Map<string, AudioBuffer>();
	const audioCtx = new AudioContext();
	try {
		for (const asset of Object.values(project.assets)) {
			if (asset.hasAudio && !asset.offline && asset.audioDecodable !== false) {
				try {
					const file = await getMediaFile(project.id, asset);
					const arrayBuf = await file.arrayBuffer();
					const decoded = await audioCtx.decodeAudioData(arrayBuf);
					buffers.set(asset.id, decoded);
				} catch {
					// Ignore single asset decode failures
				}
			}
		}
	} finally {
		void audioCtx.close();
	}

	// Determine range of timeline to mix
	let startUs = options.range ? Math.max(0, options.range.start) : 0;
	let endUs = options.range ? options.range.end : 0;

	if (!options.range) {
		endUs = project.tracks.reduce((max, track) => {
			if (options.trackId && track.id !== options.trackId) return max;
			const trackEnd = track.clips.reduce((cMax, c) => {
				if (options.clipIds && !options.clipIds.includes(c.id)) return cMax;
				return Math.max(cMax, c.start + c.duration);
			}, 0);
			return Math.max(max, trackEnd);
		}, 0);

		if (options.clipIds && options.clipIds.length > 0) {
			const matchingClips = project.tracks
				.flatMap((t) => t.clips)
				.filter((c) => options.clipIds!.includes(c.id));
			if (matchingClips.length > 0) {
				startUs = Math.min(...matchingClips.map((c) => c.start));
				endUs = Math.max(...matchingClips.map((c) => c.start + c.duration));
			}
		}
	}

	const durationUs = endUs - startUs;
	if (durationUs <= 0) {
		return {
			samples: new Float32Array(0),
			sampleRate: 16000,
			durationUs: 0,
			startOffsetUs: 0
		};
	}

	// Filter project by track or clip selection if provided
	let projectToRender: Project = project;
	if (options.trackId || (options.trackIds && options.trackIds.length > 0) || options.clipIds) {
		const allowedTracks =
			options.trackIds && options.trackIds.length > 0
				? new Set(options.trackIds)
				: options.trackId
					? new Set([options.trackId])
					: null;
		projectToRender = {
			...project,
			tracks: project.tracks
				.filter((t) => !allowedTracks || allowedTracks.has(t.id))
				.map((t) => ({
					...t,
					clips: options.clipIds ? t.clips.filter((c) => options.clipIds!.includes(c.id)) : t.clips
				}))
		};
	}

	// Render project audio mix offline at 16kHz directly
	const renderedBuffer = await renderOfflineAudio({
		project: projectToRender,
		startUs,
		durationUs,
		sampleRate: 16000,
		buffers,
		onProgress(ratio) {
			options.onProgress?.(ratio);
		}
	});

	// Convert stereo/multi-channel to mono Float32Array
	const numChannels = renderedBuffer.numberOfChannels;
	const numSamples = renderedBuffer.length;
	const monoSamples = new Float32Array(numSamples);

	if (numChannels === 1) {
		monoSamples.set(renderedBuffer.getChannelData(0));
	} else {
		const ch0 = renderedBuffer.getChannelData(0);
		const ch1 = renderedBuffer.getChannelData(1);
		for (let i = 0; i < numSamples; i++) {
			monoSamples[i] = ((ch0[i] ?? 0) + (ch1[i] ?? 0)) * 0.5;
		}
	}

	return {
		samples: monoSamples,
		sampleRate: 16000,
		durationUs,
		startOffsetUs: startUs
	};
}
