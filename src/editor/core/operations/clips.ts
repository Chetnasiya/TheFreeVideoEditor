import { retimeClipAnimation, splitClipAnimation } from '../clipAnimation';
import { createAssetId } from '../ids';
import { framesToTicks } from '../time';
import { timelineToSource } from '../timeRemap';
import { clipEnd, findFreeGap, groupOf, nearestValidStart } from '../timeline';
import type { Asset, Clip, ClipId, Project, Time, Track, TrackId } from '../types';
import {
	AssetNotFoundError,
	ClipNotFoundError,
	InvalidClipEditError,
	NoSpaceError,
	TrackKindMismatchError,
	TrackLockedError,
	TrackNotFoundError
} from './errors';

function makeId(): string {
	return createAssetId();
}

function frameDuration(project: Project): Time {
	return framesToTicks(1, project.settings.fps);
}

function tracksWithClips(project: Project, update: (track: Track) => Track): Project {
	return { ...project, tracks: project.tracks.map(update) };
}

function findTrack(project: Project, trackId: TrackId): Track {
	const track = project.tracks.find((item) => item.id === trackId);
	if (!track) throw new TrackNotFoundError(trackId);
	return track;
}

function findClip(project: Project, clipId: ClipId): { clip: Clip; track: Track } {
	for (const track of project.tracks) {
		const clip = track.clips.find((item) => item.id === clipId);
		if (clip) return { clip, track };
	}
	throw new ClipNotFoundError(clipId);
}

function fitsTrack(asset: Asset, track: Track, linkId?: string): boolean {
	return track.kind === 'video'
		? asset.kind === 'video' || asset.kind === 'image'
		: asset.kind === 'audio' || (asset.kind === 'video' && Boolean(asset.hasAudio && linkId));
}

export function insertClip(project: Project, trackId: TrackId, clip: Clip): Project {
	const track = findTrack(project, trackId);
	if (track.locked) throw new TrackLockedError(track.id);
	if (clip.assetId) {
		const asset = project.assets[clip.assetId];
		if (asset && !fitsTrack(asset, track, clip.linkId)) throw new TrackKindMismatchError();
	} else if (clip.source?.type === 'adjustment' || clip.source?.type === 'solid') {
		if (track.kind !== 'video') throw new TrackKindMismatchError();
	}
	if (findFreeGap(track, clip.start, clip.duration) === null) throw new NoSpaceError();
	return tracksWithClips(project, (current) =>
		current.id === trackId
			? { ...current, clips: [...current.clips, clip].toSorted((a, b) => a.start - b.start) }
			: current
	);
}

export interface AddClipFromAssetArgs {
	assetId: Asset['id'];
	trackId: TrackId;
	start: Time;
}

export function addClipFromAsset(project: Project, args: AddClipFromAssetArgs): Project {
	const asset = project.assets[args.assetId];
	if (!asset) throw new AssetNotFoundError(args.assetId);
	const primaryTrack = findTrack(project, args.trackId);
	if (primaryTrack.locked) throw new TrackLockedError(primaryTrack.id);
	if (!fitsTrack(asset, primaryTrack)) throw new TrackKindMismatchError();
	const duration =
		asset.kind === 'image' ? Math.max(asset.duration, frameDuration(project)) : asset.duration;
	const primaryStart = nearestValidStart(primaryTrack, args.start, duration);
	if (primaryStart === null) throw new NoSpaceError();
	const linkId =
		asset.kind === 'video' && asset.hasAudio && primaryTrack.kind === 'video'
			? makeId()
			: undefined;
	const primary: Clip = {
		id: makeId() as ClipId,
		assetId: asset.id,
		start: primaryStart,
		duration,
		sourceIn: 0,
		sourceOut: duration,
		speed: 1,
		volume: 1,
		...(linkId ? { linkId } : {})
	};
	let updated = insertClip(project, primaryTrack.id, primary);

	if (linkId && asset.kind === 'video') {
		let audioTrack = updated.tracks.find(
			(track) =>
				track.kind === 'audio' &&
				!track.locked &&
				findFreeGap(track, primaryStart, duration) === primaryStart
		);
		if (!audioTrack) {
			const count = updated.tracks.filter((track) => track.kind === 'audio').length + 1;
			audioTrack = {
				id: makeId() as TrackId,
				kind: 'audio',
				name: `Audio ${count}`,
				muted: false,
				locked: false,
				hidden: false,
				clips: []
			};
			updated = { ...updated, tracks: [...updated.tracks, audioTrack] };
		}
		const audioStart = nearestValidStart(audioTrack, primaryStart, duration);
		if (audioStart === null) throw new NoSpaceError('No audio track has room for linked audio.');
		const linkedAudio: Clip = {
			...primary,
			id: makeId() as ClipId,
			start: audioStart,
			sourceOut: duration,
			linkId
		};
		updated = insertClip(updated, audioTrack.id, linkedAudio);
	}
	return updated;
}

