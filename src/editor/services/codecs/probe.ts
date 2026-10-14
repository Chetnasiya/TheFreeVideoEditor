// src/editor/services/codecs/probe.ts
// Non-blocking runtime codec capability probing service for WebCodecs and Mediabunny.

import {
	VIDEO_CODEC_REGISTRY,
	AUDIO_CODEC_REGISTRY,
	AUDIO_ONLY_PRESETS
} from '../../core/codecs/registry';
import type {
	CodecCapabilityReport,
	CodecSupportStatus,
	ContainerFormat
} from '../../core/codecs/types';

let cachedReport: CodecCapabilityReport | null = null;
let probingPromise: Promise<CodecCapabilityReport> | null = null;

const SUPPORTED_CONTAINERS: Record<ContainerFormat, boolean> = {
	mp4: true,
	mov: true,
	webm: true,
	mkv: true,
	wav: true
};

export async function probeCodecCapabilities(): Promise<CodecCapabilityReport> {
	if (cachedReport) return cachedReport;
	if (probingPromise) return probingPromise;

	probingPromise = (async () => {
		const isClient = typeof window !== 'undefined';
		const isSecureContext = isClient ? Boolean(window.isSecureContext) : false;
		const hasVideoEncoder = isClient && typeof VideoEncoder !== 'undefined';
		const hasAudioEncoder = isClient && typeof AudioEncoder !== 'undefined';
		const hasVideoDecoder = isClient && typeof VideoDecoder !== 'undefined';
		const ua = isClient ? navigator.userAgent : 'Node/Server';

		const codecResults: Record<string, CodecSupportStatus> = {};
		const audioResults: Record<string, CodecSupportStatus> = {};
		const pixelFormats: Record<string, boolean> = {};

		const now = Date.now();

		// 1. Probe Video Codecs
		for (const codec of VIDEO_CODEC_REGISTRY) {
			if (codec.tier === 2) {
				// Tier 2 requires optional codec pack
				codecResults[codec.id] = {
					codecId: codec.id,
					supported: false,
					reason: 'Requires Advanced Codec Pack (deferred)',
					checkedAt: now
				};
				continue;
			}

			if (!hasVideoEncoder || !isSecureContext) {
				codecResults[codec.id] = {
					codecId: codec.id,
					supported: false,
					reason: isSecureContext
						? 'WebCodecs VideoEncoder not available'
						: 'Insecure context (requires HTTPS or localhost)',
					checkedAt: now
				};
				continue;
			}

			try {
				const query: VideoEncoderConfig = {
					codec: codec.videoCodecString,
					width: 1920,
					height: 1080,
					bitrate: codec.defaultBitrateBps,
					framerate: 30,
					...(codec.supportsAlpha ? { alpha: 'keep' } : {})
				};
				const res = await VideoEncoder.isConfigSupported(query);
				codecResults[codec.id] = {
					codecId: codec.id,
					supported: Boolean(res.supported),
					hardwareAccelerated: res.config?.hardwareAcceleration === 'prefer-hardware',
					reason: res.supported ? undefined : 'Platform WebCodecs rejected configuration',
					checkedAt: now
				};
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				codecResults[codec.id] = {
					codecId: codec.id,
					supported: false,
					reason: message,
					checkedAt: now
				};
			}
		}

		// 2. Audio-only Presets (WAV PCM)
		for (const preset of AUDIO_ONLY_PRESETS) {
			codecResults[preset.id] = {
				codecId: preset.id,
				supported: true, // WAV PCM muxing is always supported natively via mediabunny
				hardwareAccelerated: false,
				checkedAt: now
			};
		}

		// 3. Audio Codecs
		for (const audio of AUDIO_CODEC_REGISTRY) {
			if (audio.isLossless) {
				// PCM formats bypass AudioEncoder; muxed directly to WAV/MOV via mediabunny
				audioResults[audio.id] = {
					codecId: audio.id,
					supported: true,
					checkedAt: now
				};
				continue;
			}

			if (!hasAudioEncoder || !isSecureContext) {
				audioResults[audio.id] = {
					codecId: audio.id,
					supported: false,
					reason: 'AudioEncoder not available',
					checkedAt: now
				};
				continue;
			}

			try {
				const res = await AudioEncoder.isConfigSupported({
					codec: audio.codecString,
					sampleRate: 48000,
					numberOfChannels: 2,
					bitrate: audio.defaultBitrateBps ?? 128_000
				});
				audioResults[audio.id] = {
					codecId: audio.id,
					supported: Boolean(res.supported),
					reason: res.supported ? undefined : 'AudioEncoder does not support this codec',
					checkedAt: now
				};
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				audioResults[audio.id] = {
					codecId: audio.id,
					supported: false,
					reason: message,
					checkedAt: now
				};
			}
		}

		// 4. Pixel Formats
		if (isClient && typeof VideoFrame !== 'undefined') {
			const testFormats = [
				'RGBA',
				'BGRA',
				'I420',
				'I420A',
				'NV12',
				'I420P10',
				'I422P10',
				'I444P10'
			];
			const buffer = new Uint8Array(64 * 64 * 8);
			for (const fmt of testFormats) {
				try {
					const frame = new VideoFrame(buffer, {
						format: fmt as VideoPixelFormat,
						codedWidth: 64,
						codedHeight: 64,
						timestamp: 0
					});
					pixelFormats[fmt] = true;
					frame.close();
				} catch {
					pixelFormats[fmt] = false;
				}
			}
		}

		const report: CodecCapabilityReport = {
			timestamp: new Date().toISOString(),
			userAgent: ua,
			isSecureContext,
			hasWebCodecs: hasVideoEncoder && hasVideoDecoder,
			codecs: codecResults,
			audioCodecs: audioResults,
			pixelFormats,
			containers: SUPPORTED_CONTAINERS
		};

		cachedReport = report;
		return report;
	})();

	return probingPromise;
}

