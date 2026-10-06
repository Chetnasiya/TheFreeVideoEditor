import { expect, test } from '@playwright/test';

test('editor hydrates, creates and renames a project, and changes theme without browser errors', async ({
	page
}) => {
	const browserProblems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			browserProblems.push(`${message.type()}: ${message.text()}`);
		}
	});
	page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));
	page.on('requestfailed', (request) => {
		browserProblems.push(`requestfailed: ${request.url()} (${request.failure()?.errorText})`);
	});

	await page.addInitScript(() => {
		if (sessionStorage.getItem('tfve:e2e-initialized') === 'true') return;
		localStorage.removeItem('tfve:project-name');
		localStorage.removeItem('tfve:theme');
		sessionStorage.setItem('tfve:e2e-initialized', 'true');
	});
	await page.goto('/editor');
	await expect(page.getByRole('main', { name: 'Video editing workspace' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Timeline' })).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Your Projects' })).toBeVisible();
	await page.getByRole('button', { name: 'New project' }).click();
	await page
		.getByRole('dialog', { name: 'Create a Project' })
		.getByRole('button', {
			name: 'Create project'
		})
		.click();
	await expect(page.getByRole('heading', { name: 'Untitled Project' })).toBeVisible();

	const island = page.locator('astro-island');
	await expect(island).toHaveAttribute('client', 'only');
	await expect(island).not.toHaveAttribute('ssr', '');
	await expect(island.locator('.editor-app')).toBeVisible();

	const dimensions = await page.locator('.editor-app').evaluate((root) => ({
		height: root.getBoundingClientRect().height,
		viewportHeight: window.innerHeight,
		timelineHeight: root.querySelector('.timeline-panel')?.getBoundingClientRect().height ?? 0,
		tailwindSpacing: getComputedStyle(document.documentElement).getPropertyValue('--spacing')
	}));
	expect(dimensions.height).toBe(dimensions.viewportHeight);
	expect(dimensions.timelineHeight).toBeGreaterThan(0);
	expect(dimensions.tailwindSpacing.trim()).not.toBe('');

	await page.getByRole('button', { name: 'Switch to light mode' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	await page.getByRole('button', { name: 'Rename project: Untitled Project' }).click();
	await page.getByRole('textbox', { name: 'Project name' }).fill('Gate A Project');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Gate A Project' })).toBeVisible();
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 10_000 });
	await page.getByRole('button', { name: 'File', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Rename Project' }).click();
	await page.getByRole('textbox', { name: 'Project name' }).fill('File Menu Project');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'File Menu Project' })).toBeVisible();
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 10_000 });
	await page.reload();
	await expect(page.getByRole('heading', { name: 'File Menu Project' })).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

	expect(browserProblems).toEqual([]);
});
