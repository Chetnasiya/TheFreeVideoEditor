import { expect, test, type Page } from '@playwright/test';

async function openProject(page: Page, query: string): Promise<void> {
	await page.goto(`/editor${query}`);
	const manager = page.locator('.project-manager-dialog');
	await manager.waitFor({ state: 'visible', timeout: 5000 });
	await manager.getByRole('button', { name: 'New project' }).click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Template renderer');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(manager).not.toBeVisible();
	await page.waitForFunction(() => Boolean((window as any).__TFVE_STORE__));
}

/** Adds a built-in template at the playhead and seeks into it. */
async function addTemplate(page: Page, id: string): Promise<void> {
	await page.evaluate(async (templateId) => {
		const path = '/src/editor/core/templates/builtinTemplates.ts';
		const { getBuiltinMotionTemplate } = (await import(
			/* @vite-ignore */ path
		)) as typeof import('../../src/editor/core/templates/builtinTemplates');
		const state = (window as any).__TFVE_STORE__.getState();
		state.instantiateTemplate(getBuiltinMotionTemplate(templateId));
		state.setPlayhead(2_000_000);
	}, id);
}

/** Counts preview pixels that are not the black background. */
async function litPixels(page: Page): Promise<number> {
	return page.evaluate(async () => {
		const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
		const copy = document.createElement('canvas');
		copy.width = canvas.width;
		copy.height = canvas.height;
		const context = copy.getContext('2d', { willReadFrequently: true })!;
		context.drawImage(canvas, 0, 0);
		const { data } = context.getImageData(0, 0, copy.width, copy.height);
		let lit = 0;
		for (let index = 0; index < data.length; index += 4) {
			if (data[index]! + data[index + 1]! + data[index + 2]! > 30) lit += 1;
		}
		return lit;
	});
}

test.describe('Template instances render on every preview renderer', () => {
	for (const renderer of ['canvas2d', 'webgl2']) {
		test(`a template instance is visible on the ${renderer} preview`, async ({ page }) => {
			await openProject(page, `?renderer=${renderer}`);
			await addTemplate(page, 'cinematic-blockbuster');
			await expect.poll(() => litPixels(page), { timeout: 8000 }).toBeGreaterThan(500);
		});
	}
});
