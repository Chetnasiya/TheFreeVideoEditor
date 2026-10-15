import type { AssetId, ClipId, Time, TrackId } from '../../../core/types';
import type {
	ParsedScript,
	TakeCandidate,
	TakeDefects,
	TakeGroup,
	TakeScoreBreakdown
} from '../types';

export interface TranscribedAudioWord {
	word: string;
	cleanWord: string;
	startUs: Time;
	endUs: Time;
	confidence: number;
	clipId: ClipId;
	trackId: TrackId;
	assetId?: AssetId;
}

const COMMON_FILLER_WORDS = new Set(['um', 'uh', 'er', 'ah', 'umm', 'uhh', 'like', 'hmm', 'mhmm']);

const RESTART_CUES = new Set(['wait', 'sorry', 'restart', 'again', 'oops', 'redo', 'scratch']);

/**
 * Strips punctuation and returns a lowercase normalized token.
 */
export function cleanToken(word: string): string {
	return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Computes Levenshtein distance between two short strings.
 */
export function levenshteinDistance(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	const matrix: number[][] = [];
	for (let i = 0; i <= b.length; i++) matrix[i] = [i];
	for (let j = 0; j <= a.length; j++) matrix[0]![j] = j;

	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i]![j] = matrix[i - 1]![j - 1]!;
			} else {
				matrix[i]![j] = Math.min(
					matrix[i - 1]![j - 1]! + 1, // substitution
					matrix[i]![j - 1]! + 1, // insertion
					matrix[i - 1]![j]! + 1 // deletion
				);
			}
		}
	}

	return matrix[b.length]![a.length]!;
}

/**
 * Local sequence alignment (Smith-Waterman variant) to find best alignment between
 * target script words and a subslice of transcribed words.
 */
function alignWords(
	targetWords: string[],
	candidateWords: TranscribedAudioWord[]
): {
	score: number;
	matchedTargetCount: number;
	matchedCandidateIndices: number[];
	fillerIndices: number[];
} {
	const n = targetWords.length;
	const m = candidateWords.length;
	if (n === 0 || m === 0) {
		return { score: 0, matchedTargetCount: 0, matchedCandidateIndices: [], fillerIndices: [] };
	}

	// DP Matrix
	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
	const traceback: ('diag' | 'up' | 'left' | 'none')[][] = Array.from({ length: n + 1 }, () =>
		new Array(m + 1).fill('none')
	);

	let maxScore = 0;
	let maxI = 0;
	let maxJ = 0;

	for (let i = 1; i <= n; i++) {
		const tw = targetWords[i - 1]!;
		for (let j = 1; j <= m; j++) {
			const cw = candidateWords[j - 1]!.cleanWord;

			let matchScore = -1;
			if (tw === cw) {
				matchScore = 3;
			} else {
				const dist = levenshteinDistance(tw, cw);
				if (dist === 1) matchScore = 2;
				else if (dist === 2 && tw.length > 4) matchScore = 1;
				else matchScore = -1;
			}

			const diag = dp[i - 1]![j - 1]! + matchScore;
			const up = dp[i - 1]![j]! - 1;
			const left = dp[i]![j - 1]! - 1;

			const best = Math.max(0, diag, up, left);
			dp[i]![j] = best;

			if (best === 0) traceback[i]![j] = 'none';
			else if (best === diag) traceback[i]![j] = 'diag';
			else if (best === up) traceback[i]![j] = 'up';
			else traceback[i]![j] = 'left';

			if (best > maxScore) {
				maxScore = best;
				maxI = i;
				maxJ = j;
			}
		}
	}

	// Traceback to find matched candidate words
	const matchedCandidateIndices: number[] = [];
	const matchedTargetIndices = new Set<number>();
	let currI = maxI;
	let currJ = maxJ;

	while (currI > 0 && currJ > 0 && dp[currI]![currJ]! > 0) {
		const dir = traceback[currI]![currJ]!;
		if (dir === 'diag') {
			matchedCandidateIndices.unshift(currJ - 1);
			matchedTargetIndices.add(currI - 1);
			currI--;
			currJ--;
		} else if (dir === 'up') {
			currI--;
		} else if (dir === 'left') {
			currJ--;
		} else {
			break;
		}
	}

	// Find fillers in the aligned span
	const fillerIndices: number[] = [];
	if (matchedCandidateIndices.length > 0) {
		const startIdx = matchedCandidateIndices[0]!;
		const endIdx = matchedCandidateIndices[matchedCandidateIndices.length - 1]!;
		for (let k = startIdx; k <= endIdx; k++) {
			if (COMMON_FILLER_WORDS.has(candidateWords[k]!.cleanWord)) {
				fillerIndices.push(k);
			}
		}
	}

	return {
		score: maxScore,
		matchedTargetCount: matchedTargetIndices.size,
		matchedCandidateIndices,
		fillerIndices
	};
}

