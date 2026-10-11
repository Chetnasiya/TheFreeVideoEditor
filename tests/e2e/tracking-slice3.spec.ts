import { expect, test } from '@playwright/test';

test('tracking slice 3: add mask, track clip, track mask shape, verify keyframes created', async ({
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
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Mask Tracking E2E');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'Mask Tracking E2E' })).toBeVisible();

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

	// Open Motion Tracking section in Inspector & Add Point Tracker
	const inspector = page.locator('.inspector-panel');
	await expect(inspector).toBeVisible();
	const addBtn = inspector.getByRole('button', { name: '+ Add Point Tracker' });
	await expect(addBtn).toBeVisible();
	await addBtn.click();

	// Track forward to generate samples
	const trackForwardBtn = inspector.getByRole('button', { name: /Track Forward/i });
	await expect(trackForwardBtn).toBeVisible();
	await trackForwardBtn.click();

	// Wait until tracking finishes
	await expect(trackForwardBtn).toBeEnabled({ timeout: 30_000 });

	// Open Masks Section in Inspector if not already expanded
	const masksHeader = inspector.getByRole('button', { name: /Masks/i }).first();
	await expect(masksHeader).toBeVisible();
	const isExpanded = await masksHeader.getAttribute('aria-expanded');
	if (isExpanded !== 'true') {
		await masksHeader.click();
	}

	// Add Rectangle Mask
	const addRectMaskBtn = inspector.getByRole('button', { name: 'Add rectangle mask' });
	await expect(addRectMaskBtn).toBeVisible();
	await addRectMaskBtn.click();

	// Verify mask appears in Masks section
	await expect(inspector.getByText('Rect Mask').first()).toBeVisible();

	// Select tracker from "Track with..." dropdown in Mask Shape row
	const trackMaskSelect = inspector.getByRole('combobox', { name: 'Track mask to motion tracker' });
	await expect(trackMaskSelect).toBeVisible();

	// Select the first tracker option
	const trackerOptions = await trackMaskSelect.locator('option').all();
	expect(trackerOptions.length).toBeGreaterThan(1);
	const trackerVal = await trackerOptions[1].getAttribute('value');
	if (trackerVal) {
		await trackMaskSelect.selectOption(trackerVal);
	}

	// Verify shape keyframes were generated on the clip
	const hasMaskKeyframes = await page.evaluate(() => {
		const store = (window as any).__TFVE_STORE__;
		const proj = store.getState().project;
		const videoClip = proj.tracks.flatMap((t: any) => t.clips).find((c: any) => c.assetId);
		if (!videoClip || !videoClip.properties) return false;
		// Find any property starting with mask: and ending in :shape
		const keys = Object.keys(videoClip.properties);
		const shapeKey = keys.find((k) => k.startsWith('mask:') && k.endsWith(':shape'));
		if (!shapeKey) return false;
		const prop = videoClip.properties[shapeKey];
		return prop && prop.keyframes && prop.keyframes.length > 0;
	});

	expect(hasMaskKeyframes).toBe(true);

	// Test Undo: removes baked mask shape keyframes
	await page.keyboard.press('Meta+z');
	const afterUndo = await page.evaluate(() => {
		const store = (window as any).__TFVE_STORE__;
		const proj = store.getState().project;
		const videoClip = proj.tracks.flatMap((t: any) => t.clips).find((c: any) => c.assetId);
		if (!videoClip || !videoClip.properties) return 0;
		const keys = Object.keys(videoClip.properties);
		const shapeKey = keys.find((k) => k.startsWith('mask:') && k.endsWith(':shape'));
		if (!shapeKey) return 0;
		return videoClip.properties[shapeKey]?.keyframes?.length ?? 0;
	});
	expect(afterUndo).toBe(0);

	expect(browserProblems).toEqual([]);
});
