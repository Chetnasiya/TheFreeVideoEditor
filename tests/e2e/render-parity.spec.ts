import { expect, test, type Page } from '@playwright/test';

interface SceneResult {
	name: string;
	maxDiff: number;
	badFraction: number;
	probes: Array<{ label: string; expected: number[]; actual: number[] }>;
}

async function openEditor(page: Page): Promise<void> {
	await page.goto('/editor');
	await expect(page.getByRole('dialog', { name: 'Your Projects' })).toBeVisible();
}

/** Runs every scene through both renderers in the page and returns pixel statistics. */
async function runScenes(page: Page, tolerance: number): Promise<SceneResult[]> {
	return page.evaluate(async (tol) => {
		const path = (name: string) => `/src/editor/${name}`;
		const render = (await import(
			/* @vite-ignore */ path('services/render/index.ts')
		)) as typeof import('../../src/editor/services/render');
		const geometry = (await import(
			/* @vite-ignore */ path('core/layerGeometry.ts')
		)) as typeof import('../../src/editor/core/layerGeometry');
		type Layer = import('../../src/editor/core/playback').ActiveLayer;

		const W = 640;
		const H = 360;

		function pattern(width: number, height: number, alpha = 1): OffscreenCanvas {
			const canvas = new OffscreenCanvas(width, height);
			const context = canvas.getContext('2d')!;
			context.clearRect(0, 0, width, height);
			const colors = ['#e53935', '#43a047', '#1e88e5', '#fdd835'];
			for (let index = 0; index < 4; index += 1) {
				context.fillStyle = colors[index]!;
				context.globalAlpha = alpha;
				context.fillRect(
					(index % 2) * (width / 2),
					Math.floor(index / 2) * (height / 2),
					width / 2,
					height / 2
				);
			}
			context.globalAlpha = 1;
			return canvas;
		}
		function circle(size: number): OffscreenCanvas {
			const canvas = new OffscreenCanvas(size, size);
			const context = canvas.getContext('2d')!;
			context.fillStyle = 'rgba(255,255,255,0.8)';
			context.beginPath();
			context.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
			context.fill();
			return canvas;
		}
		function solid(color: string, width = W, height = H): OffscreenCanvas {
			const canvas = new OffscreenCanvas(width, height);
			const context = canvas.getContext('2d')!;
			context.fillStyle = color;
			context.fillRect(0, 0, width, height);
			return canvas;
		}
		const layer = (id: string, extra: Partial<Layer> = {}): Layer =>
			({
				clipId: id,
				assetId: id,
				trackId: 't',
				trackOrder: 0,
				sourceTime: 0,
				kind: 'image',
				opacity: 1,
				...extra
			}) as Layer;
		const xf = (over: Partial<NonNullable<Layer['transform']>>) => ({
			x: 0,
			y: 0,
			scaleX: 1,
			scaleY: 1,
			rotation: 0,
			opacity: 1,
			...over
		});

		interface Scene {
			name: string;
			layers: Layer[];
			sources: Record<string, OffscreenCanvas>;
			strict: boolean;
			probeSource?: { id: string; width: number; height: number };
		}
		/** Nested sequences (template instances) must composite the same on both renderers. */
		function nestedScenes(): Scene[] {
			const nestedLayer = (
				id: string,
				children: Layer[],
				extra: Partial<Layer> = {},
				size = { width: 320, height: 180 }
			): Layer =>
				layer(id, {
					kind: 'sequence',
					fit: 'none',
					nested: { sequenceId: id as never, nestedTime: 0, size, layers: children },
					...extra
				});
			return [
				{
					name: 'nested-sequence-fit-none',
					layers: [
						layer('bg'),
						nestedLayer('seq', [layer('card'), layer('badge', { transform: xf({ x: 40, scaleX: 0.4, scaleY: 0.4 }) })])
					],
					sources: { bg: solid('#263238'), card: pattern(320, 180), badge: circle(180) },
					strict: false
				},
				{
					name: 'nested-sequence-transformed',
					layers: [
						layer('bg'),
						nestedLayer(
							'seq',
							[layer('card')],
							{ fit: 'contain', transform: xf({ x: 50, y: -30, scaleX: 0.8, scaleY: 0.8, rotation: 12, opacity: 0.85 }) }
						)
					],
					sources: { bg: solid('#3949ab'), card: pattern(320, 180) },
					strict: false
				},
				{
					name: 'nested-sequence-translucent-content',
					layers: [
						layer('bg'),
						nestedLayer('seq', [layer('plate'), layer('badge')], {}, { width: 360, height: 360 })
					],
					sources: { bg: solid('#00897b'), plate: pattern(360, 360, 0.5), badge: circle(360) },
					strict: false
				}
			];
		}

		const scenes: Scene[] = [
			{
				name: 'crop-axis-aligned',
				layers: [layer('a', { crop: [0.25, 0.1, 0.15, 0.2] })],
				sources: { a: pattern(W, H) },
				strict: true
			},
			{
				name: 'crop-scaled-offset',
				layers: [
					layer('a', {
						crop: [0.25, 0.25, 0, 0],
						transform: xf({ x: 40, y: -20, scaleX: 0.5, scaleY: 0.5 })
					})
				],
				sources: { a: pattern(W, H) },
				strict: false
			},
			{
				name: 'crop-rotate-anchor',
				layers: [
					layer('bg'),
					layer('a', {
						crop: [0.1, 0.2, 0.3, 0.1],
						anchor: { x: 30, y: -10 },
						transform: xf({ rotation: 20, scaleX: 0.8, scaleY: 0.8, opacity: 0.9 })
					})
				],
				sources: { bg: solid('#263238'), a: pattern(W, H) },
				strict: false
			},
			{
				name: 'identity-fullframe',
				layers: [layer('a')],
				sources: { a: pattern(W, H) },
				strict: true
			},
			{
				name: 'letterbox-4x3',
				layers: [layer('a')],
				sources: { a: pattern(400, 300) },
				strict: true
			},
			{
				name: 'pillarbox-portrait',
				layers: [layer('a')],
				sources: { a: pattern(300, 600) },
				strict: true
			},
			{
				name: 'translate-scale',
				layers: [layer('a', { transform: xf({ x: 60, y: -40, scaleX: 0.5, scaleY: 0.5 }) })],
				sources: { a: pattern(W, H) },
				strict: false
			},
			{
				name: 'rotate-30',
				layers: [layer('a', { transform: xf({ rotation: 30, scaleX: 0.6, scaleY: 0.6 }) })],
				sources: { a: pattern(W, H) },
				strict: false,
				probeSource: { id: 'a', width: W, height: H }
			},
			{
				name: 'anchor-rotate-90',
				layers: [
					layer('a', {
						transform: xf({ rotation: 90, scaleX: 0.5, scaleY: 0.5 }),
						anchor: { x: 100, y: 50 }
					})
				],
				sources: { a: pattern(W, H) },
				strict: false,
				probeSource: { id: 'a', width: W, height: H }
			},
			{
				name: 'opacity-stack',
				layers: [
					layer('bg'),
					layer('a', { transform: xf({ opacity: 0.5, scaleX: 0.7, scaleY: 0.7 }) })
				],
				sources: { bg: solid('#3949ab'), a: pattern(W, H) },
				strict: false
			},
			{
				name: 'transparent-source-over-color',
				layers: [layer('bg'), layer('c', { transform: xf({ scaleX: 0.8, scaleY: 0.8 }) })],
				sources: { bg: solid('#00897b'), c: circle(360) },
				strict: false
			},
			{
				name: 'semi-transparent-pixels',
				layers: [layer('bg'), layer('a')],
				sources: { bg: solid('#6d4c41'), a: pattern(W, H, 0.5) },
				strict: true
			},
			...(['add', 'multiply', 'screen'] as const).map((mode): Scene => ({
				name: `blend-${mode}`,
				layers: [layer('bg'), layer('a', { blendMode: mode, transform: xf({ opacity: 0.8 }) })],
				sources: { bg: solid('#8d6e63'), a: pattern(W, H) },
				strict: false
			})),
			...nestedScenes(),
			{
				name: 'four-layers',
				layers: [
					layer('a'),
					layer('b', {
						transform: xf({ x: -120, y: -60, scaleX: 0.4, scaleY: 0.4, opacity: 0.9 })
					}),
					layer('c', { transform: xf({ x: 120, y: 60, scaleX: 0.4, scaleY: 0.4, rotation: 15 }) }),
					layer('d', { blendMode: 'screen', transform: xf({ opacity: 0.3 }) })
				],
				sources: {
					a: pattern(W, H),
					b: solid('#ff7043'),
					c: pattern(300, 300),
					d: solid('#303f9f')
				},
				strict: false
			}
		];

		function read(canvas: HTMLCanvasElement | OffscreenCanvas): Uint8ClampedArray {
			const copy = document.createElement('canvas');
			copy.width = W;
			copy.height = H;
			const context = copy.getContext('2d', { willReadFrequently: true })!;
			context.drawImage(canvas, 0, 0);
			return context.getImageData(0, 0, W, H).data;
		}

		const results: SceneResult[] = [];
		for (const scene of scenes) {
			const provider = (item: Layer) => scene.sources[item.clipId] ?? null;
			const reference = document.createElement('canvas');
			reference.width = W;
			reference.height = H;
			const referenceRenderer = render.createFrameRenderer(reference, { forceCanvas2d: true })!;
			referenceRenderer.render({ width: W, height: H }, scene.layers, provider);
			const expected = read(reference);

			const gpu = document.createElement('canvas');
			gpu.width = W;
			gpu.height = H;
			const gpuRenderer = render.createFrameRenderer(gpu, { preserveDrawingBuffer: true })!;
			if (gpuRenderer.kind !== 'webgl2') throw new Error('WebGL2 renderer was not created.');
			gpuRenderer.render({ width: W, height: H }, scene.layers, provider);
			const actual = read(gpu);

			let maxDiff = 0;
			let bad = 0;
			for (let index = 0; index < expected.length; index += 4) {
				let pixelMax = 0;
				for (let channel = 0; channel < 3; channel += 1) {
					pixelMax = Math.max(
						pixelMax,
						Math.abs(expected[index + channel]! - actual[index + channel]!)
					);
				}
				maxDiff = Math.max(maxDiff, pixelMax);
				if (pixelMax > tol) bad += 1;
			}

			const probes: SceneResult['probes'] = [];
			if (scene.probeSource) {
				// Analytic check: the centre of each source quadrant lands where layerAffine says.
				const { width, height } = scene.probeSource;
				const affine = geometry.layerAffine(scene.layers[0]!, width, height, W, H);
				const colors = [
					[229, 57, 53],
					[67, 160, 71],
					[30, 136, 229],
					[253, 216, 53]
				];
				for (const [index, color] of colors.entries()) {
					const point = geometry.applyAffine(
						affine,
						0.25 + (index % 2) * 0.5,
						0.25 + Math.floor(index / 2) * 0.5
					);
					const x = Math.round(point.x);
					const y = Math.round(point.y);
					const offset = (y * W + x) * 4;
					probes.push({
						label: `quadrant ${index} at ${x},${y}`,
						expected: color,
						actual: [actual[offset]!, actual[offset + 1]!, actual[offset + 2]!]
					});
				}
			}
			results.push({ name: scene.name, maxDiff, badFraction: bad / (W * H), probes });
			referenceRenderer.dispose();
			gpuRenderer.dispose();
		}
		return results;
	}, tolerance);
}

