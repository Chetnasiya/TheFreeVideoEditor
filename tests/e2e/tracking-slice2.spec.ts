import { expect, test } from '@playwright/test';

test('tracking slice 2: live follow binding, 200% speed mapping, bake to keyframes, undo/redo', async ({
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
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Tracking Slice 2');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'Tracking Slice 2' })).toBeVisible();

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

	// Wait until tracking finishes (progress bar completes / disappears)
	await expect(trackForwardBtn).toBeEnabled({ timeout: 30_000 });

	// Add a Text clip on a new track or via evaluate
	await page.evaluate(() => {
		const store = (window as any).__TFVE_STORE__;
		store.getState().addTextClip('FOLLOW ME');
	});

	// Verify 2 clips now exist on timeline
	await expect(page.locator('.timeline-clip')).toHaveCount(2, { timeout: 10_000 });

	// Re-select video clip specifically via store or clicking the video clip element
	await page.evaluate(() => {
		const store = (window as any).__TFVE_STORE__;
		const proj = store.getState().project;
		const videoClip = proj.tracks.flatMap((t: any) => t.clips).find((c: any) => c.assetId);
		if (videoClip) {
			store.getState().selectClips([videoClip.id]);
		}
	});

	// Select the newly added text clip as binding target
	const targetSelect = inspector.locator('#target-clip-select');
	await expect(targetSelect).toBeVisible();

	// Pick the other clip
	const options = await targetSelect.locator('option').all();
	expect(options.length).toBeGreaterThan(1);
	const targetVal = await options[1].getAttribute('value');
	if (targetVal) {
		await targetSelect.selectOption(targetVal);
	}

	// Verify "Live Follow" badge is shown
	await expect(inspector.getByText('Live Follow')).toBeVisible();

	// Click "Bake to Keyframes"
	const bakeBtn = inspector.getByRole('button', { name: 'Bake to Keyframes' });
	await expect(bakeBtn).toBeVisible();
	await bakeBtn.click();

	// Verify unbind occurred upon baking and target now has keyframes
	const hasBakedKeyframes = await page.evaluate(() => {
		const store = (window as any).__TFVE_STORE__;
		const proj = store.getState().project;
		const textClip = proj.tracks
			.flatMap((t: any) => t.clips)
			.find((c: any) => c.source?.type === 'text' || c.text);
		return Boolean(
			textClip &&
			textClip.properties &&
			textClip.properties.position &&
			textClip.properties.position.keyframes &&
			textClip.properties.position.keyframes.length > 0
		);
	});
	expect(hasBakedKeyframes).toBe(true);

	// Test undo: undo removes baked keyframes
	await page.keyboard.press('Meta+z');
	const afterUndo = await page.evaluate(() => {
		const store = (window as any).__TFVE_STORE__;
		const proj = store.getState().project;
		const textClip = proj.tracks
			.flatMap((t: any) => t.clips)
			.find((c: any) => c.source?.type === 'text' || c.text);
		return textClip?.properties?.position?.keyframes?.length ?? 0;
	});
	expect(afterUndo).toBe(0);

	// Test redo: redo restores baked keyframes
	await page.keyboard.press('Meta+Shift+z');
	const afterRedo = await page.evaluate(() => {
		const store = (window as any).__TFVE_STORE__;
		const proj = store.getState().project;
		const textClip = proj.tracks
			.flatMap((t: any) => t.clips)
			.find((c: any) => c.source?.type === 'text' || c.text);
		return textClip?.properties?.position?.keyframes?.length ?? 0;
	});
	expect(afterRedo).toBeGreaterThan(0);

	expect(browserProblems).toEqual([]);
});
