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

async function readPixelAt(page: Page, normX: number, normY: number): Promise<number[]> {
	return page.getByTestId('preview-canvas').evaluate(
		(canvas, { normX, normY }) => {
			const el = canvas as HTMLCanvasElement;
			const sampleCanvas = document.createElement('canvas');
			sampleCanvas.width = 1;
			sampleCanvas.height = 1;
			const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
			if (!ctx) return [0, 0, 0, 0];
			const px = Math.floor(normX * el.width);
			const py = Math.floor(normY * el.height);
			ctx.drawImage(el, px, py, 1, 1, 0, 0, 1, 1);
			return Array.from(ctx.getImageData(0, 0, 1, 1).data);
		},
		{ normX, normY }
	);
}

test.describe('Masks Architecture & Pipeline (Gate L)', () => {
	test('clips video with rectangle mask and inverts mask', async ({ page }) => {
		await createProject(page, 'Masks Test 1');

		// Add a solid white clip and add a rectangle mask
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clipId = store.getState().addSolidLayer('#ffffff');
			store.getState().selectClips([clipId]);
			store.getState().addMask(clipId, 'rect', {
				shape: [0.5, 0.5, 0.4, 0.4, 0, 0] // 40% centered box
			});
		});

		await page.waitForTimeout(400);

		// Center (0.5, 0.5) should be white (inside mask)
		const center = await readPixelAt(page, 0.5, 0.5);
		expect(center[0]).toBeGreaterThan(200);
		expect(center[1]).toBeGreaterThan(200);
		expect(center[2]).toBeGreaterThan(200);

		// Corner (0.05, 0.05) should be black / background (masked out)
		const corner = await readPixelAt(page, 0.05, 0.05);
		expect(corner[0]).toBeLessThan(30);
		expect(corner[1]).toBeLessThan(30);
		expect(corner[2]).toBeLessThan(30);

		// Invert the mask
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clip = store.getState().project.tracks.flatMap((t: any) => t.clips)[0];
			const maskId = clip.masks[0].id;
			store.getState().updateMask(clip.id, maskId, { inverted: true });
		});

		await page.waitForTimeout(400);

		// Inverted: center should now be black, corner should be white
		const invertedCenter = await readPixelAt(page, 0.5, 0.5);
		expect(invertedCenter[0]).toBeLessThan(30);
		expect(invertedCenter[1]).toBeLessThan(30);
		expect(invertedCenter[2]).toBeLessThan(30);

		const invertedCorner = await readPixelAt(page, 0.05, 0.05);
		expect(invertedCorner[0]).toBeGreaterThan(200);
		expect(invertedCorner[1]).toBeGreaterThan(200);
		expect(invertedCorner[2]).toBeGreaterThan(200);
	});

	test('effect-linked mask modulates effect mix without clipping clip alpha', async ({ page }) => {
		await createProject(page, 'Masks Effect Link');

		// Solid red clip (0.8, 0.1, 0.1) and add Invert effect + effect-linked mask
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clipId = store.getState().addSolidLayer('#cc1a1a');
			const eff = store.getState().addEffect(clipId, 'invert', { amount: 1 });
			store.getState().addMask(clipId, 'rect', {
				shape: [0.3, 0.5, 0.4, 0.8, 0, 0], // covers left side
				effectId: eff.id
			});
		});

		await page.waitForTimeout(400);

		// Left side (0.3, 0.5) has invert effect applied: red inverted to cyan (green/blue > 150)
		const leftPixel = await readPixelAt(page, 0.3, 0.5);
		expect(leftPixel[1]).toBeGreaterThan(150);
		expect(leftPixel[2]).toBeGreaterThan(150);

		// Right side (0.8, 0.5) is outside the effect mask: remains red (red > 150, green/blue < 100)
		// Alpha is NOT clipped, background is NOT revealed!
		const rightPixel = await readPixelAt(page, 0.8, 0.5);
		expect(rightPixel[0]).toBeGreaterThan(150);
		expect(rightPixel[1]).toBeLessThan(100);
		expect(rightPixel[2]).toBeLessThan(100);
	});

	test('adjustment layer with mask only applies effects in the masked region', async ({ page }) => {
		await createProject(page, 'Masks Adjustment Layer');

		// Track 1 (below): Solid green base (0.1, 0.8, 0.1)
		// Track 0 (above): Adjustment layer with Invert effect and a mask on left half
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			store.getState().addTimelineTrack('video');
			const videoTracks = store.getState().project.tracks.filter((t: any) => t.kind === 'video');
			// In TFVE, lower index track in tracks array is rendered on top of higher index track
			const baseTrack = videoTracks[videoTracks.length - 1]!;
			const topTrack = videoTracks[0]!;
			store.getState().addSolidLayer('#1acc1a', baseTrack.id);
			const adjId = store.getState().addAdjustmentLayer(topTrack.id);
			if (adjId) {
				store.getState().addEffect(adjId, 'invert', { amount: 1 });
				store.getState().addMask(adjId, 'rect', {
					shape: [0.25, 0.5, 0.5, 1.0, 0, 0] // left half
				});
			}
		});

		await page.waitForTimeout(400);

		// Left half (0.25, 0.5): Inverted green becomes magenta (red/blue > 150, green < 100)
		const leftPixel = await readPixelAt(page, 0.25, 0.5);
		expect(leftPixel[0]).toBeGreaterThan(150);
		expect(leftPixel[1]).toBeLessThan(100);
		expect(leftPixel[2]).toBeGreaterThan(150);

		// Right half (0.75, 0.5): Outside adjustment mask, stays original green (green > 150)
		const rightPixel = await readPixelAt(page, 0.75, 0.5);
		expect(rightPixel[0]).toBeLessThan(100);
		expect(rightPixel[1]).toBeGreaterThan(150);
		expect(rightPixel[2]).toBeLessThan(100);
	});

	test('allows adding points by clicking along path and precisely dragging points', async ({
		page
	}) => {
		await createProject(page, 'Masks Path Points');

		// Add solid clip and create path mask
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clipId = store.getState().addSolidLayer('#ffffff');
			store.getState().selectClips([clipId]);
			store.getState().addMask(clipId, 'path');
		});

		await page.waitForTimeout(300);

		// Verify initial path mask has 3 points
		const initialCount = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clip = store.getState().project.tracks.flatMap((t: any) => t.clips)[0];
			return clip.masks[0].points.length;
		});
		expect(initialCount).toBe(3);

		// Click on the SVG overlay along the edge to insert a point
		const overlay = page.locator('.mask-canvas-overlay');
		await expect(overlay).toBeVisible();

		// Click along the path edge (at 0.4, 0.5) to insert a 4th point
		const box = await overlay.boundingBox();
		expect(box).not.toBeNull();
		const clickX = box!.x + box!.width * 0.4;
		const clickY = box!.y + box!.height * 0.5;
		await page.mouse.click(clickX, clickY);

		await page.waitForTimeout(300);

		// Check points count increased to 4
		const updatedCount = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clip = store.getState().project.tracks.flatMap((t: any) => t.clips)[0];
			return clip.masks[0].points.length;
		});
		expect(updatedCount).toBe(4);

		// Drag the newly created point down by 50px
		await page.mouse.move(clickX, clickY);
		await page.mouse.down();
		await page.mouse.move(clickX, clickY + 50, { steps: 5 });
		await page.mouse.up();

		await page.waitForTimeout(300);

		// Verify point moved smoothly without runaway offset
		const movedY = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clip = store.getState().project.tracks.flatMap((t: any) => t.clips)[0];
			const selectedIdx = store.getState().maskTool.selectedPointIndex;
			return clip.masks[0].points[selectedIdx ?? 2].y;
		});
		expect(movedY).toBeGreaterThan(0.5);
		expect(movedY).toBeLessThan(0.95);
	});

	test('allows resizing and moving rectangle and ellipse masks using mouse handles without floating toolbar', async ({
		page
	}) => {
		await createProject(page, 'Masks Resize Shapes');

		// 1. Verify floating toolbar is NOT present on the screen
		const toolbar = page.locator('.mask-monitor-toolbar');
		await expect(toolbar).toHaveCount(0);

		// Add solid clip and create rect mask
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clipId = store.getState().addSolidLayer('#ffffff');
			store.getState().selectClips([clipId]);
			store.getState().addMask(clipId, 'rect', {
				shape: [0.5, 0.5, 0.4, 0.4, 0, 0]
			});
		});

		await page.waitForTimeout(300);

		// Floating toolbar should still NOT exist
		await expect(toolbar).toHaveCount(0);

		const overlay = page.locator('.mask-canvas-overlay');
		await expect(overlay).toBeVisible();
		const box = await overlay.boundingBox();
		expect(box).not.toBeNull();

		// Bottom-right corner of rect is at (0.5 + 0.2, 0.5 + 0.2) = (0.7, 0.7)
		const cornerX = box!.x + box!.width * 0.7;
		const cornerY = box!.y + box!.height * 0.7;

		// Drag bottom-right corner outwards by 30px
		await page.mouse.move(cornerX, cornerY);
		await page.mouse.down();
		await page.mouse.move(cornerX + 30, cornerY + 30, { steps: 5 });
		await page.mouse.up();

		await page.waitForTimeout(300);

		// Verify width and height of rect increased
		const updatedRect = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clip = store.getState().project.tracks.flatMap((t: any) => t.clips)[0];
			return clip.masks[0].shape;
		});
		expect(updatedRect[2]).toBeGreaterThan(0.42); // width increased
		expect(updatedRect[3]).toBeGreaterThan(0.42); // height increased

		// Add ellipse mask
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clip = store.getState().project.tracks.flatMap((t: any) => t.clips)[0];
			store.getState().addMask(clip.id, 'ellipse', {
				shape: [0.5, 0.5, 0.2, 0.2, 0]
			});
		});

		await page.waitForTimeout(300);

		// Right cardinal handle of ellipse is at (0.5 + 0.2, 0.5) = (0.7, 0.5)
		const rightHandleX = box!.x + box!.width * 0.7;
		const rightHandleY = box!.y + box!.height * 0.5;

		// Drag right handle outwards by 30px
		await page.mouse.move(rightHandleX, rightHandleY);
		await page.mouse.down();
		await page.mouse.move(rightHandleX + 30, rightHandleY, { steps: 5 });
		await page.mouse.up();

		await page.waitForTimeout(300);

		// Verify rx increased
		const updatedEllipse = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const clip = store.getState().project.tracks.flatMap((t: any) => t.clips)[0];
			return clip.masks[1].shape;
		});
		expect(updatedEllipse[2]).toBeGreaterThan(0.21); // rx increased
	});
});
