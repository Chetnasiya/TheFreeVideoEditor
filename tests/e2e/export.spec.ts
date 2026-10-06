import { expect, test } from '@playwright/test';
import type { VerifiedExportFile } from './verifyExport';

declare global {
	interface Window {
		__TFVE_LONG_TASKS__?: {
			after: number;
			entries: Array<{ startTime: number; duration: number }>;
		};
	}
}

test('exports a timeline video and an OTIO project file', async ({ page }) => {
	const browserProblems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			browserProblems.push(`${message.type()}: ${message.text()}`);
		}
	});
	page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));
	await page.addInitScript(() => {
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
		Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
	});
	await page.goto('/editor');
	const manager = page.getByRole('dialog', { name: 'Your Projects' });
	await manager.getByRole('button', { name: 'New project' }).click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Export Test');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'Export Test' })).toBeVisible();

	await page.locator('input[name="media-files"]').setInputFiles('tests/fixtures/colors.mp4');
	const media = page.getByRole('listbox', { name: 'Project media' });
	const asset = media.getByRole('option').first();
	await expect(asset).toBeVisible({ timeout: 20_000 });
	await asset.dragTo(page.locator('[data-track-lane]').first());
	await expect(page.locator('.timeline-clip')).toHaveCount(2);
	const addedSecondClip = await page.evaluate(
		() => window.__TFVE_EXPORT_TEST_HOOKS__?.addSecondClipAfterGap?.() ?? false
	);
	expect(addedSecondClip).toBe(true);
	await expect(page.locator('.timeline-clip')).toHaveCount(4);

	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const exportDialog = page.getByRole('dialog', { name: 'Export' });
	await expect(exportDialog).toBeVisible();
	await expect(exportDialog.locator('.export-capability').last()).not.toContainText(
		'Checking browser export support',
		{ timeout: 15_000 }
	);
	const capability = await page.evaluate(
		() => window.__TFVE_EXPORT_TEST_HOOKS__?.capabilities ?? { video: false, audio: false }
	);
	test.fixme(
		!capability.video,
		'Chromium has no WebCodecs video encoder; WebCodecs output proof is required.'
	);
	await exportDialog.getByLabel('Format').selectOption('webm');
	await expect(exportDialog.locator('.export-capability').last()).not.toContainText(
		'Checking browser export support',
		{ timeout: 15_000 }
	);
	await exportDialog.getByLabel('Include audio').uncheck();
	await exportDialog.getByLabel('Resolution').selectOption('720p');
	await exportDialog.getByLabel('Quality').selectOption('low');
	const mode = exportDialog.getByLabel('Export method');
	await mode.selectOption('webcodecs');
	const durationLabel =
		(await page.getByRole('status', { name: 'Current timecode and duration' }).textContent()) ?? '';
	const durationTimecode = durationLabel.split('/').at(-1)?.trim() ?? '';
	const [hours = 0, minutes = 0, seconds = 0, frames = 0] = durationTimecode.split(':').map(Number);
	const planTotalFrames = (hours * 3600 + minutes * 60 + seconds) * 30 + frames;
	const clipDescription =
		(await page.locator('.timeline-clip.is-video').first().getAttribute('aria-label')) ?? '';
	const startTimecode = clipDescription.match(/starts (\d{2}:\d{2}:\d{2}:\d{2})/)?.[1] ?? '';
	const [startHours = 0, startMinutes = 0, startSeconds = 0, startFrames = 0] = startTimecode
		.split(':')
		.map(Number);
	const clipStartSeconds = startHours * 3600 + startMinutes * 60 + startSeconds + startFrames / 30;
	const initialTerminations = await page.evaluate(
		() => window.__TFVE_EXPORT_TEST_HOOKS__?.workerTerminations ?? 0
	);
	const cancelledDownloadPromise = page
		.waitForEvent('download', { timeout: 1_000 })
		.then(() => true)
		.catch(() => false);
	await exportDialog.getByRole('button', { name: 'Export video' }).click();
	const cancelButton = exportDialog.getByRole('button', { name: 'Cancel…' });
	await cancelButton.waitFor();
	await cancelButton.click();
	const cancelDialog = page.getByRole('dialog', { name: 'Cancel this export?' });
	await expect(cancelDialog).toBeVisible();
	await expect(cancelDialog.getByRole('button', { name: 'Keep exporting' })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(cancelDialog).not.toBeVisible();
	await expect(cancelButton).toBeFocused();
	await cancelButton.click();
	await page
		.getByRole('dialog', { name: 'Cancel this export?' })
		.getByRole('button', { name: 'Cancel export' })
		.click();
	await expect(
		exportDialog.getByRole('status').filter({ hasText: 'Export cancelled' })
	).toBeVisible();
	expect(await cancelledDownloadPromise).toBe(false);
	await expect(exportDialog.locator('.export-progress')).toHaveCount(0);
	await expect(exportDialog.getByRole('button', { name: 'Cancel…' })).toHaveCount(0);
	await expect
		.poll(() => page.evaluate(() => window.__TFVE_EXPORT_TEST_HOOKS__?.workerTerminations ?? 0))
		.toBeGreaterThan(initialTerminations);

	await page.evaluate(() => {
		const state = {
			after: Number.POSITIVE_INFINITY,
			entries: [] as Array<{ startTime: number; duration: number }>
		};
		window.__TFVE_LONG_TASKS__ = state;
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				state.entries.push({ startTime: entry.startTime, duration: entry.duration });
			}
		}).observe({ type: 'longtask', buffered: true });
	});
	const videoDownloadPromise = page.waitForEvent('download', { timeout: 60_000 });
	await exportDialog.getByRole('button', { name: 'Export video' }).click();
	await expect(exportDialog.locator('.export-progress')).toBeVisible();
	await page.evaluate(() => {
		if (window.__TFVE_LONG_TASKS__) window.__TFVE_LONG_TASKS__.after = performance.now();
		if (!window.__TFVE_EXPORT_TEST_HOOKS__?.hideFirstVideoTrack?.(true)) {
			throw new Error('Could not mutate the live project during export.');
		}
	});
	const videoDownload = await videoDownloadPromise;
	expect(videoDownload.suggestedFilename()).toMatch(/\.webm$/);
	const videoPath = 'test-results/exported-video.webm';
	await videoDownload.saveAs(videoPath);
	expect(await videoDownload.failure()).toBeNull();
	const exportPath = await page.evaluate(() => window.__TFVE_EXPORT_TEST_HOOKS__?.lastExportPath);
	expect(exportPath).toBe('worker-webcodecs');

	await exportDialog.getByRole('button', { name: 'Close', exact: true }).click();
	await page.evaluate(() => {
		const input = document.createElement('input');
		input.type = 'file';
		input.id = 'export-verification-file';
		document.body.append(input);
	});
	await page.locator('#export-verification-file').setInputFiles(videoPath);
	const decoded = (await page.evaluate(
		async ({ clipStartSeconds }) => {
			const file = document.querySelector<HTMLInputElement>('#export-verification-file')
				?.files?.[0];
			if (!file) throw new Error('The exported file was not available to the browser decoder.');
			const moduleUrl = '/tests/e2e/verifyExport.ts';
			const verifier = await import(/* @vite-ignore */ moduleUrl);
			return verifier.verifyExportFile(file, clipStartSeconds);
		},
		{ clipStartSeconds }
	)) as VerifiedExportFile;
	expect(decoded.timestamps).toHaveLength(planTotalFrames);
	expect(decoded.timestamps[0]).toBeCloseTo(0, 3);
	expect(decoded.timestamps.at(-1)).toBeCloseTo((planTotalFrames - 1) / 30, 2);
	expect(Math.abs(decoded.duration - planTotalFrames / 30)).toBeLessThanOrEqual(1 / 30);
	expect(decoded.width).toBe(1280);
	expect(decoded.height).toBe(720);
	expect(decoded.black.slice(0, 3).every((channel) => channel < 40)).toBe(true);
	expect(decoded.internalGap.slice(0, 3).every((channel) => channel < 40)).toBe(true);
	expect(decoded.red[0]).toBeGreaterThan(decoded.red[1] + 70);
	expect(decoded.secondClipRed[0]).toBeGreaterThan(decoded.secondClipRed[1] + 70);
	expect(decoded.green[1]).toBeGreaterThan(decoded.green[0] + 70);
	expect(decoded.blue[2]).toBeGreaterThan(decoded.blue[0] + 70);
	expect(decoded.yellow[0]).toBeGreaterThan(150);
	expect(decoded.yellow[1]).toBeGreaterThan(150);
	expect(decoded.magenta[0]).toBeGreaterThan(150);
	expect(decoded.magenta[2]).toBeGreaterThan(150);
	expect(decoded.cyan[1]).toBeGreaterThan(150);
	expect(decoded.cyan[2]).toBeGreaterThan(150);
	const longTasks = await page.evaluate(
		() =>
			window.__TFVE_LONG_TASKS__?.entries.filter(
				(entry) =>
					entry.startTime >= (window.__TFVE_LONG_TASKS__?.after ?? Number.POSITIVE_INFINITY)
			) ?? []
	);
	expect(longTasks.every((entry) => entry.duration <= 100)).toBe(true);
	console.log(
		`WORKER_LONG_TASKS ${JSON.stringify({
			observed: longTasks.length,
			maxDurationMs: Math.max(0, ...longTasks.map((entry) => entry.duration))
		})}`
	);
	await page.evaluate(() => window.__TFVE_EXPORT_TEST_HOOKS__?.hideFirstVideoTrack?.(false));
	await page.locator('input[name="media-files"]').setInputFiles(videoPath);
	await expect(media.getByRole('option')).toHaveCount(2, { timeout: 20_000 });
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(exportDialog).toBeVisible();
	await exportDialog.getByRole('tab', { name: 'Project file' }).click();
	await expect(exportDialog.getByLabel('Format').locator('option')).toHaveCount(4);
	await page.evaluate(() => {
		for (const id of ['package-verification-file', 'source-verification-file']) {
			const input = document.createElement('input');
			input.type = 'file';
			input.id = id;
			document.body.append(input);
		}
	});
	await page.locator('#source-verification-file').setInputFiles('tests/fixtures/colors.mp4');
	for (const format of ['xmeml', 'edl', 'fcpxml', 'otio'] as const) {
		await exportDialog.getByLabel('Format').selectOption(format);
		await exportDialog.getByLabel('Package project with media files (.zip)').check();
		const packageDownloadPromise = page.waitForEvent('download', { timeout: 20_000 });
		await exportDialog.getByRole('button', { name: 'Export project' }).click();
		const packageDownload = await packageDownloadPromise;
		expect(packageDownload.suggestedFilename()).toMatch(/\.zip$/);
		expect(await packageDownload.failure()).toBeNull();
		const packagePath = await packageDownload.path();
		if (!packagePath) throw new Error(`${format} package was not saved.`);
		await page.locator('#package-verification-file').setInputFiles(packagePath);
		const result = await page.evaluate(async (selectedFormat) => {
			const archive = document.querySelector<HTMLInputElement>('#package-verification-file')
				?.files?.[0];
			const original = document.querySelector<HTMLInputElement>('#source-verification-file')
				?.files?.[0];
			if (!archive || !original)
				throw new Error('Interchange package verification files are missing.');
			const moduleUrl = '/tests/e2e/verifyPackage.ts';
			const verifier = await import(/* @vite-ignore */ moduleUrl);
			return verifier.verifyInterchangePackage(archive, original, selectedFormat);
		}, format);
		expect(result.mediaCount).toBe(2);
		expect(result.mediaMatch).toBe(true);
		expect(result.relativePaths).toBe(true);
		expect(result.referencesResolve, JSON.stringify(result)).toBe(true);
		expect(result.wellFormed).toBe(true);
		expect(result.validOtio).toBe(true);
	}
	expect(browserProblems).toEqual([]);
});

