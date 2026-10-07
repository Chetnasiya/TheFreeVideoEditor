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
});
