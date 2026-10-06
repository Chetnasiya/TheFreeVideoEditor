import { describe, expect, it } from 'vitest';
import { getExportCapabilities, type EncoderProbe } from './capabilities';

function fakeProbe(
	videoCodecs: string[],
	audioCodecs: string[],
	recorder: boolean | string[] = true
): EncoderProbe {
	return {
		isVideoConfigSupported: async (config) => videoCodecs.includes(config.codec),
		isAudioConfigSupported: async (config) => audioCodecs.includes(config.codec),
		mediaRecorderSupports: (mimeType) =>
			typeof recorder === 'boolean' ? recorder : recorder.includes(mimeType)
	};
}

describe('export capability probing', () => {
	it('selects the first supported H.264 candidate and AAC', async () => {
		const result = await getExportCapabilities(
			{ format: 'mp4', width: 1280, height: 720, fps: 30, audio: true },
			fakeProbe(['avc1.4d001f'], ['mp4a.40.2'])
		);
		expect(result).toMatchObject({ video: true, audio: true, codec: 'avc1.4d001f' });
	});

	it('reports AAC incompatibility with a WebM alternative rather than dropping audio', async () => {
		const result = await getExportCapabilities(
			{ format: 'mp4', width: 1280, height: 720, fps: 30, audio: true },
			fakeProbe(['avc1.42001f'], ['opus'])
		);
		expect(result.audio).toBe(false);
		expect(result.reason).toMatch(/choose WebM/);
	});

	it('exposes compatibility recording only when MediaRecorder supports WebM', async () => {
		const result = await getExportCapabilities(
			{ format: 'webm', width: 640, height: 480, fps: 30, audio: false },
			fakeProbe([], [], false)
		);
		expect(result).toMatchObject({ video: false, compatibility: false });
	});

	it('detects VP8 compatibility recording when VP9 is unsupported', async () => {
		const result = await getExportCapabilities(
			{ format: 'webm', width: 640, height: 480, fps: 30, audio: false },
			fakeProbe([], [], ['video/webm;codecs=vp8,opus'])
		);
		expect(result.compatibility).toBe(true);
	});
});
