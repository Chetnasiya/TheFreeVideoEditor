import type { ActiveAudio } from '../../core/playback';
import type { AssetId, Project } from '../../core/types';
import type { MediaPool } from './mediaPool';

const AUDIO_RAMP_SECONDS = 0.01;
const AUDIO_VOLUME_KEY = 'tfve:playback-volume';
const AUDIO_MUTED_KEY = 'tfve:playback-muted';

export interface AudioEngineOptions {
	createContext?: () => AudioContext;
	onError?: (error: Error, assetId?: AssetId) => void;
}

interface ConnectedAudio {
	clipId: ActiveAudio['clipId'];
	assetId: AssetId;
	element: HTMLAudioElement;
	source: MediaElementAudioSourceNode;
	gain: GainNode;
	volume: number;
}

export class AudioEngine {
	private context: AudioContext | null = null;
	private master: GainNode | null = null;
	private analyser: AnalyserNode | null = null;
	private readonly connected = new Map<HTMLAudioElement, ConnectedAudio>();
	private readonly sourceByElement = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
	private readonly createContext: () => AudioContext;
	private volume: number;
	private muted: boolean;
	private disposed = false;
	private unavailable = false;
	private syncRevision = 0;

	constructor(
		private readonly pool: Pick<MediaPool, 'getAudioElement'>,
		private readonly options: AudioEngineOptions = {}
	) {
		this.createContext = options.createContext ?? (() => new AudioContext());
		this.volume = readNumberPreference(AUDIO_VOLUME_KEY, 1, (error) => this.reportError(error));
		this.muted = readBooleanPreference(AUDIO_MUTED_KEY, false, (error) => this.reportError(error));
	}

	get masterVolume(): number {
		return this.volume;
	}

	get isMuted(): boolean {
		return this.muted;
	}

	get debugContextState(): AudioContextState | 'uninitialized' {
		return this.context?.state ?? 'uninitialized';
	}

	async unlock(): Promise<void> {
		if (this.disposed || this.unavailable) return;
		try {
			const context = this.ensureContext();
			if (context.state === 'suspended') await context.resume();
		} catch (error) {
			this.unavailable = true;
			this.reportError(error);
		}
	}

	async sync(
		sources: readonly ActiveAudio[],
		project: Project,
		playing: boolean,
		rate: number
	): Promise<void> {
		if (this.disposed) return;
		const revision = ++this.syncRevision;
		if (!playing || rate !== 1 || sources.length === 0) {
			for (const audio of this.connected.values()) {
				ramp(audio.gain.gain, 0, this.context?.currentTime ?? 0);
				audio.volume = 0;
				audio.element.pause();
			}
			return;
		}

		await this.unlock();
		if (this.disposed || revision !== this.syncRevision) return;
		const context = this.context;
		if (!context) return;
		const active = new Set<HTMLAudioElement>();
		for (const source of sources) {
			const asset = project.assets[source.assetId];
			const element = this.pool.getAudioElement(source);
			if (!asset || !element) continue;
			active.add(element);
			const connection = this.connectElement(element, source.clipId, asset.id);
			if (connection.volume !== source.volume) {
				ramp(connection.gain.gain, source.volume, context.currentTime);
				connection.volume = source.volume;
			}
			element.volume = 1;
			element.playbackRate = 1;
			if (element.paused) {
				void element.play().catch((error: unknown) => {
					if (isInterruptedPlay(error)) return;
					this.reportError(error, asset.id);
				});
			}
		}
		for (const [element, audio] of this.connected) {
			if (active.has(element)) continue;
			ramp(audio.gain.gain, 0, context.currentTime);
			audio.volume = 0;
			element.pause();
		}
	}

	setVolume(volume: number): void {
		if (!Number.isFinite(volume)) throw new RangeError('Master volume must be finite.');
		this.volume = Math.max(0, Math.min(1, volume));
		this.persist(AUDIO_VOLUME_KEY, String(this.volume));
		this.applyMasterVolume();
	}