test('hiding the top video track reveals the lower exported layer', async ({ page }) => {
	test.setTimeout(120_000);
	const browserProblems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			browserProblems.push(`${message.type()}: ${message.text()}`);
		}
	});
	page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));
	await page.addInitScript(() => {
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
		Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
	});
	await page.goto('/editor');
	await page
		.getByRole('dialog', { name: 'Your Projects' })
		.getByRole('button', { name: 'New project' })
		.click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Layer Export Test');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'Layer Export Test' })).toBeVisible();
	await page
		.locator('input[name="media-files"]')
		.setInputFiles(['tests/fixtures/colors.mp4', 'tests/fixtures/sample.mp4']);
	const media = page.getByRole('listbox', { name: 'Project media' });
	const lowerAsset = media.getByRole('option').filter({ hasText: 'colors.mp4' });
	await expect(lowerAsset).toBeVisible({ timeout: 20_000 });
	await expect(media.getByRole('option').filter({ hasText: 'sample.mp4' })).toBeVisible({
		timeout: 20_000
	});
	await lowerAsset.dragTo(page.locator('[data-track-lane]').first());
	const addedOverlay = await page.evaluate(
		() => window.__TFVE_EXPORT_TEST_HOOKS__?.addSampleOverlay?.() ?? false
	);
	expect(addedOverlay).toBe(true);

	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Export' });
	await dialog.getByLabel('Format').selectOption('webm');
	await dialog.getByLabel('Include audio').uncheck();
	await dialog.getByLabel('Resolution').selectOption('480p');
	await dialog.getByLabel('Quality').selectOption('low');
	await dialog.getByLabel('Export method').selectOption('webcodecs');
	await expect
		.poll(() => page.evaluate(() => window.__TFVE_EXPORT_TEST_HOOKS__?.capabilities?.video))
		.toBe(true);
	const capability = await page.evaluate(
		() => window.__TFVE_EXPORT_TEST_HOOKS__?.capabilities ?? { video: false }
	);
	test.fixme(!capability.video, 'Chromium has no WebCodecs video encoder for layer validation.');
	const clipDescription =
		(await page.locator('.timeline-clip.is-video').first().getAttribute('aria-label')) ?? '';
	const startTimecode = clipDescription.match(/starts (\d{2}:\d{2}:\d{2}:\d{2})/)?.[1] ?? '';
	const [startHours = 0, startMinutes = 0, startSeconds = 0, startFrames = 0] = startTimecode
		.split(':')
		.map(Number);
	const clipStartSeconds = startHours * 3600 + startMinutes * 60 + startSeconds + startFrames / 30;

	const verifyCenterPixel = async () => {
		const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
		await dialog.getByRole('button', { name: 'Export video' }).click();
		const download = await downloadPromise;
		const path = await download.path();
		if (!path) throw new Error('Layer export did not produce a file.');
		await page.evaluate(() => {
			let input = document.querySelector<HTMLInputElement>('#layer-export-file');
			if (!input) {
				input = document.createElement('input');
				input.type = 'file';
				input.id = 'layer-export-file';
				document.body.append(input);
			}
		});
		await page.locator('#layer-export-file').setInputFiles(path);
		return page.evaluate(
			async ({ clipStartSeconds: startSeconds }) => {
				const file = document.querySelector<HTMLInputElement>('#layer-export-file')?.files?.[0];
				if (!file) throw new Error('Layer export file is unavailable for pixel validation.');
				const moduleUrl = '/tests/e2e/verifyExport.ts';
				const verifier = await import(/* @vite-ignore */ moduleUrl);
				return verifier.verifyExportFile(file, startSeconds);
			},
			{ clipStartSeconds }
		);
	};

	const topLayer = await verifyCenterPixel();
	expect(await page.evaluate(() => window.__TFVE_EXPORT_TEST_HOOKS__?.lastExportPath)).toBe(
		'worker-webcodecs'
	);
	expect(topLayer.red[0]).toBeLessThan(topLayer.red[2] + 30);
	expect(
		await page.evaluate(() => window.__TFVE_EXPORT_TEST_HOOKS__?.hideTopVideoTrack?.(true))
	).toBe(true);
	const lowerLayer = await verifyCenterPixel();
	expect(await page.evaluate(() => window.__TFVE_EXPORT_TEST_HOOKS__?.lastExportPath)).toBe(
		'worker-webcodecs'
	);
	expect(lowerLayer.red[0]).toBeGreaterThan(lowerLayer.red[1] + 70);
	expect(browserProblems).toEqual([]);
});

