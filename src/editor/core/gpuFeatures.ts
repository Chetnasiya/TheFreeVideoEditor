import type { Clip, Project, Track } from './types';

function clipNeedsGpu(clip: Clip): boolean {
	return Boolean(
		(clip.effects && clip.effects.length > 0) ||
		(clip.masks && clip.masks.length > 0) ||
		(clip.source && clip.source.type !== 'asset') ||
		(clip.blendMode && clip.blendMode !== 'normal') ||
		clip.timeRemap
	);
}

function tracksNeedGpu(tracks: readonly Track[]): boolean {
	return tracks.some(
		(track) => (track.transitions?.length ?? 0) > 0 || track.clips.some(clipNeedsGpu)
	);
}

/**
 * True when a project uses features only the WebGL2 compositor implements (effects, masks,
 * transitions, generated sources, nested sequences). Plain Phase 1 projects stay on the Canvas2D
 * reference renderer; both are pixel-matched by the parity suite.
 */
export function projectNeedsGpu(project: Project): boolean {
	return tracksNeedGpu(project.tracks) || Object.keys(project.sequences ?? {}).length > 0;
}
