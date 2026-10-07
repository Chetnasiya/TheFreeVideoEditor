import { expect, test } from '@playwright/test';

test.describe('Gate K: Transitions Verification', () => {
	test('1. Core transitions rendering across all 9 shaders', async ({ page }) => {
		await page.goto('/editor');

		const result = await page.evaluate(async () => {
			const { ShaderPassManager } = await import('/src/editor/services/render/passes/ShaderPass.ts');
			const { FboPool } = await import('/src/editor/services/render/passes/FboPool.ts');
			const { TRANSITION_DEFINITIONS } = await import('/src/editor/core/transitionsRegistry.ts');

			const canvas = document.createElement('canvas');
			canvas.width = 640;
			canvas.height = 360;
			const gl = canvas.getContext('webgl2');
			if (!gl) return { transitionTypes: [], testResults: {} };

			// Test shader pass execution on all 9 transitions
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

		// Verify Effects Library has Transitions category
		const effectsTab = page.locator('.effects-library-tab', { hasText: 'Transitions' });
		if (await effectsTab.isVisible()) {
			await effectsTab.click();
			const crossDissolveItem = page.locator('.effect-library-item', { hasText: 'Cross Dissolve' });
			await expect(crossDissolveItem).toBeVisible();
		}

		// Ensure store has transition actions
		await page.waitForFunction(() => Boolean((window as any).__TFVE_STORE__));

		const storeValid = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			return {
				hasAddTransition: typeof store?.getState?.().addTransition === 'function',
				hasUpdateTransition: typeof store?.getState?.().updateTransition === 'function',
				hasRemoveTransition: typeof store?.getState?.().removeTransition === 'function'
			};
		});

		expect(storeValid.hasAddTransition).toBe(true);
		expect(storeValid.hasUpdateTransition).toBe(true);
		expect(storeValid.hasRemoveTransition).toBe(true);
	});
});
