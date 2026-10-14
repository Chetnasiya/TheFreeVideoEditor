// src/editor/core/codecs/registry.ts
// Canonical registry of Video and Audio codec descriptors for Professional Codecs.

import type { CodecDescriptor, AudioCodecDescriptor } from './types';

export const VIDEO_CODEC_REGISTRY: CodecDescriptor[] = [
	// ─── TIER 1: PLATFORM CODECS ──────────────────────────────────────────
	{
		id: 'h264-mp4',
		label: 'H.264 / AVC High (MP4)',
		family: 'h264',
		tier: 1,
		container: 'mp4',
		videoCodecString: 'avc1.640033', // High Profile Level 5.1
		defaultAudioCodec: 'aac',
		supportedAudioCodecs: ['aac', 'opus'],
		mimeType: 'video/mp4; codecs="avc1.640033, mp4a.40.2"',
		extension: 'mp4',
		bitDepth: 8,
		defaultBitrateBps: 16_000_000, // 16 Mbps for 1080p
		minBitrateBps: 2_000_000,
		maxBitrateBps: 50_000_000,
		supportsAlpha: false,
		supportedColorSpaces: ['bt709', 'srgb'],
		description: 'Industry-standard 8-bit video format with universal device and platform playback.'
	},
	{
		id: 'h264-mov',
		label: 'H.264 / AVC High (QuickTime MOV)',
		family: 'h264',
		tier: 1,
		container: 'mov',
		videoCodecString: 'avc1.640033',
		defaultAudioCodec: 'aac',
		supportedAudioCodecs: ['aac', 'pcm16', 'pcm24'],
		mimeType: 'video/quicktime; codecs="avc1.640033"',
		extension: 'mov',
		bitDepth: 8,
		defaultBitrateBps: 18_000_000,
		minBitrateBps: 2_000_000,
		maxBitrateBps: 60_000_000,
		supportsAlpha: false,
		supportedColorSpaces: ['bt709', 'srgb'],
		description: 'QuickTime MOV container with H.264 video and uncompressed PCM or AAC audio.'
	},
	{
		id: 'hevc-mp4',
		label: 'HEVC / H.265 Main (MP4)',
		family: 'hevc',
		tier: 1,
		container: 'mp4',
		videoCodecString: 'hvc1.1.6.L120.B0', // Main Profile Level 4.0
		defaultAudioCodec: 'aac',
		supportedAudioCodecs: ['aac'],
		mimeType: 'video/mp4; codecs="hvc1.1.6.L120.B0, mp4a.40.2"',
		extension: 'mp4',
		bitDepth: 8,
		defaultBitrateBps: 12_000_000, // High-efficiency: ~40% lower bitrate than H.264
		minBitrateBps: 1_500_000,
		maxBitrateBps: 40_000_000,
		supportsAlpha: false,
		supportedColorSpaces: ['bt709'],
		description: 'High-Efficiency Video Coding (H.265) 8-bit for modern web and mobile playback.'
	},
	{
		id: 'hevc-mov',
		label: 'HEVC / H.265 Main (QuickTime MOV)',
		family: 'hevc',
		tier: 1,
		container: 'mov',
		videoCodecString: 'hvc1.1.6.L120.B0',
		defaultAudioCodec: 'pcm24',
		supportedAudioCodecs: ['pcm16', 'pcm24', 'aac'],
		mimeType: 'video/quicktime; codecs="hvc1.1.6.L120.B0"',
		extension: 'mov',
		bitDepth: 8,
		defaultBitrateBps: 14_000_000,
		minBitrateBps: 1_500_000,
		maxBitrateBps: 50_000_000,
		supportsAlpha: false,
		supportedColorSpaces: ['bt709'],
		description: 'Apple ecosystem HEVC in QuickTime container with professional PCM audio.'
	},
	{
		id: 'hevc-main10-mp4',
		label: 'HEVC / H.265 Main 10 (10-bit MP4)',
		family: 'hevc',
		tier: 1,
		container: 'mp4',
		videoCodecString: 'hvc1.2.4.L120.B0', // Main 10 Profile
		defaultAudioCodec: 'aac',
		supportedAudioCodecs: ['aac'],
		mimeType: 'video/mp4; codecs="hvc1.2.4.L120.B0"',
		extension: 'mp4',
		bitDepth: 10,
		defaultBitrateBps: 18_000_000,
		minBitrateBps: 3_000_000,
		maxBitrateBps: 60_000_000,
		supportsAlpha: false,
		supportedColorSpaces: ['bt709', 'bt2020'],
		description:
			'10-bit HEVC for high-fidelity master delivery with Rec.709 or Rec.2020 color tagging.'
	},
	{
		id: 'vp9-webm',
		label: 'VP9 Profile 0 (WebM)',
		family: 'vp9',
		tier: 1,
		container: 'webm',
		videoCodecString: 'vp09.00.41.08',
		defaultAudioCodec: 'opus',
		supportedAudioCodecs: ['opus'],
		mimeType: 'video/webm; codecs="vp09.00.41.08, opus"',
		extension: 'webm',
		bitDepth: 8,
		defaultBitrateBps: 12_000_000,
		minBitrateBps: 1_500_000,
		maxBitrateBps: 45_000_000,
		supportsAlpha: true,
		supportedColorSpaces: ['bt709', 'srgb'],
		description: 'Open, royalty-free video format optimized for web streaming with Opus audio.'
	},
	{
		id: 'vp9-profile2-webm',
		label: 'VP9 Profile 2 (10-bit WebM)',
		family: 'vp9',
		tier: 1,
		container: 'webm',
		videoCodecString: 'vp09.02.41.10',
		defaultAudioCodec: 'opus',
		supportedAudioCodecs: ['opus'],
		mimeType: 'video/webm; codecs="vp09.02.41.10, opus"',
		extension: 'webm',
		bitDepth: 10,
		defaultBitrateBps: 18_000_000,
		minBitrateBps: 3_000_000,
		maxBitrateBps: 60_000_000,
		supportsAlpha: false,
		supportedColorSpaces: ['bt709', 'bt2020'],
		description: '10-bit VP9 delivering smooth color gradients and high-dynamic-range capability.'
	},
	{
		id: 'av1-webm',
		label: 'AV1 Main (8-bit WebM)',
		family: 'av1',
		tier: 1,
		container: 'webm',
		videoCodecString: 'av01.0.08M.08',
		defaultAudioCodec: 'opus',
		supportedAudioCodecs: ['opus'],
		mimeType: 'video/webm; codecs="av01.0.08M.08, opus"',
		extension: 'webm',
		bitDepth: 8,
		defaultBitrateBps: 10_000_000, // AV1 achieves comparable quality at ~30% lower bitrates than VP9
		minBitrateBps: 1_000_000,
		maxBitrateBps: 35_000_000,
		supportsAlpha: false,
		supportedColorSpaces: ['bt709', 'srgb'],
		description: 'Next-generation open codec with state-of-the-art compression efficiency.'
	},
	{
		id: 'av1-mp4',
		label: 'AV1 Main (8-bit MP4)',
		family: 'av1',
		tier: 1,
		container: 'mp4',
		videoCodecString: 'av01.0.08M.08',
		defaultAudioCodec: 'aac',
		supportedAudioCodecs: ['aac', 'opus'],
		mimeType: 'video/mp4; codecs="av01.0.08M.08, mp4a.40.2"',
		extension: 'mp4',
		bitDepth: 8,
		defaultBitrateBps: 10_000_000,
		minBitrateBps: 1_000_000,
		maxBitrateBps: 35_000_000,
		supportsAlpha: false,
		supportedColorSpaces: ['bt709', 'srgb'],
		description: 'Next-generation AV1 video encapsulated in standard MP4 container.'
	},

	// ─── TIER 2: ADVANCED CODEC PACK (OPT-IN WASM) ───────────────────────
	{
		id: 'prores-422hq-mov',
		label: 'Apple ProRes 422 HQ (compatible MOV)',
		family: 'prores',
		tier: 2,
		container: 'mov',
		videoCodecString: 'apch',
		defaultAudioCodec: 'pcm24',
		supportedAudioCodecs: ['pcm16', 'pcm24', 'pcm32f'],
		mimeType: 'video/quicktime; codecs="apch"',
		extension: 'mov',
		bitDepth: 10,
		defaultBitrateBps: 220_000_000, // ~220 Mbps at 1080p29.97
		minBitrateBps: 100_000_000,
		maxBitrateBps: 300_000_000,
		supportsAlpha: false,
		supportedColorSpaces: ['bt709', 'bt2020', 'display-p3'],
		requiresPack: true,
		description: '10-bit intra-frame professional broadcast and editing master codec.'
	},
	{
		id: 'prores-4444-mov',
		label: 'Apple ProRes 4444 (with Alpha MOV)',
		family: 'prores',
		tier: 2,
		container: 'mov',
		videoCodecString: 'ap4h',
		defaultAudioCodec: 'pcm24',
		supportedAudioCodecs: ['pcm16', 'pcm24', 'pcm32f'],
		mimeType: 'video/quicktime; codecs="ap4h"',
		extension: 'mov',
		bitDepth: 12,
		defaultBitrateBps: 330_000_000,
		minBitrateBps: 150_000_000,
		maxBitrateBps: 500_000_000,
		supportsAlpha: true,
		supportedColorSpaces: ['bt709', 'bt2020', 'display-p3'],
		requiresPack: true,
		description:
			'12-bit master format with lossless alpha channel support for graphics compositing.'
	},
	{
		id: 'dnxhr-hq-mov',
		label: 'Avid DNxHR HQ (compatible MOV)',
		family: 'dnxhr',
		tier: 2,
		container: 'mov',
		videoCodecString: 'AVdh',
		defaultAudioCodec: 'pcm24',
		supportedAudioCodecs: ['pcm16', 'pcm24', 'pcm32f'],
		mimeType: 'video/quicktime; codecs="AVdh"',
		extension: 'mov',
		bitDepth: 8,
		defaultBitrateBps: 220_000_000,
		minBitrateBps: 100_000_000,
		maxBitrateBps: 300_000_000,
		supportsAlpha: false,
		supportedColorSpaces: ['bt709'],
		requiresPack: true,
		description: 'Avid DNxHR (SMPTE VC-3) editing master codec for post-production interchange.'
	}
];

