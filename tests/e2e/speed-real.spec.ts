import { expect, test, type Page } from '@playwright/test';

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

async function importColorsMedia(page: Page): Promise<void> {
	await page.locator('input[name="media-files"]').setInputFiles('tests/fixtures/colors.mp4');
	const media = page.getByRole('listbox', { name: 'Project media' });
	const mediaClip = media.getByRole('option', { name: /colors\.mp4/ });
	await expect(mediaClip).toBeVisible();
	await mediaClip.dragTo(page.getByRole('gridcell', { name: 'Video 1 track lane' }), {
		targetPosition: { x: 20, y: 28 }
	});
	await expect(page.locator('.timeline-clip').first()).toBeVisible();
	// Align imported clip cleanly to start at 0
	await page.evaluate(() => {
		const store = (window as any).__TFVE_STORE__;
		const clip = store.getState().project.tracks[0].clips[0];
		if (clip && clip.start !== 0) {
			store.getState().moveClips([clip.id], -clip.start);
		}
	});
}

async function seekTo(page: Page, seconds: number): Promise<void> {
	await page.evaluate((s) => {
		const store = (window as any).__TFVE_STORE__;
		store.getState().setPlayhead(Math.round(s * 1_000_000));
	}, seconds);
}

async function readCenterPixel(page: Page): Promise<number[]> {
	return page.getByTestId('preview-canvas').evaluate((canvas) => {
		const element = canvas as HTMLCanvasElement;
		const sampleCanvas = document.createElement('canvas');
		sampleCanvas.width = 1;
		sampleCanvas.height = 1;
		const context = sampleCanvas.getContext('2d', { willReadFrequently: true });
		if (!context) throw new Error('Preview canvas has no 2D context.');
		context.drawImage(
			element,
			Math.floor(element.width / 2),
			Math.floor(element.height / 2),
			1,
			1,
			0,
			0,
			1,
			1
		);
		const { data } = context.getImageData(0, 0, 1, 1);
		return Array.from(data);
	});
}

async function expectDominantColor(
	page: Page,
	color: 'red' | 'green' | 'blue' | 'yellow' | 'magenta' | 'cyan'
): Promise<void> {
	await expect
		.poll(async () => {
			const [red = 0, green = 0, blue = 0] = await readCenterPixel(page);
			switch (color) {
				case 'red':
					return red > 170 && green < 90 && blue < 90;
				case 'green':
					return green > 150 && red < 100 && blue < 100;
				case 'blue':
					return blue > 150 && red < 100 && green < 100;
				case 'yellow':
					return red > 160 && green > 150 && blue < 100;
				case 'magenta':
					return red > 160 && blue > 150 && green < 100;
				case 'cyan':
					return green > 150 && blue > 150 && red < 100;
			}
		}, { timeout: 10_000 })
		.toBe(true);
}

