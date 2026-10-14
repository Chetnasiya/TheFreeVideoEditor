import { expect, test } from '@playwright/test';

test.describe('Text Rendering & Export Verification', () => {
	test('renders visible text pixels on preview canvas in both WebGL2 and Canvas2D', async ({
		page
	}) => {
		await page.goto('/editor');
		const manager = page.locator('.project-manager-dialog');
		try {
			await manager.waitFor({ state: 'visible', timeout: 5000 });
			await manager.getByRole('button', { name: 'New project' }).click();
			const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
			await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Pixel Proof');
			await createDialog.getByRole('button', { name: 'Create project' }).click();
			await expect(manager).not.toBeVisible();
		} catch {}

		// Add Text Clip from timeline toolbar
		const addTextBtn = page.getByRole('button', { name: 'Text Layer' });
		await expect(addTextBtn).toBeVisible();
		await addTextBtn.click();

		const textClip = page.locator('.timeline-clip.is-text').first();
		await expect(textClip).toBeVisible();

		// Wait a tick for frame rendering
		await page.waitForTimeout(500);

		const canvas = page.locator('canvas.preview-canvas');
		await expect(canvas).toBeVisible();

		// 1. Verify WebGL2 renders text pixels
		const result = await canvas.evaluate((c: HTMLCanvasElement) => {
			const gl = c.getContext('webgl2');
			if (gl) {
				const pixels = new Uint8Array(c.width * c.height * 4);
				gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
				let nonBlack = 0;
				for (let i = 0; i < pixels.length; i += 4) {
					if (pixels[i]! > 20 || pixels[i + 1]! > 20 || pixels[i + 2]! > 20) {
						nonBlack++;
					}
				}
				return { context: 'webgl2', width: c.width, height: c.height, nonBlack };
			}
			return { context: 'none', width: c.width, height: c.height, nonBlack: 0 };
		});

		expect(result.nonBlack).toBeGreaterThan(100);

		// 2. Switch engine to canvas2d and verify Canvas2D renderer renders text pixels
		await page.evaluate(() => {
			const playback = (window as any).__tfvePlaybackTest;
			const engine = playback?.engine;
			const c = document.querySelector('canvas.preview-canvas') as HTMLCanvasElement;
			if (engine && c) {
				// Re-create canvas element for 2d context since canvas cannot switch context type
				const clone = c.cloneNode() as HTMLCanvasElement;
				c.parentNode?.replaceChild(clone, c);
				engine.attach(clone, 'canvas2d');
				engine.drawCurrentFrame();
			}
		});

		await page.waitForTimeout(200);

		const canvas2d = page.locator('canvas.preview-canvas');
		const result2d = await canvas2d.evaluate((c: HTMLCanvasElement) => {
			const ctx = c.getContext('2d');
			if (ctx) {
				const imgData = ctx.getImageData(0, 0, c.width, c.height);
				let nonBlack = 0;
				for (let i = 0; i < imgData.data.length; i += 4) {
					if (imgData.data[i]! > 20 || imgData.data[i + 1]! > 20 || imgData.data[i + 2]! > 20) {
						nonBlack++;
					}
				}
				return { context: '2d', width: c.width, height: c.height, nonBlack };
			}
			return { context: 'none', width: c.width, height: c.height, nonBlack: 0 };
		});

		expect(result2d.nonBlack).toBeGreaterThan(100);
	});

	test('exports a text clip successfully without errors', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
			Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
		});
		await page.goto('/editor');
		const manager = page.locator('.project-manager-dialog');
		try {
			await manager.waitFor({ state: 'visible', timeout: 5000 });
			await manager.getByRole('button', { name: 'New project' }).click();
			const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
			await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Text Export Test');
			await createDialog.getByRole('button', { name: 'Create project' }).click();
			await expect(manager).not.toBeVisible();
		} catch {}

		// Add Text Clip from timeline toolbar
		const addTextBtn = page.getByRole('button', { name: 'Text Layer' });
		await expect(addTextBtn).toBeVisible();
		await addTextBtn.click();

		const textClip = page.locator('.timeline-clip.is-text').first();
		await expect(textClip).toBeVisible();

		// Open Export dialog
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const exportDialog = page.getByRole('dialog', { name: 'Export' });
		await expect(exportDialog).toBeVisible();
		await expect(exportDialog.locator('.export-capability').last()).not.toContainText(
			'Checking browser export support',
			{ timeout: 15_000 }
		);

		await exportDialog.getByLabel('Format').selectOption('webm');
		await exportDialog.getByLabel('Include audio').uncheck();
		await exportDialog.getByLabel('Resolution').selectOption('720p');
		await exportDialog.getByLabel('Quality').selectOption('low');
		const mode = exportDialog.getByLabel('Export method');
		await mode.selectOption('webcodecs');

		const videoDownloadPromise = page.waitForEvent('download', { timeout: 30_000 });
		await exportDialog.getByRole('button', { name: 'Export video' }).click();
		const download = await videoDownloadPromise;
		expect(download.suggestedFilename()).toMatch(/\.webm$/);
	});
});