/**
 * Detects defects in a take candidate.
 */
function evaluateDefects(
	candidateWords: TranscribedAudioWord[],
	fillerIndices: number[],
	targetWordCount: number,
	matchedTargetCount: number
): TakeDefects {
	let stumble = false;
	let restart = false;
	let longPause = false;

	const fillerWords: string[] = [];
	for (const idx of fillerIndices) {
		fillerWords.push(candidateWords[idx]!.word);
	}

	// Check repeated adjacent words or restarts
	for (let i = 0; i < candidateWords.length - 1; i++) {
		const w1 = candidateWords[i]!.cleanWord;
		const w2 = candidateWords[i + 1]!.cleanWord;
		if (w1 && w1 === w2 && !COMMON_FILLER_WORDS.has(w1)) {
			stumble = true;
		}
		if (RESTART_CUES.has(w1)) {
			restart = true;
		}
		const gap = candidateWords[i + 1]!.startUs - candidateWords[i]!.endUs;
		if (gap > 800_000) {
			longPause = true;
		}
	}

	const incomplete = matchedTargetCount < Math.ceil(targetWordCount * 0.65);

	return {
		clipping: false,
		lowSnr: false,
		stumble,
		restart,
		fillerWords,
		longPause,
		incomplete
	};
}

/**
 * Multi-factor explainable scoring heuristic for a candidate take.
 * Weights: accuracy (0.35), completeness (0.25), fluency (0.15), audioQuality (0.15), recency (0.10).
 */
export function scoreTakeCandidate(
	defects: TakeDefects,
	targetWordCount: number,
	matchedTargetCount: number,
	alignmentScore: number,
	recencyRank: number, // 0 = first take, 1 = second, etc.
	totalTakesForLine: number,
	confidenceAvg: number
): { score: number; breakdown: TakeScoreBreakdown } {
	// 1. Accuracy: based on alignment score & confidence (0 to 100)
	const maxPossibleScore = Math.max(1, targetWordCount * 3);
	const rawAcc = Math.min(100, Math.round((alignmentScore / maxPossibleScore) * 100));
	const accuracy = Math.round(rawAcc * 0.7 + confidenceAvg * 100 * 0.3);

	// 2. Completeness: fraction of target words matched
	const completeness = Math.min(
		100,
		Math.round((matchedTargetCount / Math.max(1, targetWordCount)) * 100)
	);

	// 3. Fluency: penalize stumbles, restarts, fillers, and awkward long pauses
	let fluency = 100;
	if (defects.stumble) fluency -= 30;
	if (defects.restart) fluency -= 40;
	if (defects.longPause) fluency -= 15;
	fluency -= Math.min(30, defects.fillerWords.length * 10);
	fluency = Math.max(0, fluency);

	// 4. Audio quality: (defaults to high if no clipping/lowSnr detected)
	let audioQuality = 95;
	if (defects.clipping) audioQuality -= 40;
	if (defects.lowSnr) audioQuality -= 30;
	audioQuality = Math.max(0, audioQuality);

	// 5. Recency prior: later takes are often preferred by directors
	let recency = 50;
	if (totalTakesForLine > 1) {
		recency = Math.round(50 + (recencyRank / (totalTakesForLine - 1)) * 50);
	}

	// Composite score (0 to 100)
	const score = Math.round(
		accuracy * 0.35 + completeness * 0.25 + fluency * 0.15 + audioQuality * 0.15 + recency * 0.1
	);

	const breakdown: TakeScoreBreakdown = {
		accuracy,
		completeness,
		fluency,
		audioQuality,
		recency
	};

	return { score, breakdown };
}

/**
 * Segments transcribed words into candidate take utterances by detecting
 * clip boundaries, inter-speech pauses (>1.0s), and repeated take start cues.
 */
export function segmentWordsIntoUtterances(
	words: TranscribedAudioWord[],
	firstToken?: string
): TranscribedAudioWord[][] {
	if (words.length === 0) return [];
	const utterances: TranscribedAudioWord[][] = [];
	let current: TranscribedAudioWord[] = [];

	for (let i = 0; i < words.length; i++) {
		const w = words[i]!;
		const prev = current[current.length - 1];

		let split = false;
		if (prev) {
			// 1. Clip boundary
			if (w.clipId !== prev.clipId) {
				split = true;
			}
			// 2. Inter-take pause > 1.0s
			else if (w.startUs - prev.endUs > 1_000_000) {
				split = true;
			}
			// 3. Restart / repetition of firstToken after at least 3 words
			else if (firstToken && w.cleanWord === firstToken && current.length >= 3) {
				split = true;
			}
		}

		if (split && current.length > 0) {
			utterances.push(current);
			current = [];
		}

		current.push(w);
	}

	if (current.length > 0) {
		utterances.push(current);
	}

	return utterances;
}

