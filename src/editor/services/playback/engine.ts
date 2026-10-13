import { nextBoundary, resolveFrame, type ActiveLayer } from '../../core/playback';
import { framesToTicks, ticksToTimecode, timelineDuration } from '../../core';
import { viewProject } from '../../core/sequences/access';
import type { AssetId, ClipId, Project, Time, TrackId } from '../../core';
import type { EditorStore } from '../../state/store';
import { AudioEngine } from './audioEngine';
import type { FrameSource, LastGoodFrames } from './compositor';
import {
	createFrameRenderer,
	type RendererKind,
	type FrameRenderer,
	type RenderStats
} from '../render';
import { extractCanvasScopeFrame, type ScopeFrameData } from '../render/passes/scopes';
import { createPlaybackClock, type PlaybackRate } from './clock';
import { MediaPool } from './mediaPool';
import { TextRasterCache } from '../render/text/cache';
import { ensureFontLoaded } from '../render/text/fontLoader';

export interface PlaybackSnapshot {
	time: Time;
	duration: Time;
	playing: boolean;
	rate: PlaybackRate;
	looping: boolean;
	volume: number;
	muted: boolean;
	meter: number;
	missing: AssetId[];
	loading: boolean;
	error: string;
	proxyActive?: boolean;
}

export interface PlaybackDebugStats {
	elementCount: number;
	rafRunning: boolean;
	audioContextState: AudioContextState | 'uninitialized';
	meter: number;
	time: Time;
	duration: Time;
	playing: boolean;
	rate: PlaybackRate;
	looping: boolean;
	activeVideoAssets: Array<{ id: AssetId; name: string; trackId: ActiveLayer['trackId'] }>;
	render: RenderStats | null;
	proxyActive?: boolean;
}

export interface PlaybackEngine {
	readonly projectId: Project['id'];
	readonly snapshot: PlaybackSnapshot;
	attach(canvas: HTMLCanvasElement, renderer?: RendererKind): void;
	detach(): void;
	setProject(project: Project): void;
	play(): void;
	pause(): void;
	toggle(): void;
	seek(time: Time): void;
	stepFrames(count: number): void;
	jumpTo(target: 'start' | 'end' | 'prevEdge' | 'nextEdge'): void;
	shuttle(direction: -1 | 1): void;
	setLoop(looping: boolean): void;
	setVolume(volume: number): void;
	setMuted(muted: boolean): void;
	subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void;
	getDebugStats(): PlaybackDebugStats;
	enableScopes(enabled: boolean): void;
	getLastScopeFrame(): ScopeFrameData | null;
	getRenderer(): FrameRenderer | null;
	dispose(): void;
}

export function createPlaybackEngine(store: EditorStore, initialProject: Project): PlaybackEngine {
	const duration = timelineDuration(initialProject);
	const clock = createPlaybackClock({
		duration,
		fps: initialProject.settings.fps,
		initialTime: store.getState().timeline.playhead
	});
	const bridge: {
		current: PlaybackEngineImpl | null;
		audio: AudioEngine | null;
	} = { current: null, audio: null };
	const pool = new MediaPool(initialProject, {
		onFrame: () => bridge.current?.onPoolFrame(),
		onMissing: (assetId) => bridge.current?.onPoolMissing(assetId),
		onError: (error) => bridge.current?.onPoolError(error),
		onStall: (clipId) => bridge.current?.onMediaStall(clipId),
		onReady: (clipId) => bridge.current?.onMediaReady(clipId),
		onReleaseAudioElement: (element) => bridge.audio?.releaseElement(element)
	});
	const audio = new AudioEngine(pool, { onError: (error) => bridge.current?.onPoolError(error) });
	bridge.audio = audio;
	const engine = new PlaybackEngineImpl(store, initialProject, clock, pool, audio);
	bridge.current = engine;
	return engine;
}

