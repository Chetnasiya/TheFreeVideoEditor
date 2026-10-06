import { assetDefaults, classifyMime, secondsToTicks } from '../../core';
import type { AssetKind, ProjectSettings, Time } from '../../core';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface ProbedMedia {
	kind: AssetKind;
	duration: Time;
	width?: number;
	height?: number;
	fps?: number;
	fpsEstimated?: boolean;
	hasAudio: boolean;
	audioChecked: boolean;
	audioDecodable?: boolean;
	audioCodec?: string;
	videoDecodable?: boolean;
	videoCodec?: string;
}

function waitForEvent(
	element: HTMLMediaElement | HTMLImageElement,
	events: string[],
	signal: AbortSignal | undefined,
	timeoutMs: number
): Promise<void> {
	return new Promise((resolve, reject) => {
		const timeout = window.setTimeout(() => {
			cleanup();
			reject(new Error('Timed out while reading media metadata.'));
		}, timeoutMs);
		const cleanup = () => {
			window.clearTimeout(timeout);
			for (const eventName of events) element.removeEventListener(eventName, onSuccess);
			element.removeEventListener('error', onError);
			signal?.removeEventListener('abort', onAbort);
		};
		const onSuccess = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			reject(new Error("Browser can't decode this file; try MP4 (H.264/AAC) or WebM."));
		};
		const onAbort = () => {
			cleanup();
			reject(new DOMException('The operation was aborted.', 'AbortError'));
		};
		for (const eventName of events) element.addEventListener(eventName, onSuccess, { once: true });
		element.addEventListener('error', onError, { once: true });
		signal?.addEventListener('abort', onAbort, { once: true });
		if (signal?.aborted) onAbort();
	});
}

async function estimateFrameRate(
	video: HTMLVideoElement,
	fallback: number,
	signal?: AbortSignal
): Promise<{ fps: number; estimated: boolean }> {
	if (!video.requestVideoFrameCallback) return { fps: fallback, estimated: true };
	video.muted = true;
	video.playsInline = true;
	video.preload = 'metadata';
	let frames = 0;
	let start = 0;
	let end = 0;
	try {
		await video.play();
		await new Promise<void>((resolve) => {
			const stop = window.setTimeout(resolve, 1_500);
			const onAbort = () => {
				window.clearTimeout(stop);
				resolve();
			};
			signal?.addEventListener('abort', onAbort, { once: true });
			const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
				if (frames === 0) start = metadata.mediaTime;
				end = metadata.mediaTime;
				frames += 1;
				if (frames >= 10 || signal?.aborted) {
					window.clearTimeout(stop);
					signal?.removeEventListener('abort', onAbort);
					resolve();
					return;
				}
				video.requestVideoFrameCallback(onFrame);
			};
			video.requestVideoFrameCallback(onFrame);
		});
	} catch {
		return { fps: fallback, estimated: true };
	} finally {
		video.pause();
	}
	if (frames < 2 || end <= start) return { fps: fallback, estimated: true };
	const measured = (frames - 1) / (end - start);
	if (!Number.isFinite(measured) || measured < 1 || measured > 240) {
		return { fps: fallback, estimated: true };
	}
	return { fps: Math.round(measured * 100) / 100, estimated: false };
}

function makeProbeVideo(): HTMLVideoElement {
	const video = document.createElement('video');
	video.preload = 'metadata';
	video.muted = true;
	video.playsInline = true;
	video.setAttribute('aria-hidden', 'true');
	video.style.position = 'fixed';
	video.style.width = '1px';
	video.style.height = '1px';
	video.style.opacity = '0';
	video.style.pointerEvents = 'none';
	document.body.append(video);
	return video;
}

