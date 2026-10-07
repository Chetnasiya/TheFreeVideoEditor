import { expect, test } from '@playwright/test';

test.describe('Gate J — Functional Pipeline Verification', () => {
	test('renders Color Correction, Curves, Chroma Key, Adjustment Layers, and Starter Effects with real pixel changes', async ({
		page
	}) => {
		page.on('console', (msg) => console.log('PAGE:', msg.text()));
		await page.goto('/editor');

		const results = await page.evaluate(async () => {
			const renderPath = '/src/editor/services/render/index.ts';
			const render = (await import(
				/* @vite-ignore */ renderPath
			)) as unknown as typeof import('../../src/editor/services/render/index');
			type Layer = import('../../src/editor/core/playback').ActiveLayer;

			const W = 128;
			const H = 128;

			// Helper to make solid color canvas
			const makeSource = (r: number, g: number, b: number, a = 1): OffscreenCanvas => {
				const canvas = new OffscreenCanvas(W, H);
				const ctx = canvas.getContext('2d')!;
				ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
				ctx.fillRect(0, 0, W, H);
				return canvas;
			};

			const sources: Record<string, OffscreenCanvas> = {
				gray: makeSource(128, 128, 128),
				green: makeSource(0, 220, 0),
				red: makeSource(220, 30, 30),
				white: makeSource(255, 255, 255)
			};

			const canvas = document.createElement('canvas');
			canvas.width = W;
			canvas.height = H;

			const renderer = render.createFrameRenderer(canvas, {
				preserveDrawingBuffer: true
			}) as import('../../src/editor/services/render').FrameRenderer;

			const provider = (layer: Layer) => (layer.assetId ? sources[layer.assetId] ?? null : null);
			const size = { width: W, height: H };

			const readPixel = (x: number, y: number): number[] => {
				const copy = document.createElement('canvas');
				copy.width = W;
				copy.height = H;
				const ctx = copy.getContext('2d', { willReadFrequently: true })!;
				ctx.drawImage(canvas, 0, 0);
				return Array.from(ctx.getImageData(x, y, 1, 1).data);
			};

			const renderLogs: any[] = [];
			const doRender = (label: string, layers: any[]) => {
				try {
					const ok = renderer.render(size, layers, provider);
					renderLogs.push({ label, ok });
				} catch (err: any) {
					renderLogs.push({ label, error: err?.message || String(err), stack: err?.stack });
				}
			};

			// 1. Baseline: gray without effects
			doRender('baseline', [
				{
					clipId: 'c1' as any,
					assetId: 'gray' as any,
					trackId: 't1' as any,
					trackOrder: 0,
					sourceTime: 0,
					kind: 'image',
					opacity: 1,
					transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }
				}
			]);
			const baselineGray = readPixel(W / 2, H / 2);

			// 2. Color Correction: Exposure boost
			doRender('exposure', [
				{
					clipId: 'c1' as any,
					assetId: 'gray' as any,
					trackId: 't1' as any,
					trackOrder: 0,
					sourceTime: 0,
					kind: 'image',
					opacity: 1,
					transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
					effects: [
						{
							id: 'e_cc',
							type: 'colorCorrection',
							enabled: true,
							params: {
								exposure: 0.5,
								contrast: 0,
								highlights: 0,
								shadows: 0,
								whites: 0,
								blacks: 0,
								temperature: 0,
								tint: 0,
								saturation: 0,
								vibrance: 0,
								liftR: 0,
								liftG: 0,
								liftB: 0,
								gammaR: 0,
								gammaG: 0,
								gammaB: 0,
								gainR: 0,
								gainG: 0,
								gainB: 0,
								mix: 1
							},
							isNeutral: false
						}
					]
				}
			]);
			const exposureBoostGray = readPixel(W / 2, H / 2);

			// 2b. Color Correction: Lift, Gamma, Gain wheels (tint shadows green, highlights magenta)
			doRender('wheels', [
				{
					clipId: 'c1' as any,
					assetId: 'gray' as any,
					trackId: 't1' as any,
					trackOrder: 0,
					sourceTime: 0,
					kind: 'image',
					opacity: 1,
					transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
					effects: [
						{
							id: 'e_wheels',
							type: 'colorCorrection',
							enabled: true,
							params: {
								exposure: 0,
								contrast: 0,
								highlights: 0,
								shadows: 0,
								whites: 0,
								blacks: 0,
								temperature: 0,
								tint: 0,
								saturation: 0,
								vibrance: 0,
								liftR: 0,
								liftG: 0.3,
								liftB: 0,
								gammaR: 0,
								gammaG: 0,
								gammaB: 0,
								gainR: 0.3,
								gainG: -0.2,
								gainB: 0.3,
								mix: 1
							},
							isNeutral: false
						}
					]
				}
			]);
			const wheelsGradedGray = readPixel(W / 2, H / 2);

			// 3. Curves: Boost midtones on master RGB
			doRender('curves', [
				{
					clipId: 'c1' as any,
					assetId: 'gray' as any,
					trackId: 't1' as any,
					trackOrder: 0,
					sourceTime: 0,
					kind: 'image',
					opacity: 1,
					transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
					effects: [
						{
							id: 'e_curves',
							type: 'curves',
							enabled: true,
							params: {
								rgb: [
									{ x: 0, y: 0 },
									{ x: 0.5, y: 0.85 },
									{ x: 1, y: 1 }
								],
								red: [
									{ x: 0, y: 0 },
									{ x: 1, y: 1 }
								],
								green: [
									{ x: 0, y: 0 },
									{ x: 1, y: 1 }
								],
								blue: [
									{ x: 0, y: 0 },
									{ x: 1, y: 1 }
								],
								mix: 1
							},
							isNeutral: false
						}
					]
				}
			]);
			const curvedGray = readPixel(W / 2, H / 2);

			// 4. Chroma Key: Key out green screen
			doRender('chroma', [
				{
					clipId: 'c_green' as any,
					assetId: 'green' as any,
					trackId: 't1' as any,
					trackOrder: 0,
					sourceTime: 0,
					kind: 'image',
					opacity: 1,
					transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
					effects: [
						{
							id: 'e_chroma',
							type: 'chromaKey',
							enabled: true,
							params: {
								color: [0, 0.86, 0],
								tolerance: 0.35,
								softness: 0.1,
								spill: 0.5,
								mix: 1
							},
							isNeutral: false
						}
					]
				}
			]);
			const keyedGreen = readPixel(W / 2, H / 2);

			// 5. Invert starter effect
			doRender('invert', [
				{
					clipId: 'c_white' as any,
					assetId: 'white' as any,
					trackId: 't1' as any,
					trackOrder: 0,
					sourceTime: 0,
					kind: 'image',
					opacity: 1,
					transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
					effects: [
						{
							id: 'e_inv',
							type: 'invert',
							enabled: true,
							params: { amount: 1, mix: 1 },
							isNeutral: false
						}
					]
				}
			]);
			const invertedWhite = readPixel(W / 2, H / 2);

			// 6. Adjustment Layer affecting underlying clip
			// Bottom track: Red clip. Top track: Adjustment Layer with Invert effect.
			doRender('adjustment', [
				{
					clipId: 'c_bottom_red' as any,
					assetId: 'red' as any,
					trackId: 't1' as any,
					trackOrder: 0,
					sourceTime: 0,
					kind: 'image',
					opacity: 1,
					transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }
				},
				{
					clipId: 'c_top_adj' as any,
					trackId: 't2' as any,
					trackOrder: 1,
					sourceTime: 0,
					kind: 'adjustment',
					opacity: 1,
					transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
					effects: [
						{
							id: 'e_adj_inv',
							type: 'invert',
							enabled: true,
							params: { amount: 1, mix: 1 },
							isNeutral: false
						}
					]
				}
			]);
			const adjustmentInvertedRed = readPixel(W / 2, H / 2);

			// 7. Neutral effect bypass check (bit-identical fast path)
			doRender('neutral', [
				{
					clipId: 'c1' as any,
					assetId: 'gray' as any,
					trackId: 't1' as any,
					trackOrder: 0,
					sourceTime: 0,
					kind: 'image',
					opacity: 1,
					transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
					effects: [
						{
							id: 'e_neutral',
							type: 'colorCorrection',
							enabled: true,
							params: { exposure: 0, mix: 1 },
							isNeutral: true
						}
					]
				}
			]);
			const neutralBypassGray = readPixel(W / 2, H / 2);

			renderer.dispose();

			return {
				renderLogs,
				baselineGray,
				exposureBoostGray,
				wheelsGradedGray,
				curvedGray,
				keyedGreen,
				invertedWhite,
				adjustmentInvertedRed,
				neutralBypassGray
			};
		});

		console.log('RESULTS:', JSON.stringify(results));
		// Assertions:
		// 1. Baseline gray is around ~128
		expect(results.baselineGray[0]).toBeGreaterThanOrEqual(120);
		expect(results.baselineGray[0]).toBeLessThanOrEqual(135);

		// 2. Exposure boost significantly increases brightness: A !== B
		expect(results.exposureBoostGray[0]).not.toBe(results.baselineGray[0]);
		expect(results.exposureBoostGray[0]).toBeGreaterThan(results.baselineGray[0] + 50);

		// 2b. Wheels grading changes color channels (Green and Red/Blue altered)
		expect(results.wheelsGradedGray[1]).not.toBe(results.baselineGray[1]);
		expect(results.wheelsGradedGray[0]).not.toBe(results.baselineGray[0]);

		// 3. Curves boosts midtones from ~128 to > 180
		expect(results.curvedGray[0]).not.toBe(results.baselineGray[0]);
		expect(results.curvedGray[0]).toBeGreaterThan(170);

		// 4. Chroma Key: green pixel keyed out (green channel removed from 220 down to < 15)
		expect(results.keyedGreen[1]).toBeLessThan(15);

		// 5. Invert: White [255, 255, 255] inverted to Black [0, 0, 0]
		expect(results.invertedWhite[0]).toBeLessThan(15);
		expect(results.invertedWhite[1]).toBeLessThan(15);
		expect(results.invertedWhite[2]).toBeLessThan(15);

		// 6. Adjustment layer: inverts bottom Red clip to Cyan (Red ~35, Green/Blue > 200)
		expect(results.adjustmentInvertedRed[0]).toBeLessThan(50);
		expect(results.adjustmentInvertedRed[1]).toBeGreaterThan(180);
		expect(results.adjustmentInvertedRed[2]).toBeGreaterThan(180);

		// 7. Neutral effect: bit-identical fast path
		expect(results.neutralBypassGray).toEqual(results.baselineGray);
	});

	test('verifies Film Grain determinism, universal mix parameter, and Vignette falloff', async ({
		page
	}) => {
		await page.goto('/editor');

		const results = await page.evaluate(async () => {
			const renderPath = '/src/editor/services/render/index.ts';
			const render = (await import(
				/* @vite-ignore */ renderPath
			)) as unknown as typeof import('../../src/editor/services/render/index');
			type Layer = import('../../src/editor/core/playback').ActiveLayer;

			const W = 128;
			const H = 128;

			const makeSource = (r: number, g: number, b: number): OffscreenCanvas => {
				const canvas = new OffscreenCanvas(W, H);
				const ctx = canvas.getContext('2d')!;
				ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
				ctx.fillRect(0, 0, W, H);
				return canvas;
			};

			const sources: Record<string, OffscreenCanvas> = {
				white: makeSource(255, 255, 255),
				gray: makeSource(128, 128, 128)
			};

			const canvas = document.createElement('canvas');
			canvas.width = W;
			canvas.height = H;

			const renderer = render.createFrameRenderer(canvas, {
				preserveDrawingBuffer: true
			}) as import('../../src/editor/services/render').FrameRenderer;

			const provider = (layer: Layer) => (layer.assetId ? sources[layer.assetId] ?? null : null);
			const size = { width: W, height: H };

			const readPixel = (x: number, y: number): number[] => {
				const copy = document.createElement('canvas');
				copy.width = W;
				copy.height = H;
				const ctx = copy.getContext('2d', { willReadFrequently: true })!;
				ctx.drawImage(canvas, 0, 0);
				return Array.from(ctx.getImageData(x, y, 1, 1).data);
			};

			// 1. Film grain determinism: render twice at sourceTime = 1000
			const renderGrain = (sourceTime: number) => {
				renderer.render(size, [
					{
						clipId: 'c_grain' as any,
						assetId: 'gray' as any,
						trackId: 't1' as any,
						trackOrder: 0,
						sourceTime,
						kind: 'image',
						opacity: 1,
						transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
						effects: [
							{
								id: 'e_grain',
								type: 'filmGrain',
								enabled: true,
								params: { amount: 0.5, speed: 1.0, colored: false, mix: 1 },
								isNeutral: false
							}
						]
					}
				], provider);
			};

			renderGrain(1000);
			const grainT1000_run1 = readPixel(W / 2, H / 2);
			renderGrain(1000);
			const grainT1000_run2 = readPixel(W / 2, H / 2);
			renderGrain(500000);
			const grainT500000 = readPixel(W / 2, H / 2);

			// 2. Universal mix = 0.5 on Invert (White inverted = Black; mix 0.5 = 128)
			renderer.render(size, [
				{
					clipId: 'c_mix' as any,
					assetId: 'white' as any,
					trackId: 't1' as any,
					trackOrder: 0,
					sourceTime: 0,
					kind: 'image',
					opacity: 1,
					transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
					effects: [
						{
							id: 'e_inv_mix',
							type: 'invert',
							enabled: true,
							params: { amount: 1, mix: 0.5 },
							isNeutral: false
						}
					]
				}
			], provider);
			const mixHalfPixel = readPixel(W / 2, H / 2);

			// 3. Vignette: center should be brighter than corners
			renderer.render(size, [
				{
					clipId: 'c_vig' as any,
					assetId: 'white' as any,
					trackId: 't1' as any,
					trackOrder: 0,
					sourceTime: 0,
					kind: 'image',
					opacity: 1,
					transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
					effects: [
						{
							id: 'e_vig',
							type: 'vignette',
							enabled: true,
							params: { amount: 0.8, radius: 0.4, softness: 0.5, roundness: 1, mix: 1 },
							isNeutral: false
						}
					]
				}
			], provider);
			const vigCenter = readPixel(W / 2, H / 2);
			const vigCorner = readPixel(2, 2);

			renderer.dispose();

			return {
				grainT1000_run1,
				grainT1000_run2,
				grainT500000,
				mixHalfPixel,
				vigCenter,
				vigCorner
			};
		});

		console.log('ORACLE_RESULTS:', JSON.stringify(results));

		// 1. Film grain determinism: identical at same timestamp
		expect(results.grainT1000_run1).toEqual(results.grainT1000_run2);
		// But different at later timestamp
		expect(results.grainT1000_run1).not.toEqual(results.grainT500000);

		// 2. Mix = 0.5 blend oracle: [255] inverted with mix 0.5 equals [128 +/- 3]
		expect(results.mixHalfPixel[0]).toBeGreaterThanOrEqual(125);
		expect(results.mixHalfPixel[0]).toBeLessThanOrEqual(131);

		// 3. Vignette: center is white [255], corner is darkened significantly (< 180)
		expect(results.vigCenter[0]).toBeGreaterThan(240);
		expect(results.vigCorner[0]).toBeLessThan(180);
	});

	test('orientation parity: filters, rotation, and color correction never flip footage/images vertically or horizontally', async ({
		page
	}) => {
		await page.goto('/editor');

		const results = await page.evaluate(async () => {
			const render = await (new Function('return import("/src/editor/services/render/index.ts")')());
			type Layer = any;

			const W = 200;
			const H = 200;

			// Source image: top half (y < H/2) is RED, bottom half (y >= H/2) is BLUE
			const srcCanvas = new OffscreenCanvas(W, H);
			const ctx = srcCanvas.getContext('2d')!;
			ctx.fillStyle = '#ff0000';
			ctx.fillRect(0, 0, W, H / 2);
			ctx.fillStyle = '#0000ff';
			ctx.fillRect(0, H / 2, W, H / 2);

			const canvas = document.createElement('canvas');
			canvas.width = W;
			canvas.height = H;

			const renderer = render.createFrameRenderer(canvas, {
				preserveDrawingBuffer: true
			}) as import('../../src/editor/services/render').FrameRenderer;

			const provider = (_layer: Layer) => srcCanvas;
			const size = { width: W, height: H };

			const readPixel = (x: number, y: number): number[] => {
				const copy = document.createElement('canvas');
				copy.width = W;
				copy.height = H;
				const cctx = copy.getContext('2d', { willReadFrequently: true })!;
				cctx.drawImage(canvas, 0, 0);
				return Array.from(cctx.getImageData(x, y, 1, 1).data);
			};

			const baseLayer: Layer = {
				clipId: 'c_test' as any,
				assetId: 'src' as any,
				trackId: 't1' as any,
				trackOrder: 0,
				sourceTime: 0,
				kind: 'image',
				opacity: 1,
				transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }
			};

			// 1. Fast path (no effects)
			renderer.render(size, [baseLayer], provider);
			const fastTop = readPixel(W / 2, Math.round(H * 0.25));
			const fastBottom = readPixel(W / 2, Math.round(H * 0.75));

			// 2. Color Correction (1-pass shader)
			renderer.render(
				size,
				[
					{
						...baseLayer,
						effects: [
							{
								id: 'e_cc',
								type: 'colorCorrection',
								enabled: true,
								params: { exposure: 0.2, mix: 1 },
								isNeutral: false
							}
						]
					}
				],
				provider
			);
			const ccTop = readPixel(W / 2, Math.round(H * 0.25));
			const ccBottom = readPixel(W / 2, Math.round(H * 0.75));

			// 3. Gaussian Blur (2-pass shader)
			renderer.render(
				size,
				[
					{
						...baseLayer,
						effects: [
							{
								id: 'e_blur',
								type: 'gaussianBlur',
								enabled: true,
								params: { radius: 4, mix: 1 },
								isNeutral: false
							}
						]
					}
				],
				provider
			);
			const blurTop = readPixel(W / 2, Math.round(H * 0.25));
			const blurBottom = readPixel(W / 2, Math.round(H * 0.75));

			// 4. Invert (Red -> Cyan, Blue -> Yellow)
			renderer.render(
				size,
				[
					{
						...baseLayer,
						effects: [
							{
								id: 'e_inv',
								type: 'invert',
								enabled: true,
								params: { amount: 1, mix: 1 },
								isNeutral: false
							}
						]
					}
				],
				provider
			);
			const invTop = readPixel(W / 2, Math.round(H * 0.25));
			const invBottom = readPixel(W / 2, Math.round(H * 0.75));

			// 5. Rotation +90 deg clockwise (no effects): Top (Red) moves to Right, Bottom (Blue) moves to Left
			renderer.render(
				size,
				[
					{
						...baseLayer,
						transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 90, opacity: 1 }
					}
				],
				provider
			);
			const rotLeft = readPixel(Math.round(W * 0.25), H / 2);
			const rotRight = readPixel(Math.round(W * 0.75), H / 2);

			// 6. Rotation +90 deg clockwise WITH Color Correction
			renderer.render(
				size,
				[
					{
						...baseLayer,
						transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 90, opacity: 1 },
						effects: [
							{
								id: 'e_cc_rot',
								type: 'colorCorrection',
								enabled: true,
								params: { exposure: 0.2, mix: 1 },
								isNeutral: false
							}
						]
					}
				],
				provider
			);
			const rotCcLeft = readPixel(Math.round(W * 0.25), H / 2);
			const rotCcRight = readPixel(Math.round(W * 0.75), H / 2);

			renderer.dispose();

			return {
				fastTop,
				fastBottom,
				ccTop,
				ccBottom,
				blurTop,
				blurBottom,
				invTop,
				invBottom,
				rotLeft,
				rotRight,
				rotCcLeft,
				rotCcRight
			};
		});

		console.log('ORIENTATION_RESULTS:', JSON.stringify(results));

		// 1. Fast path: top is RED (r > 200, b < 20), bottom is BLUE (b > 200, r < 20)
		expect(results.fastTop[0]).toBeGreaterThan(200);
		expect(results.fastTop[2]).toBeLessThan(20);
		expect(results.fastBottom[2]).toBeGreaterThan(200);
		expect(results.fastBottom[0]).toBeLessThan(20);

		// 2. Color correction: top must still be RED (r > 200, b < 20), bottom must still be BLUE (b > 200, r < 20)
		expect(results.ccTop[0]).toBeGreaterThan(200);
		expect(results.ccTop[2]).toBeLessThan(20);
		expect(results.ccBottom[2]).toBeGreaterThan(200);
		expect(results.ccBottom[0]).toBeLessThan(20);

		// 3. Gaussian blur: top predominantly red, bottom predominantly blue
		expect(results.blurTop[0]).toBeGreaterThan(150);
		expect(results.blurTop[2]).toBeLessThan(80);
		expect(results.blurBottom[2]).toBeGreaterThan(150);
		expect(results.blurBottom[0]).toBeLessThan(80);

		// 4. Invert: top inverted to Cyan (g,b > 200, r < 20), bottom inverted to Yellow (r,g > 200, b < 20)
		expect(results.invTop[1]).toBeGreaterThan(200);
		expect(results.invTop[2]).toBeGreaterThan(200);
		expect(results.invTop[0]).toBeLessThan(20);
		expect(results.invBottom[0]).toBeGreaterThan(200);
		expect(results.invBottom[1]).toBeGreaterThan(200);
		expect(results.invBottom[2]).toBeLessThan(20);

		// 5. Rotation 90°: left is BLUE (b > 200, r < 20), right is RED (r > 200, b < 20)
		expect(results.rotLeft[2]).toBeGreaterThan(200);
		expect(results.rotLeft[0]).toBeLessThan(20);
		expect(results.rotRight[0]).toBeGreaterThan(200);
		expect(results.rotRight[2]).toBeLessThan(20);

		// 6. Rotation 90° + Color Correction: left is BLUE (b > 200, r < 20), right is RED (r > 200, b < 20)
		expect(results.rotCcLeft[2]).toBeGreaterThan(200);
		expect(results.rotCcLeft[0]).toBeLessThan(20);
		expect(results.rotRight[0]).toBeGreaterThan(200);
		expect(results.rotRight[2]).toBeLessThan(20);
	});
});
