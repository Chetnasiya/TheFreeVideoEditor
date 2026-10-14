import { expect, test } from '@playwright/test';

test.describe('Gate O: Text System (Slice 1)', () => {
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
			await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Gate O Text E2E');
			await createDialog.getByRole('button', { name: 'Create project' }).click();
			await expect(manager).not.toBeVisible();
		} catch {}
	});

	test('creates text clip from toolbar, edits content and styling, verifies undo/redo', async ({
		page
	}) => {
		// 1. Add Text Clip from timeline toolbar
		const addTextBtn = page.getByRole('button', { name: 'Text Layer' });
		await expect(addTextBtn).toBeVisible();
		await addTextBtn.click();

		// Verify clip appears in timeline
		const textClip = page.locator('.timeline-clip.is-text').first();
		await expect(textClip).toBeVisible();
		await expect(textClip).toContainText('T Title Text');

		// 2. Verify Inspector shows Text section
		const contentInput = page.locator('#text-content-input');
		await expect(contentInput).toBeVisible();
		await expect(contentInput).toHaveValue('Title Text');

		// 3. Edit text content with multi-line and emojis
		const multilineEmojiText = 'Hello World\nLine 2 🎬✨';
		await contentInput.fill(multilineEmojiText);
		await expect(contentInput).toHaveValue(multilineEmojiText);
		await expect(textClip).toContainText('T Hello World');

		// 4. Test Undo / Redo of text edits
		await page.keyboard.press('ControlOrMeta+z');
		await expect(contentInput).toHaveValue('Title Text');

		await page.keyboard.press('ControlOrMeta+Shift+z');
		await expect(contentInput).toHaveValue(multilineEmojiText);

		// 5. Change Text Alignment
		const leftAlignBtn = page.getByRole('button', { name: 'left' });
		const rightAlignBtn = page.getByRole('button', { name: 'right' });
		await expect(leftAlignBtn).toBeVisible();
		await rightAlignBtn.click();
		// 6. Split text clip at playhead and assert continuity
		const clipPosition = await textClip.evaluate((element) => {
			const style = (element as HTMLElement).style;
			return {
				left: Number.parseFloat(style.left),
				width: Number.parseFloat(style.width)
			};
		});
		await page
			.getByRole('slider', { name: 'Timeline playhead' })
			.click({ position: { x: clipPosition.left + clipPosition.width / 2, y: 12 } });
		await textClip.click();
		await page.keyboard.press('s'); // Split selected clip at playhead
		const clipsAfterSplit = page.locator('.timeline-clip.is-text');
		await expect(clipsAfterSplit).toHaveCount(2);

		// Assert both clips maintain text type
		await expect(clipsAfterSplit.nth(0)).toBeVisible();
		await expect(clipsAfterSplit.nth(1)).toBeVisible();
	});

	test('creates text clip from Edit menu', async ({ page }) => {
		// Open Edit menu using exact button match
		const editMenu = page.getByRole('button', { name: 'Edit', exact: true });
		await expect(editMenu).toBeVisible();
		await editMenu.click();

		// Click "New Text Clip"
		const newTextItem = page.getByRole('menuitem', { name: /Text/ });
		await expect(newTextItem).toBeVisible();
		await newTextItem.click();

		const textClip = page.locator('.timeline-clip.is-text').first();
		await expect(textClip).toBeVisible();
		await expect(textClip).toContainText('T Title Text');
	});

	test('provides custom font upload option and padding controls', async ({ page }) => {
		const addTextBtn = page.getByRole('button', { name: 'Text Layer' });
		await expect(addTextBtn).toBeVisible();
		await addTextBtn.click();

		// Open Font picker dropdown
		const fontPickerBtn = page.locator('.font-picker-btn');
		await expect(fontPickerBtn).toBeVisible();
		await fontPickerBtn.click();

		// Verify custom font upload button is present
		const uploadFontBtn = page.getByRole('button', { name: /Add Custom Font/i });
		await expect(uploadFontBtn).toBeVisible();

		// Close dropdown
		await fontPickerBtn.click();

		// Verify Padding X and Padding Y controls are visible and functional
		const paddingXInput = page.getByRole('spinbutton', { name: 'Text Horizontal Padding Input' });
		const paddingYInput = page.getByRole('spinbutton', { name: 'Text Vertical Padding Input' });
		await expect(paddingXInput).toBeVisible();
		await expect(paddingYInput).toBeVisible();

		// Change padding
		await paddingXInput.fill('45');
		await paddingYInput.fill('35');
		await expect(paddingXInput).toHaveValue('45');
		await expect(paddingYInput).toHaveValue('35');
	});
});
