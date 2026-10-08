import { expect, test } from '@playwright/test';

test.describe('Gate O: Text Presets & Animations (Slice 2)', () => {
	test.beforeEach(async ({ page }) => {
		const browserProblems: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error' || message.type() === 'warning') {
				browserProblems.push(`${message.type()}: ${message.text()}`);
			}
		});
		page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));

		await page.goto('/editor');
		const manager = page.locator('.project-manager-dialog');
		try {
			await manager.waitFor({ state: 'visible', timeout: 5000 });
			await manager.getByRole('button', { name: 'New project' }).click();
			const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
			await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Gate O Presets E2E');
			await createDialog.getByRole('button', { name: 'Create project' }).click();
			await expect(manager).not.toBeVisible();
		} catch {}
	});

	test('applies template presets to text clip in inspector', async ({ page }) => {
		// 1. Add Text Clip from timeline toolbar
		const addTextBtn = page.getByRole('button', { name: '+ Text' });
		await expect(addTextBtn).toBeVisible();
		await addTextBtn.click();

		const textClip = page.locator('.timeline-clip.is-text').first();
		await expect(textClip).toBeVisible();

		// 2. Select Template: Subtitle
		const templateSelect = page.getByLabel('Apply text template preset');
		await expect(templateSelect).toBeVisible();
		await templateSelect.selectOption('subtitle');

		// Verify font family updated to Inter
		await expect(page.getByRole('button', { name: 'Select font family' })).toContainText('Inter');

		// 3. Select Template: Bold Outline
		await templateSelect.selectOption('bold-outline');
		await expect(page.getByRole('button', { name: 'Select font family' })).toContainText(
			'Bebas Neue'
		);
	});

	test('applies typewriter animation and clears animations', async ({ page }) => {
		// 1. Add Text Clip
		const addTextBtn = page.getByRole('button', { name: '+ Text' });
		await expect(addTextBtn).toBeVisible();
		await addTextBtn.click();

		const textClip = page.locator('.timeline-clip.is-text').first();
		await expect(textClip).toBeVisible();

		// 2. Select Animation: Typewriter
		const animationSelect = page.getByLabel('Apply text animation preset');
		await expect(animationSelect).toBeVisible();
		await animationSelect.selectOption('typewriter');

		// 3. Click Clear button to remove animations
		const clearBtn = page.getByRole('button', { name: 'Clear' });
		await expect(clearBtn).toBeVisible();
		await clearBtn.click();
	});
});