export interface MoveClipsArgs {
	clipIds: readonly ClipId[];
	deltaTime: Time;
	targetTrackId?: TrackId;
	unlink?: boolean;
}

export function moveClips(project: Project, args: MoveClipsArgs): Project {
	if (args.clipIds.length === 0) return project;
	const selected = new Set<ClipId>();
	for (const id of args.clipIds) {
		const { clip } = findClip(project, id);
		for (const member of args.unlink ? [clip] : groupOf(project, id)) selected.add(member.id);
	}
	const moving = project.tracks.flatMap((track) =>
		track.clips.filter((clip) => selected.has(clip.id)).map((clip) => ({ clip, track }))
	);
	for (const { track } of moving) if (track.locked) throw new TrackLockedError(track.id);
	const anchor = moving.find(({ clip }) => args.clipIds.includes(clip.id));
	if (!anchor) return project;
	const desiredAnchor = Math.max(0, anchor.clip.start + args.deltaTime);
	const destinations = moving.map(({ clip, track }) => {
		const destination =
			args.targetTrackId && track.kind === findTrack(project, anchor.track.id).kind
				? findTrack(project, args.targetTrackId)
				: findTrack(project, track.id);
		if (destination.locked) throw new TrackLockedError(destination.id);
		if (clip.assetId) {
			const asset = project.assets[clip.assetId];
			const audioSource = track.kind === 'audio' ? (clip.linkId ?? 'detached-audio') : clip.linkId;
			if (!asset || !fitsTrack(asset, destination, audioSource)) throw new TrackKindMismatchError();
		} else if (destination.kind !== 'video') {
			throw new TrackKindMismatchError();
		}
		const desiredStart = Math.max(0, clip.start + (desiredAnchor - anchor.clip.start));
		return { clip, destination, desiredStart };
	});

	const anchorDestination = destinations.find(
		({ clip }) => clip.id === anchor.clip.id
	)?.destination;
	if (!anchorDestination) return project;
	const candidateStarts = new Set<Time>([desiredAnchor]);
	for (const entry of destinations) {
		for (const clip of entry.destination.clips) {
			if (selected.has(clip.id)) continue;
			candidateStarts.add(
				Math.max(0, anchor.clip.start + clip.start - entry.clip.duration - entry.clip.start)
			);
			candidateStarts.add(Math.max(0, anchor.clip.start + clipEnd(clip) - entry.clip.start));
		}
	}
	const orderedCandidates = [...candidateStarts].toSorted(
		(a, b) => Math.abs(a - desiredAnchor) - Math.abs(b - desiredAnchor) || a - b
	);
	const minimumMovingStart = Math.min(...moving.map(({ clip }) => clip.start));
	let offset: Time | undefined;
	for (const candidate of orderedCandidates) {
		const proposedOffset = candidate - anchor.clip.start;
		if (proposedOffset < -minimumMovingStart) continue;
		const reservations = new Map<TrackId, Array<{ start: Time; end: Time }>>();
		let valid = true;
		for (const entry of destinations) {
			const start = Math.max(0, entry.clip.start + proposedOffset);
			const end = start + entry.clip.duration;
			const occupied = entry.destination.clips.filter((clip) => !selected.has(clip.id));
			const reserved = reservations.get(entry.destination.id) ?? [];
			if (
				occupied.some((clip) => start < clipEnd(clip) && end > clip.start) ||
				reserved.some((span) => start < span.end && end > span.start)
			) {
				valid = false;
				break;
			}
			reserved.push({ start, end });
			reservations.set(entry.destination.id, reserved);
		}
		if (valid) {
			offset = proposedOffset;
			break;
		}
	}
	if (offset === undefined) throw new NoSpaceError();
	const byTrack = new Map<TrackId, Clip[]>();
	for (const entry of destinations) {
		const clips = byTrack.get(entry.destination.id) ?? [];
		clips.push({ ...entry.clip, start: Math.max(0, entry.clip.start + offset) });
		byTrack.set(entry.destination.id, clips);
	}
	const moved = project.tracks.map((track) => {
		const remaining = track.clips.filter((clip) => !selected.has(clip.id));
		const arrivals = byTrack.get(track.id) ?? [];
		return { ...track, clips: [...remaining, ...arrivals].toSorted((a, b) => a.start - b.start) };
	});
	return { ...project, tracks: moved };
}

