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

async function importMedia(page: Page, ...files: string[]): Promise<void> {
	await page.locator('input[name="media-files"]').setInputFiles(files);
	await expect(
		page.getByRole('listbox', { name: 'Project media' }).getByRole('option')
	).toHaveCount(files.length, { timeout: 30_000 });
	await expect(page.locator('.media-library')).not.toHaveAttribute('aria-busy', 'true', {
		timeout: 30_000
	});
}

async function seekTo(page: Page, seconds: number): Promise<void> {
	const ruler = page.getByRole('slider', { name: 'Timeline playhead' });
	const bounds = await ruler.boundingBox();
	expect(bounds).not.toBeNull();
	await page.mouse.click(bounds!.x + seconds * 64, bounds!.y + 12);
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

test.describe('Mid-Session Renderer Switch', () => {
	test('switches from Canvas2D to WebGL2 when an effect or mask is added mid-session without reload', async ({
		page
	}) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
		});

		await createProject(page, 'Mid Session Switch');
		await importMedia(page, 'tests/fixtures/colors.mp4');

		const media = page.getByRole('listbox', { name: 'Project media' });
		const mediaClip = media.getByRole('option', { name: /colors\.mp4/ });
		await expect(mediaClip).toBeVisible();
		await mediaClip.dragTo(page.getByRole('gridcell', { name: 'Video 1 track lane' }), {
			targetPosition: { x: 20, y: 28 }
		});
		await expect(page.locator('.timeline-clip').first()).toBeVisible();

		// Check that project initially does NOT need GPU (uses Canvas2D)
		const initialNeedsGpu = await page.evaluate(async () => {
			const { projectNeedsGpu } = await import('../../src/editor/core/gpuFeatures');
			const store = (window as any).__TFVE_STORE__;
			return projectNeedsGpu(store.getState().project);
		});
		expect(initialNeedsGpu).toBe(false);

		// Canvas is visible
		const canvas = page.getByTestId('preview-canvas');
		await expect(canvas).toBeVisible();

		// Seek to 0.5s: colors.mp4 begins with red
		await seekTo(page, 0.5);

		// Poll until red is rendered on Canvas2D
		await expect
			.poll(
				async () => {
					const [r, g, b] = await readCenterPixel(page);
					return r! > 150 && g! < 80 && b! < 80;
				},
				{ timeout: 5000 }
			)
			.toBe(true);

		// Now add an Invert effect directly via store without page reload
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const state = store.getState();
			const clip = state.project?.tracks.flatMap((t: any) => t.clips)[0];
			if (clip) {
				store.getState().addEffect(clip.id, 'invert', { amount: 1 });
			}
		});

		// Now project DOES need GPU
		const nextNeedsGpu = await page.evaluate(async () => {
			const { projectNeedsGpu } = await import('../../src/editor/core/gpuFeatures');
			const store = (window as any).__TFVE_STORE__;
			return projectNeedsGpu(store.getState().project);
		});
		expect(nextNeedsGpu).toBe(true);

		// Re-seek slightly or let engine re-render on the newly attached WebGL2 canvas
		await seekTo(page, 0.5);

		// Center pixel is now inverted on WebGL2: red becomes cyan (red < 100, green > 150, blue > 150)
		await expect
			.poll(
				async () => {
					const [r, g, b] = await readCenterPixel(page);
					return r! < 100 && g! > 150 && b! > 150;
				},
				{ timeout: 5000 }
			)
			.toBe(true);
	});
});

