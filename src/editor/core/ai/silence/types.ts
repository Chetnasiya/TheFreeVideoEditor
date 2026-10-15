import type { Time } from '../../../core/types';

export interface AudioFeatures {
	sampleRate: number; // 16000
	hopSize: number; // 160 samples (10ms)
	windowSize: number; // 320 samples (20ms)
	numFrames: number;
	rmsDb: Float32Array;
	speechBandRatio: Float32Array;
	spectralFlatness: Float32Array;
	zcr: Float32Array;
}

export type SilenceTrimMode = 'ripple' | 'shorten' | 'markers';
export type SilenceApplyTarget = 'all-tracks' | 'linked-only';
export type SilenceRangeScope = 'all' | 'selection' | 'in-out';
export type SilenceTrackCombination = 'any' | 'all';

export interface SilenceTrimOptions {
	trackIds: string[];
	combinationRule: SilenceTrackCombination;
	maxSilenceSec: number; // default 0.4s
	minSilenceSec: number; // default 0.3s
	thresholdMode: 'auto' | 'manual';
	manualThresholdDb: number; // default -40 dB
	sensitivity: number; // 0.0 to 1.0 (default 0.5)
	paddingBeforeMs: number; // default 80ms
	paddingAfterMs: number; // default 80ms
	keepBreaths: boolean; // default false
	voiceOnly: boolean; // default true
	trimLeadingTrailing: boolean; // default false
	range: SilenceRangeScope;
	mode: SilenceTrimMode;
	crossfadeMs: number; // default 5ms
	applyTarget: SilenceApplyTarget;
}

export const DEFAULT_SILENCE_OPTIONS: SilenceTrimOptions = {
	trackIds: [],
	combinationRule: 'any',
	maxSilenceSec: 0.4,
	minSilenceSec: 0.3,
	thresholdMode: 'auto',
	manualThresholdDb: -40,
	sensitivity: 0.5,
	paddingBeforeMs: 80,
	paddingAfterMs: 80,
	keepBreaths: false,
	voiceOnly: true,
	trimLeadingTrailing: false,
	range: 'all',
	mode: 'shorten',
	crossfadeMs: 5,
	applyTarget: 'all-tracks'
};

export interface DetectedSilence {
	id: string;
	startUs: Time; // Timeline microsecond start of silence interval
	endUs: Time; // Timeline microsecond end of silence interval
	durationUs: Time; // Full gap duration
	cutStartUs: Time; // Snapped cut start (middle to be removed)
	cutEndUs: Time; // Snapped cut end
	cutDurationUs: Time; // Duration to remove
	included: boolean; // User toggle to include/exclude this cut
	isLeadingOrTrailing?: boolean;
}

export interface SilenceDetectionResult {
	silences: DetectedSilence[];
	totalSilencesCount: number;
	includedCount: number;
	totalRemovedUs: Time;
	originalDurationUs: Time;
	newDurationUs: Time;
}
