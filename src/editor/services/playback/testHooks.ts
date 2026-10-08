import type { PlaybackEngine, PlaybackDebugStats } from './engine';

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
	return () => {
		if (window.__tfvePlaybackTest === hooks) delete window.__tfvePlaybackTest;
	};
}
