import type {
	InterchangeAsset,
	InterchangeClip,
	InterchangeMarker,
	InterchangeTimeline,
	InterchangeTrack
} from '../../../core/interchange/ir';
import { resolveRate, timecodeToFrames } from '../../../core/interchange/time';
import type { AssetId } from '../../../core/types';

export function parseEdl(edlContent: string, fps = 25): InterchangeTimeline {
	const lines = edlContent.split(/\r?\n/);
	let title = 'Imported EDL';
	let isDropFrame = false;

	// Check header
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith('TITLE:')) {
			title = trimmed.slice(6).trim();
		} else if (trimmed.startsWith('FCM:')) {
			isDropFrame = trimmed.includes('DROP FRAME') && !trimmed.includes('NON-DROP FRAME');
		}
	}

	const rate = resolveRate(fps, isDropFrame);
	const videoClips: InterchangeClip[] = [];
	const audioClips: InterchangeClip[] = [];
	const markers: InterchangeMarker[] = [];
	const assets = new Map<AssetId, InterchangeAsset>();

	let currentClip: {
		eventNum: string;
		reel: string;
		trackType: string;
		srcInTc: string;
		srcOutTc: string;
		recInTc: string;
		recOutTc: string;
		clipName?: string;
		mediaPath?: string;
		speed?: number;
	} | null = null;

	const commitCurrentClip = () => {
		if (!currentClip) return;
		const srcIn = timecodeToFrames(currentClip.srcInTc, rate);
		const srcOut = timecodeToFrames(currentClip.srcOutTc, rate);
		const recIn = timecodeToFrames(currentClip.recInTc, rate);
		const recOut = timecodeToFrames(currentClip.recOutTc, rate);
		const duration = Math.max(1, recOut - recIn + 1);

		const name = currentClip.clipName || currentClip.reel;
		const mediaPath = currentClip.mediaPath || `media/${name}`;
		const assetId = `asset-${currentClip.eventNum}` as AssetId;

		if (!assets.has(assetId)) {
			assets.set(assetId, {
				id: assetId,
				name,
				path: mediaPath,
				durationFrames: Math.max(srcOut + 1, duration),
				hasAudio: currentClip.trackType.includes('A'),
				width: 1920,
				height: 1080
			});
		}

		const clip: InterchangeClip = {
			id: `clip-${currentClip.eventNum}`,
			name,
			assetId,
			mediaPath,
			recordIn: recIn,
			recordOut: recIn + duration,
			duration,
			sourceIn: srcIn,
			sourceOut: srcOut,
			speed: currentClip.speed ?? 1,
			volume: 1,
			pan: 0
		};

		if (currentClip.trackType.includes('V') || currentClip.trackType.includes('B')) {
			videoClips.push(clip);
		}
		if (currentClip.trackType.includes('A') || currentClip.trackType.includes('B')) {
			audioClips.push({ ...clip, id: `${clip.id}-audio` });
		}

		currentClip = null;
	};

	// Event regex: 001 REELNAME V C 00:00:00:00 00:00:05:00 00:00:00:00 00:00:05:00
	const eventRegex =
		/^(\d{3,4})\s+([^\s]+)\s+([VA1-4B]+)\s+([CDW])(?:\s+(\d+))?\s+(\d{2}:\d{2}:\d{2}[:;]\d{2})\s+(\d{2}:\d{2}:\d{2}[:;]\d{2})\s+(\d{2}:\d{2}:\d{2}[:;]\d{2})\s+(\d{2}:\d{2}:\d{2}[:;]\d{2})/;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;

		const eventMatch = line.match(eventRegex);
		if (eventMatch) {
			commitCurrentClip();
			currentClip = {
				eventNum: eventMatch[1]!,
				reel: eventMatch[2]!,
				trackType: eventMatch[3]!,
				srcInTc: eventMatch[6]!,
				srcOutTc: eventMatch[7]!,
				recInTc: eventMatch[8]!,
				recOutTc: eventMatch[9]!
			};
			continue;
		}

		if (line.startsWith('*')) {
			if (currentClip && line.startsWith('* FROM CLIP NAME:')) {
				currentClip.clipName = line.slice(17).trim();
			} else if (currentClip && line.startsWith('* MEDIA PATH:')) {
				currentClip.mediaPath = line.slice(13).trim();
			} else if (currentClip && line.startsWith('* SPEED:')) {
				const spMatch = line.match(/\* SPEED:\s*([\d.]+)x/);
				if (spMatch) currentClip.speed = parseFloat(spMatch[1]!);
			} else if (line.startsWith('* MARKER')) {
				const mMatch = line.match(/\* MARKER\s+(\d{2}:\d{2}:\d{2}[:;]\d{2})\s*(.*)$/);
				if (mMatch) {
					markers.push({
						id: `marker-${markers.length + 1}`,
						frame: timecodeToFrames(mMatch[1]!, rate),
						name: mMatch[2]!.trim() || 'Marker'
					});
				}
			}
		}
	}

	commitCurrentClip();

	const tracks: InterchangeTrack[] = [];
	if (videoClips.length > 0) {
		tracks.push({
			id: 'track-v1',
			name: 'Video 1',
			kind: 'video',
			enabled: true,
			locked: false,
			volume: 1,
			pan: 0,
			clips: videoClips
		});
	}
	if (audioClips.length > 0) {
		tracks.push({
			id: 'track-a1',
			name: 'Audio 1',
			kind: 'audio',
			enabled: true,
			locked: false,
			volume: 1,
			pan: 0,
			clips: audioClips
		});
	}

	const totalFrames = Math.max(0, ...tracks.flatMap((t) => t.clips.map((c) => c.recordOut)));

	return {
		name: title,
		rate,
		width: 1920,
		height: 1080,
		durationFrames: totalFrames,
		tracks,
		markers,
		assets,
		omissions: [],
		featureAudits: []
	};
}
