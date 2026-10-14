import type {
	InterchangeAsset,
	InterchangeClip,
	InterchangeMarker,
	InterchangeTimeline,
	InterchangeTrack,
	InterchangeTransform
} from '../../../core/interchange/ir';
import { resolveRate } from '../../../core/interchange/time';
import type { AssetId } from '../../../core/types';
import { parseXml, type SimpleXmlNode } from './xml';

export function parseXmeml(xmlString: string): InterchangeTimeline {
	const doc = parseXml(xmlString);

	const seq = doc.tagName === 'sequence' ? doc : doc.querySelector('sequence');
	if (!seq) {
		throw new Error('No <sequence> element found in xmeml document.');
	}

	const name = seq.querySelector('name')?.textContent || 'Imported Sequence';
	const timebase = parseInt(seq.querySelector('rate > timebase')?.textContent || '25', 10);
	const ntsc = seq.querySelector('rate > ntsc')?.textContent?.toUpperCase() === 'TRUE';
	const displayFormat = seq.querySelector('timecode > displayformat')?.textContent || 'NDF';
	const isDrop = displayFormat === 'DF';

	const rate = resolveRate(ntsc ? (timebase === 30 ? 29.97 : 59.94) : timebase, isDrop);

	const width = parseInt(
		seq.querySelector('media > video > format > samplecharacteristics > width')?.textContent ||
			'1920',
		10
	);
	const height = parseInt(
		seq.querySelector('media > video > format > samplecharacteristics > height')?.textContent ||
			'1080',
		10
	);

	const assets = new Map<AssetId, InterchangeAsset>();
	const tracks: InterchangeTrack[] = [];

	const parseTrackClips = (
		trackEl: SimpleXmlNode,
		kind: 'video' | 'audio',
		trackIdx: number
	): InterchangeClip[] => {
		const clips: InterchangeClip[] = [];
		const clipItems = Array.from(trackEl.querySelectorAll(':scope > clipitem'));

		for (const item of clipItems) {
			const clipId = item.getAttribute('id') || `clip-${trackIdx}-${clips.length + 1}`;
			const clipName = item.querySelector('name')?.textContent || 'Clip';
			const start = parseInt(item.querySelector('start')?.textContent || '0', 10);
			const end = parseInt(item.querySelector('end')?.textContent || '0', 10);
			const sourceIn = parseInt(item.querySelector('in')?.textContent || '0', 10);
			const sourceOut = parseInt(item.querySelector('out')?.textContent || '0', 10);
			const duration = Math.max(1, end - start);

			// File / Asset
			const fileEl = item.querySelector('file');
			let assetId: AssetId | null = null;
			let mediaPath = '';
			if (fileEl) {
				const rawId = fileEl.getAttribute('id') || `file-${clips.length + 1}`;
				assetId = rawId.replace(/^file-/, '') as AssetId;
				const fileName = fileEl.querySelector('name')?.textContent || clipName;
				const pathurl = fileEl.querySelector('pathurl')?.textContent || '';
				try {
					const url = new URL(pathurl);
					mediaPath = decodeURIComponent(url.pathname.replace(/^\/localhost\//, ''));
				} catch {
					mediaPath = pathurl.replace(/^file:\/\/localhost\//, '');
				}

				if (!assets.has(assetId)) {
					const fileDur = parseInt(
						fileEl.querySelector('duration')?.textContent || String(duration),
						10
					);
					assets.set(assetId, {
						id: assetId,
						name: fileName,
						path: mediaPath || `media/${fileName}`,
						durationFrames: fileDur,
						hasAudio: Boolean(fileEl.querySelector('media > audio')),
						width: kind === 'video' ? width : undefined,
						height: kind === 'video' ? height : undefined
					});
				}
			}

			// Filters: Basic Motion & Audio Levels
			let transform: InterchangeTransform | undefined = undefined;
			let volume = 1;
			let pan = 0;

			for (const filter of Array.from(item.querySelectorAll('filter'))) {
				const filterName = filter.querySelector('effect > name')?.textContent;
				if (filterName === 'Basic Motion') {
					let scale = 1;
					let rotation = 0;
					let center: [number, number] = [0, 0];
					for (const param of Array.from(filter.querySelectorAll('parameter'))) {
						const pid = param.querySelector('parameterid')?.textContent;
						const val = param.querySelector('value')?.textContent;
						if (pid === 'scale' && val) scale = parseFloat(val) / 100;
						if (pid === 'rotation' && val) rotation = parseFloat(val);
						if (pid === 'center') {
							const h = parseFloat(param.querySelector('value > horiz')?.textContent || '0');
							const v = parseFloat(param.querySelector('value > vert')?.textContent || '0');
							center = [h, v];
						}
					}
					transform = { position: center, scale: [scale, scale], rotation, opacity: 1 };
				} else if (filterName === 'Opacity') {
					const opVal = filter.querySelector('parameter > value')?.textContent;
					if (opVal && transform) transform.opacity = parseFloat(opVal) / 100;
				} else if (filterName === 'Audio Levels') {
					for (const param of Array.from(filter.querySelectorAll('parameter'))) {
						const pid = param.querySelector('parameterid')?.textContent;
						const val = param.querySelector('value')?.textContent;
						if (pid === 'level' && val) volume = parseFloat(val);
						if (pid === 'pan' && val) pan = parseFloat(val);
					}
				}
			}

			// Links
			let linkId: string | undefined = undefined;
			const linkEl = item.querySelector('link > linkclipref');
			if (linkEl?.textContent) {
				linkId = linkEl.textContent;
			}

			clips.push({
				id: clipId,
				name: clipName,
				assetId,
				mediaPath,
				recordIn: start,
				recordOut: end,
				duration,
				sourceIn,
				sourceOut,
				speed: 1,
				volume,
				pan,
				transform,
				linkId
			});
		}

		return clips;
	};

	// Parse video tracks
	const videoTracks = seq.querySelectorAll('media > video > track');
	videoTracks.forEach((tEl, idx) => {
		const enabled = tEl.querySelector('enabled')?.textContent !== '0';
		const locked = tEl.querySelector('locked')?.textContent === '1';
		tracks.push({
			id: `track-v${idx + 1}`,
			name: `Video ${idx + 1}`,
			kind: 'video',
			enabled,
			locked,
			volume: 1,
			pan: 0,
			clips: parseTrackClips(tEl, 'video', idx + 1)
		});
	});

	// Parse audio tracks
	const audioTracks = seq.querySelectorAll('media > audio > track');
	audioTracks.forEach((tEl, idx) => {
		const enabled = tEl.querySelector('enabled')?.textContent !== '0';
		const locked = tEl.querySelector('locked')?.textContent === '1';
		tracks.push({
			id: `track-a${idx + 1}`,
			name: `Audio ${idx + 1}`,
			kind: 'audio',
			enabled,
			locked,
			volume: 1,
			pan: 0,
			clips: parseTrackClips(tEl, 'audio', idx + 1)
		});
	});

	// Parse sequence markers
	const markers: InterchangeMarker[] = [];
	for (const m of Array.from(seq.querySelectorAll(':scope > marker'))) {
		const mName = m.querySelector('name')?.textContent || 'Marker';
		const mComment = m.querySelector('comment')?.textContent || '';
		const mIn = parseInt(m.querySelector('in')?.textContent || '0', 10);
		markers.push({
			id: `marker-${markers.length + 1}`,
			frame: mIn,
			name: mName,
			comment: mComment
		});
	}

	const totalFrames = parseInt(seq.querySelector('duration')?.textContent || '0', 10);

	return {
		name,
		rate,
		width,
		height,
		durationFrames:
			totalFrames || Math.max(0, ...tracks.flatMap((t) => t.clips.map((c) => c.recordOut))),
		tracks,
		markers,
		assets,
		omissions: [],
		featureAudits: []
	};
}
