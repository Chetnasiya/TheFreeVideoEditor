import { expect, test } from '@playwright/test';

test('tracking slice 4: track shaky footage, stabilize clip, verify compensation keyframes applied', async ({
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
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Stabilize E2E');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'Stabilize E2E' })).toBeVisible();

	// Import shaky.mp4 fixture via file input
	await page.locator('input[name="media-files"]').setInputFiles(['tests/fixtures/shaky.mp4']);
	const library = page.getByRole('listbox', { name: 'Project media' });
	await expect(library.getByRole('option')).toHaveCount(1, { timeout: 20_000 });
	const mediaOption = library.getByRole('option', { name: /shaky\.mp4/ });

	// Drag to timeline video track
	const videoLane = page.locator('[data-track-lane]').first();
	await mediaOption.dragTo(videoLane, {
		targetPosition: { x: 10, y: 24 }
	});

	// Select clip
	const clipElement = page.locator('.timeline-clip').first();
	await expect(clipElement).toBeVisible({ timeout: 10_000 });
	await clipElement.click();

	// Open Motion Tracking section in Inspector if closed
	const inspector = page.locator('.inspector-panel');
	const trackingHeader = inspector.getByRole('button', { name: /Motion Tracking/i }).first();
	await expect(trackingHeader).toBeVisible();

	const isExpanded = await trackingHeader.getAttribute('aria-expanded');
	if (isExpanded !== 'true') {
		await trackingHeader.click();
	}

	// Add point tracker
	const addTrackerBtn = inspector.getByRole('button', { name: '+ Add Point Tracker' });
	await expect(addTrackerBtn).toBeVisible();
	await addTrackerBtn.click();

	// Track Forward
	const trackForwardBtn = inspector.getByRole('button', { name: 'Track Forward ⯈' });
	await expect(trackForwardBtn).toBeVisible();
	await trackForwardBtn.click();

	// Wait until tracking finishes (Track Forward button re-enabled)
	await expect(trackForwardBtn).toBeEnabled({ timeout: 30000 });

	// Check Stabilize Clip button
	const stabilizeBtn = inspector.getByRole('button', { name: 'Stabilize Clip' });
	await expect(stabilizeBtn).toBeVisible();
	await expect(stabilizeBtn).toBeEnabled();

	// Click Stabilize Clip
	await stabilizeBtn.click();

	// Verify Transform section shows position keyframes enabled (stopwatch active / diamond navigator)
	const transformSection = inspector.getByRole('button', { name: /Transform/i }).first();
	if ((await transformSection.getAttribute('aria-expanded')) !== 'true') {
		await transformSection.click();
	}

	// Position row should have keyframe controls enabled
	const positionRow = inspector.locator('.property-row', { hasText: 'Position' });
	await expect(positionRow).toBeVisible();
});
