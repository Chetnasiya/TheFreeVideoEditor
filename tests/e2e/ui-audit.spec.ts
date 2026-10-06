import { expect, test } from '@playwright/test';

const viewports = [
	{ name: 'desktop', width: 1440, height: 900 },
	{ name: 'laptop', width: 1280, height: 720 },
	{ name: 'full-hd', width: 1920, height: 1080 },
	{ name: 'large-desktop', width: 2560, height: 1440 },
	{ name: 'tablet-landscape', width: 1024, height: 768 },
	{ name: 'tablet-portrait', width: 768, height: 1024 },
	{ name: 'mobile', width: 390, height: 844 }
] as const;

test('captures dark and light editor layouts across desktop, tablet, and mobile sizes', async ({
	page
}) => {
	test.setTimeout(90_000);
	const browserProblems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			browserProblems.push(`${message.type()}: ${message.text()}`);
		}
	});
	page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));
	page.on('requestfailed', (request) => {
		const errorText = request.failure()?.errorText;
		if (errorText !== 'net::ERR_ABORTED') {
			browserProblems.push(`requestfailed: ${request.url()} (${errorText})`);
		}
	});

	await page.goto('/editor');
	const manager = page.getByRole('dialog', { name: 'Your Projects' });
	await expect(manager).toBeVisible();
	await page.screenshot({
		path: 'test-results/ui-audit/project-manager-empty.png',
		fullPage: true
	});
	await manager.getByRole('button', { name: 'New project' }).click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await page.screenshot({
		path: 'test-results/ui-audit/new-project-dialog.png',
		fullPage: true
	});
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('UI audit project');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'UI audit project' })).toBeVisible();
	await page
		.locator('input[name="media-files"]')
		.setInputFiles('tests/fixtures/stock-1080p25-noaudio.webm');
	const mediaLibrary = page.getByRole('listbox', { name: 'Project media' });
	const media = mediaLibrary.getByRole('option', { name: /stock-1080p25-noaudio\.webm/ });
	await expect(media).toBeVisible({ timeout: 20_000 });
	await media.click();
	await media.dragTo(page.locator('[data-track-lane]').first(), {
		targetPosition: { x: 2, y: 24 }
	});
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 20_000 });
	const fixture = await page.evaluate(
		() => window.__TFVE_EXPORT_TEST_HOOKS__?.createUiAuditFixture?.() ?? false
	);
	expect(fixture).toEqual({ trackCount: 4, clipCount: 11 });
	await page.reload();
	await expect(page.getByRole('heading', { name: 'UI audit project' })).toBeVisible();
	await expect(page.locator('.media-chip.is-offline')).toBeVisible({ timeout: 20_000 });

	let currentTheme: 'dark' | 'light' = 'dark';
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		for (const theme of ['dark', 'light'] as const) {
			if (theme !== currentTheme) {
				await page.getByRole('button', { name: `Switch to ${theme} mode` }).click();
				currentTheme = theme;
			}
			const geometry = await page.evaluate(() => {
				const editor = document.querySelector('.editor-app');
				const workspace = document.querySelector('.editor-workspace');
				const monitors = document.querySelector('.monitor-panel');
				const timeline = document.querySelector('.timeline-panel');
				const media = document.querySelector('.media-panel');
				const canvas = document.querySelector('.preview-canvas');
				const rect = (element: Element | null) => {
					const box = element?.getBoundingClientRect();
					return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
				};
				const canvasRect = canvas?.getBoundingClientRect();
				const centerElement =
					canvasRect && canvasRect.width > 0 && canvasRect.height > 0
						? document.elementFromPoint(
								canvasRect.x + canvasRect.width / 2,
								canvasRect.y + canvasRect.height / 2
							)
						: null;
				return {
					viewportWidth: window.innerWidth,
					documentWidth: document.documentElement.scrollWidth,
					editor: rect(editor),
					workspace: rect(workspace),
					media: rect(media),
					monitors: rect(monitors),
					timeline: rect(timeline),
					canvas: rect(canvas),
					canvasCenterInsideFrame: Boolean(centerElement?.closest('.preview-canvas-frame')),
					theme: document.documentElement.dataset.theme
				};
			});
			console.info(`UI_AUDIT ${viewport.name} ${theme} ${JSON.stringify(geometry)}`);
			expect(geometry.documentWidth).toBeLessThanOrEqual(viewport.width);
			expect(geometry.editor?.width).toBeGreaterThan(0);
			expect(geometry.workspace?.height).toBeGreaterThan(0);
			expect(geometry.monitors?.width).toBeGreaterThan(0);
			expect(geometry.timeline?.width).toBeGreaterThan(0);
			expect(geometry.canvas?.width).toBeGreaterThan(0);
			expect(geometry.canvas?.height).toBeGreaterThan(0);
			expect(geometry.canvasCenterInsideFrame).toBe(true);
			if (viewport.width >= 1024) {
				expect(geometry.media?.width).toBeGreaterThanOrEqual(150);
				expect(geometry.monitors?.width).toBeGreaterThanOrEqual(150);
				expect(geometry.timeline?.width).toBeGreaterThanOrEqual(200);
			}
			if (viewport.width < 600) {
				expect(geometry.canvas?.width).toBeGreaterThanOrEqual(120);
				expect(geometry.canvas?.height).toBeGreaterThanOrEqual(68);
			}
			expect(geometry.theme).toBe(theme);
			await page.screenshot({
				path: `test-results/ui-audit/${viewport.name}-${theme}.png`,
				fullPage: true
			});
		}
	}

	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole('button', { name: 'File', exact: true }).click();
	await page.getByRole('menuitem', { name: /Open Project/ }).click();
	const projectManager = page.getByRole('dialog', { name: 'Your Projects' });
	await expect(projectManager).toBeVisible();
	await page.screenshot({
		path: 'test-results/ui-audit/project-manager-populated.png',
		fullPage: true
	});
	await projectManager.getByRole('button', { name: 'Close project manager' }).click();
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const exportDialog = page.getByRole('dialog', { name: 'Export' });
	await expect(exportDialog).toBeVisible();
	await page.screenshot({
		path: 'test-results/ui-audit/export-dialog.png',
		fullPage: true
	});
	await exportDialog.getByRole('button', { name: 'Close export dialog' }).click();
	for (const [name, selector] of [
		['media-panel', '.media-panel'],
		['monitors', '.monitor-panel'],
		['timeline', '.timeline-panel']
	] as const) {
		await page.locator(selector).screenshot({
			path: `test-results/ui-audit/${name}.png`
		});
	}
	expect(browserProblems).toEqual([]);
});