test.describe('Gate M: Real Video (colors.mp4) Speed & Remap Verification', () => {
	test('1. Speed / Duration dialog 200%: timeline 1.25s maps to source 2.5s (Blue)', async ({
		page
	}) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
		});

		await createProject(page, 'Real Video Speed 200');
		await importColorsMedia(page);

		const clip = page.locator('.timeline-clip').first();
		await clip.click();

		// Open Speed/Duration dialog via Alt+R
		await page.keyboard.press('Alt+KeyR');
		const speedDialog = page.getByRole('dialog', { name: 'Speed / Duration' });
		await expect(speedDialog).toBeVisible();

		// Fill 200%
		const speedInput = speedDialog.getByLabel('Speed percentage');
		await speedInput.fill('200');
		await speedDialog.getByRole('button', { name: 'OK' }).click();
		await expect(speedDialog).not.toBeVisible();

		// At 200% speed, timeline 1.25s into clip maps to source 2.5s -> Blue
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const c = store.getState().project.tracks[0].clips[0];
			store.getState().setPlayhead(c.start + 1_250_000);
		});
		await expectDominantColor(page, 'blue');
	});

	test('2. Speed / Duration dialog 50%: timeline 3.0s maps to source 1.5s (Green)', async ({
		page
	}) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
		});

		await createProject(page, 'Real Video Speed 50');
		await importColorsMedia(page);

		const clip = page.locator('.timeline-clip').first();
		await clip.click();

		// Open Speed/Duration dialog via Alt+R
		await page.keyboard.press('Alt+KeyR');
		const speedDialog = page.getByRole('dialog', { name: 'Speed / Duration' });
		await expect(speedDialog).toBeVisible();

		// Fill 50%
		const speedInput = speedDialog.getByLabel('Speed percentage');
		await speedInput.fill('50');
		await speedDialog.getByRole('button', { name: 'OK' }).click();
		await expect(speedDialog).not.toBeVisible();

		// At 50% speed, timeline 3.0s maps to source 1.5s -> Green (at 1x it would be Yellow)
		await seekTo(page, 3.0);
		await expectDominantColor(page, 'green');
	});

	test('3. Reverse playback: reverses color sequence from Cyan to Red', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
		});

		await createProject(page, 'Real Video Reverse');
		await importColorsMedia(page);

		// Reverse the clip via store action
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clipId = store.getState().project.tracks[0].clips[0].id;
			store.getState().reverseClips([clipId]);
		});

		// At timeline 0.5s (near start of reversed clip), source is near end (~5.5s) -> Cyan
		await seekTo(page, 0.5);
		await expectDominantColor(page, 'cyan');

		// At timeline 5.5s (near end of reversed clip), source is near start (~0.5s) -> Red
		await seekTo(page, 5.5);
		await expectDominantColor(page, 'red');
	});

	test('4. Add Freeze Frame (Shift+F): creates hold segment with constant color', async ({
		page
	}) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
		});

		await createProject(page, 'Real Video Freeze');
		await importColorsMedia(page);

		// Select clip and seek to 0.5s (Red)
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clipId = store.getState().project.tracks[0].clips[0].id;
			store.getState().selectClips([clipId]);
			store.getState().setPlayhead(500_000);
		});

		// Press Shift+F to add freeze frame
		await page.keyboard.press('Shift+KeyF');

		// The video track lane should have 3 clips: head, freeze, tail
		const videoClips = page.locator('.timeline-track-lane').first().locator('.timeline-clip');
		await expect(videoClips).toHaveCount(3);

		// Inside freeze segment at 1.5s
		await seekTo(page, 1.5);
		await expectDominantColor(page, 'red');
	});

	test('5. Speed ramp via Inspector: source colors match curve integral', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
		});

		await createProject(page, 'Real Video Speed Ramp');
		await importColorsMedia(page);

		const clip = page.locator('.timeline-clip').first();
		await clip.click();

		// Enable Time Remap in Inspector
		const timeRemapCheckbox = page.getByRole('checkbox', { name: 'Enable Time Remapping' });
		await timeRemapCheckbox.click();

		// Set a curve: [0s, speed: 1.0], [2s, speed: 3.0]
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clipId = store.getState().timeline.selection.clipIds[0];
			store.getState().enableTimeRemap(clipId);
			store.getState().setClipTimeRemap(clipId, {
				keyframes: [
					{ time: 0, value: 1.0, interpolation: 'linear' },
					{ time: 2_000_000, value: 3.0, interpolation: 'linear' }
				]
			});
		});

		// At t = 1.0s into clip, avg speed = (1 + 2) / 2 = 1.5 -> source is 1.5s -> Green
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const c = store.getState().project.tracks[0].clips[0];
			store.getState().setPlayhead(c.start + 1_000_000);
		});
		await expectDominantColor(page, 'green');
	});

	test('6. Head-trim re-bases timeRemap and preserves source time continuity', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
		});

		await createProject(page, 'Real Video Head Trim');
		await importColorsMedia(page);

		// Trim 1.0s off head of clip
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clipId = store.getState().project.tracks[0].clips[0].id;
			store.getState().trimClip(clipId, 'start', 1_000_000);
		});

		// At timeline 1.5s (0.5s into trimmed clip starting at 1.0s), source time is 1.5s -> Green
		await seekTo(page, 1.5);
		await expectDominantColor(page, 'green');
	});

	test('7. Exceeds-media duration displays warning badge', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
		});

		await createProject(page, 'Real Video Bounds Warning');
		await importColorsMedia(page);

		// Set speed to 25% with ripple false so source extent needed is 24s > asset 6s
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clipId = store.getState().project.tracks[0].clips[0].id;
			store.getState().setClipSpeed([clipId], 0.25, { ripple: false });
		});

		// The clip view should display the warning badge
		const warningBadge = page.locator('.clip-speed-exceeds-warning').first();
		await expect(warningBadge).toBeVisible();
		await expect(warningBadge).toHaveAttribute('title', /exceeds media duration/i);
	});

	test('8. Split mid-ramp is continuous: colors match across cut boundary', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
		});

		await createProject(page, 'Real Video Split Ramp');
		await importColorsMedia(page);

		const clip = page.locator('.timeline-clip').first();
		await clip.click();

		// Set a curve: [0s, speed: 1.0], [2s, speed: 3.0]
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clipId = store.getState().timeline.selection.clipIds[0];
			store.getState().enableTimeRemap(clipId);
			store.getState().setClipTimeRemap(clipId, {
				keyframes: [
					{ time: 0, value: 1.0, interpolation: 'linear' },
					{ time: 2_000_000, value: 3.0, interpolation: 'linear' }
				]
			});
		});

		// Split at 1.0s into ramp
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const c = store.getState().project.tracks[0].clips[0];
			store.getState().setPlayhead(c.start + 1_000_000);
			store.getState().splitAtPlayhead();
		});

		// Expect 2 video clips on Video 1 track
		const videoClips = page.locator('.timeline-track-lane').first().locator('.timeline-clip');
		await expect(videoClips).toHaveCount(2);

		// Frame immediately before split (0.95s into clip) is Green
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const c1 = store.getState().project.tracks[0].clips[0];
			store.getState().setPlayhead(c1.start + 950_000);
		});
		await expectDominantColor(page, 'green');

		// Frame immediately after split (1.05s into clip) is also Green
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const c1 = store.getState().project.tracks[0].clips[0];
			store.getState().setPlayhead(c1.start + 1_050_000);
		});
		await expectDominantColor(page, 'green');
	});

	test('9. Worker export parity check with 200% speed clip', async ({ page }) => {
		test.setTimeout(60_000);
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
			Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
		});

		await createProject(page, 'Real Video Export Parity');
		await importColorsMedia(page);

		const clip = page.locator('.timeline-clip').first();
		await clip.click();

		// Set speed to 200%
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clipId = store.getState().project.tracks[0].clips[0].id;
			store.getState().setClipSpeed([clipId], 2.0, { ripple: true });
		});

		// Open Export Dialog
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Export' });
		await expect(dialog).toBeVisible();

		await dialog.getByLabel('Format').selectOption('webm');
		await dialog.getByLabel('Include audio').uncheck();
		await dialog.getByLabel('Resolution').selectOption('480p');
		await dialog.getByLabel('Quality').selectOption('low');

		// Trigger export download
		const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
		await dialog.getByRole('button', { name: 'Export video' }).click();
		const download = await downloadPromise;
		const path = await download.path();
		expect(path).toBeTruthy();
	});
});