test('worker WebCodecs export mixes, mutes, and omits audio tracks correctly', async ({ page }) => {
	test.setTimeout(120_000);
	const browserProblems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			browserProblems.push(`${message.type()}: ${message.text()}`);
		}
	});
	page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));
	await page.addInitScript(() => {
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
		Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
	});
	await page.goto('/editor');
	const manager = page.getByRole('dialog', { name: 'Your Projects' });
	await manager.getByRole('button', { name: 'New project' }).click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Audio Export Test');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'Audio Export Test' })).toBeVisible();
	const fileInput = page.locator('input[name="media-files"]');
	await fileInput.setInputFiles(['tests/fixtures/colors.mp4', 'tests/fixtures/tone.wav']);
	const media = page.getByRole('listbox', { name: 'Project media' });
	const videoAsset = media.getByRole('option').filter({ hasText: 'colors.mp4' });
	const audioAsset = media.getByRole('option').filter({ hasText: 'tone.wav' });
	await expect(videoAsset).toBeVisible({ timeout: 20_000 });
	await expect(audioAsset).toBeVisible({ timeout: 20_000 });
	await videoAsset.dragTo(page.locator('[data-track-lane]').nth(0));
	await audioAsset.dragTo(page.locator('[data-track-lane]').nth(1));
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const exportDialog = page.getByRole('dialog', { name: 'Export' });
	await expect(exportDialog).toBeVisible();
	await exportDialog.getByLabel('Format').selectOption('webm');
	await expect
		.poll(() => page.evaluate(() => window.__TFVE_EXPORT_TEST_HOOKS__?.capabilities?.audio))
		.toBe(true);
	const capability = await page.evaluate(() => window.__TFVE_EXPORT_TEST_HOOKS__?.capabilities);
	test.fixme(
		!capability?.video || !capability.audio,
		'Chromium lacks WebCodecs VP9/Opus support; worker audio output cannot be validated.'
	);
	await exportDialog.getByLabel('Resolution').selectOption('480p');
	await exportDialog.getByLabel('Quality').selectOption('low');
	await exportDialog.getByLabel('Export method').selectOption('webcodecs');
	const verificationInput = await page.evaluate(() => {
		const input = document.createElement('input');
		input.type = 'file';
		input.id = 'audio-export-verification';
		document.body.append(input);
		return input.id;
	});

	const exportAndMeasure = async () => {
		const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
		await exportDialog.getByRole('button', { name: 'Export video' }).click();
		const download = await downloadPromise;
		const path = await download.path();
		if (!path) throw new Error('The audio export did not produce a file.');
		await page.locator(`#${verificationInput}`).setInputFiles(path);
		const result = await page.evaluate(async () => {
			const file = document.querySelector<HTMLInputElement>('#audio-export-verification')
				?.files?.[0];
			if (!file) throw new Error('The audio export was not available for decoding.');
			const moduleUrl = '/tests/e2e/verifyExport.ts';
			const verifier = await import(/* @vite-ignore */ moduleUrl);
			return verifier.verifyExportAudio(file);
		});
		return result;
	};

	const audible = await exportAndMeasure();
	expect(await page.evaluate(() => window.__TFVE_EXPORT_TEST_HOOKS__?.lastExportPath)).toBe(
		'worker-webcodecs'
	);
	expect(audible.hasTrack).toBe(true);
	expect(audible.rms).toBeGreaterThan(0.01);

	await exportDialog.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByRole('button', { name: 'Mute Audio 1' }).click();
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(exportDialog).toBeVisible();
	const muted = await exportAndMeasure();
	expect(muted.rms).toBeLessThan(0.001);

	await exportDialog.getByLabel('Include audio').uncheck();
	const videoOnly = await exportAndMeasure();
	expect(videoOnly.hasTrack).toBe(false);
	expect(videoOnly.rms).toBeLessThan(0.001);
	expect(browserProblems).toEqual([]);
});

