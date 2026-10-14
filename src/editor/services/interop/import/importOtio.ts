import type {
	InterchangeAsset,
	InterchangeClip,
	InterchangeCrop,
	InterchangeMarker,
	InterchangeText,
	InterchangeTimeline,
	InterchangeTrack,
	InterchangeTransform
} from '../../../core/interchange/ir';
import { resolveRate } from '../../../core/interchange/time';
import type { AssetId } from '../../../core/types';

interface OtioNode {
	OTIO_SCHEMA?: string;
	name?: string;
	metadata?: {
		thefreevideoeditor?: {
			clipId?: string;
			trackId?: string;
			speed?: number;
			volume?: number;
			pan?: number;
			linkId?: string;
			transform?: InterchangeTransform;
			crop?: InterchangeCrop;
			text?: InterchangeText;
			caption?: { text: string; speaker?: string };
			assetId?: string;
			enabled?: boolean;
			locked?: boolean;
			rate?: { numerator?: number; dropFrame?: boolean };
			width?: number;
			height?: number;
		};
		originalName?: string;
	};
	[key: string]: unknown;
}

export function parseOtio(jsonString: string): InterchangeTimeline {
	let data: OtioNode;
	try {
		data = JSON.parse(jsonString) as OtioNode;
	} catch (err) {
		throw new Error(
			`Invalid JSON in OTIO document: ${err instanceof Error ? err.message : String(err)}`
		);
	}

	if (!data || typeof data !== 'object') {
		throw new Error('OTIO document root must be a JSON object.');
	}

	if (data.OTIO_SCHEMA !== 'Timeline.1') {
		throw new Error(
			`Unsupported OTIO schema: expected "Timeline.1", received "${data.OTIO_SCHEMA}"`
		);
	}

	const globalStartTime = data.global_start_time as { rate?: number } | undefined;
	const tfveMeta = data.metadata?.thefreevideoeditor as
		| { rate?: { numerator?: number; dropFrame?: boolean }; width?: number; height?: number }
		| undefined;
	const fps = globalStartTime?.rate ?? tfveMeta?.rate?.numerator ?? 25;
	const isDrop = Boolean(tfveMeta?.rate?.dropFrame);
	const rate = resolveRate(fps, isDrop);

	const name = (data.name as string) || 'Imported Timeline';
	const width = tfveMeta?.width || 1920;
	const height = tfveMeta?.height || 1080;
	const durationObj = data.duration as { value?: number } | undefined;
	const durationFrames = durationObj?.value || 0;

	const tracks: InterchangeTrack[] = [];
	const assets = new Map<AssetId, InterchangeAsset>();

	const stack = data.tracks as OtioNode | undefined;
	if (stack && stack.OTIO_SCHEMA === 'Stack.1' && Array.isArray(stack.children)) {
		stack.children.forEach((rawTrackNode: unknown, trackIdx: number) => {
			const trackNode = rawTrackNode as OtioNode;
			if (trackNode.OTIO_SCHEMA !== 'Track.1') return;

			const kind: 'video' | 'audio' =
				typeof trackNode.kind === 'string' && trackNode.kind.toLowerCase() === 'audio'
					? 'audio'
					: 'video';
			const trackName =
				(trackNode.name as string) || `${kind === 'video' ? 'Video' : 'Audio'} ${trackIdx + 1}`;
			const trackMeta = trackNode.metadata?.thefreevideoeditor as
				| { enabled?: boolean; locked?: boolean; volume?: number; pan?: number; trackId?: string }
				| undefined;
			const enabled = trackMeta?.enabled ?? true;
			const locked = trackMeta?.locked ?? false;
			const volume = trackMeta?.volume ?? 1;
			const pan = trackMeta?.pan ?? 0;

			const clips: InterchangeClip[] = [];
			let trackPosition = 0;

			if (Array.isArray(trackNode.children)) {
				trackNode.children.forEach((rawChild: unknown, clipIdx: number) => {
					const child = rawChild as OtioNode;
					const srcRange = child.source_range as
						{ duration?: { value?: number }; start_time?: { value?: number } } | undefined;
					if (child.OTIO_SCHEMA === 'Gap.1') {
						const gapDur = srcRange?.duration?.value ?? 0;
						trackPosition += gapDur;
						return;
					}

					if (child.OTIO_SCHEMA === 'Clip.2') {
						const clipDur = srcRange?.duration?.value ?? 0;
						const sourceIn = srcRange?.start_time?.value ?? 0;
						const sourceOut = sourceIn + clipDur - 1;

						// Speed from LinearTimeWarp
						const childMeta = child.metadata?.thefreevideoeditor as
							Record<string, unknown> | undefined;
						let speed = typeof childMeta?.speed === 'number' ? childMeta.speed : 1;
						if (Array.isArray(child.effects)) {
							const warp = child.effects.find(
								(e: unknown) => (e as OtioNode)?.OTIO_SCHEMA === 'LinearTimeWarp.1'
							) as { time_scalar?: number } | undefined;
							if (warp && typeof warp.time_scalar === 'number') {
								speed = warp.time_scalar;
							}
						}

						// Asset reference
						let mediaPath = '';
						const assetName = (child.name as string) || `Clip ${clipIdx + 1}`;
						const mediaRef = child.media_reference as
							| {
									OTIO_SCHEMA?: string;
									target_url?: string;
									available_range?: { duration?: { value?: number } };
							  }
							| undefined;
						if (mediaRef && mediaRef.OTIO_SCHEMA === 'ExternalReference.1' && mediaRef.target_url) {
							try {
								const url = new URL(mediaRef.target_url);
								mediaPath = decodeURIComponent(url.pathname.replace(/^\/localhost\//, ''));
							} catch {
								mediaPath = mediaRef.target_url.replace(/^file:\/\/localhost\//, '');
							}
						}

						const assetId = (child.metadata?.thefreevideoeditor?.assetId ||
							`asset-${clipIdx + 1}`) as AssetId;
						if (!assets.has(assetId) && mediaPath) {
							assets.set(assetId, {
								id: assetId,
								name: assetName,
								path: mediaPath,
								durationFrames: mediaRef?.available_range?.duration?.value ?? clipDur,
								hasAudio: kind === 'audio',
								width: kind === 'video' ? width : undefined,
								height: kind === 'video' ? height : undefined
							});
						}

						clips.push({
							id:
								child.metadata?.thefreevideoeditor?.clipId || `clip-${trackIdx + 1}-${clipIdx + 1}`,
							name: assetName,
							assetId: mediaPath ? assetId : null,
							mediaPath,
							recordIn: trackPosition,
							recordOut: trackPosition + clipDur,
							duration: clipDur,
							sourceIn,
							sourceOut,
							speed,
							volume: child.metadata?.thefreevideoeditor?.volume ?? 1,
							pan: child.metadata?.thefreevideoeditor?.pan ?? 0,
							linkId: child.metadata?.thefreevideoeditor?.linkId,
							transform: child.metadata?.thefreevideoeditor?.transform ?? undefined,
							crop: child.metadata?.thefreevideoeditor?.crop ?? undefined,
							text: child.metadata?.thefreevideoeditor?.text ?? undefined,
							caption: child.metadata?.thefreevideoeditor?.caption ?? undefined
						});

						trackPosition += clipDur;
					}
				});
			}

			tracks.push({
				id: trackNode.metadata?.thefreevideoeditor?.trackId || `track-${trackIdx + 1}`,
				name: trackName,
				kind,
				enabled,
				locked,
				volume,
				pan,
				clips
			});
		});
	}

	const markers: InterchangeMarker[] = [];
	if (Array.isArray(data.markers)) {
		data.markers.forEach((rawM: unknown, idx: number) => {
			const m = rawM as OtioNode;
			if (m.OTIO_SCHEMA === 'Marker.1') {
				const markedRange = m.marked_range as { start_time?: { value?: number } } | undefined;
				markers.push({
					id: `m-${idx + 1}`,
					frame: markedRange?.start_time?.value ?? 0,
					name: (m.metadata?.originalName as string) || (m.name as string) || 'Marker',
					color: typeof m.color === 'string' ? m.color.toLowerCase() : undefined
				});
			}
		});
	}

	return {
		name,
		rate,
		width,
		height,
		durationFrames: Math.max(
			durationFrames,
			...tracks.flatMap((t) => t.clips.map((c) => c.recordOut))
		),
		tracks,
		markers,
		assets,
		omissions: [],
		featureAudits: []
	};
}
