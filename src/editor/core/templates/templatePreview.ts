import { createEmptyProject } from '../factory';
import type { Project, SequenceId, Time } from '../types';
import { instantiateTemplateIntoProject } from './templateService';
import type { MotionGraphicTemplate } from './templateTypes';

const MIN_PREVIEW_SIZE = 16;
const DEFAULT_INTRO: Time = 500_000;

/**
 * A one-clip project that holds a single instance of `template`, sized to the template bounds so the
 * instance fills the frame. It goes through the same instantiation and `resolveFrame` path as a clip
 * on the timeline, so a card preview cannot drift from what the Program monitor shows.
 */
export function buildTemplatePreviewProject(template: MotionGraphicTemplate): Project {
	const width = Math.max(MIN_PREVIEW_SIZE, Math.round(template.bounds?.width ?? 1920));
	const height = Math.max(MIN_PREVIEW_SIZE, Math.round(template.bounds?.height ?? 1080));
	const empty = createEmptyProject({ name: template.name, settings: { width, height } });
	const { project } = instantiateTemplateIntoProject(empty, 'root' as SequenceId, template, 0);
	return {
		...project,
		tracks: project.tracks.map((track) => ({
			...track,
			clips: track.clips.map((clip) => ({
				...clip,
				transform: clip.transform ? { ...clip.transform, x: 0, y: 0 } : clip.transform
			}))
		}))
	};
}

/** The time a still thumbnail shows: just after the intro has settled. */
export function templatePreviewSettledTime(template: MotionGraphicTemplate): Time {
	const intro = template.responsiveTiming?.introDuration ?? DEFAULT_INTRO;
	return Math.min(intro + 200_000, Math.round(template.duration * 0.45));
}

/** Maps a hover-loop fraction in [0, 1] to a template-local time. */
export function templatePreviewLoopTime(template: MotionGraphicTemplate, fraction: number): Time {
	const clamped = Math.min(Math.max(fraction, 0), 1);
	return Math.min(Math.round(clamped * template.duration), Math.max(0, template.duration - 1));
}