/**
 * Searches transcribed words and groups candidate takes for each script line.
 */
export function alignScriptWithAudioWords(
	script: ParsedScript,
	words: TranscribedAudioWord[]
): TakeGroup[] {
	if (script.lines.length === 0 || words.length === 0) return [];

	const groups: TakeGroup[] = [];

	for (const line of script.lines) {
		const targetTokens = line.text.split(/\s+/).map(cleanToken).filter(Boolean);

		if (targetTokens.length === 0) continue;

		const firstToken = targetTokens[0]!;
		const candidates: TakeCandidate[] = [];

		// Segment words into candidate speech utterances
		const utterances = segmentWordsIntoUtterances(words, firstToken);

		for (const utterance of utterances) {
			if (utterance.length === 0) continue;

			const alignment = alignWords(targetTokens, utterance);

			// Accept take candidate if:
			// 1. It matched at least 3 target words, OR
			// 2. It matched >= 25% of the target words, OR
			// 3. Contains restart cues with at least 2 matched words
			const hasRestartCue = utterance.some((w) => RESTART_CUES.has(w.cleanWord));
			const minWordsRequired = hasRestartCue
				? 2
				: Math.min(3, Math.ceil(targetTokens.length * 0.25));

			if (
				alignment.matchedTargetCount >= minWordsRequired &&
				alignment.matchedCandidateIndices.length > 0
			) {
				const startIdx = alignment.matchedCandidateIndices[0]!;
				const endIdx =
					alignment.matchedCandidateIndices[alignment.matchedCandidateIndices.length - 1]!;

				// Include any trailing restart/abort words in the candidate span for false starts
				let lastIdx = endIdx;
				if (hasRestartCue && lastIdx < utterance.length - 1) {
					lastIdx = utterance.length - 1;
				}

				const spanWords = utterance.slice(startIdx, lastIdx + 1);
				const firstAudioWord = spanWords[0]!;
				const lastAudioWord = spanWords[spanWords.length - 1]!;

				// Padding of 120ms around spoken take
				const startUs = Math.max(0, firstAudioWord.startUs - 120_000);
				const endUs = lastAudioWord.endUs + 120_000;
				const durationUs = endUs - startUs;

				const transcriptText = spanWords.map((item) => item.word).join(' ');
				const avgConfidence =
					spanWords.reduce((sum, item) => sum + (item.confidence || 0.9), 0) / spanWords.length;

				const defects = evaluateDefects(
					spanWords,
					alignment.fillerIndices,
					targetTokens.length,
					alignment.matchedTargetCount
				);

				const candidateId = `cand_${line.id}_take_${candidates.length + 1}`;

				candidates.push({
					id: candidateId,
					scriptLineId: line.id,
					lineIndex: line.lineIndex,
					clipId: firstAudioWord.clipId,
					trackId: firstAudioWord.trackId,
					assetId: firstAudioWord.assetId,
					startUs,
					endUs,
					durationUs,
					sourceIn: startUs,
					sourceOut: endUs,
					transcript: transcriptText,
					confidence: avgConfidence,
					alignmentScore: alignment.score,
					defects,
					score: 0,
					scoreBreakdown: {
						accuracy: 0,
						completeness: 0,
						fluency: 0,
						audioQuality: 0,
						recency: 0
					}
				});
			}
		}

		// Score all takes for this line
		const totalTakes = candidates.length;
		for (let t = 0; t < candidates.length; t++) {
			const cand = candidates[t]!;
			const { score, breakdown } = scoreTakeCandidate(
				cand.defects,
				targetTokens.length,
				Math.round(
					(cand.alignmentScore / Math.max(1, targetTokens.length * 3)) * targetTokens.length
				),
				cand.alignmentScore,
				t,
				totalTakes,
				cand.confidence
			);
			cand.score = score;
			cand.scoreBreakdown = breakdown;
		}

		// Sort takes descending by score
		candidates.sort((a, b) => b.score - a.score);

		// Choose the highest scoring take as default
		if (candidates.length > 0) {
			candidates[0]!.isChosen = true;
		}

		groups.push({
			id: `group_${line.id}`,
			scriptLineId: line.id,
			lineIndex: line.lineIndex,
			candidates,
			selectedTakeId: candidates[0]?.id ?? ''
		});
	}

	return groups;
}
