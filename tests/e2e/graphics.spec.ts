import { expect, test } from '@playwright/test';

test.describe('Editable Motion Graphics & Kinetic Typography Tab', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/editor');
		const manager = page.locator('.project-manager-dialog');
		try {
			await manager.waitFor({ state: 'visible', timeout: 5000 });
			await manager.getByRole('button', { name: 'New project' }).click();
			const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
			await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Graphics Test');
			await createDialog.getByRole('button', { name: 'Create project' }).click();
			await expect(manager).not.toBeVisible();
		} catch {}
	});

	test('Graphics tab is located beside Captions in the left sidebar and displays template library', async ({
		page
	}) => {
		// Verify Graphics panel tab exists beside Captions
		const graphicsTab = page.locator('#graphics-panel-title');
		await expect(graphicsTab).toBeVisible();
		await expect(graphicsTab).toHaveText('Graphics');

		// Open Graphics panel
		await graphicsTab.click();

		// Verify panel title and view tabs
		const templatesSubtab = page.getByTestId('tab-graphic-templates');
		const editorSubtab = page.getByTestId('tab-graphic-editor');
		await expect(templatesSubtab).toBeVisible();
		await expect(editorSubtab).toBeVisible();

		// Check search input and category pills
		const searchInput = page.locator('input.graphics-search-input');
		await expect(searchInput).toBeVisible();

		await expect(page.locator('.graphics-cat-btn', { hasText: 'All' })).toBeVisible();
		await expect(page.locator('.graphics-cat-btn', { hasText: 'Kinetic' })).toBeVisible();
		await expect(page.locator('.graphics-cat-btn', { hasText: 'Neon' })).toBeVisible();
		await expect(page.locator('.graphics-cat-btn', { hasText: 'Badges' })).toBeVisible();

		// Check curated templates are rendered
		await expect(page.getByTestId('graphic-card-dream-big')).toBeVisible();
		await expect(page.getByTestId('graphic-card-ae-motion-title')).toBeVisible();

		// Filter by Neon category
		await page.locator('.graphics-cat-btn', { hasText: 'Neon' }).click();
		await expect(page.getByTestId('graphic-card-ae-motion-title')).toBeVisible();
		await expect(page.getByTestId('graphic-card-dream-big')).not.toBeVisible();

		// Clear category filter and search
		await page.locator('.graphics-cat-btn', { hasText: 'All' }).click();
		await searchInput.fill('Dream Big');
		await expect(page.getByTestId('graphic-card-dream-big')).toBeVisible();
		await expect(page.getByTestId('graphic-card-ae-motion-title')).not.toBeVisible();
	});

	test('Adds graphic template to timeline and allows editing headline and subtitle lines', async ({
		page
	}) => {
		const graphicsTab = page.locator('#graphics-panel-title');
		await graphicsTab.click();

		// Click + Add on Dream Big template
		const dreamBigCard = page.getByTestId('graphic-card-dream-big');
		await expect(dreamBigCard).toBeVisible();
		const addBtn = dreamBigCard.locator('button.graphic-add-btn');
		await addBtn.click();

		// Panel should switch to editor tab with selected graphic
		const editorSubtab = page.getByTestId('tab-graphic-editor');
		await expect(editorSubtab).toHaveAttribute('aria-selected', 'true');

		// Verify Headline input contains primary line
		const headlineInput = page.locator('input.graphics-text-input').first();
		await expect(headlineInput).toBeVisible();
		await expect(headlineInput).toHaveValue('DREAM BIG');

		// Edit headline text
		await headlineInput.fill('UNSTOPPABLE');

		// Verify clip text in store / timeline
		const textClip = page.locator('.timeline-clip.is-text').first();
		await expect(textClip).toBeVisible();

		// Verify the textarea has updated full text
		const fullTextarea = page.locator('textarea.graphics-textarea');
		await expect(fullTextarea).toHaveValue(/UNSTOPPABLE/);
	});

	test('Graphics workspace preset prominently displays Graphics panel active beside Captions', async ({
		page
	}) => {
		// Click Graphics workspace button on the top bar
		const wsGraphicsBtn = page.locator('.workspace-tab', { hasText: 'Graphics' });
		await wsGraphicsBtn.click();

		// Verify Graphics panel tab is active and visible
		const graphicsTab = page.locator('#graphics-panel-title');
		await expect(graphicsTab).toBeVisible();
		await expect(graphicsTab).toHaveAttribute('aria-selected', 'true');

		// Verify Captions tab is right beside it
		const captionsTab = page.locator('#captions-panel-title');
		await expect(captionsTab).toBeVisible();

		// Verify graphic templates grid is visible directly
		await expect(page.getByTestId('graphic-card-dream-big')).toBeVisible();
	});

	test('Undo and Redo work reliably on text edits, colors, and keyboard shortcuts in Graphics panel', async ({
		page
	}) => {
		const graphicsTab = page.locator('#graphics-panel-title');
		await graphicsTab.click();

		// Add Dream Big template
		const dreamBigCard = page.getByTestId('graphic-card-dream-big');
		await expect(dreamBigCard).toBeVisible();
		await dreamBigCard.locator('button.graphic-add-btn').click();

		// Verify in Quick Editor
		const headlineInput = page.locator('input.graphics-text-input').first();
		await expect(headlineInput).toHaveValue('DREAM BIG');

		const headerUndoBtn = page.getByTestId('graphics-header-undo-btn');
		const headerRedoBtn = page.getByTestId('graphics-header-redo-btn');
		await expect(headerUndoBtn).toBeEnabled();
		await expect(headerRedoBtn).toBeDisabled();

		// Edit headline text
		await headlineInput.fill('CUSTOM TITLE');
		await expect(headlineInput).toHaveValue('CUSTOM TITLE');

		// Click Undo button in header
		await headerUndoBtn.click();
		await expect(headlineInput).toHaveValue('DREAM BIG');
		await expect(headerRedoBtn).toBeEnabled();

		// Click Redo button in header
		await headerRedoBtn.click();
		await expect(headlineInput).toHaveValue('CUSTOM TITLE');

		// Test keyboard shortcut Mod+Z while focused inside headline input
		await headlineInput.focus();
		const isMac = process.platform === 'darwin';
		const mod = isMac ? 'Meta' : 'Control';
		await page.keyboard.press(`${mod}+z`);
		await expect(headlineInput).toHaveValue('DREAM BIG');

		// Test keyboard shortcut Redo (Mod+Shift+z)
		await page.keyboard.press(`${mod}+Shift+z`);
		await expect(headlineInput).toHaveValue('CUSTOM TITLE');

		// Test Color changes and Undo/Redo
		const hexInput = page.locator('.color-hex-input').first();
		const originalHex = await hexInput.inputValue();
		await hexInput.fill('FF0055');
		await hexInput.blur();
		await expect(hexInput).toHaveValue(/ff0055/i);

		// Undo color change
		await headerUndoBtn.click();
		await expect(hexInput).toHaveValue(new RegExp(originalHex, 'i'));

		// Redo color change
		await headerRedoBtn.click();
		await expect(hexInput).toHaveValue(/ff0055/i);
	});

	test('Undo and Redo work reliably on template switch, animation preset, and clip deletion', async ({
		page
	}) => {
		const graphicsTab = page.locator('#graphics-panel-title');
		await graphicsTab.click();

		const dreamBigCard = page.getByTestId('graphic-card-dream-big');
		await dreamBigCard.locator('button.graphic-add-btn').click();

		const headerUndoBtn = page.getByTestId('graphics-header-undo-btn');
		const headerRedoBtn = page.getByTestId('graphics-header-redo-btn');

		// Check template select
		const templateSelect = page.locator('select.graphics-select').first();
		await expect(templateSelect).toHaveValue('dream-big');

		// Switch template to ae-motion-title
		await templateSelect.selectOption('ae-motion-title');
		await expect(templateSelect).toHaveValue('ae-motion-title');

		// Undo template change
		await headerUndoBtn.click();
		await expect(templateSelect).toHaveValue('dream-big');

		// Redo template change
		await headerRedoBtn.click();
		await expect(templateSelect).toHaveValue('ae-motion-title');

		// Check animation select dropdown
		const animSelect = page.locator('select.graphics-select').nth(1);
		await expect(animSelect).toHaveValue('glitch-snap');

		// Change animation preset
		await animSelect.selectOption('bounce-in');
		await expect(animSelect).toHaveValue('bounce-in');

		// Undo animation preset
		await headerUndoBtn.click();
		await expect(animSelect).toHaveValue('glitch-snap');

		// Redo animation preset
		await headerRedoBtn.click();
		await expect(animSelect).toHaveValue('bounce-in');

		// Undo all the way back past clip creation
		await headerUndoBtn.click(); // Undoes animation
		await headerUndoBtn.click(); // Undoes template change
		await headerUndoBtn.click(); // Undoes add clip

		// Clip should be gone and empty state visible with Redo button
		const emptyRedoBtn = page.getByTestId('graphics-empty-redo-btn');
		await expect(emptyRedoBtn).toBeVisible();

		// Click Redo on empty state to restore clip
		await emptyRedoBtn.click();

		// Quick editor view should be restored with the clip selected
		const headlineInput = page.locator('input.graphics-text-input').first();
		await expect(headlineInput).toBeVisible();
		await expect(headlineInput).toHaveValue('DREAM BIG');
	});
});

