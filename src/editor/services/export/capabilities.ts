import type { ExportSettings } from './plan';
import { recordExportCapabilities } from './testHooks';

export interface EncoderSupport {
	video: boolean;
	audio: boolean;
	codec?: string;
	audioCodec?: string;
	reason: string;
	compatibility: boolean;
}

export interface EncoderProbe {
	isVideoConfigSupported: (config: VideoEncoderConfig) => Promise<boolean>;
	isAudioConfigSupported: (config: AudioEncoderConfig) => Promise<boolean>;
	mediaRecorderSupports: (mimeType: string) => boolean;
}

const cache = new Map<string, Promise<EncoderSupport>>();
const DEFAULT_PROBE = browserProbe();

function browserProbe(): EncoderProbe {
	return {
		async isVideoConfigSupported(config) {
			if (typeof VideoEncoder === 'undefined') return false;
			try {
				return (await VideoEncoder.isConfigSupported(config)).supported ?? false;
			} catch {
				return false;
			}
		},
		async isAudioConfigSupported(config) {
			if (typeof AudioEncoder === 'undefined') return false;
			try {
				return (await AudioEncoder.isConfigSupported(config)).supported ?? false;
			} catch {
				return false;
			}
		},
		mediaRecorderSupports(mimeType) {
			return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType);
		}
	};
}

export function clearExportCapabilityCache(): void {
	cache.clear();
}

export async function getExportCapabilities(
	settings: Pick<ExportSettings, 'format' | 'width' | 'height' | 'fps' | 'audio'> & {
		codecId?: string;
		audioCodecId?: string;
	},
	probe: EncoderProbe = DEFAULT_PROBE
): Promise<EncoderSupport> {
	const key = `${settings.format}:${settings.codecId ?? ''}:${settings.width}x${settings.height}@${settings.fps}:${settings.audio}:${settings.audioCodecId ?? ''}`;
	if (probe === DEFAULT_PROBE) {
		const cached = cache.get(key);
		if (cached) return cached;
	}
	const request = (async () => {
		if (settings.format === 'wav') {
			return {
				video: true,
				audio: true,
				reason: '',
				compatibility: true
			};
		}

		let candidates: string[] = [];
		if (settings.format === 'mp4') {
			if (settings.codecId?.includes('hevc')) {
				candidates = ['hvc1.1.6.L120.B0', 'hev1.1.6.L120.B0'];
			} else if (settings.codecId?.includes('av1')) {
				candidates = ['av01.0.08M.10', 'av01.0.04M.08'];
			} else {
				candidates = ['avc1.640033', 'avc1.640028', 'avc1.4d001f', 'avc1.42001f'];
			}
		} else if (settings.format === 'mov') {
			if (settings.codecId?.includes('hevc')) {
				candidates = ['hvc1.1.6.L120.B0', 'hev1.1.6.L120.B0'];
			} else {
				candidates = ['avc1.640033', 'avc1.640028', 'avc1.4d001f'];
			}
		} else {
			if (settings.codecId?.includes('av1')) {
				candidates = ['av01.0.08M.10', 'av01.0.04M.08'];
			} else if (settings.codecId?.includes('profile2') || settings.codecId?.includes('10bit')) {
				candidates = ['vp09.02.10.10', 'vp09.02.41.10'];
			} else {
				candidates = ['vp09.00.10.08', 'vp09.00.41.08', 'vp8'];
			}
		}

		let codec: string | undefined;
		for (const candidate of candidates) {
			if (
				await probe.isVideoConfigSupported({
					codec: candidate,
					width: settings.width,
					height: settings.height,
					framerate: settings.fps,
					bitrate: Math.max(500_000, settings.width * settings.height * settings.fps * 0.08)
				})
			) {
				codec = candidate;
				break;
			}
		}

		const isPcmAudio = settings.audioCodecId?.startsWith('pcm');
		const audioCodec =
			settings.format === 'mp4'
				? 'mp4a.40.2'
				: settings.format === 'mov'
					? isPcmAudio
						? 'pcm'
						: 'mp4a.40.2'
					: 'opus';

		const audio =
			!settings.audio ||
			isPcmAudio ||
			(await probe.isAudioConfigSupported({
				codec: audioCodec,
				sampleRate: 48_000,
				numberOfChannels: 2,
				bitrate: 192_000
			}));

		const compatibility = [
			'video/webm;codecs=vp8,opus',
			'video/webm;codecs=vp9,opus',
			'video/webm'
		].some((mimeType) => probe.mediaRecorderSupports(mimeType));

		let reason = '';
		if (!codec) reason = 'This browser cannot encode the selected video format with WebCodecs.';
		else if (!audio && (settings.format === 'mp4' || settings.format === 'mov')) {
			reason =
				'AAC encoding is unavailable in this browser; choose WebM with Opus or PCM audio to include audio.';
		} else if (!audio)
			reason = 'Opus encoding is unavailable; disable audio or use another browser.';
		return {
			video: codec !== undefined,
			audio,
			...(codec ? { codec } : {}),
			...(audio ? { audioCodec } : {}),
			reason,
			compatibility
		};
	})();
	request.then(recordExportCapabilities);
	if (probe === DEFAULT_PROBE) cache.set(key, request);
	return request;
}
