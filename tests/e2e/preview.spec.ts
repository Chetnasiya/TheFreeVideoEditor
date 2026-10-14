import { expect, test, type Page } from '@playwright/test';
import type { PlaybackDebugStats, PlaybackEngine } from '../../src/editor/services/playback/engine';

declare global {
	interface Window {
		__tfvePlaybackTest?: {
			getStats: () => PlaybackDebugStats;
			engine?: PlaybackEngine;
		};
	}
}

async function createProject(page: Page, name: string): Promise<void> {
	await page.goto('/editor');
	await page
		.getByRole('dialog', { name: 'Your Projects' })
		.getByRole('button', { name: 'New project' })
		.click();
	const dialog = page.getByRole('dialog', { name: 'Create a Project' });
	await dialog.getByRole('textbox', { name: 'Project name' }).fill(name);
	await dialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function importMedia(page: Page, ...files: string[]): Promise<void> {
	await page.locator('input[name="media-files"]').setInputFiles(files);
	await expect(
		page.getByRole('listbox', { name: 'Project media' }).getByRole('option')
	).toHaveCount(files.length, { timeout: 30_000 });
	await expect(page.locator('.media-library')).not.toHaveAttribute('aria-busy', 'true', {
		timeout: 30_000
	});
}

async function seekTo(page: Page, seconds: number): Promise<void> {
	const ruler = page.getByRole('slider', { name: 'Timeline playhead' });
	const bounds = await ruler.boundingBox();
	expect(bounds).not.toBeNull();
	await page.mouse.click(bounds!.x + seconds * 64, bounds!.y + 12);
}

async function readCenterPixel(page: Page): Promise<number[]> {
	return page.getByTestId('preview-canvas').evaluate((canvas) => {
		const element = canvas as HTMLCanvasElement;
		const sampleCanvas = document.createElement('canvas');
		sampleCanvas.width = 1;
		sampleCanvas.height = 1;
		const context = sampleCanvas.getContext('2d', { willReadFrequently: true });
		if (!context) throw new Error('Preview canvas has no 2D context.');
		context.drawImage(
			element,
			Math.floor(element.width / 2),
			Math.floor(element.height / 2),
			1,
			1,
			0,
			0,
			1,
			1
		);
		const { data } = context.getImageData(0, 0, 1, 1);
		return Array.from(data);
	});
}

async function expectDominantColor(
	page: Page,
	color: 'red' | 'green' | 'blue' | 'yellow' | 'magenta' | 'cyan' | 'black'
): Promise<void> {
	await expect
		.poll(async () => {
			const [red, green, blue] = await readCenterPixel(page);
			switch (color) {
				case 'red':
					return red! > 170 && green! < 90 && blue! < 90;
				case 'green':
					return green! > 150 && red! < 100 && blue! < 100;
				case 'blue':
					return blue! > 150 && red! < 100 && green! < 100;
				case 'yellow':
					return red! > 160 && green! > 150 && blue! < 100;
				case 'magenta':
					return red! > 160 && blue! > 150 && green! < 100;
				case 'cyan':
					return green! > 150 && blue! > 150 && red! < 100;
				case 'black':
					return red! < 35 && green! < 35 && blue! < 35;
			}
		})
		.toBe(true);
}

async function getPlaybackStats(page: Page): Promise<PlaybackDebugStats> {
	return page.evaluate(() => {
		const hooks = window.__tfvePlaybackTest;
		if (!hooks) throw new Error('Playback test hook is unavailable.');
		return hooks.getStats();
	});
}

async function markAssetsOffline(page: Page, projectName: string): Promise<boolean> {
	return page.evaluate(async (targetProjectName) => {
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('tfve');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const record = await new Promise<{
			id: string;
			updatedAt: string;
			value: {
				name: string;
				assets: Record<string, { offline?: boolean; opfsPath: string }>;
			};
		}>((resolve, reject) => {
			const request = database.transaction('projects', 'readonly').objectStore('projects').getAll();
			request.onsuccess = () => {
				const project = request.result.find(
					(item: { value: { name: string } }) => item.value.name === targetProjectName
				);
				if (project) resolve(project);
				else reject(new Error(`Could not find project ${targetProjectName} in IndexedDB.`));
			};
			request.onerror = () => reject(request.error);
		});
		const appDirectory = await (
			await navigator.storage.getDirectory()
		).getDirectoryHandle('projects');
		const projectDirectory = await appDirectory.getDirectoryHandle(record.id);
		const mediaDirectory = await projectDirectory.getDirectoryHandle('media');
		for (const asset of Object.values(record.value.assets)) {
			const filename = asset.opfsPath.split('/').at(-1);
			if (!filename) throw new Error('An asset has an invalid OPFS filename.');
			try {
				await mediaDirectory.removeEntry(filename);
			} catch (error) {
				if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
			}
			asset.offline = true;
		}
		const transaction = database.transaction(['projects', 'meta'], 'readwrite');
		transaction.objectStore('projects').put(record);
		transaction.objectStore('meta').put({ key: 'lastOpenedProjectId', value: record.id });
		await new Promise<void>((resolve, reject) => {
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () => reject(transaction.error);
		});
		const verified = Object.values(record.value.assets).every((asset) => asset.offline === true);
		database.close();
		return verified;
	}, projectName);
}

async function projectAssetHasAudio(page: Page, projectName: string, assetName: string) {
	return page.evaluate(
		async ({ targetProjectName, targetAssetName }) => {
			interface StoredProject {
				value: {
					name: string;
					assets: Record<string, { name: string; hasAudio: boolean }>;
				};
			}
			function isStoredProject(record: unknown): record is StoredProject {
				if (typeof record !== 'object' || record === null || !('value' in record)) return false;
				const value = record.value;
				return (
					typeof value === 'object' &&
					value !== null &&
					'name' in value &&
					value.name === targetProjectName &&
					'assets' in value &&
					typeof value.assets === 'object' &&
					value.assets !== null
				);
			}
			const database = await new Promise<IDBDatabase>((resolve, reject) => {
				const request = indexedDB.open('tfve');
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			const hasAudio = await new Promise<boolean>((resolve, reject) => {
				const request = database
					.transaction('projects', 'readonly')
					.objectStore('projects')
					.getAll();
				request.onsuccess = () => {
					const project = (request.result as unknown[]).find(isStoredProject);
					const asset = project
						? Object.values(project.value.assets).find((item) => item.name === targetAssetName)
						: undefined;
					resolve(asset?.hasAudio ?? false);
				};
				request.onerror = () => reject(request.error);
			});
			database.close();
			return hasAudio;
		},
		{ targetProjectName: projectName, targetAssetName: assetName }
	);
}

test('scrubs decoded frames, handles cuts, shuttle and buffering, and closes cleanly', async ({
	page
}) => {
	const browserProblems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			browserProblems.push(`${message.type()}: ${message.text()}`);
		}
	});
	page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));
	page.on('requestfailed', (request) => {
		const errorText = request.failure()?.errorText;
		if (errorText !== 'net::ERR_ABORTED') {
			browserProblems.push(`requestfailed: ${request.url()} (${errorText})`);
		}
	});
	await page.addInitScript(() => {
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
		Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
	});
	await createProject(page, 'Playback acceptance');
	await importMedia(page, 'tests/fixtures/colors.mp4');
	const media = page.getByRole('listbox', { name: 'Project media' });
	const clip = media.getByRole('option', { name: /colors\.mp4/ });
	await expect(clip).toBeVisible();
	await clip.dragTo(page.getByRole('gridcell', { name: 'Video 1 track lane' }), {
		targetPosition: { x: 20, y: 28 }
	});
	await expect(page.locator('.timeline-clip')).toHaveCount(2);
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 20_000 });

	for (const [second, color] of [
		[0.5, 'red'],
		[1.5, 'green'],
		[2.5, 'blue'],
		[3.5, 'yellow'],
		[4.5, 'magenta'],
		[5.5, 'cyan']
	] as const) {
		await seekTo(page, second);
		await expectDominantColor(page, color);
	}
	for (const second of [0.6, 2.6, 4.6, 1.6]) await seekTo(page, second);
	await expectDominantColor(page, 'green');

	const videoClips = page.locator('.timeline-clip[aria-label^="Clip: colors.mp4, Video 1"]');
	await videoClips.first().click();
	await seekTo(page, 3);
	await page.keyboard.press('s');
	await expect(page.locator('.timeline-clip-count')).toHaveText('4 clips');
	await expect(videoClips).toHaveCount(2);
	await clip.dragTo(page.getByRole('gridcell', { name: 'Video 1 track lane' }), {
		targetPosition: { x: 487, y: 28 }
	});
	await expect(page.locator('.timeline-clip-count')).toHaveText('6 clips');
	await seekTo(page, 6.8);
	await expectDominantColor(page, 'black');
	await seekTo(page, 7.8);
	await expectDominantColor(page, 'red');

	await page.getByRole('button', { name: 'Toggle playback loop' }).click();
	await expect(page.getByRole('button', { name: 'Toggle playback loop' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.keyboard.press('End');
	for (let index = 0; index < 10; index += 1) {
		await page.keyboard.press('ArrowLeft');
	}
	await page.getByTestId('preview-canvas').focus();
	await page.keyboard.press('Space');
	await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
	await expect
		.poll(async () => {
			const stats = await getPlaybackStats(page);
			return stats.playing && stats.time < 500_000;
		})
		.toBe(true);
	await page.keyboard.press('j');
	await expect(page.locator('.preview-rate')).toContainText('reverse');
	await page.keyboard.press('j');
	await expect(page.locator('.preview-rate')).toContainText('2× reverse');
	await page.keyboard.press('k');
	await expect(page.locator('.preview-play-button')).toHaveAttribute('aria-label', 'Play');
	await page.keyboard.press('l');
	await expect.poll(async () => (await getPlaybackStats(page)).rate).toBe(1);
	await page.keyboard.press('l');
	await expect(page.locator('.preview-rate')).toContainText('2× forward');
	await page.keyboard.press('k');

	const beforeClose = await getPlaybackStats(page);
	expect(beforeClose.elementCount).toBeLessThanOrEqual(6);
	await page.getByRole('button', { name: 'File', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Close Project' }).click();
	await expect(page.getByText('No project open').first()).toBeVisible();
	expect(await page.evaluate(() => typeof window.__tfvePlaybackTest === 'undefined')).toBe(true);
	expect(browserProblems).toEqual([]);
});

test('composites image layers, hides tracks, meters audio, and shows offline media', async ({
	page
}) => {
	const browserProblems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			browserProblems.push(`${message.type()}: ${message.text()}`);
		}
	});
	page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));
	page.on('requestfailed', (request) => {
		const errorText = request.failure()?.errorText;
		if (errorText !== 'net::ERR_ABORTED') {
			browserProblems.push(`requestfailed: ${request.url()} (${errorText})`);
		}
	});
	await page.addInitScript(() => {
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
		Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
	});
	await createProject(page, 'Layer and audio check');
	await page.keyboard.press('Control+Shift+v');
	await expect(page.getByRole('gridcell', { name: 'Video 2 track lane' })).toBeVisible();
	await importMedia(
		page,
		'tests/fixtures/colors.mp4',
		'tests/fixtures/overlay.png',
		'tests/fixtures/tone.wav'
	);
	await expect
		.poll(() => projectAssetHasAudio(page, 'Layer and audio check', 'colors.mp4'))
		.toBe(true);
	const media = page.getByRole('listbox', { name: 'Project media' });
	await media
		.getByRole('option', { name: /colors\.mp4/ })
		.dragTo(page.getByRole('gridcell', { name: 'Video 1 track lane' }), {
			targetPosition: { x: 20, y: 28 }
		});
	await media
		.getByRole('option', { name: /tone\.wav/ })
		.dragTo(page.getByRole('gridcell', { name: 'Audio 1 track lane' }), {
			targetPosition: { x: 20, y: 28 }
		});
	await expect(page.locator('.timeline-clip')).toHaveCount(3);

	await media
		.getByRole('option', { name: /overlay\.png/ })
		.dragTo(page.getByRole('gridcell', { name: 'Video 2 track lane' }), {
			targetPosition: { x: 20, y: 28 }
		});
	await expect(page.locator('.timeline-clip')).toHaveCount(4);
	await seekTo(page, 0.5);
	await expect
		.poll(async () => {
			const [red, green, blue] = await readCenterPixel(page);
			return red! < 100 && green! > 100 && blue! > 150;
		})
		.toBe(true);
	await page.getByRole('button', { name: 'Hide Video 2' }).click();
	await seekTo(page, 0.5);
	await expect
		.poll(async () => (await getPlaybackStats(page)).activeVideoAssets[0]?.name)
		.toBe('colors.mp4');
	await expectDominantColor(page, 'red');

	await page.getByRole('button', { name: 'Mute audio', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Unmute audio', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByRole('button', { name: 'Unmute audio', exact: true }).click();
	await seekTo(page, 0.5);
	await page
		.getByRole('toolbar', { name: 'Program playback controls' })
		.getByRole('button', { name: 'Play', exact: true })
		.click();
	await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
	await expect.poll(async () => (await getPlaybackStats(page)).meter).toBeGreaterThan(0.005);
	await page.keyboard.press('k');
	await page.getByRole('button', { name: 'Show Video 2' }).click();

	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 20_000 });
	await page.getByRole('button', { name: 'File', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Close Project' }).click();
	await expect(page.getByText('No project open').first()).toBeVisible();
	expect(await markAssetsOffline(page, 'Layer and audio check')).toBe(true);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Layer and audio check' })).toBeVisible();
	await seekTo(page, 0.5);
	await expect(page.getByText('Offline media', { exact: true })).toBeVisible();
	await expect(page.locator('.preview-warning-overlay')).toContainText('colors.mp4');
	await page.getByRole('button', { name: 'File', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Close Project' }).click();
	await expect
		.poll(() => page.evaluate(() => typeof window.__tfvePlaybackTest === 'undefined'))
		.toBe(true);
	expect(browserProblems).toEqual([]);
});
