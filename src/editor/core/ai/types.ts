import type { AssetId, ClipId, Time, TrackId } from '../types';
export * from './silence/types';

export interface ScriptLine {
	id: string;
	lineIndex: number;
	speaker?: string;
	text: string;
	trackId?: TrackId; // Mapped track (e.g. Host -> Audio 1)
	optional?: boolean;
}

export interface ParsedScript {
	id: string;
	title: string;
	lines: ScriptLine[];
	rawText: string;
	speakers: string[];
	format?: 'txt' | 'md' | 'docx' | 'srt' | 'vtt' | 'pasted';
}

export interface TakeDefects {
	clipping: boolean;
	lowSnr: boolean;
	stumble: boolean;
	restart: boolean;
	fillerWords: string[];
	longPause: boolean;
	incomplete: boolean;
}

export interface TakeScoreBreakdown {
	accuracy: number; // 0 to 100 (Levenshtein / word recall)
	completeness: number; // 0 to 100 (fraction of words present)
	fluency: number; // 0 to 100 (penalties for fillers, hesitations)
	audioQuality: number; // 0 to 100 (SNR, clipping, plosives)
	recency: number; // 0 to 100 (prior for later takes: director preference)
}

export interface TakeCandidate {
	id: string;
	scriptLineId: string;
	lineIndex: number;
	clipId: ClipId;
	trackId: TrackId;
	assetId?: AssetId;
	startUs: Time;
	endUs: Time;
	durationUs: Time;
	sourceIn: Time;
	sourceOut: Time;
	transcript: string;
	confidence: number;
	alignmentScore: number;
	defects: TakeDefects;
	score: number; // Composite score 0 to 100
	scoreBreakdown: TakeScoreBreakdown;
	isPinned?: boolean;
	isChosen?: boolean;
}

export interface TakeGroup {
	id: string;
	scriptLineId: string;
	lineIndex: number;
	candidates: TakeCandidate[];
	selectedTakeId: string;
	timelineClipId?: ClipId;
}

export interface TakeScoringWeights {
	accuracy: number; // default 0.35
	completeness: number; // default 0.25
	fluency: number; // default 0.15
	audioQuality: number; // default 0.15
	recency: number; // default 0.10
}

export const DEFAULT_TAKE_WEIGHTS: TakeScoringWeights = {
	accuracy: 0.35,
	completeness: 0.25,
	fluency: 0.15,
	audioQuality: 0.15,
	recency: 0.1
};