export const AUDIO_CODEC_REGISTRY: AudioCodecDescriptor[] = [
	{
		id: 'aac',
		label: 'AAC-LC (Advanced Audio Coding)',
		codecString: 'mp4a.40.2',
		container: 'mp4',
		defaultBitrateBps: 192_000,
		supportedBitratesBps: [128_000, 192_000, 256_000, 320_000, 384_000],
		supportedSampleRates: [44100, 48000],
		supportedChannels: [1, 2, 6],
		isLossless: false,
		description: 'Standard high-quality compressed audio for web, broadcast, and mobile delivery.'
	},
	{
		id: 'opus',
		label: 'Opus Interactive Audio',
		codecString: 'opus',
		container: 'webm',
		defaultBitrateBps: 128_000,
		supportedBitratesBps: [96_000, 128_000, 160_000, 192_000, 256_000],
		supportedSampleRates: [48000],
		supportedChannels: [1, 2],
		isLossless: false,
		description: 'Next-generation low-latency codec delivering transparent quality at low bitrates.'
	},
	{
		id: 'pcm16',
		label: 'Linear PCM 16-bit (Lossless)',
		codecString: 'pcm-s16',
		container: 'wav',
		supportedSampleRates: [44100, 48000, 96000],
		supportedChannels: [1, 2],
		bitDepth: 16,
		isLossless: true,
		description: 'CD-quality uncompressed audio with exact sample preservation.'
	},
	{
		id: 'pcm24',
		label: 'Linear PCM 24-bit (Studio Master)',
		codecString: 'pcm-s24',
		container: 'wav',
		supportedSampleRates: [48000, 96000],
		supportedChannels: [1, 2],
		bitDepth: 24,
		isLossless: true,
		description: 'Professional studio-grade 24-bit uncompressed audio with 144 dB dynamic range.'
	},
	{
		id: 'pcm32f',
		label: '32-bit Float PCM (Floating Point Master)',
		codecString: 'pcm-f32',
		container: 'wav',
		supportedSampleRates: [48000, 96000],
		supportedChannels: [1, 2],
		bitDepth: 32,
		isLossless: true,
		description:
			'32-bit floating point audio eliminating digital clipping during mixing and interchange.'
	}
];

