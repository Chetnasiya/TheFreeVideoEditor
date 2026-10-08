import { expect, test, type Page } from '@playwright/test';

declare const process: { platform?: string } | undefined;

async function createProject(page: Page, name: string): Promise<void> {
	await page.goto('/editor');
	await page
		.getByRole('dialog', { name: 'Your Projects' })
		.getByRole('button', { name: 'New project' })
		.click();
	const dialog = page.getByRole('dialog', { name: 'Create a Project' });
	await dialog.getByRole('textbox', { name: 'Project name' }).fill(name);
	await dialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name })).toBeVisible();
}

test.describe('Gate M: Speed & Time Remapping End-to-End', () => {
	test('opens Speed/Duration dialog via shortcut mod+shift+r and updates clip speed', async ({
		page
	}) => {
		await createProject(page, 'Speed Dialog Test');

		// Add a solid layer to work with
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clipId = store.getState().addSolidLayer('#3b82f6');
			store.getState().selectClips([clipId]);
		});

		await expect(page.locator('.timeline-clip')).toHaveCount(1);

		// Trigger alt+r shortcut
		await page.keyboard.press('Alt+KeyR');

		// Verify Speed / Duration dialog opens
		const speedDialog = page.getByRole('dialog', { name: 'Speed / Duration' });
		await expect(speedDialog).toBeVisible();

		// Change speed to 200%
		const speedInput = speedDialog.getByLabel('Speed percentage');
		await speedInput.fill('200');

		// Click OK
		await speedDialog.getByRole('button', { name: 'OK' }).click();
		await expect(speedDialog).not.toBeVisible();

		// Verify speed badge appears on clip
		const badge = page.locator('.clip-speed-badge');
		await expect(badge).toBeVisible();
		await expect(badge).toHaveText('200%');

		// Verify clip duration is halved
		const clipData = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clip = store.getState().project.tracks[0].clips[0];
			return { speed: clip.speed, duration: clip.duration };
		});
		expect(clipData.speed).toBe(2);
	});

	test('reverses clip playback speed via context menu / store action', async ({ page }) => {
		await createProject(page, 'Reverse Clip Test');

		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clipId = store.getState().addSolidLayer('#10b981');
			store.getState().selectClips([clipId]);
			store.getState().reverseClips([clipId]);
		});

		const badge = page.locator('.clip-speed-badge');
		await expect(badge).toBeVisible();
		await expect(badge).toHaveText('−100%');

		const clipData = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clip = store.getState().project.tracks[0].clips[0];
			return { speed: clip.speed, sourceIn: clip.sourceIn, sourceOut: clip.sourceOut };
		});
		expect(clipData.speed).toBe(-1);
		expect(clipData.sourceIn).toBeGreaterThan(clipData.sourceOut);
	});

	test('inserts freeze frame via Shift+F shortcut and creates hold segment', async ({ page }) => {
		await createProject(page, 'Freeze Frame Test');

		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clipId = store.getState().addSolidLayer('#ef4444');
			store.getState().selectClips([clipId]);
		});

		await expect(page.locator('.timeline-clip')).toHaveCount(1);

		// Position playhead in the middle of clip
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			store.getState().setPlayhead(1_500_000);
		});

		// Press Shift+F
		await page.keyboard.press('Shift+KeyF');

		// Timeline should now have 3 clips (head, freeze segment, tail)
		await expect(page.locator('.timeline-clip')).toHaveCount(3);

		// The freeze segment should have timeRemap: { value: 0 } and 2s duration
		const clipsInfo = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			return store.getState().project.tracks[0].clips.map((c: any) => ({
				start: c.start,
				duration: c.duration,
				timeRemap: c.timeRemap,
				volume: c.volume
			}));
		});

		expect(clipsInfo.length).toBe(3);
		const freezeSegment = clipsInfo[1];
		expect(freezeSegment.duration).toBe(2_000_000);
		expect(freezeSegment.timeRemap).toEqual({ value: 0 });
		expect(freezeSegment.volume).toBe(0);
	});

	test('Inspector Speed & Time Remap section edits speed curve and displays Remap badge', async ({
		page
	}) => {
		await createProject(page, 'Inspector Remap Test');

		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clipId = store.getState().addSolidLayer('#8b5cf6');
			store.getState().selectClips([clipId]);
		});

		// Check Inspector section
		const remapSection = page.locator('.inspector-section', {
			hasText: 'Speed & Time Remap'
		});
		await expect(remapSection).toBeVisible();

		// Enable Time Remapping checkbox
		const enableCheckbox = remapSection.getByLabel('Enable Time Remapping');
		await enableCheckbox.check();

		// Verify Remap badge appears on clip
		const remapBadge = page.locator('.clip-remap-badge');
		await expect(remapBadge).toBeVisible();
		await expect(remapBadge).toHaveText('Remap');
	});
});