test.describe('WebGL2 vs Canvas2D compositor parity', () => {
	test('matches the Canvas2D reference on every scene', async ({ page }) => {
		const logs: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error') logs.push(message.text());
		});
		await openEditor(page);
		const gpu = await page.evaluate(() => {
			const gl = document.createElement('canvas').getContext('webgl2');
			if (!gl) return 'WEBGL2_UNAVAILABLE';
			const info = gl.getExtension('WEBGL_debug_renderer_info');
			return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
		});
		console.log(`GPU_RENDERER ${gpu}`);
		test.fail(gpu === 'WEBGL2_UNAVAILABLE', 'WebGL2 is required for the parity harness.');

		const results = await runScenes(page, 3);
		for (const result of results) {
			console.log(
				`PARITY ${result.name} maxDiff=${result.maxDiff} bad=${(result.badFraction * 100).toFixed(4)}%`
			);
			// Strict scenes have no rotated or resampled edges; AA on transformed edges is looser.
			const strict = ['identity-fullframe', 'semi-transparent-pixels', 'crop-axis-aligned'];
			expect(result.badFraction, result.name).toBeLessThanOrEqual(
				strict.includes(result.name) ? 0.001 : 0.01
			);
			for (const probe of result.probes) {
				for (let channel = 0; channel < 3; channel += 1) {
					expect(
						Math.abs(probe.actual[channel]! - probe.expected[channel]!),
						`${result.name} ${probe.label}`
					).toBeLessThanOrEqual(6);
				}
			}
		}
		expect(logs).toEqual([]);
	});
});
