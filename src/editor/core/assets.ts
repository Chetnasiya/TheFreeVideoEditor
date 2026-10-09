import type { Asset, AssetId, Clip, Project } from './types';

export class UnknownAssetError extends Error {
	constructor(assetId: AssetId) {
		super(`Media asset “${assetId}” does not exist in this project.`);
		this.name = 'UnknownAssetError';
	}
}

export class AssetInUseError extends Error {
	readonly clips: Clip[];

	constructor(assetId: AssetId, clips: Clip[]) {
		super(`Media asset “${assetId}” is used by ${clips.length} timeline clip(s).`);
		this.name = 'AssetInUseError';
		this.clips = clips;
	}
}

function requireAsset(project: Project, assetId: AssetId): Asset {
	const asset = project.assets[assetId];
	if (!asset) throw new UnknownAssetError(assetId);
	return asset;
}

export function getAssetUsage(project: Project, assetId: AssetId): Clip[] {
	requireAsset(project, assetId);
	const rootClips = project.tracks.flatMap((track) =>
		track.clips.filter((clip) => clip.assetId === assetId)
	);
	const seqClips = Object.values(project.sequences ?? {}).flatMap((seq) =>
		seq.tracks.flatMap((track) => track.clips.filter((clip) => clip.assetId === assetId))
	);
	return [...rootClips, ...seqClips];
}

export function addAsset(project: Project, args: { asset: Asset }): Project {
	if (project.assets[args.asset.id]) {
		throw new Error(`Media asset id “${args.asset.id}” already exists in this project.`);
	}
	return { ...project, assets: { ...project.assets, [args.asset.id]: args.asset } };
}

export function removeAsset(
	project: Project,
	args: { assetId: AssetId; force?: boolean }
): Project {
	const asset = requireAsset(project, args.assetId);
	const clips = getAssetUsage(project, args.assetId);
	if (clips.length > 0 && !args.force) throw new AssetInUseError(args.assetId, clips);
	const removedClipIds = new Set(clips.map((clip) => clip.id));
	if (args.force) {
		const linkedIds = new Set(clips.flatMap((clip) => (clip.linkId ? [clip.linkId] : [])));
		const allTracks = [
			...project.tracks,
			...Object.values(project.sequences ?? {}).flatMap((seq) => seq.tracks)
		];
		for (const track of allTracks) {
			for (const clip of track.clips) {
				if (clip.linkId && linkedIds.has(clip.linkId)) removedClipIds.add(clip.id);
			}
		}
	}

	const filterClips = (tracks: typeof project.tracks) =>
		args.force && removedClipIds.size > 0
			? tracks.map((track) => ({
					...track,
					clips: track.clips.filter((clip) => !removedClipIds.has(clip.id))
				}))
			: tracks;

	const assets = { ...project.assets };
	delete assets[asset.id];

	const updatedSequences = project.sequences
		? Object.fromEntries(
				Object.entries(project.sequences).map(([seqId, seq]) => [
					seqId,
					{ ...seq, tracks: filterClips(seq.tracks) }
				])
			)
		: undefined;

	return {
		...project,
		assets,
		tracks: filterClips(project.tracks),
		...(updatedSequences ? { sequences: updatedSequences } : {})
	};
}

export function renameAsset(project: Project, args: { assetId: AssetId; name: string }): Project {
	const asset = requireAsset(project, args.assetId);
	const name = args.name.trim();
	if (!name) throw new Error('Media asset name cannot be empty.');
	return { ...project, assets: { ...project.assets, [asset.id]: { ...asset, name } } };
}

export function markAssetOffline(
	project: Project,
	args: { assetId: AssetId; offline?: boolean }
): Project {
	const asset = requireAsset(project, args.assetId);
	return {
		...project,
		assets: {
			...project.assets,
			[asset.id]: { ...asset, offline: args.offline ?? true }
		}
	};
}

export function relinkAsset(
	project: Project,
	args: { assetId: AssetId; opfsPath: string; mimeType?: string; size?: number }
): Project {
	const asset = requireAsset(project, args.assetId);
	const onlineAsset = { ...asset };
	delete onlineAsset.offline;
	return {
		...project,
		assets: {
			...project.assets,
			[asset.id]: {
				...onlineAsset,
				opfsPath: args.opfsPath,
				...(args.mimeType === undefined ? {} : { mimeType: args.mimeType }),
				...(args.size === undefined ? {} : { size: args.size })
			}
		}
	};
}
