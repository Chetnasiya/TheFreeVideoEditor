import { ALL_FORMATS, AudioSample, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import type { AssetId, Project, Time } from '../../core';
import { audioSchedulesForChunk, AudioMixError } from './audioMix';
import type { getMediaFile } from '../storage/opfs';

interface DecodedSegment {
	startSeconds: number;
	sampleRate: number;
	frameCount: number;
	channels: Float32Array[];
}

interface AudioDecoderEntry {
	input: Input;
	sink: AudioSampleSink;
}

export class WorkerAudioMixer {
	private readonly decoders = new Map<AssetId, AudioDecoderEntry>();

	constructor(
		private readonly project: Project,
		private readonly getFile: typeof getMediaFile
	) {}

	async mixChunk(
		chunkStart: Time,
		chunkDuration: Time,
		sampleRate: number,
		signal?: AbortSignal
	): Promise<AudioSample | null> {
		const schedules = audioSchedulesForChunk(this.project, chunkStart, chunkDuration);
		if (schedules.length === 0) return null;
		const frameCount = Math.max(1, Math.ceil((chunkDuration * sampleRate) / 1_000_000));
		const left = new Float32Array(frameCount);
		const right = new Float32Array(frameCount);
		for (const schedule of schedules) {
			if (signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError');
			const segments = await this.decodeRange(
				schedule.assetId,
				schedule.sourceOffsetSeconds,
				schedule.sourceDurationSeconds,
				signal
			);
			this.addSchedule(
				segments,
				schedule.whenSeconds,
				schedule.sourceOffsetSeconds,
				schedule.playbackRate,
				schedule.volume,
				sampleRate,
				frameCount,
				left,
				right
			);
		}
		const data = new Float32Array(frameCount * 2);
		for (let frame = 0; frame < frameCount; frame += 1) {
			data[frame] = Math.max(-1, Math.min(1, left[frame] ?? 0));
			data[frameCount + frame] = Math.max(-1, Math.min(1, right[frame] ?? 0));
		}
		return new AudioSample({
			format: 'f32-planar',
			numberOfChannels: 2,
			numberOfFrames: frameCount,
			sampleRate,
			timestamp: chunkStart / 1_000_000,
			data
		});
	}

	async dispose(): Promise<void> {
		for (const decoder of this.decoders.values()) decoder.input.dispose();
		this.decoders.clear();
	}

	private async decodeRange(
		assetId: AssetId,
		startSeconds: number,
		durationSeconds: number,
		signal?: AbortSignal
	): Promise<DecodedSegment[]> {
		const asset = this.project.assets[assetId];
		if (!asset) throw new Error(`Project asset “${assetId}” is missing.`);
		try {
			const decoder = await this.getDecoder(assetId);
			const segments: DecodedSegment[] = [];
			for await (const sample of decoder.sink.samples(
				startSeconds,
				startSeconds + durationSeconds
			)) {
				try {
					if (signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError');
					const channels = Array.from({ length: sample.numberOfChannels }, () => {
						const plane = new Float32Array(sample.numberOfFrames);
						return plane;
					});
					for (let channel = 0; channel < channels.length; channel += 1) {
						const plane = channels[channel];
						if (!plane) continue;
						sample.copyTo(plane, { planeIndex: channel, format: 'f32-planar' });
					}
					segments.push({
						startSeconds: sample.timestamp,
						sampleRate: sample.sampleRate,
						frameCount: sample.numberOfFrames,
						channels
					});
				} finally {
					sample.close();
				}
			}
			return segments;
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') throw error;
			throw new AudioMixError(assetId, asset.name, error);
		}
	}

	private async getDecoder(assetId: AssetId): Promise<AudioDecoderEntry> {
		const existing = this.decoders.get(assetId);
		if (existing) return existing;
		const asset = this.project.assets[assetId];
		if (!asset) throw new Error(`Project asset “${assetId}” is missing.`);
		const file = await this.getFile(this.project.id, asset);
		const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
		try {
			const track = await input.getPrimaryAudioTrack();
			if (!track) throw new Error('The asset has no decodable audio track.');
			const entry = { input, sink: new AudioSampleSink(track) };
			this.decoders.set(assetId, entry);
			return entry;
		} catch (error) {
			input.dispose();
			throw error;
		}
	}

	private addSchedule(
		segments: readonly DecodedSegment[],
		whenSeconds: number,
		sourceOffsetSeconds: number,
		playbackRate: number,
		volume: number,
		outputSampleRate: number,
		outputFrameCount: number,
		left: Float32Array,
		right: Float32Array
	): void {
		let segmentIndex = 0;
		const firstFrame = Math.max(0, Math.floor(whenSeconds * outputSampleRate));
		for (let frame = firstFrame; frame < outputFrameCount; frame += 1) {
			const timelineSeconds = frame / outputSampleRate;
			const sourceSeconds =
				sourceOffsetSeconds + Math.max(0, timelineSeconds - whenSeconds) * playbackRate;
			while (
				segmentIndex < segments.length &&
				sourceSeconds >=
					(segments[segmentIndex]?.startSeconds ?? Number.POSITIVE_INFINITY) +
						(segments[segmentIndex]?.frameCount ?? 0) / (segments[segmentIndex]?.sampleRate ?? 1)
			) {
				segmentIndex += 1;
			}
			const segment = segments[segmentIndex];
			if (
				!segment ||
				sourceSeconds < segment.startSeconds ||
				sourceSeconds >= segment.startSeconds + segment.frameCount / segment.sampleRate
			) {
				continue;
			}
			const sourcePosition = (sourceSeconds - segment.startSeconds) * segment.sampleRate;
			const sourceFrame = Math.floor(sourcePosition);
			const fraction = sourcePosition - sourceFrame;
			const firstLeft = segment.channels[0]?.[sourceFrame] ?? 0;
			const nextLeft =
				segment.channels[0]?.[Math.min(sourceFrame + 1, segment.frameCount - 1)] ?? 0;
			const firstRight =
				segment.channels[1]?.[sourceFrame] ?? segment.channels[0]?.[sourceFrame] ?? 0;
			const nextRight =
				segment.channels[1]?.[Math.min(sourceFrame + 1, segment.frameCount - 1)] ??
				segment.channels[0]?.[Math.min(sourceFrame + 1, segment.frameCount - 1)] ??
				0;
			const destinationFrame = Math.min(outputFrameCount - 1, frame);
			left[destinationFrame] =
				(left[destinationFrame] ?? 0) + (firstLeft + (nextLeft - firstLeft) * fraction) * volume;
			right[destinationFrame] =
				(right[destinationFrame] ?? 0) +
				(firstRight + (nextRight - firstRight) * fraction) * volume;
		}
	}
}
