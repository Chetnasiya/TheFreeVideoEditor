import { describe, expect, it } from 'vitest';
import { VIDEO_CODEC_REGISTRY, AUDIO_CODEC_REGISTRY, AUDIO_ONLY_PRESETS } from '../registry';

describe('Codecs Registry', () => {
	it('defines standard platform codecs for MP4, WebM, and QuickTime MOV', () => {
		const containers = new Set(VIDEO_CODEC_REGISTRY.map((c) => c.container));
		expect(containers.has('mp4')).toBe(true);
		expect(containers.has('webm')).toBe(true);
		expect(containers.has('mov')).toBe(true);
	});

	it('includes 10-bit color profile support in video registry', () => {
		const tenBitCodecs = VIDEO_CODEC_REGISTRY.filter((c) => c.bitDepth >= 10);
		expect(tenBitCodecs.length).toBeGreaterThanOrEqual(4);

		const vp9_10bit = tenBitCodecs.find((c) => c.id === 'vp9-profile2-webm');
		expect(vp9_10bit).toBeDefined();
		expect(vp9_10bit?.videoCodecString).toBe('vp09.02.41.10');

		const hevc_10bit = tenBitCodecs.find((c) => c.id === 'hevc-main10-mp4');
		expect(hevc_10bit).toBeDefined();
		expect(hevc_10bit?.videoCodecString).toBe('hvc1.2.4.L120.B0');
	});

	it('includes alpha-capable video codecs', () => {
		const alphaCodecs = VIDEO_CODEC_REGISTRY.filter((c) => c.supportsAlpha);
		expect(alphaCodecs.length).toBeGreaterThanOrEqual(2);

		const vp9Alpha = alphaCodecs.find((c) => c.id === 'vp9-webm');
		expect(vp9Alpha).toBeDefined();

		const proresAlpha = alphaCodecs.find((c) => c.id === 'prores-4444-mov');
		expect(proresAlpha).toBeDefined();
		expect(proresAlpha?.tier).toBe(2);
	});

	it('categorizes codecs into Tier 1 (Platform/WebCodecs) and Tier 2 (Advanced Pack)', () => {
		const tier1 = VIDEO_CODEC_REGISTRY.filter((c) => c.tier === 1);
		const tier2 = VIDEO_CODEC_REGISTRY.filter((c) => c.tier === 2);

		expect(tier1.length).toBeGreaterThan(0);
		expect(tier2.length).toBeGreaterThan(0);

		// Tier 2 should include ProRes and DNxHR
		expect(tier2.some((c) => c.id.includes('prores'))).toBe(true);
		expect(tier2.some((c) => c.id.includes('dnxhr'))).toBe(true);
	});

	it('registers uncompressed PCM audio presets for WAV and MOV', () => {
		const pcm16 = AUDIO_CODEC_REGISTRY.find((a) => a.id === 'pcm16');
		const pcm24 = AUDIO_CODEC_REGISTRY.find((a) => a.id === 'pcm24');
		const pcm32f = AUDIO_CODEC_REGISTRY.find((a) => a.id === 'pcm32f');

		expect(pcm16).toBeDefined();
		expect(pcm16?.bitDepth).toBe(16);
		expect(pcm24?.bitDepth).toBe(24);
		expect(pcm32f?.bitDepth).toBe(32);

		expect(AUDIO_ONLY_PRESETS.length).toBe(3);
		expect(AUDIO_ONLY_PRESETS.map((p) => p.container)).toEqual(['wav', 'wav', 'wav']);
	});
});
