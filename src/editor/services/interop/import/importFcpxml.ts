import type {
	InterchangeAsset,
	InterchangeClip,
	InterchangeMarker,
	InterchangeText,
	InterchangeTimeline,
	InterchangeTrack,
	InterchangeTransform
} from '../../../core/interchange/ir';
import { fcpxmlTimeToFrames, resolveRate } from '../../../core/interchange/time';
import type { AssetId } from '../../../core/types';
import { parseXml, type SimpleXmlNode } from './xml';

export function parseFcpxml(xmlString: string): InterchangeTimeline {
	const doc = parseXml(xmlString);
	if (doc.tagName !== 'fcpxml') {
		throw new Error(`Expected <fcpxml> root element, found <${doc.tagName}>`);
	}

	// 1. Parse resources: formats and assets
	const formats = new Map<
		string,
		{ frameDuration: string; width: number; height: number; fps: number }
	>();
	const resourcesNode = doc.querySelector('resources');

	if (resourcesNode) {
		for (const fmt of Array.from(resourcesNode.querySelectorAll('format'))) {
			const id = fmt.getAttribute('id') || '';
			const frameDur = fmt.getAttribute('frameDuration') || '1/25s';
			const width = parseInt(fmt.getAttribute('width') || '1920', 10);
			const height = parseInt(fmt.getAttribute('height') || '1080', 10);

			let fps = 25;
			if (frameDur.includes('/')) {
				const [n, d] = frameDur.replace(/s$/, '').split('/').map(Number);
				if (n && d) fps = d / n;
			}
			formats.set(id, { frameDuration: frameDur, width, height, fps });
		}
	}

	// 2. Sequence settings
	const seq = doc.querySelector('sequence');
	const seqFormatId = seq?.getAttribute('format') || 'r1';
	const seqFormat = formats.get(seqFormatId) || {
		frameDuration: '1/25s',
		width: 1920,
		height: 1080,
		fps: 25
	};
	const isDrop = seq?.getAttribute('tcFormat') === 'DF';
	const rate = resolveRate(seqFormat.fps, isDrop);

	// Parse assets
	const assets = new Map<AssetId, InterchangeAsset>();
	if (resourcesNode) {
		for (const ast of Array.from(resourcesNode.querySelectorAll('asset'))) {
			const id = (ast.getAttribute('id') || '') as AssetId;
			const name = ast.getAttribute('name') || 'Asset';
			const durStr = ast.getAttribute('duration') || '0s';
			const durationFrames = fcpxmlTimeToFrames(durStr, rate);
			const hasAudio = ast.getAttribute('hasAudio') === '1';
			const hasVideo = ast.getAttribute('hasVideo') === '1';

			const mediaRep = ast.querySelector('media-rep');
			let path = mediaRep?.getAttribute('src') || '';
			try {
				const url = new URL(path);
				path = decodeURIComponent(url.pathname.replace(/^\/localhost\//, ''));
			} catch {
				path = path.replace(/^file:\/\/localhost\//, '');
			}

			assets.set(id, {
				id,
				name,
				path: path || `media/${name}`,
				durationFrames,
				width: hasVideo ? seqFormat.width : undefined,
				height: hasVideo ? seqFormat.height : undefined,
				hasAudio
			});
		}
	}

	const projectName =
		doc.querySelector('project')?.getAttribute('name') ||
		doc.querySelector('event')?.getAttribute('name') ||
		'Imported FCPXML';

	const spine = doc.querySelector('spine');
	const tracksByLane = new Map<number, InterchangeClip[]>();
	const markers: InterchangeMarker[] = [];

	if (spine) {
		let spineCursor = 0;

		const parseClipElement = (el: SimpleXmlNode, forcedLane?: number) => {
			const tag = el.tagName;
			if (tag === 'gap') {
				const dur = fcpxmlTimeToFrames(el.getAttribute('duration') || '0s', rate);
				spineCursor += dur;
				return;
			}

			if (tag === 'asset-clip' || tag === 'title') {
				const ref = el.getAttribute('ref') as AssetId;
				const asset = assets.get(ref);
				const laneAttr = el.getAttribute('lane');
				const lane = forcedLane !== undefined ? forcedLane : laneAttr ? parseInt(laneAttr, 10) : 0;

				const offsetStr = el.getAttribute('offset');
				const recordIn = offsetStr ? fcpxmlTimeToFrames(offsetStr, rate) : spineCursor;
				const durStr = el.getAttribute('duration') || '1s';
				const duration = Math.max(1, fcpxmlTimeToFrames(durStr, rate));
				const recordOut = recordIn + duration;

				const startStr = el.getAttribute('start') || '0s';
				const sourceIn = fcpxmlTimeToFrames(startStr, rate);
				const sourceOut = sourceIn + duration - 1;

				const name = el.getAttribute('name') || asset?.name || 'Clip';
				const mediaPath = asset?.path || '';

				// Adjustments
				let volume = 1;
				const volEl = el.querySelector('adjust-volume');
				if (volEl) {
					const amt = volEl.getAttribute('amount') || '0dB';
					const db = parseFloat(amt.replace(/dB$/, ''));
					if (!isNaN(db)) volume = Math.pow(10, db / 20);
				}

				let transform: InterchangeTransform | undefined = undefined;
				const transEl = el.querySelector('adjust-transform');
				if (transEl) {
					const scaleStr = transEl.getAttribute('scale') || '1 1';
					const [sx, sy] = scaleStr.split(/\s+/).map(Number);
					const rot = parseFloat(transEl.getAttribute('rotation') || '0');
					const posStr = transEl.getAttribute('position') || '0 0';
					const [px, py] = posStr.split(/\s+/).map(Number);
					transform = {
						scale: [sx || 1, sy || 1],
						rotation: rot || 0,
						position: [px || 0, py || 0],
						opacity: 1
					};
				}

				// Markers on clip
				for (const m of Array.from(el.querySelectorAll('marker'))) {
					const mStart = fcpxmlTimeToFrames(m.getAttribute('start') || '0s', rate);
					const mFrame = recordIn + mStart;
					const mName = m.getAttribute('value') || 'Marker';
					if (!markers.some((existing) => existing.frame === mFrame && existing.name === mName)) {
						markers.push({
							id: `marker-${markers.length + 1}`,
							frame: mFrame,
							name: mName
						});
					}
				}

				// Text
				let text: InterchangeText | undefined = undefined;
				if (tag === 'title') {
					const textContent = el.querySelector('text')?.textContent || name;
					text = { content: textContent };
				}

				const clip: InterchangeClip = {
					id: `clip-${tracksByLane.size + 1}-${recordIn}`,
					name,
					assetId: asset ? asset.id : null,
					mediaPath,
					recordIn,
					recordOut,
					duration,
					sourceIn,
					sourceOut,
					speed: 1,
					volume,
					pan: 0,
					transform,
					text
				};

				if (!tracksByLane.has(lane)) {
					tracksByLane.set(lane, []);
				}
				tracksByLane.get(lane)!.push(clip);

				if (lane === 0) {
					spineCursor = recordOut;
				}
			}
		};

		// Parse children of spine
		for (const child of Array.from(spine.children)) {
			parseClipElement(child);
		}
	}

	const tracks: InterchangeTrack[] = [];
	const sortedLanes = Array.from(tracksByLane.keys()).sort((a, b) => a - b);

	sortedLanes.forEach((lane, idx) => {
		const clips = tracksByLane.get(lane)!;
		const isAudio = clips.every(
			(c) => assets.get(c.assetId as AssetId)?.hasAudio && !assets.get(c.assetId as AssetId)?.width
		);
		tracks.push({
			id: `track-${idx + 1}`,
			name: lane === 0 ? 'Primary Storyline' : `Lane ${lane}`,
			kind: isAudio ? 'audio' : 'video',
			enabled: true,
			locked: false,
			volume: 1,
			pan: 0,
			clips: clips.toSorted((a, b) => a.recordIn - b.recordIn)
		});
	});

	const totalFrames = Math.max(0, ...tracks.flatMap((t) => t.clips.map((c) => c.recordOut)));

	return {
		name: projectName,
		rate,
		width: seqFormat.width,
		height: seqFormat.height,
		durationFrames: totalFrames,
		tracks,
		markers,
		assets,
		omissions: [],
		featureAudits: []
	};
}
