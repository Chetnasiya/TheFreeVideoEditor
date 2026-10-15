import { describe, expect, it } from 'vitest';
import { assembleSequenceFromScriptTakes, swapTakeInProject } from './assembly';
import { createEmptyProject } from '../../../core/factory';
import type { AssetId, ClipId, SequenceId, Track, TrackId } from '../../../core/types';
import type { ParsedScript, TakeCandidate, TakeGroup } from '../types';

describe('Script Take Assembly & Timeline Swapping', () => {
	it('assembles a new rough-cut sequence placing chosen takes in script order', () => {
		const project = createEmptyProject({ name: 'Documentary' });

		const script: ParsedScript = {
			id: 's1',
			title: 'Doc Script',
			rawText: 'Line 1\nLine 2',
			speakers: ['Host'],
			lines: [
				{ id: 'l1', lineIndex: 1, text: 'First line spoken by host.', optional: false },
				{ id: 'l2', lineIndex: 2, text: 'Second line spoken by host.', optional: false },
				{ id: 'l3', lineIndex: 3, text: 'Optional third line.', optional: true }
			]
		};

		const candidate1: TakeCandidate = {
			id: 'cand_l1_take_1',
			scriptLineId: 'l1',
			lineIndex: 1,
			clipId: 'c_orig_1' as ClipId,
			trackId: 't1' as TrackId,
			assetId: 'asset_1' as unknown as AssetId,
			startUs: 0,
			endUs: 3_000_000,
			durationUs: 3_000_000,
			sourceIn: 1_000_000,
			sourceOut: 4_000_000,
			transcript: 'First line spoken by host.',
			confidence: 0.95,
			alignmentScore: 20,
			defects: {
				clipping: false,
				lowSnr: false,
				stumble: false,
				restart: false,
				fillerWords: [],
				longPause: false,
				incomplete: false
			},
			score: 95,
			scoreBreakdown: {
				accuracy: 95,
				completeness: 100,
				fluency: 100,
				audioQuality: 95,
				recency: 50
			},
			isChosen: true
		};

		const candidate2: TakeCandidate = {
			id: 'cand_l2_take_1',
			scriptLineId: 'l2',
			lineIndex: 2,
			clipId: 'c_orig_2' as ClipId,
			trackId: 't1' as TrackId,
			assetId: 'asset_1' as unknown as AssetId,
			startUs: 0,
			endUs: 4_000_000,
			durationUs: 4_000_000,
			sourceIn: 5_000_000,
			sourceOut: 9_000_000,
			transcript: 'Second line spoken by host.',
			confidence: 0.96,
			alignmentScore: 22,
			defects: {
				clipping: false,
				lowSnr: false,
				stumble: false,
				restart: false,
				fillerWords: [],
				longPause: false,
				incomplete: false
			},
			score: 96,
			scoreBreakdown: {
				accuracy: 96,
				completeness: 100,
				fluency: 100,
				audioQuality: 95,
				recency: 50
			},
			isChosen: true
		};

		const takeGroups: TakeGroup[] = [
			{
				id: 'g1',
				scriptLineId: 'l1',
				lineIndex: 1,
				candidates: [candidate1],
				selectedTakeId: candidate1.id
			},
			{
				id: 'g2',
				scriptLineId: 'l2',
				lineIndex: 2,
				candidates: [candidate2],
				selectedTakeId: candidate2.id
			}
		];

		const { project: updated, sequenceId } = assembleSequenceFromScriptTakes(
			project,
			script,
			takeGroups,
			{ includeOptional: false }
		);

		const seq = updated.sequences ? updated.sequences[sequenceId] : undefined;
		expect(seq).toBeDefined();
		if (!seq) throw new Error('Sequence not found');
		expect(seq.name).toBe('Documentary – Rough Cut');

		const vTrack = seq.tracks.find((t) => t.kind === 'video')!;
		const aTrack = seq.tracks.find((t) => t.kind === 'audio')!;

		// Both tracks have 2 clips (l3 was optional and omitted)
		expect(vTrack.clips.length).toBe(2);
		expect(aTrack.clips.length).toBe(2);

		// Clip 1 start = 0, duration = 3s
		expect(vTrack.clips[0]!.start).toBe(0);
		expect(vTrack.clips[0]!.duration).toBe(3_000_000);
		expect(aTrack.clips[0]!.start).toBe(0);
		expect(aTrack.clips[0]!.duration).toBe(3_000_000);

		// Clip 2 start = 3s, duration = 4s
		expect(vTrack.clips[1]!.start).toBe(3_000_000);
		expect(vTrack.clips[1]!.duration).toBe(4_000_000);
		expect(aTrack.clips[1]!.start).toBe(3_000_000);
		expect(aTrack.clips[1]!.duration).toBe(4_000_000);

		// Video and audio clips share the same linkId
		expect(vTrack.clips[0]!.linkId).toBe(aTrack.clips[0]!.linkId);
		expect(vTrack.clips[1]!.linkId).toBe(aTrack.clips[1]!.linkId);
	});

	it('swaps a take on the timeline and ripples following clips to preserve sync', () => {
		const videoTrack: Track = {
			id: 'track_v1' as Track['id'],
			name: 'Video 1',
			kind: 'video',
			muted: false,
			locked: false,
			hidden: false,
			clips: [
				{
					id: 'c_v1' as ClipId,
					assetId: 'asset_1' as unknown as AssetId,
					start: 0,
					duration: 3_000_000,
					sourceIn: 1_000_000,
					sourceOut: 4_000_000,
					speed: 1,
					volume: 1,
					linkId: 'link_1',
					takeCandidateId: 'cand_1'
				},
				{
					id: 'c_v2' as ClipId,
					assetId: 'asset_1' as unknown as AssetId,
					start: 3_000_000,
					duration: 2_000_000,
					sourceIn: 5_000_000,
					sourceOut: 7_000_000,
					speed: 1,
					volume: 1,
					linkId: 'link_2',
					takeCandidateId: 'cand_2'
				}
			]
		};

		const audioTrack: Track = {
			id: 'track_a1' as Track['id'],
			name: 'Audio 1',
			kind: 'audio',
			muted: false,
			locked: false,
			hidden: false,
			clips: [
				{
					id: 'c_a1' as ClipId,
					assetId: 'asset_1' as unknown as AssetId,
					start: 0,
					duration: 3_000_000,
					sourceIn: 1_000_000,
					sourceOut: 4_000_000,
					speed: 1,
					volume: 1,
					linkId: 'link_1',
					takeCandidateId: 'cand_1'
				},
				{
					id: 'c_a2' as ClipId,
					assetId: 'asset_1' as unknown as AssetId,
					start: 3_000_000,
					duration: 2_000_000,
					sourceIn: 5_000_000,
					sourceOut: 7_000_000,
					speed: 1,
					volume: 1,
					linkId: 'link_2',
					takeCandidateId: 'cand_2'
				}
			]
		};

		const project = createEmptyProject({ name: 'Take Swap Test' });
		project.tracks = [videoTrack, audioTrack];

		// New alternate take for Clip 1: longer duration (5s instead of 3s -> delta +2s)
		const alternateTake: TakeCandidate = {
			id: 'cand_1_take_2',
			scriptLineId: 'l1',
			lineIndex: 1,
			clipId: 'c_orig_alt' as ClipId,
			trackId: 't1' as TrackId,
			assetId: 'asset_1' as unknown as AssetId,
			startUs: 0,
			endUs: 5_000_000,
			durationUs: 5_000_000,
			sourceIn: 10_000_000,
			sourceOut: 15_000_000,
			transcript: 'First line spoken by host, longer delivery.',
			confidence: 0.98,
			alignmentScore: 25,
			defects: {
				clipping: false,
				lowSnr: false,
				stumble: false,
				restart: false,
				fillerWords: [],
				longPause: false,
				incomplete: false
			},
			score: 98,
			scoreBreakdown: {
				accuracy: 98,
				completeness: 100,
				fluency: 100,
				audioQuality: 95,
				recency: 100
			}
		};

		const updatedProject = swapTakeInProject(
			project,
			'root' as unknown as SequenceId,
			'c_v1' as ClipId,
			alternateTake
		);

		const updatedVTrack = updatedProject.tracks.find((t) => t.id === 'track_v1')!;
		const updatedATrack = updatedProject.tracks.find((t) => t.id === 'track_a1')!;

		// Both video and audio clip 1 were updated to 5s duration and new sourceIn/Out
		expect(updatedVTrack.clips[0]!.duration).toBe(5_000_000);
		expect(updatedVTrack.clips[0]!.sourceIn).toBe(10_000_000);
		expect(updatedVTrack.clips[0]!.sourceOut).toBe(15_000_000);
		expect(updatedVTrack.clips[0]!.takeCandidateId).toBe('cand_1_take_2');

		expect(updatedATrack.clips[0]!.duration).toBe(5_000_000);
		expect(updatedATrack.clips[0]!.sourceIn).toBe(10_000_000);
		expect(updatedATrack.clips[0]!.sourceOut).toBe(15_000_000);
		expect(updatedATrack.clips[0]!.takeCandidateId).toBe('cand_1_take_2');

		// Following clips (c_v2 and c_a2) were rippled from start 3s to 5s!
		expect(updatedVTrack.clips[1]!.start).toBe(5_000_000);
		expect(updatedATrack.clips[1]!.start).toBe(5_000_000);
	});
});
