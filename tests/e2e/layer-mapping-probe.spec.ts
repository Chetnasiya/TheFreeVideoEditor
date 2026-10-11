import { expect, test } from '@playwright/test';

test('Step 0: pixel probe validates layerAffine against Canvas2D and WebGL2 centroids', async ({
	page
}) => {
	await page.goto('/editor');
	await page.waitForLoadState('domcontentloaded');

	const results = await page.evaluate(async () => {
		const path = (name: string) => `/src/editor/${name}`;
		const { renderFrame } = (await import(
			/* @vite-ignore */ path('services/playback/compositor.ts')
		)) as typeof import('../../src/editor/services/playback/compositor');
		const { GlCompositor } = (await import(
			/* @vite-ignore */ path('services/render/index.ts')
		)) as typeof import('../../src/editor/services/render');
		const { layerAffine, applyAffine } = (await import(
			/* @vite-ignore */ path('core/layerGeometry.ts')
		)) as typeof import('../../src/editor/core/layerGeometry');
		type ActiveLayer = import('../../src/editor/core/playback').ActiveLayer;

		const compW = 640;
		const compH = 360;
		const srcW = 320;
		const srcH = 180;

		// Create a synthetic source texture with black background and a single white 10x10 dot at (srcX, srcY)
		function makeMarkerSource(
			w: number,
			h: number,
			dotCenterX: number,
			dotCenterY: number,
			dotRadius = 4
		): OffscreenCanvas {
			const canvas = new OffscreenCanvas(w, h);
			const ctx = canvas.getContext('2d')!;
			ctx.fillStyle = '#000000';
			ctx.fillRect(0, 0, w, h);
			ctx.fillStyle = '#ffffff';
			ctx.beginPath();
			ctx.arc(dotCenterX, dotCenterY, dotRadius, 0, Math.PI * 2);
			ctx.fill();
			return canvas;
		}

		// Helper to compute centroid of white pixels in image data
		function findMarkerCentroid(
			data: Uint8ClampedArray | Uint8Array,
			width: number,
			height: number,
			threshold = 200
		): { x: number; y: number } | null {
			let totalWeight = 0;
			let sumX = 0;
			let sumY = 0;
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					const r = data[idx]!;
					const g = data[idx + 1]!;
					const b = data[idx + 2]!;
					const val = (r + g + b) / 3;
					if (val >= threshold) {
						totalWeight += val;
						sumX += x * val;
						sumY += y * val;
					}
				}
			}
			if (totalWeight === 0) return null;
			return { x: sumX / totalWeight, y: sumY / totalWeight };
		}

		const testCases: Array<{
			name: string;
			layer: ActiveLayer;
			markerSrcNorm: { x: number; y: number };
			uCropped: number;
			vCropped: number;
		}> = [
			{
				name: 'identity-contain',
				layer: {
					clipId: 'c1' as ActiveLayer['clipId'],
					kind: 'video',
					trackId: 't1' as ActiveLayer['trackId'],
					trackOrder: 0,
					opacity: 1,
					sourceTime: 0,
					fit: 'contain'
				},
				markerSrcNorm: { x: 0.3, y: 0.4 },
				uCropped: 0.3,
				vCropped: 0.4
			},
			{
				name: 'translate-scale-rotate-anchor',
				layer: {
					clipId: 'c2' as ActiveLayer['clipId'],
					kind: 'video',
					trackId: 't1' as ActiveLayer['trackId'],
					trackOrder: 0,
					opacity: 1,
					sourceTime: 0,
					transform: {
						x: 30,
						y: -20,
						scaleX: 1.4,
						scaleY: 1.1,
						rotation: 25,
						opacity: 1
					},
					anchor: { x: 15, y: -10 },
					fit: 'contain'
				},
				markerSrcNorm: { x: 0.6, y: 0.5 },
				uCropped: 0.6,
				vCropped: 0.5
			},
			{
				name: 'crop-rotate-anchor',
				layer: {
					clipId: 'c3' as ActiveLayer['clipId'],
					kind: 'video',
					trackId: 't1' as ActiveLayer['trackId'],
					trackOrder: 0,
					opacity: 1,
					sourceTime: 0,
					transform: {
						x: -15,
						y: 25,
						scaleX: 1.2,
						scaleY: 1.2,
						rotation: -30,
						opacity: 1
					},
					anchor: { x: -20, y: 10 },
					crop: [0.1, 0.15, 0.1, 0.15],
					fit: 'contain'
				},
				markerSrcNorm: { x: 0.5, y: 0.5 },
				uCropped: 0.5,
				vCropped: 0.5
			},
			{
				name: 'fit-none-text-like',
				layer: {
					clipId: 'c4' as ActiveLayer['clipId'],
					kind: 'video',
					trackId: 't1' as ActiveLayer['trackId'],
					trackOrder: 0,
					opacity: 1,
					sourceTime: 0,
					transform: {
						x: 10,
						y: 15,
						scaleX: 1,
						scaleY: 1,
						rotation: 10,
						opacity: 1
					},
					fit: 'none'
				},
				markerSrcNorm: { x: 0.4, y: 0.6 },
				uCropped: 0.4,
				vCropped: 0.6
			}
		];

		const caseReports: Array<{
			name: string;
			expected: { x: number; y: number };
			c2dCentroid: { x: number; y: number } | null;
			glCentroid: { x: number; y: number } | null;
			c2dError: number;
			glError: number;
		}> = [];

		// Create GL canvas and compositor
		const glCanvas = document.createElement('canvas');
		glCanvas.width = compW;
		glCanvas.height = compH;
		const glComp = new GlCompositor(glCanvas);

		// Create C2D canvas
		const c2dCanvas = document.createElement('canvas');
		c2dCanvas.width = compW;
		c2dCanvas.height = compH;
		const c2dCtx = c2dCanvas.getContext('2d')!;

		for (const tc of testCases) {
			const dotX = tc.markerSrcNorm.x * srcW;
			const dotY = tc.markerSrcNorm.y * srcH;
			const srcCanvas = makeMarkerSource(srcW, srcH, dotX, dotY, 4);

			// Expected position via layerAffine
			const affine = layerAffine(tc.layer, srcW, srcH, compW, compH);
			const expected = applyAffine(affine, tc.uCropped, tc.vCropped);

			// Render C2D
			c2dCtx.clearRect(0, 0, compW, compH);
			renderFrame(c2dCtx, { width: compW, height: compH }, [tc.layer], () => srcCanvas);
			const c2dData = c2dCtx.getImageData(0, 0, compW, compH).data;
			const c2dCentroid = findMarkerCentroid(c2dData, compW, compH);

			// Render WebGL2
			glComp.render({ width: compW, height: compH }, [tc.layer], () => srcCanvas);
			const gl = glCanvas.getContext('webgl2')!;
			const glPixels = new Uint8Array(compW * compH * 4);
			gl.readPixels(0, 0, compW, compH, gl.RGBA, gl.UNSIGNED_BYTE, glPixels);
			// Gl readPixels is row-inverted (bottom-up), flip Y to match canvas 0-at-top
			const glFlipped = new Uint8Array(glPixels.length);
			for (let y = 0; y < compH; y++) {
				const srcRow = (compH - 1 - y) * compW * 4;
				const dstRow = y * compW * 4;
				glFlipped.set(glPixels.subarray(srcRow, srcRow + compW * 4), dstRow);
			}
			const glCentroid = findMarkerCentroid(glFlipped, compW, compH);

			const c2dDist = c2dCentroid
				? Math.hypot(c2dCentroid.x - expected.x, c2dCentroid.y - expected.y)
				: 999;
			const glDist = glCentroid
				? Math.hypot(glCentroid.x - expected.x, glCentroid.y - expected.y)
				: 999;

			caseReports.push({
				name: tc.name,
				expected,
				c2dCentroid,
				glCentroid,
				c2dError: c2dDist,
				glError: glDist
			});
		}

		glComp.dispose();
		return caseReports;
	});

	console.log('LAYER_MAPPING_PIXEL_PROBE_RESULTS', JSON.stringify(results));
	for (const r of results) {
		expect(r.c2dCentroid).not.toBeNull();
		expect(r.glCentroid).not.toBeNull();
		// Tolerance is <= 1.0 px due to subpixel bilinear rasterization of a 4px circular dot
		expect(r.c2dError).toBeLessThanOrEqual(1.0);
		expect(r.glError).toBeLessThanOrEqual(1.0);
	}
});