test('compatibility export is explicitly selected and recorded as its own path', async ({
	page
}) => {
	test.setTimeout(90_000);
	const browserProblems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			browserProblems.push(`${message.type()}: ${message.text()}`);
		}
	});
	page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));
	await page.addInitScript(() => {
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
		Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
	});
	await page.goto('/editor');
	await page
		.getByRole('dialog', { name: 'Your Projects' })
		.getByRole('button', { name: 'New project' })
		.click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await createDialog
		.getByRole('textbox', { name: 'Project name' })
		.fill('Compatibility Export Test');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'Compatibility Export Test' })).toBeVisible();
	await page.locator('input[name="media-files"]').setInputFiles('tests/fixtures/sample.mp4');
	const media = page.getByRole('listbox', { name: 'Project media' });
	const asset = media.getByRole('option').first();
	await expect(asset).toBeVisible({ timeout: 20_000 });
	await asset.dragTo(page.locator('[data-track-lane]').first());
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const exportDialog = page.getByRole('dialog', { name: 'Export' });
	await exportDialog.getByLabel('Format').selectOption('webm');
	await exportDialog.getByLabel('Include audio').uncheck();
	const method = exportDialog.getByLabel('Export method');
	const compatibility = method.locator('option[value="compatibility"]');
	test.fixme(
		!(await compatibility.isEnabled()),
		'Chromium MediaRecorder does not support WebM compatibility export.'
	);
	await method.selectOption('compatibility');
	const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
	await exportDialog.getByRole('button', { name: 'Export video' }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/\.webm$/);
	expect(await page.evaluate(() => window.__TFVE_EXPORT_TEST_HOOKS__?.lastExportPath)).toBe(
		'compatibility'
	);
	expect(await download.failure()).toBeNull();
	expect(browserProblems).toEqual([]);
});
