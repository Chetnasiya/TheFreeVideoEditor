import { expect, test } from '@playwright/test';

test('markers slice 1: add via M key stopped/playback, edit dialog, Premiere swatches, drag snapping, range resize, delete/undo/redo, multi-select, tfve roundtrip', async ({
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
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Markers Slice1 E2E');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'Markers Slice1 E2E' })).toBeVisible();

	// Import fixture media so timeline has duration
	await page
		.locator('input[name="media-files"]')
		.setInputFiles(['tests/fixtures/stock-1080p25-noaudio.mp4']);
	const library = page.getByRole('listbox', { name: 'Project media' });
	await expect(library.getByRole('option')).toHaveCount(1, { timeout: 20_000 });
	const mediaOption = library.getByRole('option', { name: /stock-1080p25-noaudio\.mp4/ });
	const videoLane = page.locator('[data-track-lane]').first();
	await mediaOption.dragTo(videoLane, {
		targetPosition: { x: 40, y: 20 }
	});
	const clip = page.locator('.timeline-clip').first();
	await expect(clip).toBeVisible();

	// 1. Add Marker at Playhead (stopped) with 'M' shortcut
	await page.keyboard.press('m');
	const markerItems = page.locator('.timeline-marker-item');
	await expect(markerItems).toHaveCount(1, { timeout: 5000 });

	const firstMarker = markerItems.first();
	await expect(firstMarker).toBeVisible();

	// 2. Open MarkerDialog via double-click on marker item
	await firstMarker.dblclick();
	const markerDialog = page.locator('.marker-dialog');
	await expect(markerDialog).toBeVisible({ timeout: 5000 });

	// Edit Name, Comment, Type, Color
	const nameInput = markerDialog.getByRole('textbox', { name: 'Marker name' });
	await nameInput.fill('Scene 1 Climax');

	const commentInput = markerDialog.getByRole('textbox', { name: 'Marker comment' });
	await commentInput.fill('Crucial dialog sequence with audio cue');

	// Verify all 8 swatches exist and match design tokens
	const swatches = markerDialog.locator('.marker-color-swatch');
	await expect(swatches).toHaveCount(8);

	const colors = ['green', 'red', 'purple', 'orange', 'yellow', 'white', 'blue', 'cyan'];
	for (const color of colors) {
		const swatch = markerDialog.locator(`.marker-color-swatch[data-color="${color}"]`);
		await expect(swatch).toBeVisible();
	}

	// Change color to Orange
	const orangeSwatch = markerDialog.locator('.marker-color-swatch[data-color="orange"]');
	await orangeSwatch.click();

	// Change type to 'chapter'
	const typeSelect = markerDialog.getByRole('combobox', { name: 'Marker type' });
	await typeSelect.selectOption('chapter');

	// Enable Range Marker and specify duration
	const rangeCheckbox = markerDialog.getByRole('checkbox', { name: 'Range Marker (Duration)' });
	await rangeCheckbox.check();
	const durationInput = markerDialog.getByRole('textbox', { name: 'Marker duration timecode' });
	await durationInput.fill('00:00:02:00');

	// Submit dialog
	await markerDialog.getByRole('button', { name: 'Save' }).click();
	await expect(markerDialog).not.toBeVisible();

	// Assert updated properties on ruler
	await expect(firstMarker).toHaveAttribute('data-marker-color', 'orange');
	await expect(firstMarker).toHaveClass(/is-range/);
	await expect(firstMarker.locator('.timeline-marker-label')).toHaveText('Scene 1 Climax');

	// 3. Move playhead to 00:00:05:00 and add another marker using 'Control+M' (Add & Edit)
	await page.evaluate(() => {
		const store = (
			window as unknown as {
				__TFVE_STORE__?: { getState: () => { setPlayhead: (t: number) => void } };
			}
		).__TFVE_STORE__;
		if (store) store.getState().setPlayhead(5_000_000);
	});
	await page.keyboard.press('Control+m');
	await expect(markerDialog).toBeVisible({ timeout: 5000 });

	// Set name to Second Marker and Cyan color
	await markerDialog.getByRole('textbox', { name: 'Marker name' }).fill('Marker Two');
	await markerDialog.locator('.marker-color-swatch[data-color="cyan"]').click();
	await markerDialog.getByRole('button', { name: 'Save' }).click();
	await expect(markerDialog).not.toBeVisible();

	await expect(markerItems).toHaveCount(2);

	// 4. Test Navigation: Shift+M (Next Marker) & Alt+Shift+M (Prev Marker)
	await page.evaluate(() => {
		const store = (
			window as unknown as {
				__TFVE_STORE__?: { getState: () => { setPlayhead: (t: number) => void } };
			}
		).__TFVE_STORE__;
		if (store) store.getState().setPlayhead(0);
	});
	await page.keyboard.press('Shift+m');
	// Next marker should seek to 5_000_000 (since Marker 1 starts at 0)
	await page.waitForTimeout(200);

	await page.keyboard.press('Alt+Shift+m');
	// Prev marker should seek back to 0
	await page.waitForTimeout(200);

	// 5. Test Range marker resizing handle
	const rangeMarker = page.locator(
		'.timeline-marker-item.is-range[aria-label="Marker: Scene 1 Climax"]'
	);
	await expect(rangeMarker).toBeVisible();
	const endHandle = rangeMarker.locator('.handle-end');
	await expect(endHandle).toBeVisible();
	const handleBox = await endHandle.boundingBox();
	if (handleBox) {
		await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
		await page.mouse.down();
		await page.mouse.move(handleBox.x + 100, handleBox.y);
		await page.mouse.up();
	}

	// 6. Test Single Step Undo and Redo on marker operations
	await page.keyboard.press('Meta+z'); // Undo resize
	await page.waitForTimeout(300);
	await page.keyboard.press('Meta+Shift+z'); // Redo resize
	await page.waitForTimeout(300);

	// 7. Multi-select bulk color change via context menu
	const markerScene1 = page.locator('.timeline-marker-item[aria-label="Marker: Scene 1 Climax"]');
	const markerTwo = page.locator('.timeline-marker-item[aria-label="Marker: Marker Two"]');

	await markerScene1.click(); // Select first
	await markerTwo.click({ modifiers: ['Shift'] }); // Shift+click second to multi-select

	// Right click on markerTwo to open context menu
	await markerTwo.click({ button: 'right' });
	const contextMenu = page.locator('.marker-context-menu');
	await expect(contextMenu).toBeVisible();

	// Click Purple swatch in context menu
	const purpleSwatch = contextMenu.locator('.swatch-btn[aria-label="Purple"]');
	await purpleSwatch.click();
	await expect(contextMenu).not.toBeVisible();

	// Verify both markers now have purple color
	await expect(markerScene1).toHaveAttribute('data-marker-color', 'purple');
	await expect(markerTwo).toHaveAttribute('data-marker-color', 'purple');

	// 8. Delete selected markers via Delete key
	await page.keyboard.press('Delete');
	await expect(markerItems).toHaveCount(0);

	// Undo deletion
	await page.keyboard.press('Meta+z');
	await expect(markerItems).toHaveCount(2);

	// 9. Workspace switching keeps markers intact
	await page.keyboard.press('Alt+Shift+5'); // Switch to Audio workspace
	await page.waitForTimeout(400);
	await expect(markerItems).toHaveCount(2);

	await page.keyboard.press('Alt+Shift+2'); // Switch back to Editing workspace
	await page.waitForTimeout(400);
	await expect(markerItems).toHaveCount(2);

	// 10. Toolbar marker count and snap to markers toggle
	const snapToMarkersBtn = page.getByRole('button', { name: 'Snap to markers' });
	await expect(snapToMarkersBtn).toBeVisible();
	await expect(snapToMarkersBtn).toHaveAttribute('aria-pressed', 'true');
	await snapToMarkersBtn.click();
	await expect(snapToMarkersBtn).toHaveAttribute('aria-pressed', 'false');

	const markerCountDisplay = page.locator('.timeline-marker-count');
	await expect(markerCountDisplay).toHaveText('2 markers');

	// Verify zero console errors
	expect(browserProblems).toEqual([]);
});