export const AUDIO_ONLY_PRESETS: CodecDescriptor[] = [
	{
		id: 'wav-pcm16',
		label: 'WAV Audio (16-bit PCM)',
		family: 'prores', // not used
		tier: 1,
		container: 'wav',
		videoCodecString: '',
		defaultAudioCodec: 'pcm16',
		supportedAudioCodecs: ['pcm16'],
		mimeType: 'audio/wav',
		extension: 'wav',
		bitDepth: 16,
		defaultBitrateBps: 1536_000, // 48000 * 16 * 2
		minBitrateBps: 1536_000,
		maxBitrateBps: 1536_000,
		supportsAlpha: false,
		supportedColorSpaces: [],
		description: 'Lossless 16-bit WAV audio interchange export.'
	},
	{
		id: 'wav-pcm24',
		label: 'WAV Audio (24-bit Studio Master)',
		family: 'prores',
		tier: 1,
		container: 'wav',
		videoCodecString: '',
		defaultAudioCodec: 'pcm24',
		supportedAudioCodecs: ['pcm24'],
		mimeType: 'audio/wav',
		extension: 'wav',
		bitDepth: 24,
		defaultBitrateBps: 2304_000, // 48000 * 24 * 2
		minBitrateBps: 2304_000,
		maxBitrateBps: 2304_000,
		supportsAlpha: false,
		supportedColorSpaces: [],
		description: 'Lossless 24-bit WAV studio-grade master audio export.'
	},
	{
		id: 'wav-pcm32f',
		label: 'WAV Audio (32-bit Float Master)',
		family: 'prores',
		tier: 1,
		container: 'wav',
		videoCodecString: '',
		defaultAudioCodec: 'pcm32f',
		supportedAudioCodecs: ['pcm32f'],
		mimeType: 'audio/wav',
		extension: 'wav',
		bitDepth: 32,
		defaultBitrateBps: 3072_000, // 48000 * 32 * 2
		minBitrateBps: 3072_000,
		maxBitrateBps: 3072_000,
		supportsAlpha: false,
		supportedColorSpaces: [],
		description: 'Floating point 32-bit WAV audio master with unlimited headroom.'
	}
];
