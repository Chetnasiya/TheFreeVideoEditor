import { expect, test } from '@playwright/test';

test('imports, persists, and archives local media with a project', async ({ page }) => {
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
	const newProjectDialog = page.getByRole('dialog', { name: 'Create a Project' });
	const newProjectBounds = await newProjectDialog.boundingBox();
	const viewport = page.viewportSize();
	expect(newProjectBounds).not.toBeNull();
	expect(viewport).not.toBeNull();
	expect(
		Math.abs(newProjectBounds!.x + newProjectBounds!.width / 2 - viewport!.width / 2)
	).toBeLessThan(2);
	expect(
		Math.abs(newProjectBounds!.y + newProjectBounds!.height / 2 - viewport!.height / 2)
	).toBeLessThan(2);
	await newProjectDialog.getByRole('textbox', { name: 'Project name' }).fill('Media Import Test');
	await newProjectDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'Media Import Test' })).toBeVisible();

	await page
		.locator('input[name="media-files"]')
		.setInputFiles([
			'tests/fixtures/sample.mp4',
			'tests/fixtures/tone.wav',
			'tests/fixtures/still.png',
			'tests/fixtures/bad.mp4'
		]);
	const assets = page.getByRole('listbox', { name: 'Project media' });
	await expect(assets.getByRole('option')).toHaveCount(3, { timeout: 20_000 });
	// Newest imported file (still.png) is at top
	await expect(assets.getByRole('option').first()).toContainText('still.png');
	// Thumbnail height fixed at 48px
	await expect(page.locator('.media-asset-preview').first()).toHaveCSS('height', '48px');
	await page.getByRole('button', { name: 'Grid view' }).click();
	await expect(page.locator('.media-asset-preview').first()).toHaveCSS('height', '48px');
	await page.getByRole('button', { name: 'List view' }).click();
	await expect(page.locator('.media-asset-preview').first()).toHaveCSS('height', '48px');
	await assets.getByRole('option').first().locator('.media-asset-preview').click();
	await assets
		.getByRole('option')
		.nth(2)
		.locator('.media-asset-preview')
		.click({ modifiers: ['Shift'] });
	await expect(assets.getByRole('option', { selected: true })).toHaveCount(3);
	await expect(page.getByRole('status').filter({ hasText: 'bad.mp4' })).toContainText('Failed:', {
		timeout: 20_000
	});
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 20_000 });

	await page.reload();
	await expect(page.getByRole('heading', { name: 'Media Import Test' })).toBeVisible();
	await expect(
		page.getByRole('listbox', { name: 'Project media' }).getByRole('option')
	).toHaveCount(3);

	await page.getByRole('button', { name: 'File', exact: true }).click();
	await page.getByRole('menuitem', { name: /Save a Copy as \.tfve/ }).click();
	const saveCopyDialog = page.getByRole('dialog', { name: 'Save a project copy?' });
	await expect(saveCopyDialog).toBeVisible();
	const saveCopyBounds = await saveCopyDialog.boundingBox();
	expect(saveCopyBounds).not.toBeNull();
	expect(
		Math.abs(saveCopyBounds!.x + saveCopyBounds!.width / 2 - viewport!.width / 2)
	).toBeLessThan(2);
	expect(
		Math.abs(saveCopyBounds!.y + saveCopyBounds!.height / 2 - viewport!.height / 2)
	).toBeLessThan(2);
	const downloadPromise = page.waitForEvent('download');
	await saveCopyDialog.getByRole('button', { name: 'Save Copy as .tfve' }).click();
	const download = await downloadPromise;
	const archivePath = await download.path();
	if (!archivePath) throw new Error('The project archive was not saved to a file.');

	await page.getByRole('button', { name: 'File', exact: true }).click();
	await page.getByRole('menuitem', { name: /Open Project/ }).click();
	await manager.locator('.project-manager-row').getByRole('button', { name: 'Delete' }).click();
	await page
		.getByRole('dialog', { name: 'Delete “Media Import Test”?' })
		.getByRole('button', { name: 'Delete project' })
		.click();
	const fileChooserPromise = page.waitForEvent('filechooser');
	await manager.getByRole('button', { name: 'Open .tfve project' }).click();
	const fileChooser = await fileChooserPromise;
	await fileChooser.setFiles(archivePath);
	await expect(page.getByRole('heading', { name: 'Media Import Test' })).toBeVisible();
	await expect(
		page.getByRole('listbox', { name: 'Project media' }).getByRole('option')
	).toHaveCount(3);

	expect(browserProblems).toEqual([]);
});