class PlaybackEngineImpl implements PlaybackEngine {
	private project: Project;
	private canvas: HTMLCanvasElement | null = null;
	private renderer: FrameRenderer | null = null;
	private renderHandle: number | null = null;
	private loadingTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly listeners = new Set<(snapshot: PlaybackSnapshot) => void>();
	private readonly lastGoodFrames: LastGoodFrames = new Map();
	private readonly textCache = new TextRasterCache();
	private readonly runtimeMissing = new Set<AssetId>();
	private readonly stalledClips = new Set<ClipId>();
	private readonly clockUnsubscribe: () => void;
	private readonly storeUnsubscribe: () => void;
	private readonly visibilityListener: () => void;
	private resumeAfterVisible = false;
	private resumeAfterStall = false;
	private stallDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private stallResumeTimer: ReturnType<typeof setTimeout> | null = null;
	private writingPlayhead = false;
	private disposed = false;
	private snapshotValue: PlaybackSnapshot;
	onPoolFrame = (): void => this.requestRender();
	onPoolMissing = (assetId: AssetId): void => this.markMissing(assetId);
	onPoolError = (error: Error): void => this.reportError(error);
	onMediaStall = (clipId: ClipId): void => {
		this.stalledClips.add(clipId);
		if (this.stallResumeTimer !== null) {
			clearTimeout(this.stallResumeTimer);
			this.stallResumeTimer = null;
		}
		if (!this.clock.playing) return;
		if (this.stallDebounceTimer !== null) return;
		// Debounce micro-stalls so a temporary drop or brief buffer hiccup does not immediately halt playback
		this.stallDebounceTimer = setTimeout(() => {
			this.stallDebounceTimer = null;
			if (this.disposed || !this.clock.playing || this.stalledClips.size === 0) return;
			this.resumeAfterStall = true;
			this.clock.pause();
			this.store.getState().setTimelineFollowing(false);
			void this.audio
				.sync([], this.project, false, this.clock.rate)
				.catch((error: unknown) => this.reportError(error));
		}, 160);
	};
	onMediaReady = (clipId: ClipId): void => {
		this.stalledClips.delete(clipId);
		if (this.stalledClips.size === 0 && this.stallDebounceTimer !== null) {
			clearTimeout(this.stallDebounceTimer);
			this.stallDebounceTimer = null;
		}
		if (
			this.stalledClips.size === 0 &&
			this.resumeAfterStall &&
			(typeof document === 'undefined' || document.visibilityState !== 'hidden')
		) {
			if (this.stallResumeTimer !== null) clearTimeout(this.stallResumeTimer);
			// Hysteresis: wait for decoder buffer headroom before resuming playback
			this.stallResumeTimer = setTimeout(() => {
				this.stallResumeTimer = null;
				if (
					this.stalledClips.size === 0 &&
					this.resumeAfterStall &&
					(typeof document === 'undefined' || document.visibilityState !== 'hidden')
				) {
					this.resumeAfterStall = false;
					this.play();
				}
			}, 180);
		}
	};

	private get activeProject(): Project {
		const storeProj = this.store.getState().project ?? this.project;
		const activeSeqId = this.store.getState().activeSequenceId;
		return viewProject(storeProj, activeSeqId);
	}

