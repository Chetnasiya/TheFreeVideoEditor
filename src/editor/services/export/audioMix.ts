import type { Clip, Project, Time } from '../../core';
import { clipEnd } from '../../core';
import type { AssetId } from '../../core';
import { getMediaFile } from '../storage/opfs';
import { transitionWindow, transitionGain } from '../../core/transitions';
import { renderRemappedAudio } from '../audio/renderRemappedAudio';

export interface AudioClipSchedule {
	clipId: Clip['id'];
	assetId: AssetId;
	whenSeconds: number;
	sourceOffsetSeconds: number;
	sourceDurationSeconds: number;
	playbackRate: number;
	volume: number;
}

export class AudioMixError extends Error {
	readonly assetId: AssetId;

	constructor(assetId: AssetId, assetName: string, cause: unknown) {
		super(`Could not decode audio from “${assetName}” for export.`, { cause });
		this.name = 'AudioMixError';
		this.assetId = assetId;
	}
}

import { resolveAudibleTracks, clipGainAt } from '../../core/audioMath';

export function audioSchedulesForChunk(
	project: Project,
	chunkStart: Time,
	chunkDuration: Time
): AudioClipSchedule[] {
	const chunkEnd = chunkStart + chunkDuration;
	const result: AudioClipSchedule[] = [];
	const audibleTracks = resolveAudibleTracks(project.tracks);

	for (const track of project.tracks) {
		if (track.kind !== 'audio' || !audibleTracks.has(track.id)) continue;
		for (const clip of track.clips) {
			if (!clip.assetId) continue;
			const asset = project.assets[clip.assetId];
			if (!asset?.hasAudio || asset.offline) continue;
			const overlapStart = Math.max(chunkStart, clip.start);
			const overlapEnd = Math.min(chunkEnd, clipEnd(clip));
			if (overlapEnd <= overlapStart) continue;
			const timelineDuration = overlapEnd - overlapStart;
			const sourceOffset = clip.sourceIn + (overlapStart - clip.start) * clip.speed;
			const sourceDuration = clip.timeRemap
				? timelineDuration * Math.abs(clip.speed || 1)
				: Math.min(timelineDuration * clip.speed, Math.max(0, clip.sourceOut - sourceOffset));
			if (sourceDuration <= 0 && !clip.timeRemap) continue;
			const midPoint = overlapStart + Math.floor(timelineDuration / 2);
			let effectiveVolume = clipGainAt(clip, midPoint);
			const activeTrans = (track.transitions ?? []).find((tr) => {
				let cutTime = 0;
				const edge = tr.edge;
				if (edge.kind === 'cut') {
					const cA = track.clips.find((c) => c.id === edge.fromClipId);
					if (cA) cutTime = clipEnd(cA);
				} else if (edge.kind === 'head') {
					const c = track.clips.find((c) => c.id === edge.clipId);
					if (c) cutTime = c.start;
				} else {
					const c = track.clips.find((c) => c.id === edge.clipId);
					if (c) cutTime = clipEnd(c);
				}
				const win = transitionWindow(cutTime, tr.duration, tr.alignment);
				return midPoint >= win.start && midPoint < win.end;
			});

			if (activeTrans) {
				let cutTime = 0;
				let isClipA = false;
				let isClipB = false;
				const edge = activeTrans.edge;
				if (edge.kind === 'cut') {
					if (clip.id === edge.fromClipId) isClipA = true;
					if (clip.id === edge.toClipId) isClipB = true;
					const cA = track.clips.find((c) => c.id === edge.fromClipId);
					if (cA) cutTime = clipEnd(cA);
				} else if (edge.kind === 'head' && clip.id === edge.clipId) {
					isClipB = true;
					cutTime = clip.start;
				} else if (edge.kind === 'tail' && clip.id === edge.clipId) {
					isClipA = true;
					cutTime = clipEnd(clip);
				}

				if (isClipA || isClipB) {
					const win = transitionWindow(cutTime, activeTrans.duration, activeTrans.alignment);
					const { gainA, gainB } = transitionGain(midPoint, win, 'equalPower');
					effectiveVolume = effectiveVolume * (isClipA ? gainA : gainB);
				}
			}

			result.push({
				clipId: clip.id,
				assetId: asset.id,
				whenSeconds: (overlapStart - chunkStart) / 1_000_000,
				sourceOffsetSeconds: sourceOffset / 1_000_000,
				sourceDurationSeconds: sourceDuration / 1_000_000,
				playbackRate: clip.speed,
				volume: effectiveVolume
			});
		}
	}
	return result;
}

