import type {
	AssetId,
	ClipId,
	TrackId,
	Project,
	Track,
	Clip,
	Asset,
	Marker,
	MarkerId,
	MarkerColor
} from '../../../core/types';
import { createEmptyProject } from '../../../core/factory';
import type { InterchangeTimeline } from '../../../core/interchange/ir';
import { framesToMicros } from '../../../core/interchange/time';

export interface MissingAssetInfo {
	id: AssetId;
	name: string;
	expectedPath: string;
	durationFrames: number;
	hasAudio: boolean;
	width?: number;
	height?: number;
}

export interface RelinkMatchCandidate {
	file: File;
	score: number; // 0 to 1
	reason: string;
}

/**
 * Checks which assets in the InterchangeTimeline do not have local file bytes.
 */
export function identifyMissingAssets(
	ir: InterchangeTimeline,
	availablePackageFiles: Map<string, Uint8Array | File> = new Map()
): MissingAssetInfo[] {
	const missing: MissingAssetInfo[] = [];

	for (const [id, asset] of ir.assets.entries()) {
		const cleanPath = asset.path.replace(/^\/+/, '');
		const cleanName = asset.name.toLowerCase();

		let found = false;
		for (const key of availablePackageFiles.keys()) {
			const candidateClean = key.replace(/^\/+/, '');
			if (
				candidateClean.toLowerCase() === cleanPath.toLowerCase() ||
				candidateClean.toLowerCase().endsWith(cleanName)
			) {
				found = true;
				break;
			}
		}

		if (!found) {
			missing.push({
				id,
				name: asset.name,
				expectedPath: asset.path,
				durationFrames: asset.durationFrames,
				hasAudio: asset.hasAudio,
				width: asset.width,
				height: asset.height
			});
		}
	}

	return missing;
}

/**
 * Finds best matching file for a missing asset from a list of candidate user files.
 */
export function matchCandidateFile(
	missing: MissingAssetInfo,
	candidates: File[]
): RelinkMatchCandidate | null {
	const targetBase = missing.name.toLowerCase();
	const targetStem = targetBase.replace(/\.[^.]+$/, '');

	let bestMatch: RelinkMatchCandidate | null = null;

	for (const file of candidates) {
		const fileName = file.name.toLowerCase();
		const fileStem = fileName.replace(/\.[^.]+$/, '');

		// 1. Exact match
		if (fileName === targetBase) {
			return { file, score: 1.0, reason: 'Exact filename match' };
		}

		// 2. Stem match with different extension
		if (fileStem === targetStem) {
			if (!bestMatch || bestMatch.score < 0.9) {
				bestMatch = { file, score: 0.9, reason: 'Name match (different container format)' };
			}
		}

		// 3. Fuzzy substring match
		if (fileName.includes(targetStem) || targetStem.includes(fileStem)) {
			if (!bestMatch || bestMatch.score < 0.7) {
				bestMatch = { file, score: 0.7, reason: 'Partial filename match' };
			}
		}
	}

	return bestMatch;
}

/**
 * Converts an InterchangeTimeline into a native Project data structure.
 */
export function interchangeToProject(
	ir: InterchangeTimeline,
	resolvedFiles: Map<AssetId, File> = new Map()
): { project: Project; offlineCount: number } {
	const project = createEmptyProject({
		name: ir.name,
		settings: {
			width: ir.width || 1920,
			height: ir.height || 1080,
			fps: ir.rate.numerator / ir.rate.denominator
		}
	});

	let offlineCount = 0;

	// Assets
	for (const [id, irAsset] of ir.assets.entries()) {
		const file = resolvedFiles.get(id);
		const isOffline = !file;
		if (isOffline) offlineCount += 1;

		const asset: Asset = {
			id,
			kind: irAsset.width ? 'video' : 'audio',
			name: irAsset.name,
			mimeType: file?.type || irAsset.mimeType || (irAsset.width ? 'video/mp4' : 'audio/wav'),
			size: file?.size || 0,
			duration: framesToMicros(irAsset.durationFrames, ir.rate),
			width: irAsset.width,
			height: irAsset.height,
			hasAudio: irAsset.hasAudio,
			offline: isOffline,
			opfsPath: isOffline ? '' : `projects/${project.id}/media/${id}`
		};

		project.assets[id] = asset;
	}

	// Tracks & Clips
	project.tracks = ir.tracks.map((irTrack, trackIdx): Track => {
		const clips: Clip[] = irTrack.clips.map((irClip, clipIdx): Clip => {
			const start = framesToMicros(irClip.recordIn, ir.rate);
			const duration = framesToMicros(irClip.duration, ir.rate);
			const sourceIn = framesToMicros(irClip.sourceIn, ir.rate);
			const sourceOut = framesToMicros(irClip.sourceOut, ir.rate);

			const clip: Clip = {
				id: `clip-${trackIdx + 1}-${clipIdx + 1}` as ClipId,
				assetId: irClip.assetId ?? undefined,
				start,
				duration,
				sourceIn,
				sourceOut,
				speed: irClip.speed ?? 1,
				volume: irClip.volume ?? 1,
				linkId: irClip.linkId
			};

			if (irClip.text) {
				clip.text = irClip.text.content;
				clip.source = {
					type: 'text',
					text: irClip.text.content,
					style: {
						fontFamily: 'Geist',
						alignment: irClip.text.align ?? 'center'
					}
				};
			}

			if (irClip.transform) {
				clip.transform = {
					x: irClip.transform.position[0],
					y: irClip.transform.position[1],
					scaleX: irClip.transform.scale[0],
					scaleY: irClip.transform.scale[1],
					rotation: irClip.transform.rotation,
					opacity: irClip.transform.opacity
				};
			}

			return clip;
		});

		return {
			id: `track-${trackIdx + 1}` as TrackId,
			name: irTrack.name,
			kind: irTrack.kind,
			muted: !irTrack.enabled,
			hidden: !irTrack.enabled,
			locked: irTrack.locked,
			clips
		};
	});

	// Markers
	project.markers = ir.markers.map((m, idx): Marker => ({
		id: `marker-${idx}-${Date.now().toString(36)}` as MarkerId,
		time: framesToMicros(m.frame, ir.rate),
		name: m.name,
		color: (m.color as MarkerColor) || 'blue'
	}));

	return { project, offlineCount };
}
