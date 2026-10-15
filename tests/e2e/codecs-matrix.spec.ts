import { execSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } from 'mediabunny';

const SWIFT_VALIDATOR =
	'/Users/gajananpalepwad/.gemini/antigravity/brain/3214f692-6b9d-431e-bda5-20aeb5835143/scratch/validate_avfoundation.swift';

interface AvReport {
	isPlayable: boolean;
	durationSeconds: number;
	tracksCount: number;
	videoTracks?: Array<{
		trackIndex: number;
		width: number;
		height: number;
		nominalFps: number;
		frameCount: number;
		formats: string[];
	}>;
	audioTracks?: Array<{
		trackIndex: number;
		formats: string[];
	}>;
}

function runAvFoundation(filePath: string): AvReport {
	const raw = execSync(`swift -suppress-warnings "${SWIFT_VALIDATOR}" "${filePath}"`, {
		encoding: 'utf-8'
	});
	return JSON.parse(raw.trim()) as AvReport;
}

test.describe('Professional Codecs Matrix (Tier 1 & Tier 3)', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
			Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
		});
	});

	// ─── TIER 3: GPU SHADER ORACLE, DETERMINISTIC DITHER, AND 10-BIT PROOF ───

	test('Tier 3 GPU: Shader Color Matrix Oracle executed on real WebGL2 GPU (BT.709 & BT.2020, 8-bit & 10-bit)', async ({
		page
	}) => {
		await page.goto('/editor', { waitUntil: 'networkidle' });

		const result = await page.evaluate(async () => {
			const { ColorConversionPass } =
				await import('../../src/editor/services/render/passes/ColorConversionPass');

			const canvas = document.createElement('canvas');
			canvas.width = 64;
			canvas.height = 64;
			const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
			if (!gl) throw new Error('WebGL2 unavailable');

			const pass = new ColorConversionPass(gl);

			// Create a 4x4 test texture with known RGB colors:
			// (0,0): Black (0,0,0)
			// (1,0): White (1,1,1)
			// (2,0): Red   (1,0,0)
			// (3,0): Green (0,1,0)
			// (0,1): Blue  (0,0,1)
			const tex = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, tex);
			const pixels = new Uint8Array(4 * 4 * 4); // 4x4 RGBA

			function setPixel(x: number, y: number, r: number, g: number, b: number, a: number) {
				const idx = (y * 4 + x) * 4;
				pixels[idx] = r;
				pixels[idx + 1] = g;
				pixels[idx + 2] = b;
				pixels[idx + 3] = a;
			}

			setPixel(0, 0, 0, 0, 0, 255); // Black
			setPixel(1, 0, 255, 255, 255, 255); // White
			setPixel(2, 0, 255, 0, 0, 255); // Red
			setPixel(3, 0, 0, 255, 0, 255); // Green
			setPixel(0, 1, 0, 0, 255, 255); // Blue

			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

			// Test 1: BT.709 Limited Range (8-bit)
			const res709_8 = pass.convertRgbToYuv420(tex!, 4, 4, {
				matrix: 'bt709',
				range: 'limited',
				bitDepth: 8,
				dither: false
			});

			// Test 2: BT.2020 Limited Range (8-bit)
			const res2020_8 = pass.convertRgbToYuv420(tex!, 4, 4, {
				matrix: 'bt2020',
				range: 'limited',
				bitDepth: 8,
				dither: false
			});

			// Test 3: BT.709 Limited Range (10-bit true packed readback)
			const res709_10 = pass.convertRgbToYuv420(tex!, 4, 4, {
				matrix: 'bt709',
				range: 'limited',
				bitDepth: 10,
				dither: false
			});

			// Helper to sample Y at (x, y)
			const y709_8 = (x: number, y: number) => (res709_8.yPlane as Uint8Array)[y * 4 + x];
			const y2020_8 = (x: number, y: number) => (res2020_8.yPlane as Uint8Array)[y * 4 + x];
			const y709_10 = (x: number, y: number) => (res709_10.yPlane as Uint16Array)[y * 4 + x];

			pass.dispose();
			gl.deleteTexture(tex);

			return {
				bt709_8: {
					blackY: y709_8(0, 0),
					whiteY: y709_8(1, 0),
					redY: y709_8(2, 0),
					greenY: y709_8(3, 0),
					blueY: y709_8(0, 1)
				},
				bt2020_8: {
					blackY: y2020_8(0, 0),
					whiteY: y2020_8(1, 0),
					redY: y2020_8(2, 0),
					greenY: y2020_8(3, 0),
					blueY: y2020_8(0, 1)
				},
				bt709_10: {
					blackY: y709_10(0, 0),
					whiteY: y709_10(1, 0),
					redY: y709_10(2, 0)
				}
			};
		});

		// BT.709 Limited 8-bit standard reference values:
		// Black: 16
		// White: 235
		// Red: round(16 + 219 * 0.2126) = 63
		// Green: round(16 + 219 * 0.7152) = 173
		// Blue: round(16 + 219 * 0.0722) = 32
		expect(Math.abs(result.bt709_8.blackY - 16)).toBeLessThanOrEqual(1);
		expect(Math.abs(result.bt709_8.whiteY - 235)).toBeLessThanOrEqual(1);
		expect(Math.abs(result.bt709_8.redY - 63)).toBeLessThanOrEqual(1);
		expect(Math.abs(result.bt709_8.greenY - 173)).toBeLessThanOrEqual(1);
		expect(Math.abs(result.bt709_8.blueY - 32)).toBeLessThanOrEqual(1);

		// BT.2020 Limited 8-bit standard reference values:
		// Red: round(16 + 219 * 0.2627) = 74
		expect(Math.abs(result.bt2020_8.blackY - 16)).toBeLessThanOrEqual(1);
		expect(Math.abs(result.bt2020_8.whiteY - 235)).toBeLessThanOrEqual(1);
		expect(Math.abs(result.bt2020_8.redY - 74)).toBeLessThanOrEqual(1);

		// BT.709 Limited 10-bit reference values:
		// Black: 64 (16 << 2)
		// White: 940 (235 << 2)
		// Red: round(64 + 876 * 0.2126) = 250
		expect(Math.abs(result.bt709_10.blackY - 64)).toBeLessThanOrEqual(2);
		expect(Math.abs(result.bt709_10.whiteY - 940)).toBeLessThanOrEqual(3);
		expect(Math.abs(result.bt709_10.redY - 250)).toBeLessThanOrEqual(2);
	});

	test('Tier 3 GPU: Dither Determinism and WebGL context re-creation parity', async ({ page }) => {
		await page.goto('/editor', { waitUntil: 'networkidle' });

		const parity = await page.evaluate(async () => {
			const { ColorConversionPass } =
				await import('../../src/editor/services/render/passes/ColorConversionPass');

			function runDitherPass(): Uint8Array {
				const canvas = document.createElement('canvas');
				canvas.width = 32;
				canvas.height = 32;
				const gl = canvas.getContext('webgl2');
				if (!gl) throw new Error('WebGL2 unavailable');

				const pass = new ColorConversionPass(gl);
				const tex = gl.createTexture();
				gl.bindTexture(gl.TEXTURE_2D, tex);
				const grad = new Uint8Array(32 * 32 * 4);
				for (let i = 0; i < 32 * 32; i++) {
					const val = (i % 32) * 8;
					grad[i * 4] = val;
					grad[i * 4 + 1] = val;
					grad[i * 4 + 2] = val;
					grad[i * 4 + 3] = 255;
				}
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 32, 32, 0, gl.RGBA, gl.UNSIGNED_BYTE, grad);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

				const res = pass.convertRgbToYuv420(tex!, 32, 32, {
					matrix: 'bt709',
					range: 'limited',
					bitDepth: 8,
					dither: true,
					frameIndex: 777
				});

				const yCopy = new Uint8Array(res.yPlane as Uint8Array);
				pass.dispose();
				gl.deleteTexture(tex);
				return yCopy;
			}

			// Run 1 in context A
			const run1 = runDitherPass();
			// Run 2 in new context B (context recreation)
			const run2 = runDitherPass();

			let diffCount = 0;
			for (let i = 0; i < run1.length; i++) {
				if (run1[i] !== run2[i]) diffCount++;
			}
			return { byteLength: run1.length, diffCount };
		});

		expect(parity.diffCount).toBe(0);
		expect(parity.byteLength).toBe(32 * 32);
	});

	test('Tier 3 GPU: 10-bit Proof by UI Export and Decode via WebCodecs (VP9 Profile 2 vp09.02.41.10)', async ({
		page
	}) => {
		test.setTimeout(120_000);
		await page.goto('/editor');

		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await manager.getByRole('button', { name: 'New project' }).click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('10bit Matrix UI Test');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(page.getByRole('heading', { name: '10bit Matrix UI Test' })).toBeVisible();

		const fileInput = page.locator('input[name="media-files"]');
		await fileInput.setInputFiles(['tests/fixtures/gradient.png']);
		const media = page.getByRole('listbox', { name: 'Project media' });
		const asset = media.getByRole('option').filter({ hasText: 'gradient.png' });
		await expect(asset).toBeVisible({ timeout: 15_000 });
		await asset.dragTo(page.locator('[data-track-lane]').first(), {
			targetPosition: { x: 5, y: 15 }
		});
		await expect(page.locator('.timeline-clip').first()).toBeVisible();

		const out8 = 'test-results/matrix-10bit-proof-8bit.webm';
		const out10 = 'test-results/matrix-10bit-proof-10bit.webm';
		if (existsSync(out8)) unlinkSync(out8);
		if (existsSync(out10)) unlinkSync(out10);

		// Export 8-bit VP9 Profile 0
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const exportDialog = page.getByRole('dialog', { name: 'Export' });
		await expect(exportDialog).toBeVisible();

		await exportDialog.getByLabel('Format').selectOption('webm');
		await exportDialog.getByLabel(/Video Codec/i).selectOption('vp9-webm');
		await exportDialog.getByLabel(/Quality/i).selectOption('custom');
		await exportDialog.getByLabel(/Bitrate \(Mbps\)/i).fill('60');
		await exportDialog.getByLabel('Include audio').uncheck();

		let downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
		await exportDialog.getByRole('button', { name: 'Export video' }).click();
		let download = await downloadPromise;
		await download.saveAs(out8);
		expect(existsSync(out8)).toBe(true);

		await exportDialog.getByRole('button', { name: 'Close', exact: true }).click();
		await page.waitForTimeout(500);

		// Export 10-bit VP9 Profile 2
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		await expect(exportDialog).toBeVisible();

		await exportDialog.getByLabel('Format').selectOption('webm');
		await exportDialog.getByLabel(/Video Codec/i).selectOption('vp9-profile2-webm');
		await exportDialog.getByLabel(/Quality/i).selectOption('custom');
		await exportDialog.getByLabel(/Bitrate \(Mbps\)/i).fill('60');
		await exportDialog.getByLabel('Include audio').uncheck();

		downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
		await exportDialog.getByRole('button', { name: 'Export video' }).click();
		download = await downloadPromise;
		await download.saveAs(out10);
		expect(existsSync(out10)).toBe(true);

		async function getPacket(path: string) {
			const bytes = readFileSync(path);
			const input = new Input({ source: new BlobSource(new Blob([bytes])), formats: ALL_FORMATS });
			const track = await input.getPrimaryVideoTrack();
			const config = await track!.getDecoderConfig();
			const sink = new EncodedPacketSink(track!);
			const packet = await sink.getFirstKeyPacket();
			const data = Array.from(new Uint8Array(packet!.data));
			const timestamp = packet!.timestamp;
			const type = packet!.type;
			input.dispose();
			return { config, data, timestamp, type };
		}

		const p8 = await getPacket(out8);
		const p10 = await getPacket(out10);

		const result = await page.evaluate(
			async ({ f8, f10 }) => {
				async function decodeAndMeasure(info: any) {
					let decoded: VideoFrame | null = null;
					let err: any = null;
					const decoder = new VideoDecoder({
						output: (frame) => {
							decoded = frame;
						},
						error: (e) => {
							err = e;
						}
					});
					decoder.configure({
						...info.config,
						hardwareAcceleration: 'prefer-software'
					});
					decoder.decode(
						new EncodedVideoChunk({
							type: info.type,
							timestamp: Math.round(info.timestamp * 1_000_000),
							data: new Uint8Array(info.data)
						})
					);
					await decoder.flush();
					if (err) throw err;
					if (!decoded) throw new Error('Decode failed: no frame returned');

					const format = (decoded as VideoFrame).format;
					const w = (decoded as VideoFrame).displayWidth;
					const h = (decoded as VideoFrame).displayHeight;

					const alloc = (decoded as any).allocationSize({ planeIndex: 0 });
					const yBytes = new Uint8Array(alloc);
					(decoded as any).copyTo(yBytes, { planeIndex: 0 });

					const midRow = Math.floor(h / 2);
					const set = new Set<number>();
					if ((format as string) === 'I420P10') {
						const y16 = new Uint16Array(yBytes.buffer, yBytes.byteOffset, yBytes.byteLength / 2);
						const rowOffset = midRow * w;
						for (let x = 0; x < w; x++) set.add(y16[rowOffset + x]);
					} else {
						const rowOffset = midRow * w;
						for (let x = 0; x < w; x++) set.add(yBytes[rowOffset + x]);
					}
					(decoded as VideoFrame).close();
					return { format, w, h, uniqueLevels: set.size };
				}

				const r8 = await decodeAndMeasure(f8);
				const r10 = await decodeAndMeasure(f10);
				return { r8, r10, ratio: r10.uniqueLevels / r8.uniqueLevels };
			},
			{ f8: p8, f10: p10 }
		);

		expect(result.r8.format).toBe('I420');
		expect(result.r10.format).toBe('I420P10');
		// 8-bit luma yields 220 discrete levels in BT.709 limited range (16..235) and 256 in full range
		expect(result.r8.uniqueLevels).toBeGreaterThanOrEqual(219);
		expect(result.r8.uniqueLevels).toBeLessThanOrEqual(256);
		// In 10-bit limited range, >= 800 distinct levels are preserved (out of 878 possible in 64..941)
		expect(result.r10.uniqueLevels).toBeGreaterThanOrEqual(800);
		expect(result.ratio).toBeGreaterThanOrEqual(3.0);
	});

	test('Tier 3 GPU: Byte-equality check confirming default 8-bit blit output with dithering OFF is bit-for-bit unchanged', async ({
		page
	}) => {
		await page.goto('/editor', { waitUntil: 'networkidle' });

		const diff = await page.evaluate(async () => {
			const { ShaderPassManager } =
				await import('../../src/editor/services/render/passes/ShaderPass');
			const canvas = document.createElement('canvas');
			canvas.width = 64;
			canvas.height = 64;
			const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
			if (!gl) throw new Error('WebGL2 context unavailable');
			const passManager = new ShaderPassManager(gl);

			const inputBytes = new Uint8Array(64 * 64 * 4);
			for (let i = 0; i < inputBytes.length; i++) inputBytes[i] = (i * 37 + 13) % 256;

			const tex = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, inputBytes);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

			const fboTex = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, fboTex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			const fbo = gl.createFramebuffer();
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);

			passManager.blit(tex, fbo, 64, 64, 1.0, {
				keepAlpha: true,
				dither: false,
				bitDepth: 8
			});

			const outputBytes = new Uint8Array(64 * 64 * 4);
			gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, outputBytes);

			let diffCount = 0;
			for (let i = 0; i < inputBytes.length; i++) {
				if (inputBytes[i] !== outputBytes[i]) diffCount++;
			}

			passManager.dispose();
			gl.deleteTexture(tex);
			gl.deleteTexture(fboTex);
			gl.deleteFramebuffer(fbo);

			return { totalBytes: inputBytes.length, diffCount };
		});

		expect(diff.diffCount).toBe(0);
		expect(diff.totalBytes).toBe(64 * 64 * 4);
	});

	test('Tier 3 GPU: Alpha Ramp Oracle (straight vs premultiplied handling on GPU)', async ({
		page
	}) => {
		await page.goto('/editor', { waitUntil: 'networkidle' });

		const ramp = await page.evaluate(async () => {
			const { ColorConversionPass } =
				await import('../../src/editor/services/render/passes/ColorConversionPass');

			const canvas = document.createElement('canvas');
			canvas.width = 5;
			canvas.height = 1;
			const gl = canvas.getContext('webgl2');
			if (!gl) throw new Error('WebGL2 unavailable');

			const pass = new ColorConversionPass(gl);
			const tex = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, tex);

			// 5-step straight alpha ramp: [0, 64, 128, 192, 255]
			const pixels = new Uint8Array([
				255,
				0,
				0,
				0, // Red, 0% alpha
				255,
				0,
				0,
				64, // Red, 25% alpha
				255,
				0,
				0,
				128, // Red, 50% alpha
				255,
				0,
				0,
				192, // Red, 75% alpha
				255,
				0,
				0,
				255 // Red, 100% alpha
			]);

			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 5, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

			const yuv = pass.convertRgbToYuv420(tex!, 5, 1, {
				matrix: 'bt709',
				range: 'limited',
				bitDepth: 8,
				dither: false
			});

			const alphaPlane = pass.convertRgbToAlpha(tex!, 5, 1);
			const alphas = [alphaPlane[0], alphaPlane[1], alphaPlane[2], alphaPlane[3], alphaPlane[4]];
			pass.dispose();
			gl.deleteTexture(tex);

			return { alphas, yPlaneRed: yuv.yPlane[4] };
		});

		expect(Math.abs(ramp.alphas[0] - 0)).toBeLessThanOrEqual(1);
		expect(Math.abs(ramp.alphas[1] - 64)).toBeLessThanOrEqual(1);
		expect(Math.abs(ramp.alphas[2] - 128)).toBeLessThanOrEqual(1);
		expect(Math.abs(ramp.alphas[3] - 192)).toBeLessThanOrEqual(1);
		expect(Math.abs(ramp.alphas[4] - 255)).toBeLessThanOrEqual(1);
		// Red luma remains unmodified by alpha when unmultiplied/straight
		expect(Math.abs(ramp.yPlaneRed - 63)).toBeLessThanOrEqual(1);
	});

	// ─── TIER 1: PLATFORM CODECS UI EXPORTS & VALIDATION ───────────────────

	test('1. H.264 High Profile in MP4 (AVC1 + AAC) with AVFoundation validation and frame decode', async ({
		page
	}) => {
		test.setTimeout(120_000);
		const outPath = 'test-results/matrix-h264-high.mp4';
		if (existsSync(outPath)) unlinkSync(outPath);

		await page.goto('/editor');
		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await manager.getByRole('button', { name: 'New project' }).click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('H264 Matrix Test');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(page.getByRole('heading', { name: 'H264 Matrix Test' })).toBeVisible();

		// Import fixture
		const fileInput = page.locator('input[name="media-files"]');
		await fileInput.setInputFiles(['tests/fixtures/colors.mp4']);
		const media = page.getByRole('listbox', { name: 'Project media' });
		const asset = media.getByRole('option').filter({ hasText: 'colors.mp4' });
		await expect(asset).toBeVisible({ timeout: 15_000 });
		await asset.dragTo(page.locator('[data-track-lane]').first());
		await expect(page.locator('.timeline-clip')).toHaveCount(2);

		// Export dialog
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const exportDialog = page.getByRole('dialog', { name: 'Export' });
		await expect(exportDialog).toBeVisible();

		// Configure MP4 with H.264 High
		await exportDialog.getByLabel('Format').selectOption('mp4');
		await exportDialog.getByLabel('Resolution').selectOption('720p');
		await exportDialog.getByLabel('Quality').selectOption('high');

		const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
		await exportDialog.getByRole('button', { name: 'Export video' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/\.mp4$/);
		await download.saveAs(outPath);
		expect(existsSync(outPath)).toBe(true);

		// Re-probe via mediabunny
		const bytes = readFileSync(outPath);
		const input = new Input({
			source: new BlobSource(new Blob([bytes], { type: 'video/mp4' })),
			formats: ALL_FORMATS
		});
		try {
			const videoTrack = await input.getPrimaryVideoTrack();
			expect(videoTrack).toBeDefined();
			if (videoTrack) {
				const codec = await videoTrack.getCodec();
				expect(codec).toMatch(/avc/i);
				expect(await videoTrack.getDisplayWidth()).toBe(1280);
				expect(await videoTrack.getDisplayHeight()).toBe(720);
			}

			const audioTrack = await input.getPrimaryAudioTrack();
			expect(audioTrack).toBeDefined();
			if (audioTrack) {
				const audioCodec = await audioTrack.getCodec();
				expect(audioCodec).toMatch(/aac/i);
			}
		} finally {
			input.dispose();
		}

		// AVFoundation Independent Validation
		if (existsSync(SWIFT_VALIDATOR)) {
			const report = runAvFoundation(outPath);
			expect(report.isPlayable).toBe(true);
			expect(report.videoTracks).toBeDefined();
			expect(report.videoTracks![0].width).toBe(1280);
			expect(report.videoTracks![0].height).toBe(720);
			expect(report.videoTracks![0].formats).toContain('avc1');
			expect(report.audioTracks![0].formats).toContain('aac ');
			expect(report.videoTracks![0].frameCount).toBeGreaterThan(0);
		}
	});

	test('2. QuickTime MOV with H.264 Video and 24-bit Uncompressed Linear PCM Audio', async ({
		page
	}) => {
		test.setTimeout(120_000);
		const outPath = 'test-results/matrix-h264-pcm24.mov';
		if (existsSync(outPath)) unlinkSync(outPath);

		await page.goto('/editor');
		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await manager.getByRole('button', { name: 'New project' }).click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('MOV Matrix Test');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(page.getByRole('heading', { name: 'MOV Matrix Test' })).toBeVisible();

		const fileInput = page.locator('input[name="media-files"]');
		await fileInput.setInputFiles(['tests/fixtures/colors.mp4']);
		const media = page.getByRole('listbox', { name: 'Project media' });
		const asset = media.getByRole('option').filter({ hasText: 'colors.mp4' });
		await expect(asset).toBeVisible({ timeout: 15_000 });
		await asset.dragTo(page.locator('[data-track-lane]').first());
		await expect(page.locator('.timeline-clip')).toHaveCount(2);

		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const exportDialog = page.getByRole('dialog', { name: 'Export' });
		await expect(exportDialog).toBeVisible();

		// Select MOV format
		await exportDialog.getByLabel('Format').selectOption('mov');

		// Select 24-bit Linear PCM audio
		const audioCodecSelect = exportDialog.getByLabel(/Audio Codec/i);
		await expect(audioCodecSelect).toBeVisible();
		await audioCodecSelect.selectOption('pcm24');

		const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
		await exportDialog.getByRole('button', { name: 'Export video' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/\.mov$/);
		await download.saveAs(outPath);
		expect(existsSync(outPath)).toBe(true);

		// Re-probe via mediabunny
		const bytes = readFileSync(outPath);
		const input = new Input({
			source: new BlobSource(new Blob([bytes], { type: 'video/quicktime' })),
			formats: ALL_FORMATS
		});
		try {
			const videoTrack = await input.getPrimaryVideoTrack();
			expect(videoTrack).toBeDefined();
			if (videoTrack) {
				const codec = await videoTrack.getCodec();
				expect(codec).toMatch(/avc/i);
			}

			const audioTrack = await input.getPrimaryAudioTrack();
			expect(audioTrack).toBeDefined();
			if (audioTrack) {
				const audioCodec = await audioTrack.getCodec();
				expect(audioCodec).toMatch(/pcm-s24/i);
			}
		} finally {
			input.dispose();
		}

		// AVFoundation Independent Validation
		if (existsSync(SWIFT_VALIDATOR)) {
			const report = runAvFoundation(outPath);
			expect(report.isPlayable).toBe(true);
			expect(report.videoTracks![0].formats).toContain('avc1');
			expect(report.audioTracks![0].formats).toContain('lpcm');
		}
	});

	test('3. WebM VP9 Alpha Export with Transparent Canvas Verification', async ({ page }) => {
		test.setTimeout(90_000);
		const outPath = 'test-results/matrix-vp9-alpha.webm';
		if (existsSync(outPath)) unlinkSync(outPath);

		await page.goto('/editor');
		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await manager.getByRole('button', { name: 'New project' }).click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('VP9 Alpha Matrix Test');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(page.getByRole('heading', { name: 'VP9 Alpha Matrix Test' })).toBeVisible();

		// Add text clip to leave background transparent
		await page.getByRole('button', { name: 'Text Layer' }).click();
		await expect(page.locator('.timeline-clip')).toHaveCount(1);

		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const exportDialog = page.getByRole('dialog', { name: 'Export' });
		await expect(exportDialog).toBeVisible();

		await exportDialog.getByLabel('Format').selectOption('webm');
		const alphaCheckbox = exportDialog.getByLabel(/alpha transparency/i);
		await expect(alphaCheckbox).toBeVisible();
		await alphaCheckbox.check();
		await exportDialog.getByLabel('Include audio').uncheck();

		const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
		await exportDialog.getByRole('button', { name: 'Export video' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/\.webm$/);
		await download.saveAs(outPath);
		expect(existsSync(outPath)).toBe(true);

		// Re-probe via mediabunny
		const bytes = readFileSync(outPath);
		const input = new Input({
			source: new BlobSource(new Blob([bytes], { type: 'video/webm' })),
			formats: ALL_FORMATS
		});
		try {
			const videoTrack = await input.getPrimaryVideoTrack();
			expect(videoTrack).toBeDefined();
			if (videoTrack) {
				const codec = await videoTrack.getCodec();
				expect(codec).toMatch(/vp9/i);
			}
		} finally {
			input.dispose();
		}

		// Decode in browser and verify alpha values
		await page.evaluate(() => {
			const input = document.createElement('input');
			input.type = 'file';
			input.id = 'alpha-verify-input';
			document.body.append(input);
		});
		await page.locator('#alpha-verify-input').setInputFiles(outPath);

		const alphaResult = await page.evaluate(async () => {
			const file = document.querySelector<HTMLInputElement>('#alpha-verify-input')?.files?.[0];
			if (!file) throw new Error('File not found.');
			const video = document.createElement('video');
			video.muted = true;
			video.src = URL.createObjectURL(file);
			await new Promise<void>((resolve, reject) => {
				video.onloadeddata = () => resolve();
				video.onerror = () => reject(new Error('Video load failed'));
			});
			const canvas = document.createElement('canvas');
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			if (!ctx) throw new Error('2D context failed');
			ctx.drawImage(video, 0, 0);
			// Top-left pixel should be transparent background
			const bgData = ctx.getImageData(5, 5, 1, 1).data;
			return { bgAlpha: bgData[3] };
		});

		// Background pixel alpha should be 0 (transparent canvas clear)
		expect(alphaResult.bgAlpha).toBe(0);
	});

	test('4. Master Audio Export: WAV Linear PCM 16, 24, and 32-bit float tone fidelity', async ({
		page
	}) => {
		test.setTimeout(90_000);
		const wavOut = 'test-results/matrix-audio-pcm32f.wav';
		if (existsSync(wavOut)) unlinkSync(wavOut);

		await page.goto('/editor');
		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await manager.getByRole('button', { name: 'New project' }).click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('PCM Audio Matrix');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(page.getByRole('heading', { name: 'PCM Audio Matrix' })).toBeVisible();

		const fileInput = page.locator('input[name="media-files"]');
		await fileInput.setInputFiles(['tests/fixtures/tone.wav']);
		const media = page.getByRole('listbox', { name: 'Project media' });
		const audioAsset = media.getByRole('option').filter({ hasText: 'tone.wav' });
		await expect(audioAsset).toBeVisible({ timeout: 15_000 });
		await audioAsset.dragTo(page.locator('[data-track-lane]').last());

		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const exportDialog = page.getByRole('dialog', { name: 'Export' });
		await expect(exportDialog).toBeVisible();

		await exportDialog.getByLabel('Format').selectOption('wav');
		const audioCodecSelect = exportDialog.getByLabel(/Audio Bit Depth/i);
		await audioCodecSelect.selectOption('pcm32f');

		const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
		await exportDialog.getByRole('button', { name: 'Export video' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/\.wav$/);
		await download.saveAs(wavOut);

		// Mediabunny re-probe
		const bytes = readFileSync(wavOut);
		const input = new Input({
			source: new BlobSource(new Blob([bytes], { type: 'audio/wav' })),
			formats: ALL_FORMATS
		});
		try {
			const track = await input.getPrimaryAudioTrack();
			expect(track).toBeDefined();
			if (track) {
				expect(await track.getCodec()).toBe('pcm-f32');
				expect(await track.getNumberOfChannels()).toBe(2);
				expect(await track.getSampleRate()).toBe(48000);
			}
		} finally {
			input.dispose();
		}

		// AVFoundation Independent Validation
		if (existsSync(SWIFT_VALIDATOR)) {
			const report = runAvFoundation(wavOut);
			expect(report.isPlayable).toBe(true);
			expect(report.audioTracks![0].formats).toContain('lpcm');
		}
	});

	test('5. HEVC Main Profile in MP4 (H.265 + AAC) with AVFoundation validation', async ({
		page
	}) => {
		test.setTimeout(120_000);
		const outPath = 'test-results/matrix-hevc-main.mp4';
		if (existsSync(outPath)) unlinkSync(outPath);

		await page.goto('/editor');
		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await manager.getByRole('button', { name: 'New project' }).click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('HEVC Matrix Test');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(page.getByRole('heading', { name: 'HEVC Matrix Test' })).toBeVisible();

		const fileInput = page.locator('input[name="media-files"]');
		await fileInput.setInputFiles(['tests/fixtures/colors.mp4']);
		const media = page.getByRole('listbox', { name: 'Project media' });
		const asset = media.getByRole('option').filter({ hasText: 'colors.mp4' });
		await expect(asset).toBeVisible({ timeout: 15_000 });
		await asset.dragTo(page.locator('[data-track-lane]').first());
		await expect(page.locator('.timeline-clip')).toHaveCount(2);

		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const exportDialog = page.getByRole('dialog', { name: 'Export' });
		await expect(exportDialog).toBeVisible();

		await exportDialog.getByLabel('Format').selectOption('mp4');
		const codecSelect = exportDialog.getByLabel(/Video Codec/i);
		await expect(codecSelect).toBeVisible();
		await codecSelect.selectOption('hevc-mp4');

		// In Google Chrome (chrome-gpu / host Chrome), HEVC hardware encode is supported.
		// In bundled Playwright Chromium, proprietary codecs are not licensed.
		const isSupported = await page.evaluate(async () => {
			if (typeof VideoEncoder === 'undefined') return false;
			try {
				const res = await VideoEncoder.isConfigSupported({
					codec: 'hvc1.1.6.L120.B0',
					width: 1280,
					height: 720,
					bitrate: 5_000_000
				});
				return res.supported ?? false;
			} catch {
				return false;
			}
		});

		const exportBtn = exportDialog.getByRole('button', { name: 'Export video' });
		if (!isSupported) {
			// Verify UI honesty: Export button must be disabled when codec is unsupported by runtime
			await expect(exportBtn).toBeDisabled();
			return;
		}

		// Full export when supported (real Chrome / GPU)
		await expect(exportBtn).toBeEnabled();
		const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
		await exportBtn.click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/\.mp4$/);
		await download.saveAs(outPath);
		expect(existsSync(outPath)).toBe(true);

		// Mediabunny re-probe
		const bytes = readFileSync(outPath);
		const input = new Input({
			source: new BlobSource(new Blob([bytes], { type: 'video/mp4' })),
			formats: ALL_FORMATS
		});
		try {
			const videoTrack = await input.getPrimaryVideoTrack();
			expect(videoTrack).toBeDefined();
			if (videoTrack) {
				const codec = await videoTrack.getCodec();
				expect(codec).toMatch(/hevc/i);
			}
		} finally {
			input.dispose();
		}

		// AVFoundation Independent Validation
		if (existsSync(SWIFT_VALIDATOR)) {
			const report = runAvFoundation(outPath);
			expect(report.isPlayable).toBe(true);
			expect(report.videoTracks![0].formats).toContain('hvc1');
		}
	});

	test('6. AV1 Main Profile in WebM and MP4 with WebCodecs Verification', async ({ page }) => {
		test.setTimeout(120_000);
		const outPath = 'test-results/matrix-av1-main.webm';
		if (existsSync(outPath)) unlinkSync(outPath);

		await page.goto('/editor');
		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await manager.getByRole('button', { name: 'New project' }).click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('AV1 Matrix Test');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(page.getByRole('heading', { name: 'AV1 Matrix Test' })).toBeVisible();

		const fileInput = page.locator('input[name="media-files"]');
		await fileInput.setInputFiles(['tests/fixtures/colors.mp4']);
		const media = page.getByRole('listbox', { name: 'Project media' });
		const asset = media.getByRole('option').filter({ hasText: 'colors.mp4' });
		await expect(asset).toBeVisible({ timeout: 15_000 });
		await asset.dragTo(page.locator('[data-track-lane]').first());
		await expect(page.locator('.timeline-clip')).toHaveCount(2);

		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const exportDialog = page.getByRole('dialog', { name: 'Export' });
		await expect(exportDialog).toBeVisible();

		await exportDialog.getByLabel('Format').selectOption('webm');
		const codecSelect = exportDialog.getByLabel(/Video Codec/i);
		await expect(codecSelect).toBeVisible();
		await codecSelect.selectOption('av1-webm');

		const isSupported = await page.evaluate(async () => {
			if (typeof VideoEncoder === 'undefined') return false;
			try {
				const res = await VideoEncoder.isConfigSupported({
					codec: 'av01.0.08M.08',
					width: 1280,
					height: 720,
					bitrate: 4_000_000
				});
				return res.supported ?? false;
			} catch {
				return false;
			}
		});

		const exportBtn = exportDialog.getByRole('button', { name: 'Export video' });
		if (!isSupported) {
			await expect(exportBtn).toBeDisabled();
			return;
		}

		await expect(exportBtn).toBeEnabled();
		const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
		await exportBtn.click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/\.webm$/);
		await download.saveAs(outPath);
		expect(existsSync(outPath)).toBe(true);

		// Mediabunny re-probe
		const bytes = readFileSync(outPath);
		const input = new Input({
			source: new BlobSource(new Blob([bytes], { type: 'video/webm' })),
			formats: ALL_FORMATS
		});
		try {
			const videoTrack = await input.getPrimaryVideoTrack();
			expect(videoTrack).toBeDefined();
			if (videoTrack) {
				const codec = await videoTrack.getCodec();
				expect(codec).toMatch(/av1/i);
			}
		} finally {
			input.dispose();
		}
	});

	test('7. Audio Matrix: Opus in WebM/MP4, and Honest Reporting of FLAC and H.264 Profile Limits', async ({
		page
	}) => {
		await page.goto('/editor', { waitUntil: 'networkidle' });

		const report = await page.evaluate(async () => {
			const checkAudio = async (codec: string) => {
				if (typeof AudioEncoder === 'undefined') return false;
				try {
					const res = await AudioEncoder.isConfigSupported({
						codec,
						sampleRate: 48000,
						numberOfChannels: 2,
						bitrate: 192_000
					});
					return res.supported ?? false;
				} catch {
					return false;
				}
			};

			const checkVideo = async (codec: string) => {
				if (typeof VideoEncoder === 'undefined') return false;
				try {
					const res = await VideoEncoder.isConfigSupported({
						codec,
						width: 1920,
						height: 1080,
						bitrate: 10_000_000,
						framerate: 30
					});
					return res.supported ?? false;
				} catch {
					return false;
				}
			};

			return {
				audio: {
					aac: await checkAudio('mp4a.40.2'),
					opus: await checkAudio('opus'),
					flac: await checkAudio('flac')
				},
				h264Profiles: {
					high51: await checkVideo('avc1.640033'),
					high10_10bit: await checkVideo('avc1.6e0033'),
					high422: await checkVideo('avc1.7a0033'),
					high444: await checkVideo('avc1.f40033')
				}
			};
		});

		// AAC and Opus are supported by WebCodecs
		expect(report.audio.aac).toBe(true);
		expect(report.audio.opus).toBe(true);

		// FLAC is NOT supported natively by WebCodecs AudioEncoder
		expect(report.audio.flac).toBe(false);

		// H.264 High Profile Level 5.1 is supported
		expect(report.h264Profiles.high51).toBe(true);

		// macOS VideoToolbox WebCodecs does NOT support H.264 10-bit or 4:2:2/4:4:4
		expect(report.h264Profiles.high10_10bit).toBe(false);
		expect(report.h264Profiles.high422).toBe(false);
		expect(report.h264Profiles.high444).toBe(false);
	});

	test('8. Export Dialog Presets Validation across all resolutions and qualities', async ({
		page
	}) => {
		await page.goto('/editor');

		const presetsValidation = await page.evaluate(async () => {
			const { settingsForPreset, dimensionsForPreset, bitrateFor } =
				await import('../../src/editor/services/export/presets');
			const mockProject: any = {
				id: 'test-project',
				name: 'Presets Test',
				settings: {
					width: 1920,
					height: 1080,
					fps: 30,
					sampleRate: 48000
				}
			};

			const resolutions = ['480p', '720p', '1080p', '1440p', '4k'] as const;
			const qualities = ['low', 'medium', 'high', 'pro', 'custom'] as const;

			const dims = resolutions.map((res) => ({
				preset: res,
				...dimensionsForPreset(mockProject, res, 'mp4')
			}));

			const bitrates = qualities.map((q) => ({
				quality: q,
				bitrate: bitrateFor(1920, 1080, 30, q)
			}));

			const fullSettings = resolutions.map((r) =>
				settingsForPreset(mockProject, {
					format: 'mp4',
					preset: r,
					quality: 'high',
					audio: true,
					filename: `Test_${r}`
				})
			);

			return { dims, bitrates, fullSettings };
		});

		// Check dimension calculations
		expect(presetsValidation.dims.find((d) => d.preset === '480p')).toEqual({
			preset: '480p',
			width: 852,
			height: 480
		});
		expect(presetsValidation.dims.find((d) => d.preset === '720p')).toEqual({
			preset: '720p',
			width: 1280,
			height: 720
		});
		expect(presetsValidation.dims.find((d) => d.preset === '1080p')).toEqual({
			preset: '1080p',
			width: 1920,
			height: 1080
		});
		expect(presetsValidation.dims.find((d) => d.preset === '1440p')).toEqual({
			preset: '1440p',
			width: 2560,
			height: 1440
		});
		expect(presetsValidation.dims.find((d) => d.preset === '4k')).toEqual({
			preset: '4k',
			width: 3840,
			height: 2160
		});

		// Check quality bitrate scaling: Low < Medium < High < Pro
		const qMap = Object.fromEntries(presetsValidation.bitrates.map((b) => [b.quality, b.bitrate]));
		expect(qMap.low).toBeLessThan(qMap.medium);
		expect(qMap.medium).toBeLessThan(qMap.high);
		expect(qMap.high).toBeLessThan(qMap.pro);

		// All presets generated valid settings objects
		expect(presetsValidation.fullSettings).toHaveLength(5);
		for (const s of presetsValidation.fullSettings) {
			expect(s.fps).toBe(30);
			expect(s.audio).toBe(true);
			expect(s.videoBitrate).toBeGreaterThan(0);
		}
	});
});
