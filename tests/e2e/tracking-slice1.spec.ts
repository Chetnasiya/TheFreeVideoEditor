import { expect, test } from '@playwright/test';

test('tracking slice 1: add point tracker on track-target.mp4, move search/feature boxes, track forward, see trail', async ({
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
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Tracking E2E');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'Tracking E2E' })).toBeVisible();

	// Import track-target.mp4 fixture
	await page
		.locator('input[name="media-files"]')
		.setInputFiles(['tests/fixtures/track-target.mp4']);
	const library = page.getByRole('listbox', { name: 'Project media' });
	await expect(library.getByRole('option')).toHaveCount(1, { timeout: 20_000 });
	const mediaOption = library.getByRole('option', { name: /track-target\.mp4/ });

	// Drag to timeline video track
	const videoLane = page.locator('[data-track-lane]').first();
	await mediaOption.dragTo(videoLane, {
		targetPosition: { x: 10, y: 24 }
	});

	// Select clip
	const clipElement = page.locator('.timeline-clip').first();
	await expect(clipElement).toBeVisible({ timeout: 10_000 });
	await clipElement.click();

	// Open Motion Tracking section in Inspector
	const inspector = page.locator('.inspector-panel');
	await expect(inspector).toBeVisible();
	const trackingSectionHeader = inspector.getByRole('button', { name: /Motion Tracking/i });
	await expect(trackingSectionHeader).toBeVisible();

	// Add Point Tracker
	const addBtn = inspector.getByRole('button', { name: '+ Add Point Tracker' });
	await expect(addBtn).toBeVisible();
	await addBtn.click();

	// Verify Tracker box appears in Preview overlay
	const overlay = page.locator('[data-testid="tracking-overlay"]');
	await expect(overlay).toBeVisible();

	const featureBox = page.locator('[data-testid="tracker-feature-box"]');
	await expect(featureBox).toBeVisible();

	const searchBox = page.locator('[data-testid="tracker-search-box"]');
	await expect(searchBox).toBeVisible();

	// Drag feature box with mouse to reposition
	const boxBox = await featureBox.boundingBox();
	expect(boxBox).not.toBeNull();
	if (boxBox) {
		await page.mouse.move(boxBox.x + boxBox.width / 2, boxBox.y + boxBox.height / 2);
		await page.mouse.down();
		await page.mouse.move(boxBox.x + boxBox.width / 2 + 30, boxBox.y + boxBox.height / 2 + 20);
		await page.mouse.up();
	}

	// Click Track Forward
	const trackFwdBtn = inspector.getByRole('button', { name: /Track Forward/i });
	await expect(trackFwdBtn).toBeVisible();
	await trackFwdBtn.click();

	// Progress bar should appear then complete
	await expect(inspector.getByText(/Tracking frame/i)).toBeVisible({ timeout: 5_000 });
	await expect(inspector.getByText(/Tracking frame/i)).toBeHidden({ timeout: 45_000 });

	// Assert tracking trail line rendered in overlay
	const trailPolyline = overlay.locator('polyline');
	await expect(trailPolyline).toBeVisible();

	// Assert no console errors occurred
	expect(browserProblems).toEqual([]);
});
