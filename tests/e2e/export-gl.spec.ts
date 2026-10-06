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

test('WebGL2 worker export renders the same layers as Canvas2D', async ({ page }) => {
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
	await page.evaluate(() => {
		window.__TFVE_EXPORT_TEST_HOOKS__ ??= {};
		window.__TFVE_EXPORT_TEST_HOOKS__.forceRenderer = 'webgl2';
	});
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
	expect(await page.evaluate(() => window.__TFVE_EXPORT_TEST_HOOKS__?.lastRenderer)).toBe('webgl2');
	expect(browserProblems).toEqual([]);
});
