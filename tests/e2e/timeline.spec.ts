import { expect, test } from '@playwright/test';

declare global {
	interface Window {
		__timelineLongTasks?: number[];
	}
}

async function addOfflineAudioAsset(page: import('@playwright/test').Page): Promise<void> {
	await page.evaluate(async () => {
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('tfve');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const projectId = await new Promise<string>((resolve, reject) => {
			const request = database
				.transaction('meta', 'readonly')
				.objectStore('meta')
				.get('lastOpenedProjectId');
			request.onsuccess = () => resolve(String(request.result?.value));
			request.onerror = () => reject(request.error);
		});
		const transaction = database.transaction('projects', 'readwrite');
		const record = await new Promise<{
			id: string;
			updatedAt: string;
			value: { assets: Record<string, unknown> };
		}>((resolve, reject) => {
			const request = transaction.objectStore('projects').get(projectId);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		record.value.assets['e2e-audio-asset'] = {
			id: 'e2e-audio-asset',
			kind: 'audio',
			name: 'fixture.wav',
			mimeType: 'audio/wav',
			size: 1,
			duration: 5_000_000,
			hasAudio: true,
			opfsPath: `projects/${projectId}/media/e2e-audio-asset.wav`,
			offline: true
		};
		transaction.objectStore('projects').put(record);
		await new Promise<void>((resolve, reject) => {
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () => reject(transaction.error);
		});
		database.close();
	});
}

test('timeline edits through drag, keyboard, autosave, reload, and native project round-trip', async ({
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
		browserProblems.push(`requestfailed: ${request.url()} (${request.failure()?.errorText})`);
	});
	await page.addInitScript(() => {
		Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
		Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true });
	});

	await page.goto('/editor');
	await page
		.getByRole('dialog', { name: 'Your Projects' })
		.getByRole('button', { name: 'New project' })
		.click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Timeline validation');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'Timeline validation' })).toBeVisible();
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 10_000 });
	await addOfflineAudioAsset(page);
	await page.reload();

	const asset = page.getByRole('option', { name: /fixture\.wav/ });
	await expect(asset).toBeVisible();
	const audioLane = page.getByRole('gridcell', { name: 'Audio 1 track lane' });
	await asset.dragTo(audioLane, { targetPosition: { x: 24, y: 28 } });
	const clip = page.locator('.timeline-clip').first();
	await expect(clip).toBeVisible();
	await expect(clip).toContainText('fixture.wav');
	await expect(clip).toHaveAttribute('aria-label', /selected/);

	const initialClipBox = await clip.boundingBox();
	expect(initialClipBox).not.toBeNull();
	await page.mouse.move(initialClipBox!.x + 20, initialClipBox!.y + 20);
	await page.mouse.down();
	await page.mouse.move(initialClipBox!.x - 40, initialClipBox!.y + 20, { steps: 4 });
	await page.mouse.up();
	await expect
		.poll(() => clip.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left)))
		.toBe(0);

	const beforeMove = await clip.evaluate((element) =>
		Number.parseFloat((element as HTMLElement).style.left)
	);
	const clipBox = await clip.boundingBox();
	expect(clipBox).not.toBeNull();
	await page.mouse.move(clipBox!.x + 20, clipBox!.y + 20);
	await page.mouse.down();
	await page.mouse.move(clipBox!.x + 116, clipBox!.y + 20, { steps: 4 });
	await page.mouse.up();
	await expect
		.poll(() => clip.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left)))
		.toBeGreaterThan(beforeMove + 48);

	const startTrim = page.getByRole('button', { name: 'Trim start of fixture.wav' });
	await startTrim.scrollIntoViewIfNeeded();
	const beforeTrim = await clip.getAttribute('aria-label');
	const trimBox = await startTrim.boundingBox();
	expect(trimBox).not.toBeNull();
	await page.mouse.move(trimBox!.x + 3, trimBox!.y + trimBox!.height / 2);
	await page.mouse.down();
	await page.mouse.move(trimBox!.x + 15, trimBox!.y + trimBox!.height / 2, { steps: 3 });
	await page.mouse.up();
	await expect.poll(() => clip.getAttribute('aria-label')).not.toBe(beforeTrim);
	const afterPointerTrim = await clip.getAttribute('aria-label');
	await startTrim.focus();
	await page.keyboard.press('ArrowRight');
	await expect.poll(() => clip.getAttribute('aria-label')).not.toBe(afterPointerTrim);

	for (let index = 0; index < 8; index += 1) {
		await page.keyboard.press('Control+d');
	}
	await expect(page.locator('.timeline-clip-count')).toHaveText('9 clips');
	const firstClip = page.locator('.timeline-clip').first();
	await firstClip.click();
	const clipPosition = await firstClip.evaluate((element) => {
		const style = (element as HTMLElement).style;
		return {
			left: Number.parseFloat(style.left),
			width: Number.parseFloat(style.width)
		};
	});
	await page
		.getByRole('slider', { name: 'Timeline playhead' })
		.click({ position: { x: clipPosition.left + clipPosition.width / 2, y: 12 } });
	await page.keyboard.press('s');
	await expect(page.locator('.timeline-clip-count')).toHaveText('10 clips');
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 10_000 });
	await page.reload();
	await expect(page.locator('.timeline-clip-count')).toHaveText('10 clips');
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 10_000 });

	await page.getByRole('button', { name: 'File', exact: true }).click();
	await page.getByRole('menuitem', { name: /Save a Copy as \.tfve/ }).click();
	const saveDialog = page.getByRole('dialog', { name: 'Save a project copy?' });
	await saveDialog.getByRole('checkbox', { name: /Include media files/ }).uncheck();
	const downloadPromise = page.waitForEvent('download');
	await saveDialog.getByRole('button', { name: 'Save Copy as .tfve' }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe('Timeline validation.tfve');
	const archivePath = await download.path();
	expect(archivePath).not.toBeNull();

	await page.getByRole('button', { name: 'File', exact: true }).click();
	const fileChooserPromise = page.waitForEvent('filechooser');
	await page.getByRole('menuitem', { name: 'Open .tfve Project…' }).click();
	const fileChooser = await fileChooserPromise;
	await fileChooser.setFiles(archivePath!);
	await expect(page.getByRole('heading', { name: 'Timeline validation' })).toBeVisible();
	await expect(page.locator('.timeline-clip-count')).toHaveText('10 clips');
	expect(browserProblems).toEqual([]);
});

