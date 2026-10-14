// src/editor/core/codecs/types.ts
// Canonical Professional Codecs capability model and configuration definitions.

export type CodecTier = 1 | 2;

export type ContainerFormat = 'mp4' | 'mov' | 'webm' | 'mkv' | 'wav';

export type VideoCodecFamily = 'h264' | 'hevc' | 'vp9' | 'av1' | 'prores' | 'dnxhr' | 'mpeg2';

export type AudioCodecFamily = 'aac' | 'opus' | 'pcm16' | 'pcm24' | 'pcm32f' | 'flac';

export type ColorSpaceTag = 'bt709' | 'bt2020' | 'srgb' | 'display-p3';

export type BitDepth = 8 | 10 | 12 | 16 | 24 | 32;

export interface CodecDescriptor {
	id: string;
	label: string;
	family: VideoCodecFamily;
	tier: CodecTier;
	container: ContainerFormat;
	videoCodecString: string;
	defaultAudioCodec: AudioCodecFamily;
	supportedAudioCodecs: AudioCodecFamily[];
	mimeType: string;
	extension: string;
	bitDepth: BitDepth;
	defaultBitrateBps: number;
	minBitrateBps: number;
	maxBitrateBps: number;
	supportsAlpha: boolean;
	supportedColorSpaces: ColorSpaceTag[];
	requiresPack?: boolean;
	hardwarePreference?: 'prefer-hardware' | 'prefer-software' | 'no-preference';
	description: string;
}

export interface AudioCodecDescriptor {
	id: AudioCodecFamily;
	label: string;
	codecString: string;
	container: ContainerFormat;
	defaultBitrateBps?: number;
	supportedBitratesBps?: number[];
	supportedSampleRates: number[];
	supportedChannels: number[];
	bitDepth?: number;
	isLossless: boolean;
	description: string;
}

export interface CodecSupportStatus {
	codecId: string;
	supported: boolean;
	hardwareAccelerated?: boolean;
	reason?: string;
	checkedAt: number;
}

export interface CodecCapabilityReport {
	timestamp: string;
	userAgent: string;
	isSecureContext: boolean;
	hasWebCodecs: boolean;
	codecs: Record<string, CodecSupportStatus>;
	audioCodecs: Record<string, CodecSupportStatus>;
	pixelFormats: Record<string, boolean>;
	containers: Record<ContainerFormat, boolean>;
}

export interface ExportQualityPreset {
	id: 'high' | 'medium' | 'low' | 'custom';
	label: string;
	bitrateMultiplier: number;
}