async function probeContainer(
	file: File,
	kind: AssetKind,
	fallbackFps: number
): Promise<ProbedMedia> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const videoTrack = kind === 'video' ? await input.getPrimaryVideoTrack() : null;
		const audioTrack =
			kind === 'audio' ? await input.getPrimaryAudioTrack() : await input.getPrimaryAudioTrack();
		const primaryTrack = kind === 'video' ? videoTrack : audioTrack;
		if (!primaryTrack) throw new Error(`No ${kind} track was found in “${file.name}”.`);

		const duration = await input.getDurationFromMetadata([
			...(videoTrack ? [videoTrack] : []),
			...(audioTrack ? [audioTrack] : [])
		]);
		if (duration === null || !Number.isFinite(duration) || duration <= 0) {
			throw new Error(`Could not read a valid duration from “${file.name}”.`);
		}

		const videoCodec = videoTrack ? await videoTrack.getCodecParameterString() : null;
		const audioCodec = audioTrack ? await audioTrack.getCodecParameterString() : null;
		const [videoDecodable, audioDecodable, displayWidth, displayHeight, frameRate] =
			await Promise.all([
				videoTrack?.canDecode(),
				audioTrack?.canDecode(),
				videoTrack?.getDisplayWidth(),
				videoTrack?.getDisplayHeight(),
				videoTrack?.computeFrameRateMetrics({ targetPacketCount: 64 })
			]);
		const fps = frameRate?.bestGuessFrameRate ?? fallbackFps;
		return {
			kind,
			duration: secondsToTicks(duration),
			...(displayWidth === undefined ? {} : { width: displayWidth }),
			...(displayHeight === undefined ? {} : { height: displayHeight }),
			...(videoTrack ? { fps, fpsEstimated: !frameRate?.frameRateIsConstant } : {}),
			hasAudio: audioTrack !== null,
			audioChecked: true,
			...(audioTrack ? { audioDecodable: audioDecodable ?? false } : {}),
			...(audioCodec ? { audioCodec } : {}),
			...(videoTrack ? { videoDecodable: videoDecodable ?? false } : {}),
			...(videoCodec ? { videoCodec } : {})
		};
	} finally {
		input.dispose();
	}
}

async function probeWithBrowser(
	file: File,
	kind: AssetKind,
	settings: Pick<ProjectSettings, 'fps'>,
	options: { signal?: AbortSignal; timeoutMs: number }
): Promise<ProbedMedia> {
	const url = URL.createObjectURL(file);
	try {
		if (options.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
		if (kind === 'image') {
			const image = new Image();
			const loaded = waitForEvent(image, ['load'], options.signal, options.timeoutMs);
			image.src = url;
			await loaded;
			return {
				kind,
				duration: assetDefaults('image').duration,
				width: image.naturalWidth,
				height: image.naturalHeight,
				hasAudio: false,
				audioChecked: true
			};
		}

		if (kind === 'audio') {
			const audio = document.createElement('audio');
			audio.preload = 'metadata';
			const loaded = waitForEvent(audio, ['loadedmetadata'], options.signal, options.timeoutMs);
			audio.src = url;
			await loaded;
			if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
				throw new Error("Browser can't read this file's audio metadata.");
			}
			return {
				kind,
				duration: secondsToTicks(audio.duration),
				hasAudio: true,
				audioChecked: false
			};
		}

		const video = makeProbeVideo();
		try {
			const loaded = waitForEvent(video, ['loadedmetadata'], options.signal, options.timeoutMs);
			video.src = url;
			await loaded;
			if (!Number.isFinite(video.duration) || video.duration <= 0) {
				throw new Error("Browser can't read this file's video metadata.");
			}
			const frameRate = await estimateFrameRate(video, settings.fps, options.signal);
			return {
				kind,
				duration: secondsToTicks(video.duration),
				width: video.videoWidth,
				height: video.videoHeight,
				fps: frameRate.fps,
				fpsEstimated: true,
				hasAudio: false,
				audioChecked: false
			};
		} finally {
			video.pause();
			video.removeAttribute('src');
			video.load();
			video.remove();
		}
	} finally {
		URL.revokeObjectURL(url);
	}
}

export async function probeMedia(
	file: File,
	settings: Pick<ProjectSettings, 'fps'>,
	options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<ProbedMedia> {
	const kind = classifyMime(file.type, file.name);
	if (!kind)
		throw new Error('Unsupported media type. Choose a supported video, audio, or image file.');
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	if (options.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
	if (kind === 'image') {
		return probeWithBrowser(file, kind, settings, { ...options, timeoutMs });
	}
	try {
		return await probeContainer(file, kind, settings.fps);
	} catch (containerError) {
		if (containerError instanceof DOMException && containerError.name === 'AbortError') {
			throw containerError;
		}
		try {
			return await probeWithBrowser(file, kind, settings, { ...options, timeoutMs });
		} catch (browserError) {
			const detail =
				containerError instanceof Error ? ` Container inspection: ${containerError.message}` : '';
			if (browserError instanceof Error) {
				throw new Error(`${browserError.message}${detail}`, { cause: browserError });
			}
			throw browserError;
		}
	}
}
