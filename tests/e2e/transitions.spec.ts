import { expect, test } from '@playwright/test';

test.describe('Gate K: Transitions Verification', () => {
	test('1. Core transitions rendering across all shaders', async ({ page }) => {
		await page.goto('/editor');

		const result = await page.evaluate(async () => {
			// @ts-ignore
			const { ShaderPassManager } = await import('/src/editor/services/render/passes/ShaderPass.ts');
			// @ts-ignore
			const { FboPool } = await import('/src/editor/services/render/passes/FboPool.ts');
			// @ts-ignore
			const { TRANSITION_DEFINITIONS } = await import('/src/editor/core/transitionsRegistry.ts');

			const canvas = document.createElement('canvas');
			canvas.width = 640;
			canvas.height = 360;
			const gl = canvas.getContext('webgl2');
			if (!gl) return { transitionTypes: [], testResults: {} };

			// Test shader pass execution on all transitions
			const transitionTypes = Object.keys(TRANSITION_DEFINITIONS);
			const shaderPass = new ShaderPassManager(gl);
			const fboPool = new FboPool(gl);

			const testResults: Record<string, boolean> = {};

			// Render a solid red and solid blue texture
			const redFbo = fboPool.acquire(640, 360);
			const blueFbo = fboPool.acquire(640, 360);
			const targetFbo = fboPool.acquire(640, 360);
			gl.bindFramebuffer(gl.FRAMEBUFFER, redFbo.framebuffer);
			gl.viewport(0, 0, 640, 360);
			gl.clearColor(1, 0, 0, 1);
			gl.clear(gl.COLOR_BUFFER_BIT);

			gl.bindFramebuffer(gl.FRAMEBUFFER, blueFbo.framebuffer);
			gl.viewport(0, 0, 640, 360);
			gl.clearColor(0, 0, 1, 1);
			gl.clear(gl.COLOR_BUFFER_BIT);

			for (const tType of transitionTypes) {
				try {
					shaderPass.applyTransition(
						tType,
						redFbo.texture,
						blueFbo.texture,
						0.5,
						{},
						targetFbo.framebuffer,
						640,
						360
					);

					// Read back center pixel
					const pixel = new Uint8Array(4);
					gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo.framebuffer);
					gl.readPixels(320, 180, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

					// Verify not completely transparent
					testResults[tType] = pixel[3] > 0;
				} catch (e) {
					testResults[tType] = false;
				}
			}

			fboPool.release(redFbo);
			fboPool.release(blueFbo);
			fboPool.release(targetFbo);
			shaderPass.dispose();

			return {
				transitionTypes,
				testResults
			};
		});

		console.log('TRANSITIONS_SHADER_RESULTS', JSON.stringify(result.testResults));
		for (const tType of result.transitionTypes) {
			expect(result.testResults[tType]).toBe(true);
		}
	});

	test('2. Timeline and Inspector UI interaction with Transitions', async ({ page }) => {
		await page.goto('/editor');
		const manager = page.locator('.project-manager-dialog');
		try {
			await manager.waitFor({ state: 'visible', timeout: 5000 });
			await manager.getByRole('button', { name: 'New project' }).click();
			const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
			await createDialog.getByRole('textbox', { name: 'Project name' }).fill('E2E Transitions');
			await createDialog.getByRole('button', { name: 'Create project' }).click();
			await expect(manager).not.toBeVisible();
		} catch {}

		// Verify Effects Library has Transitions category
		const effectsTab = page.locator('#effects-panel-title');
		if (await effectsTab.isVisible()) {
			await effectsTab.click();
			const transBtn = page.locator('.effects-cat-btn', { hasText: 'Transitions' });
			await expect(transBtn).toBeVisible();
			await transBtn.click();
			const crossDissolveItem = page.locator('.effect-card', { hasText: 'Cross Dissolve' });
			await expect(crossDissolveItem).toBeVisible();
		}

		// Ensure store has transition actions
		await page.waitForFunction(() => Boolean((window as any).__TFVE_STORE__));

		const storeValid = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			return {
				hasAddTransition: typeof store?.getState?.().addTransition === 'function',
				hasUpdateTransition: typeof store?.getState?.().updateTransition === 'function',
				hasRemoveTransition: typeof store?.getState?.().removeTransition === 'function',
				hasApplyDefaultTransition: typeof store?.getState?.().applyDefaultTransition === 'function'
			};
		});

		expect(storeValid.hasAddTransition).toBe(true);
		expect(storeValid.hasUpdateTransition).toBe(true);
		expect(storeValid.hasRemoveTransition).toBe(true);
		expect(storeValid.hasApplyDefaultTransition).toBe(true);
	});

	test('3. GlCompositor full-canvas transition rendering (verifying full canvas coverage)', async ({
		page
	}) => {
		await page.goto('/editor');

		const renderResult = await page.evaluate(async () => {
			// @ts-ignore
			const { GlCompositor } = await import('/src/editor/services/render/GlCompositor.ts');

			const canvas = document.createElement('canvas');
			canvas.width = 320;
			canvas.height = 180;
			const compositor = new GlCompositor(canvas);

			const redSolidLayer = {
				clipId: 'clip-red',
				trackId: 'track-1',
				trackOrder: 0,
				sourceTime: 0,
				kind: 'solid' as const,
				solidColor: { r: 1, g: 0, b: 0, a: 1 },
				opacity: 1
			};

			const blueSolidLayer = {
				clipId: 'clip-blue',
				trackId: 'track-1',
				trackOrder: 0,
				sourceTime: 0,
				kind: 'solid' as const,
				solidColor: { r: 0, g: 0, b: 1, a: 1 },
				opacity: 1
			};

			const transitionLayer = {
				clipId: 'clip-red',
				trackId: 'track-1',
				trackOrder: 0,
				sourceTime: 0,
				kind: 'solid' as const,
				opacity: 1,
				transition: {
					type: 'crossDissolve' as const,
					progress: 0.5,
					fromLayer: redSolidLayer,
					toLayer: blueSolidLayer,
					params: {}
				}
			};

			const frameProvider = () => null;
			const rendered = compositor.render({ width: 320, height: 180 }, [transitionLayer], frameProvider);

			// Read pixels from center (160, 90), top-right (300, 20), bottom-left (20, 160)
			const gl = (canvas.getContext('webgl2') || (canvas as any).gl) as WebGL2RenderingContext;
			const pixelsCenter = new Uint8Array(4);
			const pixelsTopRight = new Uint8Array(4);
			const pixelsBottomLeft = new Uint8Array(4);

			gl.readPixels(160, 90, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelsCenter);
			gl.readPixels(300, 20, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelsTopRight);
			gl.readPixels(20, 160, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelsBottomLeft);

			compositor.dispose();

			return {
				rendered,
				center: Array.from(pixelsCenter),
				topRight: Array.from(pixelsTopRight),
				bottomLeft: Array.from(pixelsBottomLeft)
			};
		});

		expect(renderResult.rendered).toBe(true);
		// Center pixel should be purple (mix of red ~128 and blue ~128, with ~255 alpha)
		expect(renderResult.center[0]).toBeGreaterThan(80);
		expect(renderResult.center[2]).toBeGreaterThan(80);
		expect(renderResult.center[3]).toBe(255);

		// Top-right and bottom-left must ALSO be full-frame transitioned pixels, NOT black or transparent!
		expect(renderResult.topRight[0]).toBeGreaterThan(80);
		expect(renderResult.topRight[2]).toBeGreaterThan(80);
		expect(renderResult.topRight[3]).toBe(255);

		expect(renderResult.bottomLeft[0]).toBeGreaterThan(80);
		expect(renderResult.bottomLeft[2]).toBeGreaterThan(80);
		expect(renderResult.bottomLeft[3]).toBe(255);
	});

	test('4. Canvas2D transition rendering parity', async ({ page }) => {
		await page.goto('/editor');

		const renderResult = await page.evaluate(async () => {
			// @ts-ignore
			const { Canvas2DRenderer } = await import('/src/editor/services/render/GlCompositor.ts');

			const canvas = document.createElement('canvas');
			canvas.width = 320;
			canvas.height = 180;
			const ctx = canvas.getContext('2d')!;
			const renderer = new Canvas2DRenderer(ctx, {
				kind: 'canvas2d',
				frames: 0,
				lastFrameMs: 0,
				maxFrameMs: 0,
				totalFrameMs: 0,
				drawCalls: 0,
				texturesCreated: 0,
				texturesDeleted: 0,
				textureUploads: 0
			});

			const redSolidLayer = {
				clipId: 'clip-red',
				trackId: 'track-1',
				trackOrder: 0,
				sourceTime: 0,
				kind: 'solid' as const,
				solidColor: { r: 1, g: 0, b: 0, a: 1 },
				opacity: 1
			};

			const blueSolidLayer = {
				clipId: 'clip-blue',
				trackId: 'track-1',
				trackOrder: 0,
				sourceTime: 0,
				kind: 'solid' as const,
				solidColor: { r: 0, g: 0, b: 1, a: 1 },
				opacity: 1
			};

			const transitionLayer = {
				clipId: 'clip-red',
				trackId: 'track-1',
				trackOrder: 0,
				sourceTime: 0,
				kind: 'solid' as const,
				opacity: 1,
				transition: {
					type: 'crossDissolve' as const,
					progress: 0.5,
					fromLayer: redSolidLayer,
					toLayer: blueSolidLayer,
					params: {}
				}
			};

			const frameProvider = () => null;
			const rendered = renderer.render({ width: 320, height: 180 }, [transitionLayer], frameProvider);

			const imgData = ctx.getImageData(160, 90, 1, 1).data;
			const imgDataCorner = ctx.getImageData(300, 20, 1, 1).data;

			return {
				rendered,
				center: Array.from(imgData),
				corner: Array.from(imgDataCorner)
			};
		});

		expect(renderResult.rendered).toBe(true);
		expect(renderResult.center[0]).toBeGreaterThan(50);
		expect(renderResult.center[2]).toBeGreaterThan(80);
		expect(renderResult.center[3]).toBe(255);

		expect(renderResult.corner[0]).toBeGreaterThan(50);
		expect(renderResult.corner[2]).toBeGreaterThan(80);
		expect(renderResult.corner[3]).toBe(255);
	});

	test('5. Timeline export with active transitions produces valid encoded video', async ({ page }) => {
		await page.goto('/editor');

		const exportResult = await page.evaluate(async () => {
			// @ts-ignore
			const { exportTimeline } = await import('/src/editor/services/export/exporter.ts');
			// @ts-ignore
			const { createEmptyProject, insertClip } = await import('/src/editor/core/index.ts');

			let proj = createEmptyProject({ name: 'Transition Export Test' });
			proj = {
				...proj,
				settings: {
					...proj.settings,
					fps: 30,
					width: 320,
					height: 180
				}
			};

			const videoTrack = proj.tracks.find((t: any) => t.kind === 'video')!;
			const clip1Id = 'clip_solid_1';
			const clip2Id = 'clip_solid_2';

			// Two 1-second clips placed back-to-back: [0, 1_000_000] and [1_000_000, 2_000_000]
			proj = insertClip(proj, videoTrack.id, {
				id: clip1Id,
				start: 0,
				duration: 1_000_000,
				source: { type: 'solid', color: { r: 1, g: 0, b: 0, a: 1 } }
			});

			proj = insertClip(proj, videoTrack.id, {
				id: clip2Id,
				start: 1_000_000,
				duration: 1_000_000,
				source: { type: 'solid', color: { r: 0, g: 0, b: 1, a: 1 } }
			});

			// Add a cut transition of 600,000 us centered at 1_000_000
			const trackWithTrans = {
				...proj.tracks.find((t: any) => t.id === videoTrack.id)!,
				transitions: [
					{
						id: 'tr_test',
						type: 'crossDissolve',
						duration: 600_000,
						alignment: 'center',
						edge: {
							kind: 'cut',
							fromClipId: clip1Id,
							toClipId: clip2Id
						},
						params: {}
					}
				]
			};

			proj = {
				...proj,
				tracks: proj.tracks.map((t: any) => (t.id === videoTrack.id ? trackWithTrans : t))
			};

			// @ts-ignore
			const { createExportSinkForTarget } = await import('/src/editor/services/export/sink.ts');
			const sink = createExportSinkForTarget('webm', null);

			let framesCompleted = 0;

			const result = await exportTimeline(
				proj,
				{
					filename: 'test-transition.webm',
					format: 'webm',
					width: 320,
					height: 180,
					fps: 30,
					videoBitrate: 500_000,
					audio: false,
					audioBitrate: 64_000,
					range: 'timeline'
				},
				{
					forceMainThread: true,
					sink,
					onProgress: (p: any) => {
						framesCompleted = p.framesDone;
					}
				}
			);

			return {
				success: true,
				totalFrames: result.plan.totalFrames,
				framesCompleted,
				blobSize: result.blob?.size ?? 0
			};
		});

		expect(exportResult.success).toBe(true);
		expect(exportResult.totalFrames).toBe(60);
		expect(exportResult.framesCompleted).toBe(60);
		expect(exportResult.blobSize).toBeGreaterThan(0);
	});

	test('6. User workflow: playhead transition apply, drop replacement, and Inspector parameter editing', async ({
		page
	}) => {
		await page.goto('/editor');
		const manager = page.locator('.project-manager-dialog');
		try {
			await manager.waitFor({ state: 'visible', timeout: 5000 });
			await manager.getByRole('button', { name: 'New project' }).click();
			const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
			await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Workflow Transitions');
			await createDialog.getByRole('button', { name: 'Create project' }).click();
			await expect(manager).not.toBeVisible();
		} catch {}

		await page.waitForSelector('.timeline-track-lane');

		// Insert two solid clips back-to-back at 0s and 5s
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			store.getState().setPlayhead(0);
			store.getState().addSolidLayer();
			store.getState().setPlayhead(5_000_000);
			store.getState().addSolidLayer();
			store.getState().selectClips([]);
			store.getState().setPlayhead(5_000_000); // Playhead at cut
		});

		// Open Effects panel and double-click Digital Glitch
		const effectsTab = page.locator('#effects-panel-title');
		await expect(effectsTab).toBeVisible();
		await effectsTab.click();

		const transTab = page.locator('.effects-cat-btn', { hasText: 'Transitions' });
		await expect(transTab).toBeVisible();
		await transTab.click();

		const glitchCard = page.locator('.effect-card', { hasText: 'Digital Glitch' });
		await expect(glitchCard).toBeVisible();
		await glitchCard.dblclick();

		// Transition block appears on timeline
		const transBlock = page.locator('.timeline-transition-block');
		await expect(transBlock).toHaveCount(1);
		await expect(transBlock).toContainText('Digital Glitch');

		// Select transition block to open Transition Inspector
		await transBlock.first().click();
		const inspectorTitle = page.locator('.inspector-section-title', {
			hasText: 'Transition Settings'
		});
		await expect(inspectorTitle).toBeVisible();

		// Change type to Venetian Blinds in Inspector dropdown
		const typeSelect = page.locator('.property-select').first();
		await typeSelect.selectOption('blinds');

		await expect(transBlock).toContainText('Venetian Blinds');

		// Drop replacing with Linear Wipe
		const clip1Box = await page.locator('.timeline-clip').first().boundingBox();
		expect(clip1Box).not.toBeNull();
		const targetX = clip1Box!.x + clip1Box!.width;

		await page.evaluate((clientX) => {
			const trackLaneEl = document.querySelector('[data-track-lane]') as HTMLDivElement;
			const dt = new DataTransfer();
			dt.setData('application/x-tfve-transition', 'wipe');

			const dropEvent = new DragEvent('drop', {
				bubbles: true,
				cancelable: true,
				clientX,
				clientY: 100,
				dataTransfer: dt
			});
			trackLaneEl.dispatchEvent(dropEvent);
		}, targetX);

		// Exactly one transition on track (clean replacement, no duplicates)
		await expect(transBlock).toHaveCount(1);
		await expect(transBlock).toContainText('Wipe');
	});
});
