import type { PlaybackEngine, PlaybackDebugStats } from './engine';
import { registerAudioDebugTap } from '../audio/debugTap';

declare global {
	interface Window {
		__tfvePlaybackTest?: {
			getStats: () => PlaybackDebugStats;
			engine?: PlaybackEngine;
		};
	}
}

export function attachPlaybackTestHooks(engine: PlaybackEngine): () => void {
	if (!import.meta.env.DEV) return () => {};
	const hooks = {
		getStats: () => engine.getDebugStats(),
		engine
	};
	window.__tfvePlaybackTest = hooks;
	const detachTap = registerAudioDebugTap(
		() => engine.getDebugMasterAnalysers?.() ?? engine.getDebugMasterAnalyser?.() ?? null
	);
	return () => {
		detachTap();
		if (window.__tfvePlaybackTest === hooks) delete window.__tfvePlaybackTest;
	};
}
