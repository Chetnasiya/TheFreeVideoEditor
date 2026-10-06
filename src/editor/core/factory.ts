import { CURRENT_SCHEMA_VERSION } from './schema';
import { rebaseMediaPath } from './ids';
import type {
	AssetId,
	ClipId,
	MarkerId,
	Project,
	ProjectId,
	ProjectSettings,
	Track,
	TrackId
} from './types';

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
	width: 1920,
	height: 1080,
	fps: 30,
	sampleRate: 48_000
};

function randomId(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
		const random = Math.floor(Math.random() * 16);
		const value = character === 'x' ? random : (random & 0x3) | 0x8;
		return value.toString(16);
	});
}

function makeTrack(id: TrackId, kind: Track['kind'], name: string): Track {
	return {
		id,
		kind,
		name,
		muted: false,
		locked: false,
		hidden: false,
		clips: []
	};
}

export function createEmptyProject(options: {
	name: string;
	settings?: Partial<ProjectSettings>;
}): Project {
	const now = new Date().toISOString();
	const videoTrackId = randomId() as TrackId;
	const audioTrackId = randomId() as TrackId;
	return {
		id: randomId() as ProjectId,
		schemaVersion: CURRENT_SCHEMA_VERSION,
		name: options.name.trim(),
		createdAt: now,
		updatedAt: now,
		settings: { ...DEFAULT_PROJECT_SETTINGS, ...options.settings },
		assets: {},
		tracks: [
			makeTrack(videoTrackId, 'video', 'Video 1'),
			makeTrack(audioTrackId, 'audio', 'Audio 1')
		],
		markers: []
	};
}

export function duplicateProject(project: Project): Project {
	const nextId = randomId() as ProjectId;
	const assetIdMap = new Map<string, string>();
	const trackIdMap = new Map<string, string>();
	const clipIdMap = new Map<string, string>();
	const markerIdMap = new Map<string, string>();
	const linkIdMap = new Map<string, string>();

	for (const asset of Object.values(project.assets)) assetIdMap.set(asset.id, randomId());
	for (const track of project.tracks) {
		trackIdMap.set(track.id, randomId());
		for (const clip of track.clips) clipIdMap.set(clip.id, randomId());
	}
	for (const marker of project.markers) markerIdMap.set(marker.id, randomId());
	for (const track of project.tracks) {
		for (const clip of track.clips) {
			if (clip.linkId && !linkIdMap.has(clip.linkId)) {
				linkIdMap.set(clip.linkId, randomId());
			}
		}
	}

	const now = new Date().toISOString();
	const assets = Object.fromEntries(
		Object.values(project.assets).map((asset) => {
			const id = assetIdMap.get(asset.id) as AssetId;
			return [
				id,
				{
					...asset,
					id,
					opfsPath: rebaseMediaPath(nextId, id, asset.opfsPath),
					offline: true
				}
			];
		})
	) as Project['assets'];

	return {
		...project,
		id: nextId,
		name: `${project.name} copy`,
		createdAt: now,
		updatedAt: now,
		assets,
		tracks: project.tracks.map((track) => ({
			...track,
			id: trackIdMap.get(track.id) as TrackId,
			clips: track.clips.map((clip) => ({
				...clip,
				id: clipIdMap.get(clip.id) as ClipId,
				assetId: assetIdMap.get(clip.assetId) as AssetId,
				...(clip.linkId ? { linkId: linkIdMap.get(clip.linkId) } : {}),
				effects: clip.effects?.map((effect) => ({ ...effect, id: randomId() }))
			}))
		})),
		markers: project.markers.map((marker) => ({
			...marker,
			id: markerIdMap.get(marker.id) as MarkerId
		}))
	};
}
