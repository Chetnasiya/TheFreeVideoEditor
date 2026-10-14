import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../../core';
import { buildExportPlan } from '../plan';
import { settingsForPreset } from '../presets';

function createProjectWithClip(name: string) {
	const project = createEmptyProject({ name });
	const video = project.tracks.find((t) => t.kind === 'video');
	if (video) {
		video.clips.push({
			id: 'clip-1' as (typeof video.clips)[number]['id'],
			assetId: 'asset-1' as keyof typeof project.assets,
			start: 0,
			duration: 10_000_000, // 10 seconds
			sourceIn: 0,
			sourceOut: 10_000_000,
			speed: 1,
			volume: 1
		});
	}
	return project;
}

describe('Export Plan with Professional Codecs', () => {
	it('builds export plan for QuickTime MOV', () => {
		const project = createProjectWithClip('MOV Test');
		const settings = settingsForPreset(project, {
			format: 'mov',
			preset: 'project',
			quality: 'high',
			audio: true,
			filename: 'output.mov',
			codecId: 'h264-mov',
			audioCodecId: 'pcm24',
			colorSpaceTag: 'rec709',
			bitDepth: 8,
			alpha: false
		});

		const plan = buildExportPlan(project, settings);
		expect(plan.width).toBe(project.settings.width);
		expect(plan.height).toBe(project.settings.height);
		expect(plan.fps).toBe(project.settings.fps);
		expect(settings.filename).toBe('output.mov');
	});

	it('builds dedicated audio-only plan for WAV export', () => {
		const project = createProjectWithClip('WAV Audio Test');
		const settings = settingsForPreset(project, {
			format: 'wav',
			preset: 'project',
			quality: 'high',
			audio: true,
			filename: 'audio.wav',
			audioCodecId: 'pcm24'
		});

		const plan = buildExportPlan(project, settings);
		expect(plan.width).toBe(2);
		expect(plan.height).toBe(2);
		expect(plan.fps).toBe(project.settings.fps);
		expect(settings.filename).toBe('audio.wav');
	});

	it('configures 10-bit and alpha flags in export settings', () => {
		const project = createProjectWithClip('Alpha 10bit Test');
		const settings = settingsForPreset(project, {
			format: 'webm',
			preset: '4k',
			quality: 'pro',
			audio: true,
			filename: 'master.webm',
			codecId: 'vp9-profile2-webm',
			bitDepth: 10,
			alpha: true,
			colorSpaceTag: 'rec2020'
		});

		expect(settings.width).toBe(3840);
		expect(settings.height).toBe(2160);
		expect(settings.bitDepth).toBe(10);
		expect(settings.alpha).toBe(true);
		expect(settings.colorSpaceTag).toBe('rec2020');
		expect(settings.videoBitrate).toBeGreaterThan(40_000_000);
	});
});