export type TrimEdge = 'start' | 'end';

export function trimClip(
	project: Project,
	clipId: ClipId,
	edge: TrimEdge,
	requestedTime: Time,
	unlink = false
): Project {
	const { clip } = findClip(project, clipId);
	const group = unlink ? [clip] : groupOf(project, clipId);
	const edits = group.map((member) => {
		const memberTrack = findTrack(
			project,
			project.tracks.find((row) => row.clips.includes(member))!.id
		);
		if (memberTrack.locked) throw new TrackLockedError(memberTrack.id);
		const asset = member.assetId ? project.assets[member.assetId] : null;
		if (member.assetId && !asset) throw new AssetNotFoundError(member.assetId);
		const isStillLike = !asset || asset.kind === 'image';
		let start = member.start;
		let duration = member.duration;
		let sourceIn = member.sourceIn;
		let sourceOut = member.sourceOut;
		if (edge === 'start') {
			const end = clipEnd(member);
			const minimum = Math.min(frameDuration(project), member.duration);
			if (member.timeRemap) {
				start = Math.max(0, Math.min(end - minimum, requestedTime));
				duration = end - start;
				sourceIn = timelineToSource(member, start);
				sourceOut = timelineToSource(member, end);
			} else {
				const minStart = Math.max(0, member.start - member.sourceIn / member.speed);
				start = Math.max(minStart, Math.min(end - minimum, requestedTime));
				if (isStillLike) {
					duration = end - start;
					sourceIn = Math.max(
						0,
						member.sourceIn + Math.round((start - member.start) * member.speed)
					);
					sourceOut = sourceIn + Math.round(duration * member.speed);
				} else {
					sourceIn = Math.max(
						0,
						member.sourceIn + Math.round((start - member.start) * member.speed)
					);
					duration = Math.max(minimum, Math.round((member.sourceOut - sourceIn) / member.speed));
					start = end - duration;
					sourceOut = member.sourceOut;
				}
			}
		} else {
			const requestedEnd = Math.max(member.start + frameDuration(project), requestedTime);
			if (member.timeRemap) {
				duration = requestedEnd - member.start;
				start = member.start;
				sourceIn = member.sourceIn;
				sourceOut = timelineToSource(member, member.start + duration);
			} else {
				const maxDuration = isStillLike
					? requestedEnd - member.start
					: Math.max(0, ((asset?.duration ?? 0) - member.sourceIn) / member.speed);
				duration = Math.max(
					Math.min(frameDuration(project), maxDuration),
					Math.min(requestedEnd - member.start, maxDuration)
				);
				start = member.start;
				sourceIn = member.sourceIn;
				sourceOut = sourceIn + Math.round(duration * member.speed);
			}
		}
		return {
			old: member,
			trackId: memberTrack.id,
			clip: {
				...member,
				start,
				duration,
				sourceIn,
				sourceOut,
				...(edge === 'start' ? retimeClipAnimation(member, start - member.start) : {})
			}
		};
	});
	const movingIds = new Set(edits.map(({ old }) => old.id));
	for (const edit of edits) {
		const memberTrack = findTrack(project, edit.trackId);
		if (
			memberTrack.clips.some(
				(other) =>
					!movingIds.has(other.id) &&
					edit.clip.start < clipEnd(other) &&
					clipEnd(edit.clip) > other.start
			)
		) {
			throw new NoSpaceError('The trim would overlap another clip.');
		}
	}
	return tracksWithClips(project, (current) => ({
		...current,
		clips: current.clips.map(
			(member) => edits.find((edit) => edit.old.id === member.id)?.clip ?? member
		)
	}));
}

