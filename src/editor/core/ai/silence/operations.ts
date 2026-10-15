import { createAssetId } from '../../../core/ids';
import {
	applyToSequence,
	isRootSequence,
	ROOT_SEQUENCE_ID,
	viewProject
} from '../../sequences/access';
import type {
	Clip,
	ClipId,
	Marker,
	MarkerId,
	Project,
	Sequence,
	SequenceId,
	Time,
	Track
} from '../../../core/types';
import type { DetectedSilence, SilenceApplyTarget, SilenceTrimMode } from './types';

export interface ApplySilenceTrimOptions {
	action: SilenceTrimMode;
	applyTarget: SilenceApplyTarget;
	crossfadeMs: number; // default 5ms
	mode: 'new-sequence' | 'in-place';
	sequenceName?: string;
}

export interface CutInterval {
	start: Time;
	end: Time;
	duration: Time;
}

/**
 * Normalizes and merges adjacent/overlapping cut intervals.
 */
export function normalizeCuts(cuts: Array<{ start: Time; end: Time }>): CutInterval[] {
	if (cuts.length === 0) return [];
	const sorted = [...cuts].filter((c) => c.end > c.start).sort((a, b) => a.start - b.start);

	const merged: CutInterval[] = [];
	let current = sorted[0]!;

	for (let i = 1; i < sorted.length; i++) {
		const next = sorted[i]!;
		if (next.start <= current.end) {
			current = {
				start: current.start,
				end: Math.max(current.end, next.end)
			};
		} else {
			merged.push({
				start: current.start,
				end: current.end,
				duration: current.end - current.start
			});
			current = next;
		}
	}
	merged.push({
		start: current.start,
		end: current.end,
		duration: current.end - current.start
	});

	return merged;
}

/**
 * Calculates how much time is removed prior to time t by the list of cuts.
 */
export function removedTimeBefore(t: Time, cuts: readonly CutInterval[]): Time {
	let removed = 0;
	for (const cut of cuts) {
		if (cut.end <= t) {
			removed += cut.duration;
		} else if (cut.start < t) {
			removed += t - cut.start;
		} else {
			break;
		}
	}
	return removed;
}

/**
 * Transforms a track by cutting out the specified cut intervals:
 * - Drops parts of clips falling inside cuts
 * - Preserves parts outside cuts with updated timeline starts and source ranges
 * - Adds audio crossfades (fades) at cut seams
 * - Keeps sample-accurate synchronisation across all tracks
 */
export function applyCutsToTrack(
	track: Track,
	cuts: readonly CutInterval[],
	crossfadeMs = 5
): Track {
	if (cuts.length === 0 || track.clips.length === 0) return track;

	const crossfadeUs = Math.max(0, crossfadeMs * 1000);
	const newClips: Clip[] = [];

	for (const clip of track.clips) {
		const clipStart = clip.start;
		const clipEnd = clip.start + clip.duration;

		// Compute sub-segments outside cuts
		let cursor = clipStart;

		for (const cut of cuts) {
			if (cut.end <= cursor) continue;
			if (cut.start >= clipEnd) break;

			// Kept portion before this cut
			if (cut.start > cursor) {
				const segStart = cursor;
				const segEnd = Math.min(clipEnd, cut.start);
				const segDur = segEnd - segStart;

				if (segDur > 0) {
					const offsetFromClipStart = segStart - clipStart;
					const sourceIn = clip.sourceIn + Math.round(offsetFromClipStart * clip.speed);
					const sourceOut = sourceIn + Math.round(segDur * clip.speed);
					const newStart = segStart - removedTimeBefore(segStart, cuts);

					const seg: Clip = {
						...clip,
						id: createAssetId() as unknown as ClipId,
						start: newStart,
						duration: segDur,
						sourceIn,
						sourceOut
					};

					if (track.kind === 'audio' && crossfadeUs > 0) {
						if (segStart > clipStart) {
							seg.fadeInUs = Math.max(seg.fadeInUs ?? 0, crossfadeUs);
						}
						seg.fadeOutUs = Math.max(seg.fadeOutUs ?? 0, crossfadeUs);
					}

					newClips.push(seg);
				}
			}

			cursor = Math.max(cursor, cut.end);
		}

		// Kept portion after the last intersecting cut
		if (cursor < clipEnd) {
			const segStart = cursor;
			const segEnd = clipEnd;
			const segDur = segEnd - segStart;

			if (segDur > 0) {
				const offsetFromClipStart = segStart - clipStart;
				const sourceIn = clip.sourceIn + Math.round(offsetFromClipStart * clip.speed);
				const sourceOut = sourceIn + Math.round(segDur * clip.speed);
				const newStart = segStart - removedTimeBefore(segStart, cuts);

				const seg: Clip = {
					...clip,
					id: createAssetId() as unknown as ClipId,
					start: newStart,
					duration: segDur,
					sourceIn,
					sourceOut
				};

				if (track.kind === 'audio' && crossfadeUs > 0 && segStart > clipStart) {
					seg.fadeInUs = Math.max(seg.fadeInUs ?? 0, crossfadeUs);
				}

				newClips.push(seg);
			}
		}
	}

	return {
		...track,
		clips: newClips.sort((a, b) => a.start - b.start)
	};
}

