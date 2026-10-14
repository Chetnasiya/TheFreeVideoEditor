import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

async function runPerfMeasurements() {
	const browser = await chromium.launch({
		headless: true,
		args: ['--use-gl=angle', '--enable-gpu-rasterization']
	});
	const context = await browser.newContext();
	const page = await context.newPage();

	await page.addInitScript(() => {
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
		Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
	});

	await page.goto('http://localhost:4321/editor');

	console.log('--- 1. MEASURING GPU FRAME TIMES & READBACK WITH gl.finish() ---');
	const gpuResults = await page.evaluate(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 1920;
		canvas.height = 1080;
		const gl = canvas.getContext('webgl2', {
			alpha: true,
			premultipliedAlpha: true,
			preserveDrawingBuffer: true,
			powerPreference: 'high-performance'
		});
		if (!gl) throw new Error('WebGL2 not available');
		gl.getExtension('EXT_color_buffer_float');

		const vs = gl.createShader(gl.VERTEX_SHADER);
		gl.shaderSource(
			vs,
			`#version 300 es
      in vec2 a_pos;
      out vec2 v_uv;
      void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }`
		);
		gl.compileShader(vs);

		const fs = gl.createShader(gl.FRAGMENT_SHADER);
		gl.shaderSource(
			fs,
			`#version 300 es
      precision highp float;
      in vec2 v_uv;
      uniform float u_time;
      out vec4 fragColor;
      void main() {
        vec2 p = v_uv * 10.0 + vec2(u_time * 2.0, u_time * 1.5);
        float pattern = sin(p.x) * cos(p.y);
        fragColor = vec4(0.5 + 0.5 * sin(u_time + v_uv.x * 6.28),
                         0.5 + 0.5 * cos(u_time + v_uv.y * 6.28),
                         0.5 + 0.5 * pattern, 1.0);
      }`
		);
		gl.compileShader(fs);

		const prog = gl.createProgram();
		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.linkProgram(prog);

		const vao = gl.createVertexArray();
		gl.bindVertexArray(vao);
		const buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
			gl.STATIC_DRAW
		);
		const posLoc = gl.getAttribLocation(prog, 'a_pos');
		gl.enableVertexAttribArray(posLoc);
		gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

		const uTimeLoc = gl.getUniformLocation(prog, 'u_time');

		// Setup 8-bit FBO
		const tex8 = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, tex8);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1920, 1080, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		const fbo8 = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo8);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex8, 0);

		// Setup 16-bit float FBO
		const tex16 = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, tex16);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1920, 1080, 0, gl.RGBA, gl.HALF_FLOAT, null);
		const fbo16 = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo16);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex16, 0);

		gl.viewport(0, 0, 1920, 1080);
		gl.useProgram(prog);

		// Warmup
		for (let i = 0; i < 10; i++) {
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		}
		gl.finish();

		// Measure 8-bit composite (60 frames, batching 20 passes per frame to exceed timer resolution)
		const passesPerFrame = 20;
		const times8 = [];
		for (let i = 0; i < 60; i++) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo8);
			gl.finish();
			const t0 = performance.now();
			for (let p = 0; p < passesPerFrame; p++) {
				gl.uniform1f(uTimeLoc, (i * passesPerFrame + p) / 30);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			}
			gl.finish();
			const t1 = performance.now();
			times8.push((t1 - t0) / passesPerFrame);
		}

		// Measure 16-bit half-float composite (60 frames)
		const times16 = [];
		for (let i = 0; i < 60; i++) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo16);
			gl.finish();
			const t0 = performance.now();
			for (let p = 0; p < passesPerFrame; p++) {
				gl.uniform1f(uTimeLoc, (i * passesPerFrame + p) / 30);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			}
			gl.finish();
			const t1 = performance.now();
			times16.push((t1 - t0) / passesPerFrame);
		}

		// Measure ColorConversionPass synchronous PBO readback stall
		const { ColorConversionPass } =
			await import('/src/editor/services/render/passes/ColorConversionPass.ts');
		const convPass = new ColorConversionPass(gl);

		const timesReadback = [];
		for (let i = 0; i < 60; i++) {
			gl.finish();
			const t0 = performance.now();
			convPass.convertRgbToYuv420(tex16, 1920, 1080, {
				matrix: 'bt709',
				range: 'limited',
				bitDepth: 10,
				dither: true,
				frameIndex: i
			});
			gl.finish();
			const t1 = performance.now();
			timesReadback.push(t1 - t0);
		}
		convPass.dispose();

		const median = (arr) => {
			const s = [...arr].sort((a, b) => a - b);
			return s[Math.floor(s.length / 2)];
		};

		return {
			fbo8_median_ms: Number(median(times8).toFixed(4)),
			fbo8_min_ms: Number(Math.min(...times8).toFixed(4)),
			fbo8_max_ms: Number(Math.max(...times8).toFixed(4)),
			fbo16_median_ms: Number(median(times16).toFixed(4)),
			fbo16_min_ms: Number(Math.min(...times16).toFixed(4)),
			fbo16_max_ms: Number(Math.max(...times16).toFixed(4)),
			readback_median_ms: Number(median(timesReadback).toFixed(2)),
			readback_min_ms: Number(Math.min(...timesReadback).toFixed(2)),
			readback_max_ms: Number(Math.max(...timesReadback).toFixed(2))
		};
	});

	console.log('GPU Measurements:', JSON.stringify(gpuResults, null, 2));

	console.log('\n--- 2. MEASURING REAL ENCODE FPS AT 1080p (NOISE + MOTION) ---');
	const encodeResults = await page.evaluate(async () => {
		const w = 1920;
		const h = 1080;
		const frameCount = 60;

		const offCanvas = new OffscreenCanvas(w, h);
		const ctx = offCanvas.getContext('2d');

		const frames = [];
		for (let i = 0; i < frameCount; i++) {
			const time = i / 30;
			ctx.fillStyle = `rgb(${Math.floor(128 + 127 * Math.sin(time))}, ${Math.floor(128 + 127 * Math.cos(time))}, 100)`;
			ctx.fillRect(0, 0, w, h);
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(Math.floor((i * 20) % (w - 200)), Math.floor((i * 10) % (h - 200)), 200, 200);
			ctx.fillStyle = '#ff0000';
			ctx.beginPath();
			ctx.arc(w / 2 + Math.cos(time * 3) * 300, h / 2 + Math.sin(time * 3) * 200, 80, 0, Math.PI * 2);
			ctx.fill();

			const vf = new VideoFrame(offCanvas, {
				timestamp: Math.round(time * 1_000_000),
				duration: 33333
			});
			frames.push(vf);
		}

		async function benchCodec(name, config, is10Bit = false, hwSw = 'HW') {
			let isSupported = false;
			try {
				const support = await VideoEncoder.isConfigSupported(config);
				isSupported = Boolean(support.supported);
			} catch {
				isSupported = false;
			}
			if (!isSupported) {
				return { name, supported: false, reason: 'unsupported on this platform' };
			}

			let encodedChunks = 0;
			let totalBytes = 0;
			const encoder = new VideoEncoder({
				output: (chunk) => {
					encodedChunks++;
					totalBytes += chunk.byteLength;
				},
				error: (e) => console.error(name, e)
			});
			encoder.configure(config);

			let testFrames = frames;
			if (is10Bit) {
				testFrames = frames.map((f, idx) => {
					const y16 = new Uint16Array(w * h);
					const u16 = new Uint16Array((w / 2) * (h / 2)).fill(512);
					const v16 = new Uint16Array((w / 2) * (h / 2)).fill(512);
					for (let y = 0; y < h; y++) {
						for (let x = 0; x < w; x++) {
							y16[y * w + x] = Math.floor((((x + idx * 10) % w) / w) * 1023);
						}
					}
					const combined = new Uint16Array(y16.length + u16.length + v16.length);
					combined.set(y16, 0);
					combined.set(u16, y16.length);
					combined.set(v16, y16.length + u16.length);
					return new VideoFrame(combined, {
						format: 'I420P10',
						codedWidth: w,
						codedHeight: h,
						timestamp: f.timestamp,
						duration: f.duration
					});
				});
			}

			const t0 = performance.now();
			for (let i = 0; i < frameCount; i++) {
				encoder.encode(testFrames[i], { keyFrame: i % 30 === 0 });
			}
			await encoder.flush();
			const t1 = performance.now();
			encoder.close();

			const durationSec = (t1 - t0) / 1000;
			const fps = frameCount / durationSec;
			const bitrateActualMbps = (totalBytes * 8) / (durationSec * 1_000_000);

			return {
				name,
				codec: config.codec,
				path: hwSw,
				supported: true,
				frameCount,
				durationSec: Number(durationSec.toFixed(3)),
				fps: Number(fps.toFixed(1)),
				targetBitrateMbps: config.bitrate / 1_000_000,
				totalBytes,
				bitrateActualMbps: Number(bitrateActualMbps.toFixed(2))
			};
		}

		const h264 = await benchCodec(
			'H.264 High 4.0 (MP4)',
			{
				codec: 'avc1.640028',
				width: w,
				height: h,
				bitrate: 16_000_000,
				framerate: 30
			},
			false,
			'HW (macOS VideoToolbox)'
		);

		const hevc = await benchCodec(
			'HEVC Main (MP4)',
			{
				codec: 'hvc1.1.6.L120.B0',
				width: w,
				height: h,
				bitrate: 12_000_000,
				framerate: 30
			},
			false,
			'HW (macOS VideoToolbox)'
		);

		const vp9_p0 = await benchCodec(
			'VP9 Profile 0 8-bit (WebM)',
			{
				codec: 'vp09.00.41.08',
				width: w,
				height: h,
				bitrate: 12_000_000,
				framerate: 30
			},
			false,
			'SW (libvpx)'
		);

		const vp9_p2 = await benchCodec(
			'VP9 Profile 2 10-bit (WebM)',
			{
				codec: 'vp09.02.41.10',
				width: w,
				height: h,
				bitrate: 18_000_000,
				framerate: 30
			},
			true,
			'SW (libvpx)'
		);

		const av1 = await benchCodec(
			'AV1 Main Profile (WebM)',
			{
				codec: 'av01.0.08M.08',
				width: w,
				height: h,
				bitrate: 12_000_000,
				framerate: 30
			},
			false,
			'SW (libaom)'
		);

		for (const f of frames) f.close();

		return { h264, hevc, vp9_p0, vp9_p2, av1 };
	});

	console.log('Encode FPS Measurements:', JSON.stringify(encodeResults, null, 2));

	console.log('\n--- 3. MEASURING MAIN-THREAD LONG TASKS DURING REAL UI EXPORT ---');
	const manager = page.getByRole('dialog', { name: 'Your Projects' });
	await manager.getByRole('button', { name: 'New project' }).click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('LongTask UI Test');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await page.getByRole('heading', { name: 'LongTask UI Test' }).waitFor();

	const fileInput = page.locator('input[name="media-files"]');
	await fileInput.setInputFiles(['tests/fixtures/gradient.png']);
	const media = page.getByRole('listbox', { name: 'Project media' });
	const asset = media.getByRole('option').filter({ hasText: 'gradient.png' });
	await asset.waitFor({ timeout: 15_000 });
	await asset.dragTo(page.locator('[data-track-lane]').first(), {
		targetPosition: { x: 5, y: 15 }
	});
	await page.locator('.timeline-clip').first().waitFor();

	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const exportDialog = page.getByRole('dialog', { name: 'Export' });
	await exportDialog.waitFor();

	await exportDialog.getByLabel('Format').selectOption('webm');
	await exportDialog.getByLabel(/Video Codec/i).selectOption('vp9-webm');
	await exportDialog.getByLabel('Include audio').uncheck();

	// Attach PerformanceObserver
	await page.evaluate(() => {
		window.__longTasks = [];
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				window.__longTasks.push({
					name: entry.name,
					startTime: entry.startTime,
					duration: entry.duration
				});
			}
		});
		observer.observe({ entryTypes: ['longtask'] });
		window.__longTaskObserver = observer;
	});

	const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
	await exportDialog.getByRole('button', { name: 'Export video' }).click();
	const download = await downloadPromise;
	const outPath = 'test-results/ui-longtask-test.webm';
	await download.saveAs(outPath);

	const longTaskReport = await page.evaluate(() => {
		if (window.__longTaskObserver) {
			window.__longTaskObserver.disconnect();
		}
		const tasks = window.__longTasks || [];
		const totalDuration = tasks.reduce((sum, t) => sum + t.duration, 0);
		const maxDuration = tasks.reduce((max, t) => Math.max(max, t.duration), 0);
		return {
			count: tasks.length,
			totalMs: Number(totalDuration.toFixed(2)),
			maxMs: Number(maxDuration.toFixed(2)),
			tasks: tasks.slice(0, 10)
		};
	});

	console.log('Main-Thread Long Tasks Report:', JSON.stringify(longTaskReport, null, 2));

	const fullSummary = {
		gpu: gpuResults,
		encode: encodeResults,
		longTasks: longTaskReport
	};

	writeFileSync('test-results/perf-summary.json', JSON.stringify(fullSummary, null, 2));
	console.log('Saved test-results/perf-summary.json');

	await browser.close();
}

runPerfMeasurements().catch(console.error);