	setMuted(muted: boolean): void {
		this.muted = muted;
		this.persist(AUDIO_MUTED_KEY, String(muted));
		this.applyMasterVolume();
	}

	getLevel(): number {
		if (!this.analyser) return 0;
		const samples = new Float32Array(this.analyser.fftSize);
		this.analyser.getFloatTimeDomainData(samples);
		let squareSum = 0;
		for (const sample of samples) squareSum += sample * sample;
		return Math.sqrt(squareSum / Math.max(1, samples.length));
	}

	releaseElement(element: HTMLAudioElement): void {
		const connection = this.connected.get(element);
		if (!connection) return;
		element.pause();
		connection.source.disconnect();
		connection.gain.disconnect();
		this.connected.delete(element);
		this.sourceByElement.delete(element);
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.syncRevision += 1;
		for (const element of this.connected.keys()) this.releaseElement(element);
		const context = this.context;
		this.context = null;
		this.master = null;
		this.analyser = null;
		if (context && context.state !== 'closed') await context.close();
	}

	private ensureContext(): AudioContext {
		if (this.context) return this.context;
		const context = this.createContext();
		const master = context.createGain();
		const analyser = context.createAnalyser();
		analyser.fftSize = 256;
		master.connect(analyser);
		analyser.connect(context.destination);
		this.context = context;
		this.master = master;
		this.analyser = analyser;
		this.applyMasterVolume();
		return context;
	}

	private connectElement(
		element: HTMLAudioElement,
		clipId: ActiveAudio['clipId'],
		assetId: AssetId
	): ConnectedAudio {
		const existing = this.connected.get(element);
		if (existing) {
			existing.clipId = clipId;
			existing.assetId = assetId;
			return existing;
		}
		const context = this.context;
		const master = this.master;
		if (!context || !master) throw new Error('Audio graph is not initialized.');
		let source = this.sourceByElement.get(element);
		if (!source) {
			source = context.createMediaElementSource(element);
			this.sourceByElement.set(element, source);
		}
		const gain = context.createGain();
		gain.gain.value = 0;
		source.connect(gain);
		gain.connect(master);
		const connection = { clipId, assetId, element, source, gain, volume: 0 };
		this.connected.set(element, connection);
		return connection;
	}

	private applyMasterVolume(): void {
		if (!this.master || !this.context) return;
		ramp(this.master.gain, this.muted ? 0 : this.volume, this.context.currentTime);
	}

	private persist(key: string, value: string): void {
		try {
			localStorage.setItem(key, value);
		} catch (error) {
			this.reportError(
				new Error('Playback preference could not be saved in local storage.', { cause: error })
			);
		}
	}

	private reportError(error: unknown, assetId?: AssetId): void {
		this.options.onError?.(
			error instanceof Error ? error : new Error('Audio playback failed.'),
			assetId
		);
	}
}

function isInterruptedPlay(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}

function ramp(parameter: AudioParam, value: number, currentTime: number): void {
	parameter.cancelScheduledValues(currentTime);
	parameter.setValueAtTime(parameter.value, currentTime);
	parameter.linearRampToValueAtTime(value, currentTime + AUDIO_RAMP_SECONDS);
}

function readNumberPreference(
	key: string,
	fallback: number,
	onError: (error: Error) => void
): number {
	try {
		const stored = localStorage.getItem(key);
		if (stored === null) return fallback;
		const value = Number(stored);
		return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
	} catch (error) {
		onError(
			new Error('Playback preferences could not be read from local storage.', { cause: error })
		);
		return fallback;
	}
}

function readBooleanPreference(
	key: string,
	fallback: boolean,
	onError: (error: Error) => void
): boolean {
	try {
		const stored = localStorage.getItem(key);
		return stored === 'true' ? true : stored === 'false' ? false : fallback;
	} catch (error) {
		onError(
			new Error('Playback preferences could not be read from local storage.', { cause: error })
		);
		return fallback;
	}
}
