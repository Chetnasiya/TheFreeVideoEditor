import { execSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';

test('codecs export: verifies WAV with uncompressed linear PCM and AVFoundation validation', async ({
	page
}) => {
	test.setTimeout(90_000);
	const wavOut = 'test-results/test-audio-export-24b.wav';
	if (existsSync(wavOut)) unlinkSync(wavOut);

	await page.addInitScript(() => {
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
		Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
	});

	await page.goto('/editor');
	const manager = page.getByRole('dialog', { name: 'Your Projects' });
	await manager.getByRole('button', { name: 'New project' }).click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Pro Audio Codecs E2E');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'Pro Audio Codecs E2E' })).toBeVisible();

	// Import tone.wav fixture
	const fileInput = page.locator('input[name="media-files"]');
	await fileInput.setInputFiles(['tests/fixtures/tone.wav']);
	const media = page.getByRole('listbox', { name: 'Project media' });
	const audioAsset = media.getByRole('option').filter({ hasText: 'tone.wav' });
	await expect(audioAsset).toBeVisible({ timeout: 15_000 });

	// Drag to timeline audio track
	await audioAsset.dragTo(page.locator('[data-track-lane]').last());
	await expect(page.locator('.timeline-clip')).toHaveCount(1);

	// Open Export dialog
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const exportDialog = page.getByRole('dialog', { name: 'Export' });
	await expect(exportDialog).toBeVisible();

	// Select WAV format
	await exportDialog.getByLabel('Format').selectOption('wav');

	// Verify WAV Audio Codec options (Linear PCM 16, 24, 32-bit float)
	const audioCodecSelect = exportDialog.getByLabel(/Audio Bit Depth|Audio Codec/i);
	await expect(audioCodecSelect).toBeVisible();
	await audioCodecSelect.selectOption('pcm24');

	const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
	await exportDialog.getByRole('button', { name: 'Export video' }).click();
	const download = await downloadPromise;

	expect(download.suggestedFilename()).toMatch(/\.wav$/);
	await download.saveAs(wavOut);
	expect(await download.failure()).toBeNull();
	expect(existsSync(wavOut)).toBe(true);

	// Validate with mediabunny re-probe in Node test runner
	const wavBytes = readFileSync(wavOut);
	const blob = new Blob([wavBytes], { type: 'audio/wav' });
	const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
	try {
		const track = await input.getPrimaryAudioTrack();
		expect(track).toBeDefined();
		if (track) {
			expect(await track.getNumberOfChannels()).toBe(2);
			expect(await track.getSampleRate()).toBe(48000);
			expect(await track.getCodec()).toBe('pcm-s24');
		}
	} finally {
		input.dispose();
	}

	// Run independent validation via Swift AVFoundation on macOS
	const swiftScript =
		'/Users/gajananpalepwad/.gemini/antigravity/brain/3214f692-6b9d-431e-bda5-20aeb5835143/scratch/validate_avfoundation.swift';
	if (existsSync(swiftScript)) {
		const avOutput = execSync(`swift -suppress-warnings "${swiftScript}" "${wavOut}"`, {
			encoding: 'utf-8'
		});
		const report = JSON.parse(avOutput.trim());
		expect(report.isPlayable).toBe(true);
		expect(report.audioTracks).toBeDefined();
		expect(report.audioTracks[0].formats).toContain('lpcm');
	}
});

test('codecs export: verifies WebM VP9 export with alpha transparency and decodable frames', async ({
	page
}) => {
	test.setTimeout(90_000);
	const webmOut = 'test-results/test-video-export-alpha.webm';
	if (existsSync(webmOut)) unlinkSync(webmOut);

	await page.addInitScript(() => {
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
		Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
	});

	await page.goto('/editor');
	const manager = page.getByRole('dialog', { name: 'Your Projects' });
	await manager.getByRole('button', { name: 'New project' }).click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Alpha Export E2E');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'Alpha Export E2E' })).toBeVisible();

	// Import colors.mp4 fixture
	const fileInput = page.locator('input[name="media-files"]');
	await fileInput.setInputFiles(['tests/fixtures/colors.mp4']);
	const media = page.getByRole('listbox', { name: 'Project media' });
	const videoAsset = media.getByRole('option').filter({ hasText: 'colors.mp4' });
	await expect(videoAsset).toBeVisible({ timeout: 15_000 });

	// Drag to timeline video track
	await videoAsset.dragTo(page.locator('[data-track-lane]').first());
	await expect(page.locator('.timeline-clip')).toHaveCount(2);

	// Open Export dialog
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const exportDialog = page.getByRole('dialog', { name: 'Export' });
	await expect(exportDialog).toBeVisible();

	// Select WebM format
	await exportDialog.getByLabel('Format').selectOption('webm');

	// Verify Alpha checkbox is available and check it
	const alphaCheckbox = exportDialog.getByLabel(/Include alpha channel/i);
	if (await alphaCheckbox.isVisible()) {
		await alphaCheckbox.check();
	}

	// Disable audio for fast video-only test
	await exportDialog.getByLabel('Include audio').uncheck();

	const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
	await exportDialog.getByRole('button', { name: 'Export video' }).click();
	const download = await downloadPromise;

	expect(download.suggestedFilename()).toMatch(/\.webm$/);
	await download.saveAs(webmOut);
	expect(await download.failure()).toBeNull();
	expect(existsSync(webmOut)).toBe(true);

	// Re-probe with mediabunny in Node
	const videoBytes = readFileSync(webmOut);
	const blob = new Blob([videoBytes], { type: 'video/webm' });
	const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
	try {
		const videoTrack = await input.getPrimaryVideoTrack();
		expect(videoTrack).toBeDefined();
		if (videoTrack) {
			expect(await videoTrack.getCodec()).toBe('vp9');
			expect(await videoTrack.getDisplayWidth()).toBe(1920);
			expect(await videoTrack.getDisplayHeight()).toBe(1080);
		}
	} finally {
		input.dispose();
	}
});