	constructor(
		private readonly store: EditorStore,
		project: Project,
		private readonly clock: ReturnType<typeof createPlaybackClock>,
		private readonly pool: MediaPool,
		private readonly audio: AudioEngine
	) {
		this.project = project;
		this.snapshotValue = {
			time: clock.time,
			duration: timelineDuration(project),
			playing: false,
			rate: clock.rate,
			looping: clock.looping,
			volume: audio.masterVolume,
			muted: audio.isMuted,
			meter: 0,
			missing: [],
			loading: false,
			error: ''
		};
		this.clockUnsubscribe = clock.onTick((time, playing, rate) => {
			if (this.disposed) return;
			this.writingPlayhead = true;
			try {
				this.store.getState().setPlayhead(time);
			} finally {
				this.writingPlayhead = false;
			}
			this.store.getState().setTimelineFollowing(playing);
			this.updateSnapshot({
				time,
				playing,
				rate,
				looping: clock.looping,
				meter: audio.getLevel()
			});
			this.syncAndRender();
		});
		this.storeUnsubscribe = store.subscribe((state, previous) => {
			if (this.disposed || this.writingPlayhead) return;
			if (state.project && state.project !== this.project && state.project.id === this.project.id) {
				this.setProject(state.project);
			}
			if (state.isExporting && !previous.isExporting) {
				this.resumeAfterStall = false;
				clock.pause();
				void audio
					.sync([], this.project, false, clock.rate)
					.catch((error: unknown) => this.reportError(error));
			}
			if (state.activeSequenceId !== previous.activeSequenceId) {
				const currentProj = state.project ?? this.project;
				const activeProject = viewProject(currentProj, state.activeSequenceId);
				const duration = timelineDuration(activeProject);
				clock.setDuration(duration);
				clock.seek(state.timeline.playhead);
				this.updateSnapshot({ duration });
				this.resizeCanvas();
				this.syncAndRender();
				return;
			}
			if (state.timeline.playhead !== previous.timeline.playhead) {
				clock.seek(state.timeline.playhead);
				if (clock.playing) {
					void audio.unlock().catch((error: unknown) => this.reportError(error));
				}
				this.syncAndRender();
			}
			if (state.scopes?.open !== previous.scopes?.open) {
				if (state.scopes?.open) {
					this.renderer?.enableScopes?.(true);
				}
				this.syncAndRender();
			}
		});
		this.visibilityListener = () => {
			if (document.visibilityState === 'hidden') {
				this.resumeAfterVisible = clock.playing || this.resumeAfterStall;
				this.resumeAfterStall = false;
				clock.pause();
				void audio
					.sync([], this.project, false, clock.rate)
					.catch((error: unknown) => this.reportError(error));
				return;
			}
			if (this.resumeAfterVisible) {
				this.resumeAfterVisible = false;
				this.play();
			}
		};
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', this.visibilityListener);
		}
	}

	get snapshot(): PlaybackSnapshot {
		return this.snapshotValue;
	}

	get projectId(): Project['id'] {
		return this.project.id;
	}

	attach(canvas: HTMLCanvasElement, rendererKind: RendererKind = 'canvas2d'): void {
		if (this.disposed) throw new Error('Cannot attach a disposed playback engine.');
		this.detach();
		const renderer = createFrameRenderer(canvas, {
			forceCanvas2d: rendererKind === 'canvas2d',
			preserveDrawingBuffer: true,
			onContextRestored: () => this.requestRender()
		});
		if (!renderer) {
			this.reportError(new Error('The preview canvas could not be initialised for rendering.'));
			return;
		}
		this.canvas = canvas;
		this.renderer = renderer;
		this.resizeCanvas();
		this.syncAndRender();
	}

	detach(): void {
		if (this.renderHandle !== null) cancelAnimationFrame(this.renderHandle);
		this.renderHandle = null;
		this.canvas = null;
		this.renderer?.dispose();
		this.renderer = null;
	}

	setProject(project: Project): void {
		if (project.id !== this.project.id) {
			throw new Error(
				'A playback engine cannot switch projects; dispose it and create a new engine.'
			);
		}
		const previousProject = this.project;
		this.project = project;
		this.stalledClips.clear();
		this.resumeAfterStall = false;
		this.pool.setProject(project);
		for (const assetId of this.runtimeMissing) {
			if (project.assets[assetId]?.opfsPath !== previousProject.assets[assetId]?.opfsPath) {
				this.runtimeMissing.delete(assetId);
			}
		}
		const duration = timelineDuration(project);
		this.clock.setDuration(duration);
		this.updateSnapshot({ duration });
		this.resizeCanvas();
		this.syncAndRender();
	}

	play(): void {
		if (this.disposed) return;
		if (this.stalledClips.size > 0) {
			this.resumeAfterStall = true;
			return;
		}
		void this.audio
			.unlock()
			.finally(() => {
				if (this.disposed) return;
				if (this.stalledClips.size > 0) {
					this.resumeAfterStall = true;
					return;
				}
				this.clock.play();
				this.store.getState().setTimelineFollowing(this.clock.playing);
				this.syncAndRender();
			})
			.catch((error: unknown) => this.reportError(error));
	}

	pause(): void {
		if (this.stallDebounceTimer !== null) {
			clearTimeout(this.stallDebounceTimer);
			this.stallDebounceTimer = null;
		}
		if (this.stallResumeTimer !== null) {
			clearTimeout(this.stallResumeTimer);
			this.stallResumeTimer = null;
		}
		this.resumeAfterStall = false;
		this.resumeAfterVisible = false;
		this.clock.pause();
		this.store.getState().setTimelineFollowing(false);
		void this.audio
			.sync([], this.project, false, this.clock.rate)
			.catch((error: unknown) => this.reportError(error));
	}

	toggle(): void {
		if (this.clock.playing) this.pause();
		else this.play();
	}

	seek(time: Time): void {
		if (this.disposed) return;
		if (this.stallDebounceTimer !== null) {
			clearTimeout(this.stallDebounceTimer);
			this.stallDebounceTimer = null;
		}
		if (this.stallResumeTimer !== null) {
			clearTimeout(this.stallResumeTimer);
			this.stallResumeTimer = null;
		}
		this.stalledClips.clear();
		this.resumeAfterStall = false;
		void this.audio.unlock().catch((error: unknown) => this.reportError(error));
		this.clock.seek(time);
		this.syncAndRender();
	}

	stepFrames(count: number): void {
		if (!Number.isSafeInteger(count)) throw new RangeError('Frame step must be an integer.');
		const delta =
			Math.sign(count) * framesToTicks(Math.abs(count), this.activeProject.settings.fps);
		this.seek(Math.max(0, this.clock.time + delta));
	}

	jumpTo(target: 'start' | 'end' | 'prevEdge' | 'nextEdge'): void {
		if (target === 'start') this.seek(0);
		else if (target === 'end') this.seek(this.snapshotValue.duration);
		else {
			const boundary = nextBoundary(
				this.activeProject,
				this.clock.time,
				target === 'nextEdge' ? 1 : -1
			);
			if (boundary !== null) this.seek(boundary);
		}
	}

	shuttle(direction: -1 | 1): void {
		const sign = direction;
		const current = this.clock.rate;
		const magnitude = Math.sign(current) === sign ? Math.min(8, Math.abs(current) * 2) : 1;
		this.clock.setRate(rateForDirection(sign, magnitude));
		this.play();
	}

	setLoop(looping: boolean): void {
		this.clock.setLoop(looping);
		this.updateSnapshot({ looping });
	}

	setVolume(volume: number): void {
		this.audio.setVolume(volume);
		this.updateSnapshot({ volume: this.audio.masterVolume });
	}

	setMuted(muted: boolean): void {
		this.audio.setMuted(muted);
		this.updateSnapshot({ muted: this.audio.isMuted });
	}

	subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void {
		this.listeners.add(listener);
		listener(this.snapshotValue);
		return () => this.listeners.delete(listener);
	}

	getDebugStats(): PlaybackDebugStats {
		return {
			elementCount: this.pool.elementCount,
			rafRunning: this.clock.playing || this.renderHandle !== null,
			audioContextState: this.audioContextState,
			meter: this.audio.getLevel(),
			time: this.clock.time,
			duration: this.snapshotValue.duration,
			playing: this.clock.playing,
			rate: this.clock.rate,
			looping: this.clock.looping,
			render: this.renderer?.stats ?? null,
			activeVideoAssets: resolveFrame(this.project, this.clock.time).videoLayers.flatMap(
				(layer) => {
					if (layer.transition) {
						const assets: Array<{ id: AssetId; name: string; trackId: TrackId }> = [];
						const aA = layer.transition.fromLayer.assetId
							? this.project.assets[layer.transition.fromLayer.assetId]
							: undefined;
						if (aA) assets.push({ id: aA.id, name: aA.name, trackId: layer.trackId });
						const aB = layer.transition.toLayer.assetId
							? this.project.assets[layer.transition.toLayer.assetId]
							: undefined;
						if (aB) assets.push({ id: aB.id, name: aB.name, trackId: layer.trackId });
						return assets;
					}
					const asset = layer.assetId ? this.project.assets[layer.assetId] : undefined;
					return asset ? [{ id: asset.id, name: asset.name, trackId: layer.trackId }] : [];
				}
			)
		};
	}

	enableScopes(enabled: boolean): void {
		this.renderer?.enableScopes?.(enabled);
		if (enabled) {
			this.requestRender();
		}
	}

	getLastScopeFrame(): ScopeFrameData | null {
		const fromRenderer = this.renderer?.getLastScopeFrame?.();
		if (fromRenderer) return fromRenderer;
		if (this.canvas && this.canvas.width > 0 && this.canvas.height > 0) {
			return extractCanvasScopeFrame(this.canvas);
		}
		return null;
	}

	getRenderer(): FrameRenderer | null {
		return this.renderer;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.clock.pause();
		this.detach();
		this.clockUnsubscribe();
		this.storeUnsubscribe();
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', this.visibilityListener);
		}
		this.clock.dispose();
		if (this.stallDebounceTimer !== null) clearTimeout(this.stallDebounceTimer);
		this.stallDebounceTimer = null;
		if (this.stallResumeTimer !== null) clearTimeout(this.stallResumeTimer);
		this.stallResumeTimer = null;
		if (this.loadingTimer !== null) clearTimeout(this.loadingTimer);
		this.loadingTimer = null;
		const audioDispose = this.audio.dispose();
		this.pool.dispose();
		void audioDispose.catch((error: unknown) => this.reportError(error));
		this.listeners.clear();
		this.lastGoodFrames.clear();
		this.textCache.dispose();
	}

	private get audioContextState(): AudioContextState | 'uninitialized' {
		return this.audio.debugContextState;
	}

	private syncAndRender(): void {
		if (this.disposed) return;
		const proj = this.activeProject;
		const resolved = resolveFrame(proj, this.clock.time);
		const missing = new Set([...resolved.missing, ...this.runtimeMissing]);
		this.updateSnapshot({
			missing: [...missing]
		});
		void this.pool
			.reconcile(resolved, this.clock.time, this.clock.playing, this.clock.rate)
			.catch((error: unknown) => this.reportError(error));
		void this.audio
			.sync(resolved.audioSources, proj, this.clock.playing, this.clock.rate)
			.catch((error: unknown) => this.reportError(error));
		this.requestRender();
	}

	private requestRender(): void {
		if (this.disposed || !this.renderer || this.renderHandle !== null) return;
		this.renderHandle = requestAnimationFrame(() => {
			this.renderHandle = null;
			this.drawCurrentFrame();
		});
	}

	private drawCurrentFrame(): void {
		const renderer = this.renderer;
		const canvas = this.canvas;
		if (!renderer || !canvas || this.disposed) return;
		const proj = this.activeProject;
		const resolved = resolveFrame(proj, this.clock.time);
		const allClips = [
			...this.project.tracks.flatMap((track) => track.clips),
			...Object.values(this.project.sequences ?? {}).flatMap((seq) =>
				seq.tracks.flatMap((track) => track.clips)
			)
		];
		const liveKeys = new Set<string>(allClips.map((clip) => clip.id));
		for (const layer of resolved.videoLayers) {
			const k = layer.instanceKey ?? layer.clipId;
			liveKeys.add(k);
		}
		for (const key of this.lastGoodFrames.keys()) {
			if (!liveKeys.has(key)) this.lastGoodFrames.delete(key);
		}
		renderer.releaseUnused(liveKeys);
		const missing = new Set([...resolved.missing, ...this.runtimeMissing]);
		const layers = resolved.videoLayers.filter((layer) => {
			if (layer.transition) {
				const fromId = layer.transition.fromLayer.assetId;
				const toId = layer.transition.toLayer.assetId;
				if (fromId && missing.has(fromId)) return false;
				if (toId && missing.has(toId)) return false;
				return true;
			}
			return !layer.assetId || !missing.has(layer.assetId);
		});
		let loading = false;
		let proxyActive = false;
		const scopesOpen = this.store.getState().scopes?.open ?? false;
		renderer.enableScopes?.(scopesOpen);
		renderer.render(
			{ width: proj.settings.width, height: proj.settings.height },
			layers,
			(layer: ActiveLayer): FrameSource | null => {
				if (layer.kind === 'text' && layer.textData) {
					const data = layer.textData;
					if (data.style.fontFamily) {
						void ensureFontLoaded(data.style.fontFamily).then((loaded) => {
							if (loaded) this.requestRender();
						});
					}
					const scale = Math.max(layer.transform?.scaleX ?? 1, layer.transform?.scaleY ?? 1);
					return this.textCache.get({
						text: data.text,
						style: data.style,
						box: data.box,
						fontSize: data.fontSize,
						fillColor: data.fillColor,
						strokeColor: data.strokeColor,
						strokeWidth: data.strokeWidth,
						letterSpacing: data.letterSpacing,
						lineHeight: data.lineHeight,
						reveal: data.reveal,
						shadowColor: data.shadowColor,
						shadowBlur: data.shadowBlur,
						shadowOffsetX: data.shadowOffsetX,
						shadowOffsetY: data.shadowOffsetY,
						backgroundBoxColor: data.backgroundBoxColor,
						backgroundBoxPadding: data.backgroundBoxPadding,
						backgroundBoxRadius: data.backgroundBoxRadius,
						colorRuns: data.colorRuns,
						scale
					});
				}
				const source = this.pool.getFrameSource(layer, this.clock.playing, this.clock.rate);
				if (!source) {
					// If we are actively playing and already have a valid lastGoodFrame for this layer,
					// the compositor will smoothly render the held frame without blanking.
					// Only treat as starving/loading if there is no frame available at all.
					if (!this.clock.playing || !this.lastGoodFrames.has(layer.clipId)) {
						loading = true;
					}
				} else if (this.pool.isUsingProxy(layer)) {
					proxyActive = true;
				}
				return source;
			},
			this.lastGoodFrames,
			{ playing: this.clock.playing }
		);
		this.updateSnapshot({ proxyActive });
		canvas.setAttribute(
			'aria-label',
			`Preview, ${ticksToTimecode(this.clock.time, proj.settings.fps)}`
		);
		if (loading) {
			if (this.loadingTimer === null) {
				const delayMs = this.clock.playing ? 250 : 120;
				this.loadingTimer = setTimeout(() => {
					this.loadingTimer = null;
					this.updateSnapshot({ loading: true });
				}, delayMs);
			}
		} else {
			if (this.loadingTimer !== null) clearTimeout(this.loadingTimer);
			this.loadingTimer = null;
			this.updateSnapshot({ loading: false });
		}
	}

	private resizeCanvas(): void {
		if (!this.canvas) return;
		const { width, height } = this.activeProject.settings;
		if (this.canvas.width !== width) this.canvas.width = width;
		if (this.canvas.height !== height) this.canvas.height = height;
	}

	private markMissing(assetId: AssetId): void {
		if (this.runtimeMissing.has(assetId)) return;
		this.runtimeMissing.add(assetId);
		this.syncAndRender();
	}

	private reportError(error: unknown): void {
		const message = error instanceof Error ? error.message : 'Playback failed unexpectedly.';
		this.updateSnapshot({ error: message });
	}

	private updateSnapshot(patch: Partial<PlaybackSnapshot>): void {
		this.snapshotValue = { ...this.snapshotValue, ...patch };
		for (const listener of this.listeners) listener(this.snapshotValue);
	}
}

function rateForDirection(direction: -1 | 1, magnitude: number): PlaybackRate {
	if (magnitude === 1) return direction;
	if (magnitude === 2) return direction === 1 ? 2 : -2;
	if (magnitude === 4) return direction === 1 ? 4 : -4;
	return direction === 1 ? 8 : -8;
}
