import { expect, test } from '@playwright/test';

test.describe('Effects, Color & Scopes (Gate J)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/editor');
		const manager = page.locator('.project-manager-dialog');
		try {
			await manager.waitFor({ state: 'visible', timeout: 5000 });
			await manager.getByRole('button', { name: 'New project' }).click();
			const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
			await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Gate J Effects');
			await createDialog.getByRole('button', { name: 'Create project' }).click();
			await expect(manager).not.toBeVisible();
		} catch {}
	});

	test('Effects Library displays categories, search, and starter effects', async ({ page }) => {
		// Switch left panel tab to Effects
		const effectsTab = page.locator('#effects-panel-title');
		await expect(effectsTab).toBeVisible();
		await effectsTab.click();

		// Check search input exists
		const searchInput = page.locator('input[placeholder*="Search effects"]');
		await expect(searchInput).toBeVisible();

		// Verify starter effects are present
		await expect(page.locator('.effect-card').filter({ hasText: 'Gaussian Blur' })).toBeVisible();
		await expect(
			page.locator('.effect-card').filter({ hasText: 'Color Correction' })
		).toBeVisible();
		await expect(page.locator('.effect-card').filter({ hasText: 'Vignette' })).toBeVisible();
		await expect(page.locator('.effect-card').filter({ hasText: 'Invert' })).toBeVisible();

		// Filter by category: Blur
		await page.locator('.effects-cat-btn', { hasText: 'Blur' }).click();
		await expect(page.locator('.effect-card').filter({ hasText: 'Gaussian Blur' })).toBeVisible();
		await expect(page.locator('.effect-card').filter({ hasText: 'Invert' })).not.toBeVisible();

		// Search filtering
		await page.locator('.effects-cat-btn', { hasText: 'All' }).click();
		await searchInput.fill('grain');
		await expect(page.locator('.effect-card').filter({ hasText: 'Film Grain' })).toBeVisible();
		await expect(
			page.locator('.effect-card').filter({ hasText: 'Gaussian Blur' })
		).not.toBeVisible();
	});

	test('Color Panel renders Lumetri-style controls (Basic, Curves, Wheels, LUTs)', async ({
		page
	}) => {
		// Add an adjustment clip so a clip is selected for color grading
		await page.getByRole('button', { name: 'Adjustment Layer' }).click();

		// Switch inspector tab to Color
		const colorTab = page.locator('#color-panel-title');
		await expect(colorTab).toBeVisible();
		await colorTab.click();

		// Verify sub-tabs
		await expect(page.locator('.color-tab-btn', { hasText: 'Basic' })).toBeVisible();
		await expect(page.locator('.color-tab-btn', { hasText: 'Curves' })).toBeVisible();
		await expect(page.locator('.color-tab-btn', { hasText: 'Wheels' })).toBeVisible();
		await expect(page.locator('.color-tab-btn', { hasText: 'LUT' })).toBeVisible();

		// Check Basic sliders
		await expect(page.getByText('Exposure')).toBeVisible();
		await expect(page.getByText('Contrast')).toBeVisible();
		await expect(page.getByText('Temperature')).toBeVisible();

		// Switch to Curves subtab
		await page.locator('.color-tab-btn', { hasText: 'Curves' }).click();
		await expect(page.getByText('Click line to add point')).toBeVisible();

		// Switch to Wheels subtab
		await page.locator('.color-tab-btn', { hasText: 'Wheels' }).click();
		await expect(page.locator('.wheel-card')).toHaveCount(3); // Lift, Gamma, Gain

		// Switch to LUT subtab
		await page.locator('.color-tab-btn', { hasText: 'LUT' }).click();
		await expect(page.getByText('Select 3D LUT')).toBeVisible();
	});

	test('Video scopes can be toggled from TransportBar', async ({ page }) => {
		const scopesBtn = page.getByRole('button', { name: 'Toggle scopes' });
		await expect(scopesBtn).toBeVisible();

		// Initially closed
		await expect(page.locator('.scopes-panel')).not.toBeVisible();

		// Click to open
		await scopesBtn.click();
		await expect(page.locator('.scopes-panel')).toBeVisible();

		// Check mode buttons
		await expect(page.locator('.scopes-tab-btn', { hasText: 'Waveform' })).toBeVisible();
		await expect(page.locator('.scopes-tab-btn', { hasText: 'Parade' })).toBeVisible();
		await expect(page.locator('.scopes-tab-btn', { hasText: 'Histogram' })).toBeVisible();
		await expect(page.locator('.scopes-tab-btn', { hasText: 'Vectorscope' })).toBeVisible();

		// Verify scopes canvas exists
		await expect(page.locator('.scopes-canvas')).toBeVisible();

		// Click to close
		await page.getByRole('button', { name: 'Close scopes' }).click();
		await expect(page.locator('.scopes-panel')).not.toBeVisible();
	});

	test('Adds Adjustment Layer and Solid Color to sequence', async ({ page }) => {
		const addAdjBtn = page.getByRole('button', { name: 'Adjustment Layer' });
		await expect(addAdjBtn).toBeVisible();
		await addAdjBtn.click();

		// Clip should appear in timeline
		await expect(page.locator('.timeline-clip')).toHaveCount(1);
		await expect(
			page.locator('.timeline-clip-name', { hasText: 'Adjustment Layer' })
		).toBeVisible();

		// Add solid layer
		const addSolidBtn = page.getByRole('button', { name: 'Solid Layer' });
		await expect(addSolidBtn).toBeVisible();
		await addSolidBtn.click();

		// Now 2 clips in timeline
		await expect(page.locator('.timeline-clip')).toHaveCount(2);
		await expect(page.locator('.timeline-clip-name', { hasText: 'Solid' })).toBeVisible();
	});

	test('Interchange export dialog warns about omitted effects and adjustment layers', async ({
		page
	}) => {
		// Add an adjustment layer
		await page.getByRole('button', { name: 'Adjustment Layer' }).click();

		// Open Export dialog
		await page.getByRole('banner').getByRole('button', { name: 'File' }).click();
		await page
			.getByRole('menu')
			.getByRole('menuitem', { name: /Export/i })
			.click();

		// Select FCPXML format
		const formatSelect = page.locator('select#export-format, select[name="format"]');
		if (await formatSelect.isVisible()) {
			await formatSelect.selectOption({ value: 'fcpxml' });
			// The warning banner should be displayed
			await expect(page.locator('.dialog-warning')).toBeVisible();
			await expect(
				page.locator('.dialog-warning', {
					hasText: /are not included in project files; use Video export to render them/i
				})
			).toBeVisible();
		}
	});
});
