import { expect, test } from '@playwright/test';

interface GlReport {
	gpu: string;
	recovered: boolean;
	losses: number;
	restores: number;
	pixelAfter: number[];
	liveTexturesAfterDispose: number;
	programsLeaked: number;
	perf: Record<string, number>;
}

test.describe('WebGL2 renderer lifecycle', () => {
	test('recovers from context loss, releases GPU objects, and meets the composite budget', async ({
		page
	}) => {
		const errors: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
		});
		await page.goto('/editor');
		const report = await page.evaluate(async (): Promise<GlReport> => {
			const path = '/src/editor/services/render/index.ts';
			const render = (await import(
				/* @vite-ignore */ path
			)) as typeof import('../../src/editor/services/render');
			type Layer = import('../../src/editor/core/playback').ActiveLayer;
			const W = 1280;
			const H = 720;
			const source = (color: string): OffscreenCanvas => {
				const canvas = new OffscreenCanvas(W, H);
				const context = canvas.getContext('2d')!;
				context.fillStyle = color;
				context.fillRect(0, 0, W, H);
				return canvas;
			};
			const sources: Record<string, OffscreenCanvas> = {
				a: source('#e53935'),
				b: source('#43a047'),
				c: source('#1e88e5'),
				d: source('#fdd835')
			};
			const layer = (id: string, opacity = 1): Layer =>
				({
					clipId: id,
					assetId: id,
					trackId: 't',
					trackOrder: 0,
					sourceTime: 0,
					kind: 'image',
					opacity,
					transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity }
				}) as Layer;
			const provider = (item: Layer) => sources[item.clipId] ?? null;
			const size = { width: W, height: H };
			const read = (canvas: HTMLCanvasElement): number[] => {
				const copy = document.createElement('canvas');
				copy.width = 4;
				copy.height = 4;
				const context = copy.getContext('2d', { willReadFrequently: true })!;
				context.drawImage(canvas, W / 2, H / 2, 4, 4, 0, 0, 4, 4);
				return Array.from(context.getImageData(1, 1, 1, 1).data);
			};

			const canvas = document.createElement('canvas');
			canvas.width = W;
			canvas.height = H;
			let restoredCallbacks = 0;
			const renderer = render.createFrameRenderer(canvas, {
				preserveDrawingBuffer: true,
				onContextRestored: () => {
					restoredCallbacks += 1;
				}
			}) as import('../../src/editor/services/render').FrameRenderer & {
				renderContext: { loseContext(): (() => void) | null };
			};
			const stats = renderer.stats;
			renderer.render(size, [layer('a')], provider);

			const restore = renderer.renderContext.loseContext();
			await new Promise((resolve) => setTimeout(resolve, 50));
			const drewWhileLost = renderer.render(size, [layer('a')], provider);
			restore?.();
			await new Promise((resolve) => setTimeout(resolve, 100));
			const recovered = renderer.render(size, [layer('b')], provider);
			const pixelAfter = read(canvas);

			const perf: Record<string, number> = {};
			for (const count of [1, 2, 4]) {
				const layers = ['a', 'b', 'c', 'd'].slice(0, count).map((id) => layer(id, 0.9));
				for (let warm = 0; warm < 10; warm += 1) renderer.render(size, layers, provider);
				const started = performance.now();
				for (let index = 0; index < 120; index += 1) renderer.render(size, layers, provider);
				perf[`gl${count}LayerMs`] = (performance.now() - started) / 120;
			}
			const reference = document.createElement('canvas');
			reference.width = W;
			reference.height = H;
			const canvas2d = render.createFrameRenderer(reference, { forceCanvas2d: true })!;
			for (const count of [1, 2, 4]) {
				const layers = ['a', 'b', 'c', 'd'].slice(0, count).map((id) => layer(id, 0.9));
				for (let warm = 0; warm < 10; warm += 1) canvas2d.render(size, layers, provider);
				const started = performance.now();
				for (let index = 0; index < 120; index += 1) canvas2d.render(size, layers, provider);
				perf[`c2d${count}LayerMs`] = (performance.now() - started) / 120;
			}
			canvas2d.dispose();

			renderer.dispose();
			const gpu = stats.gpuRenderer;
			return {
				gpu,
				recovered: recovered && !drewWhileLost,
				losses: stats.contextLosses,
				restores: Math.max(stats.contextRestores, restoredCallbacks),
				pixelAfter,
				liveTexturesAfterDispose: stats.texturesCreated - stats.texturesDeleted,
				programsLeaked: stats.programsCreated - stats.programsDeleted,
				perf
			};
		});

		console.log(`GPU_RENDERER ${report.gpu}`);
		console.log(`GL_PERF ${JSON.stringify(report.perf)}`);
		expect(report.recovered).toBe(true);
		expect(report.losses).toBeGreaterThanOrEqual(1);
		expect(report.restores).toBeGreaterThanOrEqual(1);
		expect(report.pixelAfter[1]!).toBeGreaterThan(140);
		expect(report.pixelAfter[0]!).toBeLessThan(100);
		expect(report.liveTexturesAfterDispose).toBe(0);
		expect(report.programsLeaked).toBe(0);
		expect(report.perf.gl4LayerMs!).toBeLessThanOrEqual(8);
		expect(errors.filter((text) => !/GPU stall/.test(text))).toEqual([]);
	});
});
