import type { ActiveAudio } from '../../core/playback';
import type { Project } from '../../core/types';
import type { MediaPool } from './mediaPool';
import { AudioGraphController, type AudioControllerOptions } from '../audio/controller';

export type AudioEngineOptions = AudioControllerOptions;

export class AudioEngine {
	private readonly controller: AudioGraphController;

	constructor(pool: Pick<MediaPool, 'getAudioElement'>, options: AudioEngineOptions = {}) {
		this.controller = new AudioGraphController(pool, options);
	}

	get masterVolume(): number {
		return this.controller.volume;
	}

	get isMuted(): boolean {
		return this.controller.isMuted;
	}

	get debugContextState(): AudioContextState | 'uninitialized' {
		return this.controller.debugContextState;
	}

	get debugMasterAnalyser(): AnalyserNode | null {
		return this.controller.debugMasterAnalyser;
	}

	getNodeCount(): number {
		return this.controller.getNodeCount();
	}

	unlock(): Promise<void> {
		return this.controller.unlock();
	}

	sync(
		sources: readonly ActiveAudio[],
		project: Project,
		playing: boolean,
		rate: number
	): Promise<void> {
		return this.controller.sync(sources, project, playing, rate);
	}

	updateProject(project: Project): void {
		this.controller.updateProject(project);
	}

	setVolume(volume: number): void {
		this.controller.setVolume(volume);
	}

	setMuted(muted: boolean): void {
		this.controller.setMuted(muted);
	}

	getLevel(): number {
		return this.controller.getLevel();
	}

	get debugMasterAnalysers(): { analyserL: AnalyserNode; analyserR: AnalyserNode } | null {
		return this.controller.debugMasterAnalysers;
	}

	getTrackMeterLevels(trackId: string): {
		peakL: number;
		peakR: number;
		rmsL: number;
		rmsR: number;
	} {
		return this.controller.getTrackMeterLevels(trackId);
	}

	getMasterMeterLevels(): { peakL: number; peakR: number; rmsL: number; rmsR: number } {
		return this.controller.getMasterMeterLevels();
	}

	getBusMeterLevels(busId: string): { peakL: number; peakR: number; rmsL: number; rmsR: number } {
		return this.controller.getBusMeterLevels(busId);
	}

	releaseElement(element: HTMLAudioElement): void {
		this.controller.releaseElement(element);
	}

	dispose(): Promise<void> {
		return this.controller.dispose();
	}
}
