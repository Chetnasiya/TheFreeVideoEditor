import { chromium } from '@playwright/test';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { Input, BlobSource, ALL_FORMATS, EncodedPacketSink } from 'mediabunny';

async function getPacket(path) {
	const bytes = readFileSync(path);
	const input = new Input({ source: new BlobSource(new Blob([bytes])), formats: ALL_FORMATS });
	const track = await input.getPrimaryVideoTrack();
	const config = await track.getDecoderConfig();
	const sink = new EncodedPacketSink(track);
	const packet = await sink.getFirstKeyPacket();
	const data = new Uint8Array(packet.data);
	const timestamp = packet.timestamp;
	const type = packet.type;
	input.dispose();
	return { config, data, timestamp, type };
}

async function main() {
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext();
	const page = await context.newPage();

	await page.addInitScript(() => {
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
		Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
	});

	await page.goto('http://localhost:4321/editor');
	const manager = page.getByRole('dialog', { name: 'Your Projects' });
	await manager.getByRole('button', { name: 'New project' }).click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('UI 10bit Gradient Test');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await page.getByRole('heading', { name: 'UI 10bit Gradient Test' }).waitFor();

	// Import gradient.png
	const fileInput = page.locator('input[name="media-files"]');
	await fileInput.setInputFiles(['tests/fixtures/gradient.png']);
	const media = page.getByRole('listbox', { name: 'Project media' });
	const asset = media.getByRole('option').filter({ hasText: 'gradient.png' });
	await asset.waitFor({ timeout: 15_000 });

	// Drag to timeline video track at time 0
	await asset.dragTo(page.locator('[data-track-lane]').first(), {
		targetPosition: { x: 5, y: 15 }
	});
	await page.locator('.timeline-clip').first().waitFor();

	const out8 = 'test-results/ui-test-8bit.webm';
	const out10 = 'test-results/ui-test-10bit.webm';
	if (existsSync(out8)) unlinkSync(out8);
	if (existsSync(out10)) unlinkSync(out10);

	// Export 1: 8-bit VP9 WebM at custom 60 Mbps
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const exportDialog = page.getByRole('dialog', { name: 'Export' });
	await exportDialog.waitFor();

	await exportDialog.getByLabel('Format').selectOption('webm');
	await exportDialog.getByLabel(/Video Codec/i).selectOption('vp9-webm');
	await exportDialog.getByLabel(/Quality/i).selectOption('custom');
	await exportDialog.getByLabel(/Bitrate \(Mbps\)/i).fill('60');
	await exportDialog.getByLabel('Include audio').uncheck();

	let downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
	await exportDialog.getByRole('button', { name: 'Export video' }).click();
	let download = await downloadPromise;
	await download.saveAs(out8);
	console.log('Saved 8-bit WebM, size:', readFileSync(out8).length);

	// Close export dialog
	await exportDialog.getByRole('button', { name: 'Close', exact: true }).click();
	await page.waitForTimeout(500);

	// Export 2: 10-bit VP9 Profile 2 WebM at custom 60 Mbps
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await exportDialog.waitFor();

	await exportDialog.getByLabel('Format').selectOption('webm');
	await exportDialog.getByLabel(/Video Codec/i).selectOption('vp9-profile2-webm');
	await exportDialog.getByLabel(/Quality/i).selectOption('custom');
	await exportDialog.getByLabel(/Bitrate \(Mbps\)/i).fill('60');
	await exportDialog.getByLabel('Include audio').uncheck();

	downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
	await exportDialog.getByRole('button', { name: 'Export video' }).click();
	download = await downloadPromise;
	await download.saveAs(out10);
	console.log('Saved 10-bit WebM, size:', readFileSync(out10).length);

	// Extract packets
	const p8 = await getPacket(out8);
	const p10 = await getPacket(out10);

	// Decode both and measure distinct luma levels on middle row
	const result = await page.evaluate(async ({ f8, f10 }) => {
		async function decodeAndMeasure(info) {
			let decoded = null;
			const decoder = new VideoDecoder({
				output: (frame) => {
					decoded = frame;
				},
				error: (e) => console.error('Decoder error:', e)
			});
			decoder.configure(info.config);
			decoder.decode(new EncodedVideoChunk({
				type: info.type,
				timestamp: Math.round(info.timestamp * 1_000_000),
				data: new Uint8Array(info.data)
			}));
			await decoder.flush();

			if (!decoded) throw new Error('Decode failed');
			const format = decoded.format;
			const w = decoded.displayWidth;
			const h = decoded.displayHeight;

			const alloc = decoded.allocationSize({ planeIndex: 0 });
			const yBytes = new Uint8Array(alloc);
			decoded.copyTo(yBytes, { planeIndex: 0 });

			const midRow = Math.floor(h / 2);
			const set = new Set();
			if (format === 'I420P10') {
				const y16 = new Uint16Array(yBytes.buffer, yBytes.byteOffset, yBytes.byteLength / 2);
				const rowOffset = midRow * w;
				for (let x = 0; x < w; x++) set.add(y16[rowOffset + x]);
			} else {
				const rowOffset = midRow * w;
				for (let x = 0; x < w; x++) set.add(yBytes[rowOffset + x]);
			}
			const uniqueLevels = set.size;
			const min = Math.min(...Array.from(set));
			const max = Math.max(...Array.from(set));
			decoded.close();
			return { format, w, h, uniqueLevels, min, max };
		}

		const r8 = await decodeAndMeasure(f8);
		const r10 = await decodeAndMeasure(f10);
		return { r8, r10, ratio: r10.uniqueLevels / r8.uniqueLevels };
	}, {
		f8: { config: p8.config, data: Array.from(p8.data), timestamp: p8.timestamp, type: p8.type },
		f10: { config: p10.config, data: Array.from(p10.data), timestamp: p10.timestamp, type: p10.type }
	});

	console.log('MEASURED_LUMA_LEVELS_RESULT:', JSON.stringify(result, null, 2));
	await browser.close();
}

main().catch(console.error);

