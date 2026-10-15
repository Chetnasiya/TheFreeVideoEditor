import { test, expect } from '@playwright/test';

test.describe('Codec Dialogs Layout and Interactivity', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/editor');
		const manager = page.locator('.project-manager-dialog');
		try {
			await manager.waitFor({ state: 'visible', timeout: 5000 });
			await manager.getByRole('button', { name: 'New project' }).click();
			const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
			await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Codec Test');
			await createDialog.getByRole('button', { name: 'Create project' }).click();
			await expect(manager).not.toBeVisible();
		} catch {}
	});

	test('CodecSupportDialog from Help menu is spacious, readable, and functional', async ({
		page
	}) => {
		const helpBtn = page.getByRole('button', { name: 'Help' });
		await helpBtn.click();
		const codecSupportItem = page.getByRole('menuitem', { name: 'Codecs & Hardware Support…' });
		await codecSupportItem.click();

		const dialog = page.locator('.codec-support-dialog');
		await expect(dialog).toBeVisible();

		const box = await dialog.boundingBox();
		console.log('CodecSupportDialog bounding box:', box);
		expect(box?.width).toBeGreaterThanOrEqual(520);
		expect(box?.height).toBeGreaterThanOrEqual(400);

		// Verify header and contents
		await expect(dialog.getByText('Codec & Hardware Acceleration Support')).toBeVisible();
		await expect(dialog.getByText('WebCodecs API')).toBeVisible();
		await expect(dialog.getByText('Context Security')).toBeVisible();
		await expect(dialog.getByText('Platform Engine')).toBeVisible();
		await expect(dialog.getByText('Video Codecs (Export & Encode)')).toBeVisible();
		await expect(dialog.getByText('H.264 / AVC High (MP4)')).toBeVisible();

		// Verify Copy Report and Close buttons
		const copyBtn = dialog.getByRole('button', { name: /Copy Diagnostic Report/i });
		await expect(copyBtn).toBeVisible();

		const closeBtn = dialog.getByRole('button', { name: 'Close', exact: true });
		await expect(closeBtn).toBeVisible();
		await closeBtn.click();
		await expect(dialog).not.toBeVisible();
	});

	test('CodecPackDialog from Help menu is spacious and tabs switch correctly', async ({ page }) => {
		const helpBtn = page.getByRole('button', { name: 'Help' });
		await helpBtn.click();
		const codecPackItem = page.getByRole('menuitem', {
			name: 'Advanced Codec Pack (Deferred / Build Guide)…'
		});
		await codecPackItem.click();

		const dialog = page.locator('.codec-pack-dialog');
		await expect(dialog).toBeVisible();

		const box = await dialog.boundingBox();
		console.log('CodecPackDialog bounding box:', box);
		expect(box?.width).toBeGreaterThanOrEqual(540);
		expect(box?.height).toBeGreaterThanOrEqual(400);

		// Verify title and Overview tab contents
		await expect(dialog.getByRole('heading', { name: 'Advanced Codec Pack' })).toBeVisible();
		await expect(dialog.getByText('Tier 2 Advanced Codec Pack — Deferred')).toBeVisible();

		// Switch to Codecs tab
		await dialog.getByRole('button', { name: 'Codecs' }).click();
		await expect(dialog.getByText('Supported Decoders (Ingest)')).toBeVisible();

		// Switch to Compliance tab
		await dialog.getByRole('button', { name: 'Compliance & Notices' }).click();
		await expect(dialog.getByText('Legal & Trademark Notices')).toBeVisible();

		// Switch to Build tab
		await dialog.getByRole('button', { name: 'Build Recipe' }).click();
		await expect(dialog.getByText('tools/codec-pack/build.sh', { exact: true })).toBeVisible();

		// Close dialog
		const closeBtn = dialog.getByRole('button', { name: 'Close', exact: true });
		await closeBtn.click();
		await expect(dialog).not.toBeVisible();
	});

	test('Codec dialogs open and interact cleanly over ExportDialog top layer', async ({ page }) => {
		const exportBtn = page.locator('button.export-button');
		await exportBtn.click();

		const exportDialog = page.locator('.export-dialog');
		await expect(exportDialog).toBeVisible();

		// Open Codecs & Hardware Support from inside ExportDialog
		const diagLink = exportDialog.getByRole('button', {
			name: /Hardware & Codec Support Diagnostics/i
		});
		await diagLink.click();

		const codecDialog = page.locator('.codec-support-dialog');
		await expect(codecDialog).toBeVisible();

		const box = await codecDialog.boundingBox();
		expect(box?.width).toBeGreaterThanOrEqual(520);

		// Click Close on codecDialog
		const closeCodecBtn = codecDialog.getByRole('button', { name: 'Close', exact: true });
		await closeCodecBtn.click();
		await expect(codecDialog).not.toBeVisible();

		// Now open Advanced Codec Pack from inside ExportDialog
		const packLink = exportDialog.getByRole('button', { name: /Advanced Codec Pack/i });
		await packLink.click();

		const packDialog = page.locator('.codec-pack-dialog');
		await expect(packDialog).toBeVisible();

		const packBox = await packDialog.boundingBox();
		expect(packBox?.width).toBeGreaterThanOrEqual(540);

		// Click Close on packDialog
		const closePackBtn = packDialog.getByRole('button', { name: 'Close', exact: true });
		await closePackBtn.click();
		await expect(packDialog).not.toBeVisible();

		// ExportDialog is still open and responsive
		await expect(exportDialog).toBeVisible();
	});

	test('pressing Escape closes the dialog', async ({ page }) => {
		const helpBtn = page.getByRole('button', { name: 'Help' });
		await helpBtn.click();
		const codecSupportItem = page.getByRole('menuitem', { name: 'Codecs & Hardware Support…' });
		await codecSupportItem.click();

		const dialog = page.locator('.codec-support-dialog');
		await expect(dialog).toBeVisible();

		// Press Escape
		await page.keyboard.press('Escape');
		await expect(dialog).not.toBeVisible();
	});
});
