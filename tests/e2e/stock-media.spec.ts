import { chromium, expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';

interface IndexedProject {
	value: {
		assets: Record<
			string,
			{
				name: string;
				hasAudio: boolean;
				audioChecked?: boolean;
				audioCodec?: string;
				videoDecodable?: boolean;
				fps?: number;
				width?: number;
				height?: number;
				duration: number;
			}
		>;
		tracks: Array<{
			kind: string;
			clips: Array<{
				id?: string;
				assetId: string;
				start: number;
				duration?: number;
				sourceIn?: number;
				sourceOut?: number;
				speed?: number;
				volume?: number;
				linkId?: string;
			}>;
		}>;
	};
}

async function codecReport(
	browserName: string,
	browser: Awaited<ReturnType<typeof chromium.launch>>
) {
	const page = await browser.newPage();
	const report = await page.evaluate(async () => {
		const videoConfig = async (codec: string) =>
			typeof VideoDecoder === 'undefined'
				? { supported: false }
				: VideoDecoder.isConfigSupported({
						codec,
						codedWidth: 1920,
						codedHeight: 1080
					}).catch((error: unknown) => ({ supported: false, error: String(error) }));
		const audioConfig = async (codec: string) =>
			typeof AudioDecoder === 'undefined'
				? { supported: false }
				: AudioDecoder.isConfigSupported({
						codec,
						sampleRate: 48_000,
						numberOfChannels: 2
					}).catch((error: unknown) => ({ supported: false, error: String(error) }));
		const [h264, vp9, aac, opus] = await Promise.all([
			videoConfig('avc1.640028'),
			videoConfig('vp09.00.10.08'),
			audioConfig('mp4a.40.2'),
			audioConfig('opus')
		]);
		const videoElement = document.createElement('video');
		const audioElement = document.createElement('audio');
		return {
			userAgent: navigator.userAgent,
			webCodecs: {
				videoDecoderAvailable: typeof VideoDecoder !== 'undefined',
				audioDecoderAvailable: typeof AudioDecoder !== 'undefined'
			},
			webCodecsSupport: { h264, vp9, aac, opus },
			htmlMedia: {
				h264: videoElement.canPlayType('video/mp4; codecs="avc1.640028"'),
				vp9: videoElement.canPlayType('video/webm; codecs="vp9"'),
				aac: audioElement.canPlayType('audio/mp4; codecs="mp4a.40.2"'),
				opus: audioElement.canPlayType('audio/webm; codecs="opus"')
			}
		};
	});
	console.info(`STOCK_CODEC_REPORT ${browserName} ${JSON.stringify(report)}`);
	await page.close();
}

async function readCanvasCenter(canvas: Locator): Promise<number[]> {
	return canvas.evaluate((element) => {
		const source = element as HTMLCanvasElement;
		const sample = document.createElement('canvas');
		sample.width = 1;
		sample.height = 1;
		const context = sample.getContext('2d', { willReadFrequently: true });
		if (!context) throw new Error('Could not read the preview canvas.');
		context.drawImage(
			source,
			Math.floor(source.width / 2),
			Math.floor(source.height / 2),
			1,
			1,
			0,
			0,
			1,
			1
		);
		return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
	});
}

test('reproduces 1080p25 video-only import and immediate Program/Source preview', async ({
	page
}) => {
	const browserProblems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			browserProblems.push(`${message.type()}: ${message.text()}`);
		}
	});
	page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));
	const chromiumBrowser = await chromium.launch();
	try {
		await codecReport('playwright-chromium', chromiumBrowser);
	} finally {
		await chromiumBrowser.close();
	}
	try {
		const chromeBrowser = await chromium.launch({ channel: 'chrome' });
		try {
			await codecReport('chrome-channel', chromeBrowser);
		} finally {
			await chromeBrowser.close();
		}
	} catch (error) {
		console.info(`STOCK_CODEC_REPORT chrome-channel unavailable: ${String(error)}`);
	}

	await page.goto('/editor');
	await page
		.getByRole('dialog', { name: 'Your Projects' })
		.getByRole('button', { name: 'New project' })
		.click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Stock Media Repro');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'Stock Media Repro' })).toBeVisible();
	await page
		.locator('input[name="media-files"]')
		.setInputFiles([
			'tests/fixtures/stock-1080p25-noaudio.mp4',
			'tests/fixtures/stock-1080p25-audio.mp4',
			'tests/fixtures/stock-1080p25-noaudio.webm'
		]);
	const library = page.getByRole('listbox', { name: 'Project media' });
	await expect(library.getByRole('option')).toHaveCount(3, { timeout: 20_000 });
	const noAudioMp4 = library.getByRole('option', { name: /stock-1080p25-noaudio\.mp4/ });
	const webm = library.getByRole('option', { name: /stock-1080p25-noaudio\.webm/ });
	await noAudioMp4.click();
	await expect(page.getByTestId('source-video')).toBeVisible();
	const videoLane = page.locator('[data-track-lane]').first();
	await noAudioMp4.dragTo(videoLane, {
		targetPosition: { x: 2, y: 24 }
	});
	await webm.click();
	await expect(page.getByTestId('source-video')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Play source' })).toBeEnabled();
	await page.getByRole('button', { name: 'Play source' }).click();
	await expect
		.poll(() => page.getByLabel('Source timecode').textContent())
		.not.toContain('00:00:00:00 /');
	await page.getByRole('button', { name: 'Pause source' }).click();
	await webm.dragTo(videoLane, {
		targetPosition: { x: 250, y: 24 }
	});
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 20_000 });
	const records = await page.evaluate(async () => {
		const request = indexedDB.open('tfve');
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const projects = await new Promise<unknown[]>((resolve, reject) => {
			const getAll = database.transaction('projects').objectStore('projects').getAll();
			getAll.onsuccess = () => resolve(getAll.result as IndexedProject[]);
			getAll.onerror = () => reject(getAll.error);
		});
		database.close();
		return { version: database.version, projectRecords: projects };
	});
	console.info(
		`STOCK_IMPORT_REPORT ${JSON.stringify({
			assetOptions: await library.getByRole('option').count(),
			assetCards: await page.locator('.media-asset').count(),
			status: await page.locator('[role="status"]').allTextContents(),
			database: records
		})}`
	);
	const projectRecords = records as { projectRecords: Array<{ value?: IndexedProject['value'] }> };
	const savedProjects = projectRecords.projectRecords.flatMap((record) =>
		record.value ? [record.value] : []
	);
	console.info(
		`STOCK_PROJECT_RECORDS ${JSON.stringify(
			savedProjects.map(({ assets, tracks }) => ({
				assets: Object.values(assets),
				clips: tracks.flatMap((track) => track.clips)
			}))
		)}`
	);
	const importedProject = savedProjects.find(({ assets }) => Object.keys(assets).length > 0);
	expect(importedProject, 'Stock import should persist in the project').toBeDefined();
	if (!importedProject) return;
	console.info(
		`STOCK_ASSET_METADATA ${JSON.stringify(
			Object.values(importedProject.assets).find((item) => item.width === 1920)
		)}`
	);

	await page.waitForTimeout(2_000);
	const videoTrack = importedProject.tracks.find((track) => track.kind === 'video');
	const audioTrack = importedProject.tracks.find((track) => track.kind === 'audio');
	expect(videoTrack?.clips).toHaveLength(2);
	expect(audioTrack?.clips).toHaveLength(0);
	const assets = Object.values(importedProject.assets);
	const importedAsset = assets.find((item) => item.name.endsWith('noaudio.mp4'));
	const audioAsset = assets.find((item) => item.name.endsWith('-audio.mp4'));
	const webmAsset = assets.find((item) => item.name.endsWith('noaudio.webm'));
	expect(importedAsset?.hasAudio).toBe(false);
	expect(importedAsset?.audioChecked).toBe(true);
	expect(importedAsset?.fps).toBe(25);
	expect(audioAsset?.hasAudio).toBe(true);
	expect(audioAsset?.audioChecked).toBe(true);
	expect(audioAsset?.audioCodec).toContain('mp4a');
	expect(webmAsset?.hasAudio).toBe(false);
	expect(webmAsset?.videoDecodable).toBe(true);
	expect(page.locator('.monitor-source video')).toHaveCount(1);
	await expect(page.locator('[data-testid="preview-canvas"]')).toBeVisible();
	await expect
		.poll(async () => {
			const rect = await page.getByTestId('preview-canvas').boundingBox();
			return rect ? rect.width * rect.height : 0;
		})
		.toBeGreaterThan(0);
	const ruler = page.getByRole('slider', { name: 'Timeline playhead' });
	const rulerBounds = await ruler.boundingBox();
	expect(rulerBounds).not.toBeNull();
	await page.mouse.click(rulerBounds!.x + 4 * 64, rulerBounds!.y + rulerBounds!.height / 2);
	await expect
		.poll(async () => {
			const stats = await page.evaluate(() => window.__tfvePlaybackTest?.getStats());
			return stats?.time ?? 0;
		})
		.toBeGreaterThan(3_000_000);
	await expect
		.poll(async () => (await readCanvasCenter(page.getByTestId('preview-canvas'))).some(Boolean))
		.toBe(true);
	const previewCanvas = page.getByTestId('preview-canvas');
	const program = {
		...(await previewCanvas.evaluate((canvas) => {
			const element = canvas as HTMLCanvasElement;
			const rect = element.getBoundingClientRect();
			return {
				cssWidth: rect.width,
				cssHeight: rect.height,
				backingWidth: element.width,
				backingHeight: element.height
			};
		})),
		center: await readCanvasCenter(previewCanvas)
	};
	const debugStats = await page.evaluate(() => window.__tfvePlaybackTest?.getStats());
	console.info(
		`STOCK_PREVIEW_REPORT ${JSON.stringify({
			program,
			debugStats,
			sourceMonitor: await page.locator('.monitor-source').innerText(),
			sourceCanvasCount: await page.locator('.monitor-source video, .monitor-source img').count(),
			visiblePlaybackError: await page.locator('.preview-playback-error').allTextContents(),
			browserProblems
		})}`
	);
	expect(program.center).not.toEqual([0, 0, 0]);
	expect(browserProblems).toEqual([]);

	const legacyState = await page.evaluate(async () => {
		interface LegacyAsset {
			name: string;
			hasAudio: boolean;
			audioChecked?: boolean;
		}
		interface LegacyClip {
			id: string;
			assetId: string;
			start: number;
			duration: number;
			sourceIn: number;
			sourceOut: number;
			speed: number;
			volume: number;
			linkId?: string;
		}
		interface LegacyProject {
			id: string;
			updatedAt: string;
			value: {
				updatedAt: string;
				assets: Record<string, LegacyAsset>;
				tracks: Array<{ kind: string; clips: LegacyClip[] }>;
			};
		}
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('tfve');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const transaction = database.transaction('projects', 'readwrite');
		const store = transaction.objectStore('projects');
		const records = await new Promise<LegacyProject[]>((resolve, reject) => {
			const request = store.getAll();
			request.onsuccess = () => resolve(request.result as LegacyProject[]);
			request.onerror = () => reject(request.error);
		});
		const record = records[0];
		if (!record) throw new Error('Imported project is missing from IndexedDB.');
		const videoClip = record.value.tracks
			.find((track) => track.kind === 'video')
			?.clips.find(
				(clip) => record.value.assets[clip.assetId]?.name === 'stock-1080p25-noaudio.mp4'
			);
		const audioTrack = record.value.tracks.find((track) => track.kind === 'audio');
		if (!videoClip || !audioTrack) throw new Error('Could not seed legacy linked audio data.');
		const asset = record.value.assets[videoClip.assetId];
		if (!asset) throw new Error('Video-only asset is missing from project data.');
		asset.hasAudio = true;
		delete asset.audioChecked;
		videoClip.linkId = 'legacy-false-audio-link';
		audioTrack.clips.push({
			...videoClip,
			id: crypto.randomUUID(),
			linkId: 'legacy-false-audio-link'
		});
		const now = new Date().toISOString();
		record.updatedAt = now;
		record.value.updatedAt = now;
		store.put(record);
		await new Promise<void>((resolve, reject) => {
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () => reject(transaction.error);
		});
		database.close();
		return { insertedLinkedClips: 1 };
	});
	expect(legacyState.insertedLinkedClips).toBe(1);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Stock Media Repro' })).toBeVisible();
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 20_000 });
	const repairedLegacyProject = await page.evaluate(async () => {
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('tfve');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const records = await new Promise<Array<{ value: IndexedProject['value'] }>>(
			(resolve, reject) => {
				const request = database.transaction('projects').objectStore('projects').getAll();
				request.onsuccess = () =>
					resolve(request.result as Array<{ value: IndexedProject['value'] }>);
				request.onerror = () => reject(request.error);
			}
		);
		database.close();
		return records[0]?.value;
	});
	const repairedAsset = Object.values(repairedLegacyProject?.assets ?? {}).find((item) =>
		item.name.endsWith('noaudio.mp4')
	);
	expect(repairedAsset?.hasAudio).toBe(false);
	expect(repairedAsset?.audioChecked).toBe(true);
	expect(repairedLegacyProject?.tracks.find((track) => track.kind === 'audio')?.clips).toHaveLength(
		0
	);
	expect(browserProblems).toEqual([]);
});
