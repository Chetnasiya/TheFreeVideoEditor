import type { Project, Time } from '../../core/types';
import { buildAudioGraph } from './graph';

export interface RenderOfflineAudioOptions {
	project: Project;
	startUs?: Time;
	durationUs?: Time;
	sampleRate?: number;
	buffers?: ReadonlyMap<string, AudioBuffer>;
	onProgress?: (ratio: number) => void;
}

// 256 MB buffer cap (~11 minutes of 48 kHz stereo 32-bit float audio: 48000 * 2 * 4 bytes/sec = 384 KB/sec -> 256 MB is ~666 sec ≈ 11.1 min)
const MAX_SINGLE_PASS_FRAMES = 32 * 1024 * 1024; // 32M frames = 256 MB in stereo f32

export async function renderOfflineAudio(options: RenderOfflineAudioOptions): Promise<AudioBuffer> {
	const { project, startUs = 0, durationUs = 10_000_000, buffers } = options;
	const sampleRate = options.sampleRate ?? project.settings.sampleRate ?? 48000;
	const totalFrames = Math.max(1, Math.ceil((durationUs * sampleRate) / 1_000_000));

	if (totalFrames <= MAX_SINGLE_PASS_FRAMES) {
		const ctx = new OfflineAudioContext(2, totalFrames, sampleRate);
		const graph = buildAudioGraph(ctx, project);
		await graph.scheduleProject({ startUs, durationUs }, buffers);
		const rendered = await ctx.startRendering();
		graph.dispose();
		options.onProgress?.(1.0);
		return rendered;
	}

	// Chunked rendering with >= 1s pre-roll for tracks over 256 MB
	const chunkFrames = 16 * 1024 * 1024; // ~16M frames per chunk
	const preRollFrames = sampleRate; // 1 second pre-roll
	const resultBuffer = new AudioBuffer({
		numberOfChannels: 2,
		length: totalFrames,
		sampleRate
	});

	let frameOffset = 0;
	while (frameOffset < totalFrames) {
		const currentChunkFrames = Math.min(chunkFrames, totalFrames - frameOffset);
		const hasPreRoll = frameOffset > 0;
		const actualPreRoll = hasPreRoll ? Math.min(frameOffset, preRollFrames) : 0;

		const chunkStartFrame = frameOffset - actualPreRoll;
		const chunkTotalFrames = currentChunkFrames + actualPreRoll;

		const chunkStartUs = startUs + Math.round((chunkStartFrame * 1_000_000) / sampleRate);
		const chunkDurationUs = Math.round((chunkTotalFrames * 1_000_000) / sampleRate);

		const ctx = new OfflineAudioContext(2, chunkTotalFrames, sampleRate);
		const graph = buildAudioGraph(ctx, project);
		await graph.scheduleProject({ startUs: chunkStartUs, durationUs: chunkDurationUs }, buffers);

		const renderedChunk = await ctx.startRendering();
		graph.dispose();

		// Copy without pre-roll into output buffer
		for (let c = 0; c < 2; c++) {
			const srcData = renderedChunk
				.getChannelData(c)
				.subarray(actualPreRoll, actualPreRoll + currentChunkFrames);
			const dstData = resultBuffer.getChannelData(c);
			dstData.set(srcData, frameOffset);
		}

		frameOffset += currentChunkFrames;
		options.onProgress?.(frameOffset / totalFrames);
	}

	return resultBuffer;
}