/**
 * Applies detected silence operations (ripple cut, shorten, or add markers) to project.
 */
export function applySilenceTrimToProject(
	project: Project,
	sequenceId: SequenceId = ROOT_SEQUENCE_ID,
	silences: DetectedSilence[],
	options: ApplySilenceTrimOptions
): { project: Project; resultSequenceId: SequenceId } {
	const includedSilences = silences.filter((s) => s.included && s.cutDurationUs > 0);
	if (includedSilences.length === 0) {
		return { project, resultSequenceId: sequenceId };
	}

	// 1. Markers Mode
	if (options.action === 'markers') {
		const newMarkers: Marker[] = includedSilences.map((s) => ({
			id: createAssetId() as unknown as MarkerId,
			time: s.startUs,
			duration: s.durationUs,
			name: 'Silence',
			comment: `Silence gap: ${(s.durationUs / 1_000_000).toFixed(2)}s (cut: ${(s.cutDurationUs / 1_000_000).toFixed(2)}s)`,
			color: 'orange',
			type: 'comment'
		}));

		const updatedProject = applyToSequence(project, sequenceId, (view) => ({
			...view,
			markers: [...(view.markers ?? []), ...newMarkers]
		}));

		return { project: updatedProject, resultSequenceId: sequenceId };
	}

	// 2. Ripple / Shorten Mode
	const normalizedCuts = normalizeCuts(
		includedSilences.map((s) => ({ start: s.cutStartUs, end: s.cutEndUs }))
	);

	const activeView = viewProject(project, sequenceId);
	const targetTracks = activeView.tracks.map((track) => {
		if (options.applyTarget === 'linked-only' && track.kind !== 'audio') {
			// In linked-only mode, only audio tracks and video tracks with linked audio are transformed
			const hasLinkedAudio = track.clips.some((c) =>
				activeView.tracks.some(
					(other) =>
						other.kind === 'audio' && other.clips.some((ac) => ac.linkId && ac.linkId === c.linkId)
				)
			);
			if (!hasLinkedAudio) return track;
		}
		return applyCutsToTrack(track, normalizedCuts, options.crossfadeMs);
	});

	if (options.mode === 'in-place') {
		const updatedProject = applyToSequence(project, sequenceId, (view) => ({
			...view,
			tracks: targetTracks
		}));
		return { project: updatedProject, resultSequenceId: sequenceId };
	}

	// Mode is 'new-sequence': duplicate / create new sequence non-destructively
	const originalName = isRootSequence(sequenceId)
		? project.name || 'Sequence'
		: project.sequences?.[sequenceId]?.name || 'Sequence';
	const trimmedName = options.sequenceName?.trim() || `${originalName} – trimmed`;

	const newSequenceId = createAssetId() as unknown as SequenceId;
	const newSequence: Sequence = {
		id: newSequenceId,
		name: trimmedName,
		tracks: targetTracks,
		settings: activeView.settings
	};

	const updatedProject: Project = {
		...project,
		sequences: {
			...project.sequences,
			[newSequenceId]: newSequence
		}
	};

	return { project: updatedProject, resultSequenceId: newSequenceId };
}
