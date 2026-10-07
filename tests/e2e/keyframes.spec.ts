import { expect, test } from '@playwright/test';

test('keyframes: inspector controls, stopwatch animation, graph editor, and transform gizmo', async ({
	page
}) => {
	test.setTimeout(90_000);
	const browserProblems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error') {
			browserProblems.push(`error: ${message.text()}`);
		}
	});
	page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));

	await page.goto('/editor');
	await page
		.getByRole('dialog', { name: 'Your Projects' })
		.getByRole('button', { name: 'New project' })
		.click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Keyframe E2E');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'Keyframe E2E' })).toBeVisible();

	// Import fixture media
	await page
		.locator('input[name="media-files"]')
		.setInputFiles(['tests/fixtures/stock-1080p25-noaudio.mp4']);
	const library = page.getByRole('listbox', { name: 'Project media' });
	await expect(library.getByRole('option')).toHaveCount(1, { timeout: 20_000 });
	const mediaOption = library.getByRole('option', { name: /stock-1080p25-noaudio\.mp4/ });

	// Drag to timeline video track
	const videoLane = page.locator('[data-track-lane]').first();
	await mediaOption.dragTo(videoLane, {
		targetPosition: { x: 10, y: 24 }
	});

	// Select the clip in timeline
	const clipElement = page.locator('.timeline-clip').first();
	await expect(clipElement).toBeVisible({ timeout: 10_000 });
	await clipElement.click();

	// Verify Inspector displays clip properties
	const inspector = page.locator('.inspector-panel');
	await expect(inspector).toBeVisible();
	await expect(inspector.getByText('Transform')).toBeVisible();
	await expect(inspector.getByText('Position')).toBeVisible();
	await expect(inspector.getByText('Scale')).toBeVisible();
	await expect(inspector.getByText('Crop')).toBeVisible();

	// Verify Transform Gizmo is rendered on Preview canvas
	const gizmo = page.locator('[data-testid="transform-gizmo"]');
	await expect(gizmo).toBeVisible();

	// Enable animation for Opacity via stopwatch button
	const opacityStopwatch = page.locator('button[aria-label="Enable animation for Opacity"]');
	await expect(opacityStopwatch).toBeVisible();
	await opacityStopwatch.click();

	// Keyframe diamond should appear in Inspector for Opacity
	const opacityDiamond = page.locator('button[aria-label="Remove keyframe"]');
	await expect(opacityDiamond).toBeVisible();

	// Keyframe summary strip should display keyframe diamond in clip
	const summaryStrip = clipElement.locator('.clip-keyframe-summary');
	await expect(summaryStrip).toBeVisible();
	await expect(summaryStrip.locator('.clip-keyframe-diamond')).toHaveCount(1);

	// Seek playhead forward by pressing Shift+ArrowRight
	await page.keyboard.press('Shift+ArrowRight');

	// Change Opacity to 50% -> auto-keys a new keyframe at the new time
	const opacityInput = page.locator('input[aria-label="Opacity"]');
	await opacityInput.fill('50');
	await opacityInput.press('Enter');

	// Summary strip now has 2 keyframe diamonds
	await expect(summaryStrip.locator('.clip-keyframe-diamond')).toHaveCount(2);

	// Test Undo via Edit menu
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await page.getByRole('menuitem', { name: /Undo/ }).click();
	await expect(summaryStrip.locator('.clip-keyframe-diamond')).toHaveCount(1);

	// Test Redo via Edit menu
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await page.getByRole('menuitem', { name: /Redo/ }).click();
	await expect(summaryStrip.locator('.clip-keyframe-diamond')).toHaveCount(2);

	// Select second diamond and apply Easy Ease via F9
	const diamonds = summaryStrip.locator('.clip-keyframe-diamond');
	await diamonds.nth(1).click();
	await expect(diamonds.nth(1)).toHaveClass(/is-selected/);
	await page.keyboard.press('F9');

	// Toggle Timeline keyframe lanes
	const keyframesToolbarBtn = page.getByRole('button', { name: /Keyframes/ });
	await expect(keyframesToolbarBtn).toBeVisible();
	await keyframesToolbarBtn.click();

	// Toggle Graph Editor
	const graphToolbarBtn = page.getByRole('button', { name: 'Graph', exact: true });
	await expect(graphToolbarBtn).toBeVisible();
	await graphToolbarBtn.click();

	// Verify Graph Editor panel is open
	const graphEditor = page.locator('.graph-editor-panel');
	await expect(graphEditor).toBeVisible();
	await expect(graphEditor.getByText('Linear')).toBeVisible();

	// Close Graph Editor via close button
	await page.getByRole('button', { name: 'Close Graph Editor' }).click();
	await expect(page.locator('.graph-editor-panel')).toHaveCount(0);

	// Verify no console errors
	expect(browserProblems).toEqual([]);
});
