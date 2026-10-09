import type {
	Asset,
	AssetId,
	Project,
	ProjectProxySettings,
	ProxyAutoMode,
	ProxyTargetHeight
} from '../types';

export const DEFAULT_PROJECT_PROXY_SETTINGS: ProjectProxySettings = {
	enabled: false,
	targetHeight: 540,
	auto: 'large'
};

export interface ProxyPlan {
	needed: boolean;
	targetWidth: number;
	targetHeight: number;
	fps: number;
	bitrate: number;
	codec: 'avc' | 'vp9';
	container: 'mp4' | 'webm';
	reason?: string;
}

export interface EncoderCapabilityProbe {
	isVideoConfigSupported: (config: VideoEncoderConfig) => Promise<boolean>;
}

export function computeProxyDimensions(
	sourceWidth: number,
	sourceHeight: number,
	targetHeight: ProxyTargetHeight = 540
): { width: number; height: number } {
	if (sourceHeight <= 0 || sourceWidth <= 0) {
		return { width: 960, height: 540 };
	}
	const aspect = sourceWidth / sourceHeight;
	let computedWidth = Math.round(targetHeight * aspect);
	// Ensure even dimensions required by video encoders (H.264/VP9)
	if (computedWidth % 2 !== 0) computedWidth += 1;
	const computedHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight + 1;
	return { width: computedWidth, height: computedHeight };
}

export function shouldSuggestProxy(asset: Asset, dismissDismissed = false): boolean {
	if (dismissDismissed) return false;
	if (asset.kind !== 'video') return false;
	const height = asset.height ?? 0;
	const width = asset.width ?? 0;
	const fps = asset.fps ?? 0;

	// Heuristic: Large resolution (> 1080p, i.e., > 1920x1080) or high frame rate (> 60 fps)
	if (height > 1080 || width > 1920) return true;
	if (fps > 60) return true;
	// Heavy codec or undecodable smoothly
	if (
		asset.videoCodec &&
		(asset.videoCodec.includes('hvc1') ||
			asset.videoCodec.includes('hev1') ||
			asset.videoCodec.includes('av01'))
	) {
		return true;
	}
	return false;
}

export function planProxy(
	asset: Asset,
	settings: ProjectProxySettings = DEFAULT_PROJECT_PROXY_SETTINGS,
	codecChoice: 'avc' | 'vp9' = 'avc'
): ProxyPlan {
	const sourceHeight = asset.height ?? 0;
	const sourceWidth = asset.width ?? 0;
	const fps = asset.fps ?? 30;

	// No upscaling rule: if the source height <= target, report "proxy not needed"
	if (sourceHeight > 0 && sourceHeight <= settings.targetHeight) {
		return {
			needed: false,
			targetWidth: sourceWidth % 2 === 0 ? sourceWidth : sourceWidth + 1,
			targetHeight: sourceHeight % 2 === 0 ? sourceHeight : sourceHeight + 1,
			fps,
			bitrate: 0,
			codec: codecChoice,
			container: codecChoice === 'avc' ? 'mp4' : 'webm',
			reason: `Source height (${sourceHeight}p) is less than or equal to target height (${settings.targetHeight}p).`
		};
	}

	const { width: targetWidth, height: targetHeight } = computeProxyDimensions(
		sourceWidth > 0 ? sourceWidth : 1920,
		sourceHeight > 0 ? sourceHeight : 1080,
		settings.targetHeight
	);

	// Bitrate chosen from pixels * fps * 0.08 bits/pixel (bounded minimum 800 kbps, maximum 4 Mbps)
	const rawBitrate = Math.round(targetWidth * targetHeight * fps * 0.08);
	const bitrate = Math.max(800_000, Math.min(4_000_000, rawBitrate));

	return {
		needed: true,
		targetWidth,
		targetHeight,
		fps,
		bitrate,
		codec: codecChoice,
		container: codecChoice === 'avc' ? 'mp4' : 'webm'
	};
}

export async function chooseProxyCodec(
	targetWidth: number,
	targetHeight: number,
	fps: number,
	probe?: EncoderCapabilityProbe
): Promise<'avc' | 'vp9'> {
	if (!probe) {
		if (typeof VideoEncoder !== 'undefined') {
			probe = {
				isVideoConfigSupported: async (cfg) => {
					try {
						const res = await VideoEncoder.isConfigSupported(cfg);
						return res.supported ?? false;
					} catch {
						return false;
					}
				}
			};
		} else {
			return 'avc';
		}
	}

	try {
		const avcSupported = await probe.isVideoConfigSupported({
			codec: 'avc1.4d001f', // Main profile
			width: targetWidth,
			height: targetHeight,
			framerate: fps,
			bitrate: 2_000_000
		});
		if (avcSupported) return 'avc';
	} catch {
		// fallback
	}

	try {
		const vp9Supported = await probe.isVideoConfigSupported({
			codec: 'vp09.00.10.08',
			width: targetWidth,
			height: targetHeight,
			framerate: fps,
			bitrate: 2_000_000
		});
		if (vp9Supported) return 'vp9';
	} catch {
		// fallback
	}

	return 'avc';
}

/**
 * Fingerprint calculation for proxy staleness detection:
 * Hash of size, duration, width, height, and opfsPath.
 */
export function computeAssetFingerprint(
	asset: Pick<Asset, 'size' | 'duration' | 'width' | 'height' | 'opfsPath'>
): string {
	const str = `${asset.size}:${asset.duration}:${asset.width ?? 0}:${asset.height ?? 0}:${asset.opfsPath}`;
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}
	return `fp_${Math.abs(hash).toString(16)}`;
}

export function isProxyStale(asset: Asset): boolean {
	if (!asset.proxy || asset.proxy.status !== 'ready') return false;
	if (!asset.proxy.fingerprint) return false;
	const current = computeAssetFingerprint(asset);
	return asset.proxy.fingerprint !== current;
}

export function shouldAutoGenerateProxy(asset: Asset, autoMode: ProxyAutoMode): boolean {
	if (autoMode === 'off') return false;
	if (asset.kind !== 'video' || asset.offline) return false;
	if (autoMode === 'all') return true;
	if (autoMode === 'large') return shouldSuggestProxy(asset);
	return false;
}

/**
 * Queue ordering / prioritization:
 * 1. Assets currently placed on timeline tracks first.
 * 2. Earlier clips on the timeline before later clips.
 * 3. Library assets (alphabetical / import order).
 */
export function prioritizeProxyQueue(project: Project, assetIds: AssetId[]): AssetId[] {
	const timelineMap = new Map<AssetId, number>();
	for (const track of project.tracks) {
		for (const clip of track.clips) {
			if (clip.assetId) {
				const existing = timelineMap.get(clip.assetId);
				if (existing === undefined || clip.start < existing) {
					timelineMap.set(clip.assetId, clip.start);
				}
			}
		}
	}

	return [...assetIds].sort((a, b) => {
		const aTime = timelineMap.get(a);
		const bTime = timelineMap.get(b);
		if (aTime !== undefined && bTime !== undefined) return aTime - bTime;
		if (aTime !== undefined) return -1;
		if (bTime !== undefined) return 1;
		return 0;
	});
}
