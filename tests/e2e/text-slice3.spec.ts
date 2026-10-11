import { expect, test } from '@playwright/test';

test.describe('Gate O: Inline Editing, Gizmo & Shortcuts (Slice 3)', () => {
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
			await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Gate O Slice 3 E2E');
			await createDialog.getByRole('button', { name: 'Create project' }).click();
			await expect(manager).not.toBeVisible();
		} catch {}
	});

	test('creates text clip via keyboard shortcut "t"', async ({ page }) => {
		// Timeline ruler or background click to ensure focus is on editor and not in an input
		await page.locator('.timeline-ruler').click();

		// Press shortcut 't' to add text clip
		await page.keyboard.press('t');

		const textClip = page.locator('.timeline-clip.is-text').first();
		await expect(textClip).toBeVisible();
		await expect(textClip).toContainText('T Title Text');
	});

	test('edits text via on-canvas double click inline editor and commits', async ({ page }) => {
		// Add Text Clip
		const addTextBtn = page.getByRole('button', { name: '+ Text' });
		await expect(addTextBtn).toBeVisible();
		await addTextBtn.click();

		const textClip = page.locator('.timeline-clip.is-text').first();
		await expect(textClip).toBeVisible();

		// Verify Transform Gizmo appears for selected text clip
		const gizmo = page.locator('[data-testid="transform-gizmo"]');
		await expect(gizmo).toBeVisible();

		// Double click gizmo to trigger inline editor
		await gizmo.dblclick();

		// Inline editor textarea should appear
		const inlineInput = page.getByRole('textbox', { name: 'Edit text on canvas' });
		await expect(inlineInput).toBeVisible();
		await expect(inlineInput).toHaveValue('Title Text');

		// Type new content and press Enter with Cmd/Ctrl to commit
		await inlineInput.fill('Updated In Place');
		await page.keyboard.press('ControlOrMeta+Enter');

		// Inline editor closes
		await expect(inlineInput).not.toBeVisible();

		// Content is committed to clip and inspector
		await expect(textClip).toContainText('T Updated In Place');
		const contentInput = page.locator('#text-content-input');
		await expect(contentInput).toHaveValue('Updated In Place');
	});
});
