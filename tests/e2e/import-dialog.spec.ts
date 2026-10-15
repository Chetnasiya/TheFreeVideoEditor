import { expect, test } from '@playwright/test';

test.describe('Import Dialog & YouTube Downloader', () => {
	test('opens import modal with 3 options and supports YouTube downloader flow', async ({ page }) => {
		await page.goto('/editor');

		// Open or create a project
		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await manager.getByRole('button', { name: 'New project' }).click();
		const newProjectDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await newProjectDialog.getByRole('textbox', { name: 'Project name' }).fill('Import Dialog Test');
		await newProjectDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(page.getByRole('heading', { name: 'Import Dialog Test' })).toBeVisible();

		// Click the Import button in Media Library toolbar
		const importBtn = page.locator('.media-import-button');
		await expect(importBtn).toBeVisible();
		await importBtn.click();

		// Verify Import Media Dialog opens with same theme
		const importDialog = page.getByRole('dialog', { name: 'Import Media' });
		await expect(importDialog).toBeVisible();
		await expect(importDialog.locator('.dialog-eyebrow')).toHaveText('MEDIA LIBRARY');

		// Verify the 3 options exist
		const computerTab = importDialog.getByRole('tab', { name: 'Computer' });
		const youtubeTab = importDialog.getByRole('tab', { name: 'YouTube' });
		const instaTab = importDialog.getByRole('tab', { name: 'Instagram' });

		await expect(computerTab).toBeVisible();
		await expect(youtubeTab).toBeVisible();
		await expect(instaTab).toBeVisible();

		// Verify Instagram option shows "Coming Soon" badge
		await expect(instaTab.locator('.import-soon-pill')).toHaveText('Soon');

		// Test Instagram tab panel
		await instaTab.click();
		await expect(importDialog.getByText('Instagram Import is Coming Soon')).toBeVisible();

		// Test Computer tab panel
		await computerTab.click();
		await expect(importDialog.getByText('Choose Files from Computer')).toBeVisible();

		// Test YouTube tab panel
		await youtubeTab.click();
		await expect(importDialog.getByRole('heading', { name: 'Download using YouTube Link' })).toBeVisible();

		const urlInput = importDialog.getByLabel('YouTube video URL');
		await expect(urlInput).toBeVisible();

		// Verify Format Options exist
		const videoAudioBtn = importDialog.getByRole('radio', { name: 'Video + Audio' });
		const audioOnlyBtn = importDialog.getByRole('radio', { name: 'Audio Only' });
		const videoOnlyBtn = importDialog.getByRole('radio', { name: 'Video Only' });
		await expect(videoAudioBtn).toBeVisible();
		await expect(audioOnlyBtn).toBeVisible();
		await expect(videoOnlyBtn).toBeVisible();

		// Verify Quality selector exists
		const qualitySelect = importDialog.getByLabel('Video quality');
		await expect(qualitySelect).toBeVisible();
		await qualitySelect.selectOption('720');

		// Switch to Audio Only
		await audioOnlyBtn.click();
		await expect(importDialog.getByLabel('Audio quality')).toBeVisible();

		// Switch back to Video + Audio
		await videoAudioBtn.click();

		// Verify 1-Click Download checkbox
		const backupCheckbox = importDialog.locator('.import-device-backup-checkbox');
		await expect(backupCheckbox).toBeChecked();

		const downloadBtn = importDialog.getByRole('button', { name: /Download & Import/i });
		await expect(downloadBtn).toBeDisabled();

		// Test validation: enter invalid URL
		await urlInput.fill('https://example.com/not-youtube');
		await expect(downloadBtn).toBeEnabled();
		await downloadBtn.click();
		await expect(importDialog.getByText(/Please enter a valid YouTube video link/i)).toBeVisible();

		// Test validation: enter valid YouTube URL
		await urlInput.fill('https://www.youtube.com/watch?v=jNQXAC9IVRw');
		// Details should be fetched or displayed
		await expect(importDialog.getByText(/Me at the zoo/i)).toBeVisible({ timeout: 15_000 });

		// Close dialog with close button
		await importDialog.getByRole('button', { name: 'Close dialog' }).click();
		await expect(importDialog).not.toBeVisible();
	});

	test('downloads YouTube video, triggers 1-click download, and provides library asset download', async ({
		page
	}) => {
		test.setTimeout(60_000);
		await page.goto('/editor');

		// Open or create a project
		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await manager.getByRole('button', { name: 'New project' }).click();
		const newProjectDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await newProjectDialog.getByRole('textbox', { name: 'Project name' }).fill('YouTube DL Project');
		await newProjectDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(page.getByRole('heading', { name: 'YouTube DL Project' })).toBeVisible();

		// Click the Import button
		await page.locator('.media-import-button').click();

		const importDialog = page.getByRole('dialog', { name: 'Import Media' });
		await expect(importDialog).toBeVisible();

		// Go to YouTube tab
		await importDialog.getByRole('tab', { name: 'YouTube' }).click();

		// Fill YouTube link
		const urlInput = importDialog.getByLabel('YouTube video URL');
		await urlInput.fill('https://www.youtube.com/watch?v=jNQXAC9IVRw');

		// Select 360p quality for fastest test download
		await importDialog.getByLabel('Video quality').selectOption('360');

		// Listen for browser download event
		const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });

		// Click 1-Click Download & Import
		const downloadBtn = importDialog.getByRole('button', { name: /Download & Import/i });
		await expect(downloadBtn).toBeEnabled({ timeout: 10_000 });
		await downloadBtn.click();

		// Expect progress indicator
		await expect(importDialog.locator('.import-progress-box')).toBeVisible({ timeout: 5000 });

		// Verify 1-click browser download was triggered
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toContain('Me at the zoo');

		// Dialog should close automatically after successful import
		await expect(importDialog).not.toBeVisible({ timeout: 45_000 });

		// Check that the imported asset appears in the media library
		const assets = page.getByRole('listbox', { name: 'Project media' });
		await expect(assets.getByRole('option')).toHaveCount(1, { timeout: 20_000 });
		await expect(assets.getByRole('option').first()).toContainText('Me at the zoo');

		// Verify the 1-click download button on the asset in Media Library
		const assetOption = assets.getByRole('option').first();
		await assetOption.hover();
		const assetDownloadBtn = assetOption.getByRole('button', { name: /Download .* to computer/i });
		await expect(assetDownloadBtn).toBeVisible();

		// Test clicking 1-click download on the asset
		const assetDownloadPromise = page.waitForEvent('download');
		await assetDownloadBtn.click();
		const assetDownload = await assetDownloadPromise;
		expect(assetDownload.suggestedFilename()).toContain('Me at the zoo');
	});
});