export interface SplitResult {
	project: Project;
	splitClipIds: ClipId[];
	noOpClipIds: ClipId[];
}

export function splitClipsAt(
	project: Project,
	time: Time,
	clipIds: readonly ClipId[],
	unlink = false
): SplitResult {
	const targets = new Set<ClipId>();
	for (const id of clipIds) {
		const { clip } = findClip(project, id);
		for (const member of unlink ? [clip] : groupOf(project, id)) targets.add(member.id);
	}
	const noOpClipIds: ClipId[] = [];
	const splitClipIds: ClipId[] = [];
	const leftLinkMap = new Map<string, string>();
	const rightLinkMap = new Map<string, string>();
	const tracks = project.tracks.map((track) => {
		const clips: Clip[] = [];
		for (const clip of track.clips) {
			if (!targets.has(clip.id) || time <= clip.start || time >= clipEnd(clip)) {
				if (targets.has(clip.id)) noOpClipIds.push(clip.id);
				clips.push(clip);
				continue;
			}
			if (track.locked) throw new TrackLockedError(track.id);
			const leftDuration = time - clip.start;
			const sourceMiddle = clip.timeRemap
				? timelineToSource(clip, time)
				: clip.sourceIn + Math.round(leftDuration * clip.speed);
			const [leftAnimation, rightAnimation] = splitClipAnimation(clip, leftDuration);
			const leftLink = clip.linkId
				? (leftLinkMap.get(clip.linkId) ?? leftLinkMap.set(clip.linkId, makeId()).get(clip.linkId)!)
				: undefined;
			const rightLink = clip.linkId
				? (rightLinkMap.get(clip.linkId) ??
					rightLinkMap.set(clip.linkId, makeId()).get(clip.linkId)!)
				: undefined;
			const left: Clip = {
				...clip,
				duration: leftDuration,
				sourceOut: sourceMiddle,
				...leftAnimation,
				...(leftLink ? { linkId: leftLink } : {})
			};
			const right: Clip = {
				...clip,
				id: makeId() as ClipId,
				start: time,
				duration: clipEnd(clip) - time,
				sourceIn: sourceMiddle,
				...rightAnimation,
				...(rightAnimation.effects
					? { effects: rightAnimation.effects.map((effect) => ({ ...effect, id: makeId() })) }
					: {}),
				...(rightAnimation.masks
					? { masks: rightAnimation.masks.map((mask) => ({ ...mask, id: makeId() })) }
					: {}),
				...(rightLink ? { linkId: rightLink } : {})
			};
			clips.push(left, right);
			splitClipIds.push(left.id, right.id);
		}
		return { ...track, clips: clips.toSorted((a, b) => a.start - b.start) };
	});
	return {
		project: splitClipIds.length ? { ...project, tracks } : project,
		splitClipIds,
		noOpClipIds
	};
}

export function deleteClips(project: Project, clipIds: readonly ClipId[], unlink = false): Project {
	const ids = new Set<ClipId>();
	for (const id of clipIds) {
		const { clip } = findClip(project, id);
		for (const member of unlink ? [clip] : groupOf(project, id)) ids.add(member.id);
	}
	for (const track of project.tracks) {
		if (track.locked && track.clips.some((clip) => ids.has(clip.id)))
			throw new TrackLockedError(track.id);
	}
	return tracksWithClips(project, (track) => ({
		...track,
		clips: track.clips.filter((clip) => !ids.has(clip.id))
	}));
}

export function rippleDeleteClips(project: Project, clipIds: readonly ClipId[]): Project {
	const selected = new Set<ClipId>();
	for (const id of clipIds) for (const clip of groupOf(project, id)) selected.add(clip.id);
	for (const track of project.tracks) {
		if (track.locked && track.clips.some((clip) => selected.has(clip.id))) {
			throw new TrackLockedError(track.id);
		}
	}
	const tracks = project.tracks.map((track) => {
		const remove = track.clips.filter((clip) => selected.has(clip.id));
		if (!remove.length || track.locked) return track;
		const removedIds = new Set(remove.map((clip) => clip.id));
		return {
			...track,
			clips: track.clips
				.filter((clip) => !removedIds.has(clip.id))
				.map((clip) => {
					const elapsed = remove
						.filter((deleted) => clipEnd(deleted) <= clip.start)
						.reduce((sum, deleted) => sum + deleted.duration, 0);
					return elapsed > 0 ? { ...clip, start: clip.start - elapsed } : clip;
				})
				.toSorted((a, b) => a.start - b.start)
		};
	});
	return { ...project, tracks };
}

