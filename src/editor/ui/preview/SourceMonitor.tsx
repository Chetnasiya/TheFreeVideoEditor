import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { secondsToTicks, ticksToTimecode } from '../../core';
import { getMediaObjectUrl } from '../../services/storage/opfs';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import type { PlaybackEngine } from '../../services/playback/engine';
import ScopesPanel from './ScopesPanel';

interface SourceMedia {
	url: string;
	error: string;
}

interface SourceMonitorProps {
	engine?: PlaybackEngine | null;
}

type SourceMonitorView = 'source' | 'waveform' | 'parade' | 'histogram' | 'vectorscope';

export default function SourceMonitor({ engine = null }: SourceMonitorProps) {
	const store = useEditorStoreApi();
	const project = useEditorStore((state) => state.project);
	const projectId = project?.id;
	const selectedAssetIds = useEditorStore((state) => state.media.selectedAssetIds);
	const scopesMode = useEditorStore((state) => state.scopes.mode);
	const scopesOpen = useEditorStore((state) => state.scopes.open);
	const asset = useMemo(
		() => selectedAssetIds.map((id) => project?.assets[id]).find((item) => item !== undefined),
		[project, selectedAssetIds]
	);

	const prevSelectedAssetIdsRef = useRef<string[]>([]);
	const didMountRef = useRef(false);

	// When user clicks an asset in the project panel, switch back to source view:
	useEffect(() => {
		if (!didMountRef.current) {
			didMountRef.current = true;
			prevSelectedAssetIdsRef.current = selectedAssetIds;
			return;
		}
		if (selectedAssetIds.length > 0 && selectedAssetIds !== prevSelectedAssetIdsRef.current) {
			store.getState().setScopesOpen(false);
		}
		prevSelectedAssetIdsRef.current = selectedAssetIds;
	}, [selectedAssetIds, store]);

	const viewMode: SourceMonitorView = scopesOpen ? scopesMode : 'source';

	// Keep store scopes mode in sync when viewMode is a scope:
	const handleSelectView = (mode: SourceMonitorView) => {
		if (mode === 'source') {
			store.getState().setScopesOpen(false);
		} else {
			store.getState().setScopesMode(mode);
			store.getState().setScopesOpen(true);
		}
	};

	const [sourceMedia, setSourceMedia] = useState<SourceMedia>({ url: '', error: '' });
	const [position, setPosition] = useState(0);
	const [duration, setDuration] = useState(0);
	const [playing, setPlaying] = useState(false);
	const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);

	useEffect(() => {
		setPosition(0);
		setDuration(0);
		setPlaying(false);
		if (!projectId || !asset || asset.offline) {
			setSourceMedia({ url: '', error: '' });
			return;
		}
		let active = true;
		let release: (() => void) | undefined;
		setSourceMedia({ url: '', error: '' });
		void getMediaObjectUrl(projectId, asset)
			.then((media) => {
				if (!active) {
					media.release();
					return;
				}
				release = media.release;
				setSourceMedia({ url: media.url, error: '' });
			})
			.catch((error: unknown) => {
				if (!active) return;
				setSourceMedia({
					url: '',
					error: error instanceof Error ? error.message : 'Could not load source media.'
				});
			});
		return () => {
			active = false;
			mediaRef.current?.pause();
			release?.();
		};
	}, [asset, projectId]);

	function updateTime(event: SyntheticEvent<HTMLMediaElement>): void {
		setPosition(event.currentTarget.currentTime);
	}

	function togglePlayback(): void {
		const element = mediaRef.current;
		if (!element || !sourceMedia.url) return;
		if (element.paused) {
			void element.play().catch((error: unknown) => {
				if (error instanceof DOMException && error.name === 'AbortError') return;
				setSourceMedia((current) => ({
					...current,
					error: error instanceof Error ? error.message : 'Could not play this source.'
				}));
			});
		} else {
			element.pause();
		}
	}

	function stepFrame(direction: -1 | 1): void {
		const element = mediaRef.current;
		if (!element) return;
		element.pause();
		element.currentTime = Math.max(
			0,
			Math.min(
				duration,
				element.currentTime + direction / (asset?.fps || project?.settings.fps || 30)
			)
		);
	}

	function seek(value: number): void {
		const element = mediaRef.current;
		if (!element) return;
		element.currentTime = value;
		setPosition(value);
	}

	const timecode = (seconds: number) => {
		try {
			return ticksToTimecode(secondsToTicks(seconds), asset?.fps || project?.settings.fps || 30);
		} catch {
			return '00:00:00:00';
		}
	};
	const disabled = !asset || asset.kind === 'image' || !sourceMedia.url;

	return (
		<div className="source-monitor-content">
			<div className="source-monitor-header">
				<div className="source-monitor-tabs" role="tablist" aria-label="Source monitor views">
					<button
						type="button"
						role="tab"
						aria-selected={viewMode === 'source'}
						className={`source-monitor-tab ${viewMode === 'source' ? 'is-active' : ''}`}
						onClick={() => handleSelectView('source')}
					>
						Source Media
					</button>
					{(['waveform', 'parade', 'histogram', 'vectorscope'] as const).map((mode) => (
						<button
							key={mode}
							type="button"
							role="tab"
							aria-selected={viewMode === mode}
							className={`source-monitor-tab ${viewMode === mode ? 'is-active' : ''}`}
							onClick={() => handleSelectView(mode)}
						>
							{mode.charAt(0).toUpperCase() + mode.slice(1)}
						</button>
					))}
				</div>
			</div>

			{viewMode !== 'source' ? (
				<ScopesPanel engine={engine} onClose={() => handleSelectView('source')} />
			) : (
				<>
					<div className="source-media-stage" data-testid="source-media-stage">
						{!project ? (
							<div className="source-placeholder">
								<p>No project open</p>
							</div>
						) : !asset ? (
							<div className="source-placeholder">
								<p>Select media in the Project panel</p>
							</div>
						) : asset.offline ? (
							<div className="source-placeholder" role="status">
								<p>Source media is offline</p>
								<span>Relink this file from the Project panel.</span>
							</div>
						) : asset.kind === 'image' ? (
							<>
								<img
									className="source-image"
									src={sourceMedia.url || undefined}
									alt={`Source: ${asset.name}`}
									width={asset.width ?? 1920}
									height={asset.height ?? 1080}
									onError={() =>
										setSourceMedia((current) => ({
											...current,
											error: `Could not display “${asset.name}”.`
										}))
									}
								/>
								{sourceMedia.error && (
									<div className="source-error" role="alert">
										{sourceMedia.error}
									</div>
								)}
							</>
						) : (
							<>
								{asset.kind === 'video' ? (
									<video
										ref={(element) => {
											mediaRef.current = element;
										}}
										className="source-video"
										data-testid="source-video"
										src={sourceMedia.url || undefined}
										preload="metadata"
										playsInline
										onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
										onTimeUpdate={updateTime}
										onPlay={() => setPlaying(true)}
										onPause={() => setPlaying(false)}
										onEnded={() => setPlaying(false)}
										onError={() =>
											setSourceMedia((current) => ({
												...current,
												error: `This browser could not decode “${asset.name}”${asset.videoCodec ? ` (${asset.videoCodec})` : ''}.`
											}))
										}
										aria-label={`Source video: ${asset.name}`}
									/>
								) : (
									<>
										<audio
											ref={(element) => {
												mediaRef.current = element;
											}}
											src={sourceMedia.url || undefined}
											preload="metadata"
											onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
											onTimeUpdate={updateTime}
											onPlay={() => setPlaying(true)}
											onPause={() => setPlaying(false)}
											onEnded={() => setPlaying(false)}
											onError={() =>
												setSourceMedia((current) => ({
													...current,
													error: `This browser could not decode “${asset.name}”${asset.audioCodec ? ` (${asset.audioCodec})` : ''}.`
												}))
											}
											aria-label={`Source audio: ${asset.name}`}
										/>
										<div className="source-audio-label" aria-hidden="true">
											<span>♫</span>
											<strong>{asset.name}</strong>
										</div>
									</>
								)}
								{(asset.videoDecodable === false || asset.audioDecodable === false) &&
									!sourceMedia.error &&
									!sourceMedia.url && (
										<div className="source-error" role="alert">
											Browser decode support is unavailable for{' '}
											{asset.videoCodec ?? asset.audioCodec ?? 'this codec'}.
										</div>
									)}
								{sourceMedia.error && (
									<div className="source-error" role="alert">
										{sourceMedia.error}
									</div>
								)}
							</>
						)}
					</div>
					<div
						className="source-monitor-controls"
						role="group"
						aria-label="Source playback controls"
					>
						<button
							type="button"
							onClick={() => stepFrame(-1)}
							disabled={disabled}
							aria-label="Step back one frame"
						>
							|◀
						</button>
						<button
							type="button"
							className="source-play-button"
							onClick={togglePlayback}
							disabled={disabled}
							aria-label={playing ? 'Pause source' : 'Play source'}
						>
							{playing ? 'Ⅱ' : '▶'}
						</button>
						<button
							type="button"
							onClick={() => stepFrame(1)}
							disabled={disabled}
							aria-label="Step forward one frame"
						>
							▶|
						</button>
						<input
							type="range"
							min={0}
							max={duration || 0}
							step={0.001}
							value={Math.min(position, duration)}
							onChange={(event) => seek(Number(event.currentTarget.value))}
							disabled={disabled || duration <= 0}
							aria-label="Source position"
						/>
						<output aria-label="Source timecode">
							{timecode(position)} / {timecode(duration)}
						</output>
					</div>
				</>
			)}
		</div>
	);
}