export async function decodeAudioAssets(
	project: Project,
	audioContext: Pick<AudioContext, 'decodeAudioData'>,
	getFile: typeof getMediaFile = getMediaFile,
	onWarning?: (message: string) => void
): Promise<Map<AssetId, AudioBuffer>> {
	const buffers = new Map<AssetId, AudioBuffer>();
	const scheduledAssetIds = new Set(
		project.tracks
			.filter((track) => track.kind === 'audio' && !track.muted)
			.flatMap((track) => track.clips.flatMap((clip) => (clip.assetId ? [clip.assetId] : [])))
	);
	for (const asset of Object.values(project.assets)) {
		if (
			asset.kind === 'image' ||
			!asset.hasAudio ||
			asset.offline ||
			!scheduledAssetIds.has(asset.id)
		) {
			continue;
		}
		if (asset.audioDecodable === false) {
			onWarning?.(`Audio from “${asset.name}” was skipped: its codec is not decodable.`);
			continue;
		}
		try {
			const file = await getFile(project.id, asset);
			buffers.set(asset.id, await audioContext.decodeAudioData(await file.arrayBuffer()));
		} catch (error) {
			const failure = new AudioMixError(asset.id, asset.name, error);
			onWarning?.(
				`Audio from “${asset.name}” was skipped: ${failure.message} Video export will continue.`
			);
		}
	}
	return buffers;
}

export async function mixAudioChunk(
	project: Project,
	chunkStart: Time,
	chunkDuration: Time,
	buffers: ReadonlyMap<AssetId, AudioBuffer>,
	sampleRate = project.settings.sampleRate
): Promise<AudioBuffer> {
	if (!Number.isSafeInteger(chunkStart) || chunkStart < 0) {
		throw new RangeError('Audio chunk start must be a non-negative integer time.');
	}
	if (!Number.isSafeInteger(chunkDuration) || chunkDuration <= 0) {
		throw new RangeError('Audio chunk duration must be a positive integer time.');
	}
	const frameCount = Math.max(1, Math.ceil((chunkDuration * sampleRate) / 1_000_000));
	const context = new OfflineAudioContext(2, frameCount, sampleRate);
	for (const schedule of audioSchedulesForChunk(project, chunkStart, chunkDuration)) {
		const buffer = buffers.get(schedule.assetId);
		if (!buffer) continue;
		const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === schedule.clipId);

		if (clip && (clip.timeRemap || clip.speed !== 1 || clip.maintainPitch !== undefined)) {
			const sourceChannels: Float32Array[] = [];
			for (let c = 0; c < buffer.numberOfChannels; c++) {
				sourceChannels.push(buffer.getChannelData(c));
			}

			const overlapStartTicks = chunkStart + Math.round(schedule.whenSeconds * 1_000_000);
			const overlapDurationTicks = Math.round(
				(schedule.sourceDurationSeconds / Math.max(0.0001, Math.abs(schedule.playbackRate))) *
					1_000_000
			);

			const remapped = renderRemappedAudio({
				clip,
				sourceChannels,
				sourceSampleRate: buffer.sampleRate,
				timelineStartTicks: Math.max(0, overlapStartTicks - clip.start),
				timelineDurationTicks: overlapDurationTicks
			});

			const numChannels = remapped.channels.length;
			const numSamples = remapped.channels[0]?.length ?? 0;
			if (numSamples > 0) {
				const remappedBuffer = context.createBuffer(numChannels, numSamples, remapped.sampleRate);
				for (let c = 0; c < numChannels; c++) {
					remappedBuffer.copyToChannel(
						remapped.channels[c] as unknown as Float32Array<ArrayBuffer>,
						c
					);
				}

				const source = context.createBufferSource();
				source.buffer = remappedBuffer;
				const gain = context.createGain();
				gain.gain.value = schedule.volume;
				source.connect(gain).connect(context.destination);
				source.start(schedule.whenSeconds);
			}
			continue;
		}

		const source = context.createBufferSource();
		source.buffer = buffer;
		source.playbackRate.value = schedule.playbackRate;
		const gain = context.createGain();
		gain.gain.value = schedule.volume;
		source.connect(gain).connect(context.destination);
		const maxOffset = Math.max(0, buffer.duration - 1 / buffer.sampleRate);
		const sourceOffset = Math.min(schedule.sourceOffsetSeconds, maxOffset);
		const sourceDuration = Math.min(
			schedule.sourceDurationSeconds,
			Math.max(0, buffer.duration - sourceOffset)
		);
		if (sourceDuration <= 0) continue;
		const endSeconds = Math.min(
			chunkDuration / 1_000_000,
			schedule.whenSeconds + sourceDuration / schedule.playbackRate
		);
		if (endSeconds <= schedule.whenSeconds) continue;
		source.start(
			schedule.whenSeconds,
			sourceOffset,
			(endSeconds - schedule.whenSeconds) * schedule.playbackRate
		);
	}
	return context.startRendering();
}