/** Synchronous check against the in-memory cache (or defaults if probe has not finished yet). */
export function isCodecSupportedSync(codecId: string): boolean {
	if (cachedReport?.codecs[codecId]) {
		return cachedReport.codecs[codecId].supported;
	}
	// Fallback reasonable defaults before async probe resolves
	if (
		codecId === 'vp9-webm' ||
		codecId === 'wav-pcm16' ||
		codecId === 'wav-pcm24' ||
		codecId === 'wav-pcm32f'
	) {
		return true;
	}
	return false;
}

export function isAudioCodecSupportedSync(audioCodecId: string): boolean {
	if (cachedReport?.audioCodecs[audioCodecId]) {
		return cachedReport.audioCodecs[audioCodecId].supported;
	}
	if (audioCodecId === 'opus' || audioCodecId.startsWith('pcm')) {
		return true;
	}
	return false;
}

export function getCachedReport(): CodecCapabilityReport | null {
	return cachedReport;
}

export function generateDiagnosticReport(): string {
	if (!cachedReport) {
		return 'Codec capability probe has not completed yet.';
	}
	const lines: string[] = [];
	lines.push('=== THE FREE VIDEO EDITOR: CODEC DIAGNOSTIC REPORT ===');
	lines.push(`Generated: ${cachedReport.timestamp}`);
	lines.push(`User Agent: ${cachedReport.userAgent}`);
	lines.push(
		`Secure Context: ${cachedReport.isSecureContext ? 'Yes (HTTPS / Localhost)' : 'No (Insecure)'}`
	);
	lines.push(`WebCodecs Available: ${cachedReport.hasWebCodecs ? 'Yes' : 'No'}`);
	lines.push('');
	lines.push('--- VIDEO CODECS ---');
	for (const [id, status] of Object.entries(cachedReport.codecs)) {
		const hw = status.hardwareAccelerated ? ' [Hardware Accelerated]' : '';
		const err = status.reason ? ` (${status.reason})` : '';
		lines.push(`- ${id}: ${status.supported ? 'SUPPORTED' : 'UNSUPPORTED'}${hw}${err}`);
	}
	lines.push('');
	lines.push('--- AUDIO CODECS ---');
	for (const [id, status] of Object.entries(cachedReport.audioCodecs)) {
		const err = status.reason ? ` (${status.reason})` : '';
		lines.push(`- ${id}: ${status.supported ? 'SUPPORTED' : 'UNSUPPORTED'}${err}`);
	}
	lines.push('');
	lines.push('--- SUPPORTED CONTAINERS ---');
	for (const [container, supported] of Object.entries(cachedReport.containers)) {
		lines.push(`- ${container.toUpperCase()}: ${supported ? 'SUPPORTED' : 'UNSUPPORTED'}`);
	}
	lines.push('');
	lines.push('--- PIXEL FORMATS (VideoFrame) ---');
	for (const [fmt, supported] of Object.entries(cachedReport.pixelFormats)) {
		lines.push(`- ${fmt}: ${supported ? 'SUPPORTED' : 'UNSUPPORTED'}`);
	}
	lines.push('====================================================');
	return lines.join('\n');
}
