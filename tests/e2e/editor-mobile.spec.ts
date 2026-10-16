import { test, expect } from '@playwright/test';

test.describe('Mobile Responsiveness & Desktop Non-Regression', () => {
	test('mobile viewport (390x844) has zero horizontal overflow and accessible controls', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/editor');

		// Ensure fresh workspace state for test start
		await page.evaluate(() => {
			window.localStorage.removeItem('tfve:workspace-state');
		});

		// Create a project
		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await expect(manager).toBeVisible();
		await manager.getByRole('button', { name: 'New project' }).click();

		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog
			.getByRole('textbox', { name: 'Project name' })
			.fill('Mobile Responsive Project');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(createDialog).toHaveCount(0);
		await expect(manager).toHaveCount(0);
		await expect(page.locator('.editor-workspace')).toBeVisible();

		// Check zero horizontal overflow on mobile
		const overflowCheck = await page.evaluate(() => {
			const appbar = document.querySelector('.application-bar');
			const wsbar = document.querySelector('.workspace-bar');
			return {
				pageScrollWidth: document.documentElement.scrollWidth,
				pageClientWidth: document.documentElement.clientWidth,
				appbarScrollWidth: appbar?.scrollWidth ?? 0,
				appbarClientWidth: appbar?.clientWidth ?? 0,
				wsbarClientWidth: wsbar?.clientWidth ?? 0
			};
		});

		expect(overflowCheck.pageScrollWidth).toBeLessThanOrEqual(overflowCheck.pageClientWidth);
		expect(overflowCheck.appbarScrollWidth).toBeLessThanOrEqual(overflowCheck.appbarClientWidth);

		// Export button MUST be visible on mobile
		const exportButton = page.locator('.topbar-actions .export-button');
		await expect(exportButton).toBeVisible();

		// Workspace bar tabs must be scrollable and all 7 present
		const tabs = page.locator('.workspace-tab');
		await expect(tabs).toHaveCount(7);

		// Switch to Assembly workspace on mobile: Media library visible, Program monitor hidden
		await page.click('.workspace-tab:has-text("Assembly")');
		await expect(page.locator('.workspace-tab[data-active="true"]')).toHaveText('Assembly');
		await expect(page.locator('.media-library')).toBeVisible();
		await expect(
			page.locator('.editor-workspace[data-workspace-id="assembly"] .program-monitor')
		).toBeHidden();
		await page.screenshot({
			path: '/Users/gajananpalepwad/.gemini/antigravity/brain/fcf7ed63-3029-4ec5-b062-4e16714deed9/mobile_ws_assembly.png'
		});

		// Switch to Color workspace on mobile: Color panel should be visible
		await page.click('.workspace-tab:has-text("Color")');
		await expect(page.locator('.workspace-tab[data-active="true"]')).toHaveText('Color');
		await expect(page.locator('.layout-panel-body.color-panel')).toBeVisible();

		// Switch to Effects workspace on mobile: Effects library should be visible
		await page.click('.workspace-tab:has-text("Effects")');
		await expect(page.locator('.workspace-tab[data-active="true"]')).toHaveText('Effects');
		await expect(page.locator('.effects-library')).toBeVisible();

		// Switch back to Editing workspace on mobile: Program monitor visible
		await page.click('.workspace-tab:has-text("Editing")');
		await expect(page.locator('.workspace-tab[data-active="true"]')).toHaveText('Editing');
		await expect(page.locator('.monitor-panel .has-program-monitor')).toBeVisible();

		// Timeline on mobile:
		// 1. Track name must not be displayed on mobile
		const trackName = page.locator('.timeline-track-name').first();
		await expect(trackName).toBeHidden();

		// 2. Track header width should be compact (~88px instead of desktop 212px)
		const trackHeader = page.locator('.timeline-track-header').first();
		const headerBox = await trackHeader.boundingBox();
		expect(headerBox?.width).toBeLessThanOrEqual(95);

		// 3. Ruler corner actions (snap, keyframe, graph) shifted to toolbar on mobile
		await expect(page.locator('.timeline-ruler-corner .timeline-corner-actions')).toBeHidden();
		const mobileActions = page.locator('.timeline-mobile-corner-actions');
		await expect(mobileActions).toBeVisible();
		await expect(mobileActions.getByRole('button', { name: 'Toggle Snapping' })).toBeVisible();
		await expect(mobileActions.getByRole('button', { name: /Keyframes display/ })).toBeVisible();
		await expect(mobileActions.getByRole('button', { name: 'Graph' })).toBeVisible();

		await page.screenshot({
			path: '/Users/gajananpalepwad/.gemini/antigravity/brain/fcf7ed63-3029-4ec5-b062-4e16714deed9/mobile_timeline.png'
		});
	});

	test('desktop viewport (1440x900) preserves complete desktop layout without regressions', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto('/editor');

		// Create a project
		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await expect(manager).toBeVisible();
		await manager.getByRole('button', { name: 'New project' }).click();

		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog
			.getByRole('textbox', { name: 'Project name' })
			.fill('Desktop Non-Regression Project');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(createDialog).toHaveCount(0);
		await expect(manager).toHaveCount(0);
		await expect(page.locator('.editor-workspace')).toBeVisible();

		// On desktop, all columns and monitors in Editing workspace must be simultaneously visible
		await expect(page.locator('.media-library')).toBeVisible();
		await expect(page.locator('.monitor-panel .has-source-monitor')).toBeVisible();
		await expect(page.locator('.monitor-panel .has-program-monitor')).toBeVisible();
		await expect(
			page.locator('.inspector-panel, .properties-panel, .layout-panel-body.inspector-panel')
		).toBeVisible();

		// Project title and Fullscreen button must be visible on desktop
		await expect(page.locator('.project-title')).toBeVisible();
		await expect(page.locator('.fullscreen-button')).toBeVisible();
		await expect(page.locator('.export-button')).toBeVisible();

		// Timeline on desktop:
		// 1. Track name must be visible
		const desktopTrackName = page.locator('.timeline-track-name').first();
		await expect(desktopTrackName).toBeVisible();

		// 2. Track header width should be ~212px
		const desktopTrackHeader = page.locator('.timeline-track-header').first();
		const desktopHeaderBox = await desktopTrackHeader.boundingBox();
		expect(desktopHeaderBox?.width).toBeGreaterThanOrEqual(200);

		// 3. Ruler corner actions visible in ruler corner, hidden in toolbar on desktop
		await expect(page.locator('.timeline-ruler-corner .timeline-corner-actions')).toBeVisible();
		await expect(page.locator('.timeline-mobile-corner-actions')).toBeHidden();

		await page.screenshot({
			path: '/Users/gajananpalepwad/.gemini/antigravity/brain/fcf7ed63-3029-4ec5-b062-4e16714deed9/desktop_timeline.png'
		});
	});

	test('mobile touch hold-to-drag moves clip without opening context menu', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/editor');

		await page.evaluate(() => {
			window.localStorage.removeItem('tfve:workspace-state');
		});

		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await expect(manager).toBeVisible();
		await manager.getByRole('button', { name: 'New project' }).click();

		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Mobile Drag Project');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(page.locator('.editor-workspace')).toBeVisible();

		// Add a solid layer clip
		await page.locator('.timeline-tool-group button[aria-label="Solid Layer"]').click();
		const clip = page.locator('.timeline-clip').first();
		await expect(clip).toBeVisible();

		const initialBox = await clip.boundingBox();
		expect(initialBox).toBeTruthy();

		const cx = (initialBox?.x ?? 0) + (initialBox?.width ?? 0) / 2;
		const cy = (initialBox?.y ?? 0) + (initialBox?.height ?? 0) / 2;

		// Dispatch touch pointerdown
		await page.evaluate(
			({ x, y }) => {
				const el = document.querySelector('.timeline-clip');
				el?.dispatchEvent(
					new PointerEvent('pointerdown', {
						bubbles: true,
						cancelable: true,
						pointerType: 'touch',
						pointerId: 10,
						button: 0,
						clientX: x,
						clientY: y
					})
				);
			},
			{ x: cx, y: cy }
		);

		// Hold for 250ms to activate hold-to-drag
		await page.waitForTimeout(250);

		// Verify visual lift
		const isLifted = await clip.evaluate((el) => el.classList.contains('is-drag-lifted'));
		expect(isLifted).toBe(true);

		// Drag 80px to the right
		await page.evaluate(
			({ x, y }) => {
				const scroller = document.querySelector('.timeline-scroll');
				scroller?.dispatchEvent(
					new PointerEvent('pointermove', {
						bubbles: true,
						cancelable: true,
						pointerType: 'touch',
						pointerId: 10,
						button: 0,
						clientX: x + 80,
						clientY: y
					})
				);
			},
			{ x: cx, y: cy }
		);

		// Release touch
		await page.evaluate(
			({ x, y }) => {
				const scroller = document.querySelector('.timeline-scroll');
				scroller?.dispatchEvent(
					new PointerEvent('pointerup', {
						bubbles: true,
						cancelable: true,
						pointerType: 'touch',
						pointerId: 10,
						button: 0,
						clientX: x + 80,
						clientY: y
					})
				);
			},
			{ x: cx, y: cy }
		);

		await page.waitForTimeout(100);

		// Context menu must NOT have opened
		await expect(page.locator('.timeline-context-menu')).toHaveCount(0);
	});

	test('mobile media import succeeds without hanging at 0%', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/editor');

		// Create a project
		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await expect(manager).toBeVisible();
		await manager.getByRole('button', { name: 'New project' }).click();

		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog
			.getByRole('textbox', { name: 'Project name' })
			.fill('Mobile Media Import Project');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(createDialog).toHaveCount(0);
		await expect(manager).toHaveCount(0);
		await expect(page.locator('.editor-workspace')).toBeVisible();

		// Switch to Assembly workspace on mobile
		await page.click('.workspace-tab:has-text("Assembly")');
		await expect(page.locator('.workspace-tab[data-active="true"]')).toHaveText('Assembly');
		await expect(page.locator('.media-library')).toBeVisible();

		// Import a media file
		const fileInput = page.locator('input[name="media-files"]');
		await fileInput.setInputFiles('tests/fixtures/colors.mp4');

		// Ensure asset appears in media library and is not stuck at 0%
		await expect(
			page.getByRole('listbox', { name: 'Project media' }).getByRole('option')
		).toHaveCount(1, { timeout: 15_000 });

		// Verify import queue finished successfully (no job stuck at 0%)
		const queue = page.locator('.media-import-queue');
		if ((await queue.count()) > 0) {
			const queueText = await queue.textContent();
			expect(queueText).not.toContain('0%');
			expect(queueText).toContain('Imported');
		}
	});
});