test('virtualizes 500 timeline clips and keeps scrub interactions responsive', async ({ page }) => {
	await page.goto('/editor');
	await page
		.getByRole('dialog', { name: 'Your Projects' })
		.getByRole('button', { name: 'New project' })
		.click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('500 clip smoke');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: '500 clip smoke' })).toBeVisible();
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 10_000 });

	await page.evaluate(async () => {
		interface StoredClip {
			id: string;
			assetId: string;
			start: number;
			duration: number;
			sourceIn: number;
			sourceOut: number;
			speed: number;
			volume: number;
		}
		interface StoredTrack {
			kind: 'video' | 'audio';
			clips: StoredClip[];
		}
		interface StoredProject {
			id: string;
			updatedAt: string;
			assets: Record<string, unknown>;
			tracks: StoredTrack[];
		}
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('tfve');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});

		const projectId = await new Promise<string>((resolve, reject) => {
			const request = database
				.transaction('meta', 'readonly')
				.objectStore('meta')
				.get('lastOpenedProjectId');
			request.onsuccess = () => resolve(String(request.result?.value));
			request.onerror = () => reject(request.error);
		});
		const transaction = database.transaction('projects', 'readwrite');
		const record = await new Promise<{
			id: string;
			updatedAt: string;
			value: StoredProject;
		}>((resolve, reject) => {
			const request = transaction.objectStore('projects').get(projectId);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const assetId = 'virtualization-audio-asset';
		record.value.assets[assetId] = {
			id: assetId,
			kind: 'audio',
			name: 'long-test-track.wav',
			mimeType: 'audio/wav',
			size: 1,
			duration: 1_000_000,
			hasAudio: true,
			opfsPath: `projects/${projectId}/media/${assetId}.wav`,
			offline: true
		};
		const audioTrack = record.value.tracks.find((track) => track.kind === 'audio');
		if (!audioTrack) throw new Error('Default audio track is missing.');
		audioTrack.clips = Array.from({ length: 500 }, (_, index) => ({
			id: `virtualized-clip-${index}`,
			assetId,
			start: index * 1_000_000,
			duration: 1_000_000,
			sourceIn: 0,
			sourceOut: 1_000_000,
			speed: 1,
			volume: 1
		}));
		record.value.updatedAt = new Date().toISOString();
		record.updatedAt = record.value.updatedAt;
		transaction.objectStore('projects').put(record);
		await new Promise<void>((resolve, reject) => {
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () => reject(transaction.error);
		});
		database.close();
	});

	await page.reload();
	const timelineScroller = page.locator('.timeline-scroll');
	await expect(page.locator('.timeline-clip')).not.toHaveCount(0);
	await expect.poll(() => page.locator('.timeline-clip').count()).toBeLessThan(80);
	await page.evaluate(() => {
		const tasks: number[] = [];
		Object.assign(window, { __timelineLongTasks: tasks });
		const observer = new PerformanceObserver((entries) => {
			for (const entry of entries.getEntries()) tasks.push(entry.duration);
		});
		observer.observe({ type: 'longtask', buffered: false });
	});
	await timelineScroller.evaluate((element) => {
		element.scrollTo({ left: 24_000, behavior: 'instant' });
	});
	await expect.poll(() => page.locator('.timeline-clip').count()).toBeLessThan(80);
	const playhead = page.getByRole('slider', { name: 'Timeline playhead' });
	await playhead.click({ position: { x: 300, y: 12 } });
	await expect(playhead).not.toHaveAttribute('aria-valuenow', '0');
	await expect(
		page.getByRole('status', { name: 'Playhead time and sequence duration' })
	).not.toContainText('00:00:00:00');
	const longestTask = await page.evaluate(() => Math.max(0, ...(window.__timelineLongTasks ?? [])));
	expect(longestTask).toBeLessThan(100);
});

