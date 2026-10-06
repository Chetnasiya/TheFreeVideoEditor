import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../core';
import { buildExportPlan } from './plan';
import { dimensionsForPreset, sanitizeFilename, settingsForPreset } from './presets';

function projectForTenMinutes(fps: number) {
	const project = createEmptyProject({ name: `${fps} fps`, settings: { fps } });
	const video = project.tracks.find((track) => track.kind === 'video');
	if (!video) throw new Error('Factory did not create a video track.');
	video.clips.push({
		id: 'long-clip' as (typeof video.clips)[number]['id'],
		assetId: 'long-asset' as keyof typeof project.assets,
		start: 0,
		duration: 600_000_000,
		sourceIn: 0,
		sourceOut: 600_000_000,
		speed: 1,
		volume: 1
	});
	return project;
}

describe('video export planning', () => {
	it.each([24, 25, 30, 60])('calculates drift-free 10-minute timing at %i fps', (fps) => {
		const plan = buildExportPlan(projectForTenMinutes(fps), {
			format: 'mp4',
			width: 1920,
			height: 1080,
			fps,
			videoBitrate: 8_000_000,
			audio: true,
			audioBitrate: 192_000,
			filename: 'cut.mp4',
			range: 'timeline'
		});
		expect(plan.totalFrames).toBe(600 * fps);
		expect(plan.timestamp(0)).toBe(0);
		expect(plan.timestamp(plan.totalFrames - 1)).toBe(
			Math.round(((plan.totalFrames - 1) * 1_000_000) / fps)
		);
	});

	it('rejects an empty timeline and rounds H.264 dimensions down to even', () => {
		const project = createEmptyProject({ name: 'Empty' });
		const settings = {
			format: 'mp4' as const,
			width: 1279,
			height: 719,
			fps: 30,
			videoBitrate: 1_000_000,
			audio: false,
			audioBitrate: 128_000,
			filename: 'empty.mp4',
			range: 'timeline' as const
		};
		expect(() => buildExportPlan(project, settings)).toThrow(/at least one clip/);
		project.tracks[0]!.clips.push({
			id: 'c' as (typeof project.tracks)[number]['clips'][number]['id'],
			assetId: 'a' as keyof typeof project.assets,
			start: 0,
			duration: 1,
			sourceIn: 0,
			sourceOut: 1,
			speed: 1,
			volume: 1
		});
		expect(buildExportPlan(project, settings)).toMatchObject({ width: 1278, height: 718 });
	});

	it('preserves aspect ratio for resolution presets and sanitizes filenames', () => {
		const project = createEmptyProject({
			name: 'Portrait',
			settings: { width: 1080, height: 1920 }
		});
		expect(dimensionsForPreset(project, '720p', 'mp4')).toEqual({ width: 404, height: 720 });
		expect(sanitizeFilename('../my: edit?.mp4', '.MP4')).toBe('..-my- edit-.mp4');
		expect(
			settingsForPreset(project, {
				format: 'webm',
				preset: '480p',
				quality: 'high',
				audio: true,
				filename: 'A cut'
			}).filename
		).toBe('A cut.webm');
	});
});
