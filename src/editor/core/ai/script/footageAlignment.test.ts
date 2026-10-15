import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../../core/factory';
import type { Asset, AssetId } from '../../../core/types';
import type { ParsedScript } from '../types';
import { extractFootageAudioSources, alignFootageWithScript } from './footageAlignment';

describe('Footage Audio Extraction and Script Alignment', () => {
	it('extracts audio from project media assets when timeline is empty', async () => {
		const project = createEmptyProject({ name: 'Asset Audio Test' });

		// Add media assets with audio
		const asset1: Asset = {
			id: 'asset_interview_1' as unknown as AssetId,
			kind: 'video',
			name: 'take_1.mp4',
			mimeType: 'video/mp4',
			size: 2000,
			duration: 6_000_000,
			hasAudio: true,
			width: 1920,
			height: 1080,
			fps: 30,
			opfsPath: 'take_1.mp4',
			offline: false
		};

		project.assets[asset1.id] = asset1;

		const sources = await extractFootageAudioSources(project, null, 'auto');
		expect(sources.length).toBeGreaterThan(0);
		expect(sources[0]!.sourceType).toBe('asset');
		expect(sources[0]!.assetId).toBe(asset1.id);
		expect(sources[0]!.samples.length).toBeGreaterThan(0);
		expect(sources[0]!.sampleRate).toBe(16000);
	});

	it('aligns multi-line script with footage audio and produces scored take candidates', async () => {
		const project = createEmptyProject({ name: 'Script Alignment Test' });

		const asset: Asset = {
			id: 'asset_shoot' as unknown as AssetId,
			kind: 'video',
			name: 'shoot.mp4',
			mimeType: 'video/mp4',
			size: 5000,
			duration: 10_000_000,
			hasAudio: true,
			width: 1920,
			height: 1080,
			fps: 30,
			opfsPath: 'shoot.mp4',
			offline: false
		};
		project.assets[asset.id] = asset;

		const script: ParsedScript = {
			id: 'script_test',
			title: 'Product Review',
			rawText: 'Line 1\nLine 2',
			speakers: ['Host'],
			lines: [
				{ id: 'line_1', lineIndex: 1, text: 'Welcome to this product review.', optional: false },
				{
					id: 'line_2',
					lineIndex: 2,
					text: 'Today we evaluate the design and performance.',
					optional: false
				}
			]
		};

		const sources = await extractFootageAudioSources(project, null, 'bin_media');
		expect(sources.length).toBe(1);

		const result = await alignFootageWithScript(project, script, sources);

		expect(result.words.length).toBeGreaterThan(0);
		expect(result.groups.length).toBe(2);

		// Verify every script line has at least 1 candidate take
		const group1 = result.groups.find((g) => g.scriptLineId === 'line_1');
		expect(group1).toBeDefined();
		expect(group1!.candidates.length).toBeGreaterThan(0);
		expect(group1!.candidates[0]!.score).toBeGreaterThan(0);
		expect(group1!.selectedTakeId).toBe(group1!.candidates[0]!.id);

		const group2 = result.groups.find((g) => g.scriptLineId === 'line_2');
		expect(group2).toBeDefined();
		expect(group2!.candidates.length).toBeGreaterThan(0);
		expect(group2!.candidates[0]!.score).toBeGreaterThan(0);
	});
});
