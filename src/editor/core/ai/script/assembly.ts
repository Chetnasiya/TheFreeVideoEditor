import { groupOf } from '../../../core/timeline';
import type {
	Clip,
	ClipId,
	Project,
	Sequence,
	SequenceId,
	Time,
	Track,
	TrackId
} from '../../../core/types';
import type { ParsedScript, TakeCandidate, TakeGroup } from '../types';

function createId(prefix: string): string {
	return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface AssembleSequenceOptions {
	sequenceName?: string;
	includeOptional?: boolean;
}

/**
 * Assembles a new rough-cut sequence placing the chosen takes for each script line
 * consecutively in script order. Dual-system audio or linked camera video are preserved
 * in sync.
 */
export function assembleSequenceFromScriptTakes(
	project: Project,
	script: ParsedScript,
	takeGroups: TakeGroup[],
	options: AssembleSequenceOptions = {}
): { project: Project; sequenceId: SequenceId } {
	const seqName = options.sequenceName || `${project.name} – Rough Cut`;
	const includeOptional = options.includeOptional ?? false;

	const newSeqId = createId('seq_roughcut') as unknown as SequenceId;
	const vTrackId = createId('track_v1') as TrackId;
	const aTrackId = createId('track_a1') as TrackId;

	const videoTrack: Track = {
		id: vTrackId,
		name: 'Video 1',
		kind: 'video',
		muted: false,
		locked: false,
		hidden: false,
		clips: []
	};

	const audioTrack: Track = {
		id: aTrackId,
		name: 'Audio 1',
		kind: 'audio',
		muted: false,
		locked: false,
		hidden: false,
		clips: []
	};

	let playheadTime: Time = 0;

	for (const line of script.lines) {
		if (line.optional && !includeOptional) continue;

		const group = takeGroups.find((g) => g.scriptLineId === line.id);
		if (!group || group.candidates.length === 0) continue;

		const chosenTake =
			group.candidates.find((c) => c.id === group.selectedTakeId) ||
			group.candidates.find((c) => c.isChosen) ||
			group.candidates[0]!;

		// Find original clip to locate linked partners or assets
		let originalClip: Clip | undefined;
		for (const track of project.tracks) {
			const found = track.clips.find((c) => c.id === chosenTake.clipId);
			if (found) {
				originalClip = found;
				break;
			}
		}

		const partnerClips = originalClip ? groupOf(project, originalClip.id) : [];
		const originalVideoClip =
			partnerClips.find(
				(c) => project.tracks.find((t) => t.clips.some((tc) => tc.id === c.id))?.kind === 'video'
			) ||
			(originalClip?.assetId && project.assets[originalClip.assetId]?.kind === 'video'
				? originalClip
				: undefined);

		const originalAudioClip =
			partnerClips.find(
				(c) => project.tracks.find((t) => t.clips.some((tc) => tc.id === c.id))?.kind === 'audio'
			) ||
			(originalClip?.assetId && project.assets[originalClip.assetId]?.kind === 'audio'
				? originalClip
				: undefined);

		const sharedLinkId = createId('link_take');
		const duration = chosenTake.durationUs;

		// Video clip
		if (originalVideoClip || chosenTake.assetId) {
			const vClipId = createId('clip_v') as unknown as ClipId;
			const vAssetId = originalVideoClip?.assetId ?? chosenTake.assetId;
			videoTrack.clips.push({
				id: vClipId,
				assetId: vAssetId,
				start: playheadTime,
				duration,
				sourceIn: chosenTake.sourceIn,
				sourceOut: chosenTake.sourceOut,
				speed: 1,
				volume: 1,
				linkId: sharedLinkId,
				takeGroupId: group.id,
				takeCandidateId: chosenTake.id
			});
		}

		// Audio clip
		const aClipId = createId('clip_a') as unknown as ClipId;
		const aAssetId = originalAudioClip?.assetId ?? chosenTake.assetId;
		audioTrack.clips.push({
			id: aClipId,
			assetId: aAssetId,
			start: playheadTime,
			duration,
			sourceIn: chosenTake.sourceIn,
			sourceOut: chosenTake.sourceOut,
			speed: 1,
			volume: 1,
			linkId: sharedLinkId,
			takeGroupId: group.id,
			takeCandidateId: chosenTake.id
		});

		playheadTime += duration;
	}

	const newSequence: Sequence = {
		id: newSeqId,
		name: seqName,
		settings: { ...project.settings },
		tracks: [videoTrack, audioTrack],
		markers: []
	};

	const updatedProject: Project = {
		...project,
		sequences: {
			...(project.sequences ?? {}),
			[newSeqId]: newSequence
		}
	};

	return { project: updatedProject, sequenceId: newSeqId };
}

/**
 * Swaps a clip's take candidate on the timeline, updating start/duration/sourceIn/sourceOut
 * and rippling following clips to maintain synchronization.
 */
export function swapTakeInProject(
	project: Project,
	sequenceId: SequenceId,
	clipId: ClipId,
	newTake: TakeCandidate
): Project {
	const isRoot =
		sequenceId === ('root' as unknown as SequenceId) || !project.sequences?.[sequenceId];
	const tracks = isRoot ? project.tracks : project.sequences![sequenceId]!.tracks;

	// Find the clip to swap
	let targetClip: Clip | undefined;
	for (const track of tracks) {
		const found = track.clips.find((c) => c.id === clipId);
		if (found) {
			targetClip = found;
			break;
		}
	}

	if (!targetClip) return project;

	const oldDuration = targetClip.duration;
	const newDuration = newTake.durationUs;
	const durationDelta = newDuration - oldDuration;

	// Find all linked clips
	const partnerIds = new Set(
		targetClip.linkId
			? tracks.flatMap((t) =>
					t.clips.filter((c) => c.linkId === targetClip!.linkId).map((c) => c.id)
				)
			: [targetClip.id]
	);

	const updatedTracks = tracks.map((track) => {
		const newClips = track.clips.map((clip) => {
			if (partnerIds.has(clip.id)) {
				return {
					...clip,
					duration: newDuration,
					sourceIn: newTake.sourceIn,
					sourceOut: newTake.sourceOut,
					takeCandidateId: newTake.id
				};
			}
			// Ripple following clips
			if (clip.start > targetClip!.start) {
				return {
					...clip,
					start: clip.start + durationDelta
				};
			}
			return clip;
		});

		return {
			...track,
			clips: newClips
		};
	});

	if (isRoot) {
		return {
			...project,
			tracks: updatedTracks
		};
	}

	return {
		...project,
		sequences: {
			...project.sequences,
			[sequenceId]: {
				...project.sequences![sequenceId]!,
				tracks: updatedTracks
			}
		}
	};
}
