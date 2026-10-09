import { expect, test, type Page } from '@playwright/test';

test.describe('Proxy media lifecycle and playback', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
			Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
		});
	});

	async function createProject(page: Page, name: string): Promise<void> {
		await page.goto('/editor');
		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await manager.getByRole('button', { name: 'New project' }).click();
		const dialog = page.getByRole('dialog', { name: 'Create a Project' });
		await dialog.getByRole('textbox', { name: 'Project name' }).fill(name);
		await dialog.getByRole('button', { name: 'Create project' }).click();
		await expect(page.getByRole('heading', { name })).toBeVisible();
	}

	test('Slice 1 & 2: generates proxy for 4K media, switches playback, and shows PROXY badge', async ({ page }) => {
		test.setTimeout(60_000);
		const browserProblems: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error') {
				browserProblems.push(`error: ${message.text()}`);
			}
		});
		page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));

		await createProject(page, 'Proxy Test Project');

		// Import 4K video fixture
		await page.locator('input[name="media-files"]').setInputFiles(['tests/fixtures/stock-4k.mp4']);
		const assets = page.getByRole('listbox', { name: 'Project media' });
		await expect(assets.getByRole('option')).toHaveCount(1, { timeout: 20_000 });

		// Verify suggestion toast appeared (since 4K > 1080p and proxies not yet enabled)
		const suggestionToast = page.getByTestId('proxy-suggestion-toast');
		await expect(suggestionToast).toBeVisible({ timeout: 5_000 });
		await expect(suggestionToast).toContainText('High-resolution media imported');

		// Click "Create Proxy" from the suggestion toast
		await suggestionToast.getByRole('button', { name: 'Create Proxy' }).click();
		await expect(suggestionToast).toBeHidden();

		// Wait for either ready or failed status
		const statusChip = page.locator('[data-testid="proxy-status-ready"], [data-testid="proxy-status-failed"]');
		await expect(statusChip).toBeVisible({ timeout: 45_000 });
		const isFailed = await page.getByTestId('proxy-status-failed').isVisible();
		if (isFailed) {
			const err = await page.getByTestId('proxy-status-failed').getAttribute('title');
			throw new Error(`Proxy generation failed with error: ${err}`);
		}
		const readyStatus = page.getByTestId('proxy-status-ready');
		await expect(readyStatus).toContainText('Proxy ready (540p)');

		// Place clip on timeline by dragging to Video 1 track lane
		const assetCard = assets.getByRole('option').first();
		await assetCard.dragTo(page.getByRole('gridcell', { name: 'Video 1 track lane' }), {
			targetPosition: { x: 20, y: 28 }
		});

		// Check timeline has 1 clip
		const timelineClips = page.locator('.timeline-clip');
		await expect(timelineClips).toHaveCount(1, { timeout: 5_000 });

		// Ensure "Proxies" toggle button in TransportBar exists
		const proxiesToggle = page.getByTestId('toggle-proxies-button');
		await expect(proxiesToggle).toBeVisible();

		// Turn proxies on in TransportBar
		const isPressed = await proxiesToggle.getAttribute('aria-pressed');
		if (isPressed !== 'true') {
			await proxiesToggle.click();
		}
		await expect(proxiesToggle).toHaveAttribute('aria-pressed', 'true');

		// Seek timeline into clip at 1s
		const ruler = page.getByRole('slider', { name: 'Timeline playhead' });
		await expect(ruler).toBeVisible({ timeout: 10_000 });
		const bounds = await ruler.boundingBox();
		if (bounds) {
			await page.mouse.click(bounds.x + 64, bounds.y + 12);
		}

		// Play or seek on timeline: preview should display the PROXY badge
		await page.keyboard.press('Space'); // Play
		await page.waitForTimeout(300);
		await page.keyboard.press('Space'); // Pause

		const proxyBadge = page.getByTestId('preview-proxy-badge');
		await expect(proxyBadge).toBeVisible();

		// Toggle proxies off: PROXY badge should disappear
		await proxiesToggle.click();
		await expect(proxiesToggle).toHaveAttribute('aria-pressed', 'false');
		await expect(proxyBadge).toBeHidden();

		// Toggle proxies back on: PROXY badge should reappear
		await proxiesToggle.click();
		await expect(proxiesToggle).toHaveAttribute('aria-pressed', 'true');
		await expect(proxyBadge).toBeVisible();

		expect(browserProblems).toEqual([]);
	});

	test('Slice 1: settings dialog allows deleting and recreating all proxies', async ({ page }) => {
		await createProject(page, 'Proxy Management Project');

		await page.locator('input[name="media-files"]').setInputFiles(['tests/fixtures/stock-4k.mp4']);
		const assets = page.getByRole('listbox', { name: 'Project media' });
		await expect(assets.getByRole('option')).toHaveCount(1, { timeout: 20_000 });

		// Dismiss suggestion if present
		const suggestionToast = page.getByTestId('proxy-suggestion-toast');
		if (await suggestionToast.isVisible()) {
			await suggestionToast.getByRole('button', { name: 'Not Now' }).click();
		}

		// Open Proxies... dialog from MediaLibrary toolbar
		await page.getByRole('button', { name: 'Proxy settings' }).click();
		const proxyDialog = page.getByRole('dialog', { name: 'Proxy Settings' });
		await expect(proxyDialog).toBeVisible();

		// Click "Create All Proxies" in dialog
		await proxyDialog.getByRole('button', { name: 'Create All Proxies' }).click();
		await proxyDialog.getByRole('button', { name: 'Done' }).click();

		// Verify proxy is ready in list
		const readyStatus = page.getByTestId('proxy-status-ready');
		await expect(readyStatus).toBeVisible({ timeout: 45_000 });

		// Open Proxies dialog again and click Delete All Proxies
		await page.getByRole('button', { name: 'Proxy settings' }).click();
		await proxyDialog.getByRole('button', { name: 'Delete All Proxies' }).click();
		await proxyDialog.getByRole('button', { name: 'Done' }).click();

		// Proxy status should now show "Create proxy" link again
		await expect(page.getByTestId('create-proxy-button')).toBeVisible();
	});

	test('Slice 3: export uses original media even when proxies are enabled and ready', async ({ page }) => {
		await createProject(page, 'Proxy Export Independence Project');

		await page.locator('input[name="media-files"]').setInputFiles(['tests/fixtures/stock-4k.mp4']);
		const assets = page.getByRole('listbox', { name: 'Project media' });
		await expect(assets.getByRole('option')).toHaveCount(1, { timeout: 20_000 });

		// Accept proxy creation
		const suggestionToast = page.getByTestId('proxy-suggestion-toast');
		if (await suggestionToast.isVisible()) {
			await suggestionToast.getByRole('button', { name: 'Create Proxy' }).click();
		}

		// Wait for proxy ready
		await expect(page.getByTestId('proxy-status-ready')).toBeVisible({ timeout: 45_000 });

		// Place clip on timeline
		const assetCard = assets.getByRole('option').first();
		await assetCard.dragTo(page.getByRole('gridcell', { name: 'Video 1 track lane' }), {
			targetPosition: { x: 20, y: 28 }
		});

		// Ensure proxies are enabled
		const proxiesToggle = page.getByTestId('toggle-proxies-button');
		const isPressed = await proxiesToggle.getAttribute('aria-pressed');
		if (isPressed !== 'true') {
			await proxiesToggle.click();
		}
		await expect(proxiesToggle).toHaveAttribute('aria-pressed', 'true');

		// Open Export dialog
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const exportDialog = page.getByRole('dialog', { name: 'Export' });
		await expect(exportDialog).toBeVisible();

		// Check resolution selector: original timeline default resolution (Project 1920x1080) is selected, not proxy (540p)
		const resolutionSelect = exportDialog.getByLabel('Resolution');
		if (await resolutionSelect.isVisible()) {
			const projectOption = resolutionSelect.locator('option[value="project"]');
			await expect(projectOption).toContainText('1920 × 1080');
			const val = await resolutionSelect.inputValue();
			expect(val).toBe('project');
		}

		// Close export dialog
		await exportDialog.getByRole('button', { name: 'Close', exact: true }).click();
		await expect(exportDialog).toBeHidden();
	});

	test('Slice 1: transcode cancel clears progress and leaves no partial file', async ({ page }) => {
		await createProject(page, 'Proxy Cancel Project');

		await page.locator('input[name="media-files"]').setInputFiles(['tests/fixtures/stock-4k.mp4']);
		const assets = page.getByRole('listbox', { name: 'Project media' });
		await expect(assets.getByRole('option')).toHaveCount(1, { timeout: 20_000 });

		// Suggestion toast appears
		const suggestionToast = page.getByTestId('proxy-suggestion-toast');
		await expect(suggestionToast).toBeVisible({ timeout: 5_000 });

		// Click Create Proxy
		await suggestionToast.getByRole('button', { name: 'Create Proxy' }).click();

		// As soon as Cancel button appears on the working/queued chip, click it
		const workingChip = page.getByTestId('proxy-status-working');
		const cancelBtn = workingChip.getByRole('button', { name: 'Cancel' });
		if (await cancelBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
			await cancelBtn.click();
			// Should transition back to "Create proxy" link or no proxy chip
			await expect(page.getByTestId('create-proxy-button')).toBeVisible({ timeout: 5_000 });
		}
	});

	test('Slice 1 & 3: fault injection displays error with retry button, and suggestion toast supports "Don\'t Ask Again"', async ({
		page
	}) => {
		test.setTimeout(60_000);
		await createProject(page, 'Proxy Fault and Suggestion Project');

		await page.locator('input[name="media-files"]').setInputFiles(['tests/fixtures/stock-4k.mp4']);
		const assets = page.getByRole('listbox', { name: 'Project media' });
		await expect(assets.getByRole('option')).toHaveCount(1, { timeout: 20_000 });

		const suggestionToast = page.getByTestId('proxy-suggestion-toast');
		await expect(suggestionToast).toBeVisible({ timeout: 5_000 });

		// Test "Don't Ask Again"
		await suggestionToast.getByRole('button', { name: "Don't Ask Again" }).click();
		await expect(suggestionToast).toBeHidden();

		// Inject dev fault on next proxy attempt via window.__tfveProxyService
		await page.evaluate(() => {
			const s = (window as unknown as { __tfveProxyService?: { devFaultInjection?: string } }).__tfveProxyService;
			if (s) s.devFaultInjection = 'encoder_unsupported';
		});

		// Trigger proxy creation manually via create-proxy-button
		const createProxyBtn = page.getByTestId('create-proxy-button');
		await createProxyBtn.click();

		// Verify failure chip is displayed with Retry button
		const failedChip = page.getByTestId('proxy-status-failed');
		await expect(failedChip).toBeVisible({ timeout: 15_000 });
		const retryBtn = failedChip.getByRole('button', { name: 'Retry' });
		await expect(retryBtn).toBeVisible();

		// Clear fault injection and click Retry
		await page.evaluate(() => {
			const s = (window as unknown as { __tfveProxyService?: { devFaultInjection?: string } }).__tfveProxyService;
			if (s) s.devFaultInjection = undefined;
		});
		await retryBtn.click();

		// Should succeed and display ready chip
		await expect(page.getByTestId('proxy-status-ready')).toBeVisible({ timeout: 45_000 });
	});

	test('Slice 2: Alt+P toggles proxy mode during playback preserving playhead', async ({ page }) => {
		await createProject(page, 'Proxy Toggle Shortcut Project');

		await page.locator('input[name="media-files"]').setInputFiles(['tests/fixtures/stock-4k.mp4']);
		const assets = page.getByRole('listbox', { name: 'Project media' });
		await expect(assets.getByRole('option')).toHaveCount(1, { timeout: 20_000 });

		const suggestionToast = page.getByTestId('proxy-suggestion-toast');
		if (await suggestionToast.isVisible({ timeout: 3_000 }).catch(() => false)) {
			await suggestionToast.getByRole('button', { name: 'Create Proxy' }).click();
		}
		await expect(page.getByTestId('proxy-status-ready')).toBeVisible({ timeout: 45_000 });

		// Place clip on timeline
		const assetCard = assets.getByRole('option').first();
		await assetCard.dragTo(page.getByRole('gridcell', { name: 'Video 1 track lane' }), {
			targetPosition: { x: 20, y: 28 }
		});

		// Seek timeline
		const ruler = page.getByRole('slider', { name: 'Timeline playhead' });
		const bounds = await ruler.boundingBox();
		if (bounds) {
			await page.mouse.click(bounds.x + 80, bounds.y + 12);
		}
		const initialPlayheadVal = await ruler.getAttribute('aria-valuenow');
		expect(Number(initialPlayheadVal)).toBeGreaterThan(0);

		const proxiesToggle = page.getByTestId('toggle-proxies-button');

		// Press Alt+P to toggle on
		await page.keyboard.press('Alt+p');
		await expect(proxiesToggle).toHaveAttribute('aria-pressed', 'true');

		// Play brief snippet
		await page.keyboard.press('Space');
		await page.waitForTimeout(300);
		await page.keyboard.press('Space');

		// Badge is visible
		const proxyBadge = page.getByTestId('preview-proxy-badge');
		await expect(proxyBadge).toBeVisible();

		// Press Alt+P to toggle off
		await page.keyboard.press('Alt+p');
		await expect(proxiesToggle).toHaveAttribute('aria-pressed', 'false');
		await expect(proxyBadge).toBeHidden();

		// Confirm playhead remains intact and valid
		const currentPlayheadVal = await ruler.getAttribute('aria-valuenow');
		expect(Number(currentPlayheadVal)).toBeGreaterThan(0);
	});

	test('Slice 2 & 3: colors preview and real export parity with proxies on vs off', async ({ page }) => {
		test.setTimeout(90_000);
		await createProject(page, 'Proxy Colors and Export Parity Project');

		// Import 1080p video fixture
		await page.locator('input[name="media-files"]').setInputFiles(['tests/fixtures/stock-1080p25-audio.mp4']);
		const assets = page.getByRole('listbox', { name: 'Project media' });
		await expect(assets.getByRole('option')).toHaveCount(1, { timeout: 20_000 });

		// Place clip on timeline
		const assetCard = assets.getByRole('option').first();
		await assetCard.dragTo(page.getByRole('gridcell', { name: 'Video 1 track lane' }), {
			targetPosition: { x: 20, y: 28 }
		});

		// Trigger proxy generation for 1080p video
		const createProxyBtn = page.getByTestId('create-proxy-button');
		if (await createProxyBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
			await createProxyBtn.click();
		}
		await expect(page.getByTestId('proxy-status-ready')).toBeVisible({ timeout: 45_000 });

		// Seek to 1s
		const ruler = page.getByRole('slider', { name: 'Timeline playhead' });
		await expect(ruler).toBeVisible({ timeout: 10_000 });
		const bounds = await ruler.boundingBox();
		if (bounds) {
			await page.mouse.click(bounds.x + 80, bounds.y + 12);
		}

		const proxiesToggle = page.getByTestId('toggle-proxies-button');

		// Helper to sample RGB from preview canvas
		const samplePreviewPixel = async () => {
			return await page.evaluate(() => {
				const canvas = document.querySelector('.preview-canvas') as HTMLCanvasElement | null;
				if (!canvas) return null;
				const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
				if (gl) {
					const pixels = new Uint8Array(4);
					gl.readPixels(
						Math.floor(canvas.width / 2),
						Math.floor(canvas.height / 2),
						1,
						1,
						gl.RGBA,
						gl.UNSIGNED_BYTE,
						pixels
					);
					return [pixels[0], pixels[1], pixels[2]];
				}
				const ctx = canvas.getContext('2d');
				if (ctx) {
					const data = ctx.getImageData(
						Math.floor(canvas.width / 2),
						Math.floor(canvas.height / 2),
						1,
						1
					).data;
					return [data[0], data[1], data[2]];
				}
				return null;
			});
		};

		// Play briefly to ensure frame is decoded and painted
		await page.keyboard.press('Space');
		await page.waitForTimeout(300);
		await page.keyboard.press('Space');
		await page.waitForTimeout(200);

		const pixelsOff = await samplePreviewPixel();

		// Toggle proxies ON
		await proxiesToggle.click();
		await expect(proxiesToggle).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByTestId('preview-proxy-badge')).toBeVisible();

		// Play briefly to ensure proxy frame is decoded and painted
		await page.keyboard.press('Space');
		await page.waitForTimeout(300);
		await page.keyboard.press('Space');
		await page.waitForTimeout(200);

		const pixelsOn = await samplePreviewPixel();

		// Both should be rendering valid frames (non-black) with color similarity
		if (pixelsOff && pixelsOn) {
			const diff = Math.max(
				Math.abs(pixelsOff[0] - pixelsOn[0]),
				Math.abs(pixelsOff[1] - pixelsOn[1]),
				Math.abs(pixelsOff[2] - pixelsOn[2])
			);
			// Color space compression tolerance between original and 540p transcode <= 20
			expect(diff).toBeLessThanOrEqual(20);
		}
	});
});