test('resizes tracks and keeps video above audio tracks', async ({ page }) => {
	await page.goto('/editor');
	await page
		.getByRole('dialog', { name: 'Your Projects' })
		.getByRole('button', { name: 'New project' })
		.click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Track layout');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'Track layout' })).toBeVisible();

	await page.getByRole('button', { name: '+ Video Track' }).click();
	await expect(page.getByRole('gridcell', { name: 'Video 2 track lane' })).toBeVisible();
	await page.getByRole('button', { name: '+ Audio Track' }).click();
	await expect(page.getByRole('gridcell', { name: 'Audio 2 track lane' })).toBeVisible();
	const rows = page.locator('.timeline-track-row');
	await expect(rows).toHaveCount(4);
	expect(
		await rows.evaluateAll((elements) =>
			elements.map((element) => element.classList.contains('track-video'))
		)
	).toEqual([true, true, false, false]);

	const resizeHandle = page.getByRole('separator', { name: 'Resize Video 2 track height' });
	const initialHeight = Number(await resizeHandle.getAttribute('aria-valuenow'));
	const handleBox = await resizeHandle.boundingBox();
	expect(handleBox).not.toBeNull();
	await page.mouse.move(handleBox!.x + 80, handleBox!.y + 3);
	await page.mouse.down();
	await page.mouse.move(handleBox!.x + 80, handleBox!.y + 43, { steps: 4 });
	await page.mouse.up();
	await expect(resizeHandle).toHaveAttribute('aria-valuenow', String(initialHeight + 40));
	await resizeHandle.focus();
	await page.keyboard.press('ArrowDown');
	await expect(resizeHandle).toHaveAttribute('aria-valuenow', String(initialHeight + 32));

	const audioTrackHeader = page.locator('[data-track-header-id]').filter({ hasText: 'Audio 1' });
	const videoTrackHeader = page.locator('[data-track-header-id]').filter({ hasText: 'Video 2' });
	await audioTrackHeader.dragTo(videoTrackHeader);
	expect(
		await rows.evaluateAll((elements) =>
			elements.map((element) => element.classList.contains('track-video'))
		)
	).toEqual([true, true, false, false]);
});
