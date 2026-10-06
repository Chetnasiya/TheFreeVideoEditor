import type { AssetId, ClipId, TrackId } from '../types';

export class ClipNotFoundError extends Error {
	constructor(clipId: ClipId) {
		super(`Clip “${clipId}” does not exist.`);
		this.name = 'ClipNotFoundError';
	}
}

export class TrackNotFoundError extends Error {
	constructor(trackId: TrackId) {
		super(`Track “${trackId}” does not exist.`);
		this.name = 'TrackNotFoundError';
	}
}

export class AssetNotFoundError extends Error {
	constructor(assetId: AssetId) {
		super(`Media asset “${assetId}” does not exist.`);
		this.name = 'AssetNotFoundError';
	}
}

export class TrackLockedError extends Error {
	constructor(trackId: TrackId) {
		super(`Track “${trackId}” is locked.`);
		this.name = 'TrackLockedError';
	}
}

export class TrackKindMismatchError extends Error {
	constructor(message = 'The media asset is not compatible with this track.') {
		super(message);
		this.name = 'TrackKindMismatchError';
	}
}

export class NoSpaceError extends Error {
	constructor(message = 'There is no non-overlapping space for this clip.') {
		super(message);
		this.name = 'NoSpaceError';
	}
}

export class InvalidClipEditError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidClipEditError';
	}
}