export function duplicateClips(project: Project, clipIds: readonly ClipId[]): Project {
	if (clipIds.length === 0) return project;
	const expanded = new Map<TrackId, Clip[]>();
	for (const id of clipIds) {
		findClip(project, id);
		for (const member of groupOf(project, id)) {
			const track = project.tracks.find((row) => row.clips.some((item) => item.id === member.id))!;
			if (track.locked) throw new TrackLockedError(track.id);
			const entries = expanded.get(track.id) ?? [];
			if (!entries.some((item) => item.id === member.id)) entries.push(member);
			expanded.set(track.id, entries);
		}
	}
	const sourceClips = [...expanded.values()].flat();
	const minStart = Math.min(...sourceClips.map((clip) => clip.start));
	const maxEnd = Math.max(...sourceClips.map(clipEnd));
	const desiredOffset = maxEnd - minStart;
	const candidateOffsets = new Set<Time>([desiredOffset]);
	for (const [trackId, clips] of expanded) {
		const track = findTrack(project, trackId);
		for (const source of clips) {
			for (const occupied of track.clips) {
				if (sourceClips.some((item) => item.id === occupied.id)) continue;
				candidateOffsets.add(occupied.start - source.duration - source.start);
				candidateOffsets.add(clipEnd(occupied) - source.start);
			}
		}
	}
	const delta = [...candidateOffsets]
		.filter((offset) => offset >= 0)
		.toSorted((a, b) => Math.abs(a - desiredOffset) - Math.abs(b - desiredOffset) || a - b)
		.find((offset) =>
			sourceClips.every((source) => {
				const track = findTrack(
					project,
					project.tracks.find((row) => row.clips.includes(source))!.id
				);
				const start = source.start + offset;
				return track.clips
					.filter((clip) => !sourceClips.some((moving) => moving.id === clip.id))
					.every((clip) => start >= clipEnd(clip) || start + source.duration <= clip.start);
			})
		);
	if (delta === undefined) throw new NoSpaceError();
	const linkMap = new Map<string, string>();
	const tracks = project.tracks.map((track) => {
		const source = expanded.get(track.id) ?? [];
		if (!source.length) return track;
		const copies = source.map((clip) => {
			const linkId = clip.linkId
				? (linkMap.get(clip.linkId) ?? linkMap.set(clip.linkId, makeId()).get(clip.linkId)!)
				: undefined;
			return {
				...clip,
				id: makeId() as ClipId,
				start: clip.start + delta,
				...(linkId ? { linkId } : {}),
				effects: clip.effects?.map((effect) => ({ ...effect, id: makeId() })),
				...(clip.masks ? { masks: clip.masks.map((mask) => ({ ...mask, id: makeId() })) } : {})
			};
		});
		return { ...track, clips: [...track.clips, ...copies].toSorted((a, b) => a.start - b.start) };
	});
	return { ...project, tracks };
}

export function linkClips(project: Project, clipIds: readonly ClipId[]): Project {
	const ids = new Set(clipIds);
	if (ids.size < 2) throw new InvalidClipEditError('Select at least 2 clips to link them.');
	const found = project.tracks.flatMap((track) => track.clips.filter((clip) => ids.has(clip.id)));
	const missingId = clipIds.find((id) => !found.some((clip) => clip.id === id));
	if (missingId) throw new ClipNotFoundError(missingId);
	const linkId = makeId();
	return tracksWithClips(project, (track) => ({
		...track,
		clips: track.clips.map((clip) => (ids.has(clip.id) ? { ...clip, linkId } : clip))
	}));
}

export function unlinkClips(project: Project, clipIds: readonly ClipId[]): Project {
	const ids = new Set<ClipId>();
	for (const id of clipIds) {
		const { clip } = findClip(project, id);
		for (const member of groupOf(project, id)) ids.add(member.id);
		if (!clip.linkId) ids.add(id);
	}
	return tracksWithClips(project, (track) => ({
		...track,
		clips: track.clips.map((clip) => {
			if (!ids.has(clip.id)) return clip;
			const next = { ...clip };
			delete next.linkId;
			return next;
		})
	}));
}
