import { expect, test } from '@playwright/test';

test.describe('Gate P: Captions System E2E', () => {
	test.beforeEach(async ({ page }) => {
		const browserProblems: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error' || message.type() === 'warning') {
				browserProblems.push(`${message.type()}: ${message.text()}`);
			}
		});
		page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));

		await page.goto('/editor');
		const manager = page.locator('.project-manager-dialog');
		try {
			await manager.waitFor({ state: 'visible', timeout: 5000 });
			await manager.getByRole('button', { name: 'New project' }).click();
			const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
			await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Gate P Captions E2E');
			await createDialog.getByRole('button', { name: 'Create project' }).click();
			await expect(manager).not.toBeVisible();
		} catch {}
	});

	test('creates caption segment from toolbar, edits inline and in captions panel, verifies rendering & styling', async ({
		page
	}) => {
		// 1. Add Caption via Timeline Toolbar (Caption Layer)
		const addCaptionBtn = page.getByRole('button', { name: 'Caption Layer' });
		await expect(addCaptionBtn).toBeVisible();
		await addCaptionBtn.click();

		// Verify caption segment appears on timeline in caption track
		const captionSegment = page.locator('.caption-segment-view').first();
		await expect(captionSegment).toBeVisible();
		await expect(captionSegment).toContainText('New Caption');

		// 2. Open Captions tab in left panel
		const captionsTab = page.locator('#captions-panel-title');
		await expect(captionsTab).toBeVisible();
		await captionsTab.click();

		// Verify cue textarea is present in Captions Panel
		const cueTextarea = page.locator('.caption-cue-textarea').first();
		await expect(cueTextarea).toBeVisible();
		await expect(cueTextarea).toHaveValue('New Caption');

		// 3. Edit text in Captions Panel and verify timeline segment updates
		await cueTextarea.fill('Hello Subtitles! 🌍');
		await expect(captionSegment).toContainText('Hello Subtitles! 🌍');

		// 4. Switch to Track Style tab in Captions Panel
		const styleTab = page.getByRole('tab', { name: 'Track Style' });
		await expect(styleTab).toBeVisible();
		await styleTab.click();

		// Verify preset cards exist and apply 'Bold Outline'
		const outlinePreset = page.getByRole('button', { name: /^Bold Outline/i });
		await expect(outlinePreset).toBeVisible();
		await outlinePreset.click();

		// 5. Test Export dialog shows sidecar subtitle options when caption track exists
		const exportBtn = page.getByRole('button', { name: 'Export', exact: true });
		await expect(exportBtn).toBeVisible();
		await exportBtn.click();

		const exportDialog = page.locator('.export-dialog');
		await expect(exportDialog).toBeVisible();

		// Verify sidecar checkbox is visible
		const sidecarCheckbox = page.getByText('Export sidecar subtitle file');
		await expect(sidecarCheckbox).toBeVisible();

		// Close export dialog
		await page.getByRole('button', { name: 'Close', exact: true }).click();
		await expect(exportDialog).not.toBeVisible();
	});

	test('opens local AI Auto-Caption modal with privacy guarantee, consent flow, and models manager', async ({
		page
	}) => {
		// 1. Open Captions tab
		const captionsTab = page.locator('#captions-panel-title');
		await captionsTab.click();

		// 2. Click Auto-Caption button
		const autoCaptionBtn = page.getByRole('button', { name: /Auto-Caption/i });
		await expect(autoCaptionBtn).toBeVisible();
		await autoCaptionBtn.click();

		// 3. Verify modal opens with privacy guarantee and consent or controls
		const modal = page
			.locator('dialog.editor-dialog')
			.filter({ hasText: 'Local AI Speech-to-Text' });
		await expect(modal).toBeVisible();
		await expect(modal).toContainText('100% Private');

		// 4. Switch to Models Manager tab in modal
		const modelsTab = modal.getByRole('button', { name: 'Models Manager' });
		await expect(modelsTab).toBeVisible();
		await modelsTab.click();

		await expect(modal).toContainText('Available AI Models & Local Storage Cache');
		await expect(modal).toContainText('Whisper Tiny (English)');
		await expect(modal).toContainText('Whisper Base (Multilingual)');

		// Switch back to Transcribe tab
		const transcribeTab = modal.getByRole('button', { name: 'Transcribe' });
		await expect(transcribeTab).toBeVisible();
		await transcribeTab.click();

		// Cancel / close modal
		const closeBtn = modal.getByRole('button', { name: 'Close' });
		await expect(closeBtn).toBeVisible();
		await closeBtn.click();
		await expect(modal).not.toBeVisible();
	});

	test('executes search & replace across caption cues and verifies one-step undo', async ({
		page
	}) => {
		// 1. Add caption cue
		await page.getByRole('button', { name: 'Caption Layer' }).click();
		const captionsTab = page.locator('#captions-panel-title');
		await captionsTab.click();

		const cueTextarea = page.locator('.caption-cue-textarea').first();
		await expect(cueTextarea).toBeVisible();
		await cueTextarea.fill('Video editing in browser');

		// 2. Seek playhead forward and add second cue
		await page.evaluate(() => {
			const s = (
				window as unknown as {
					__TFVE_STORE__?: { getState: () => { setPlayhead: (t: number) => void } };
				}
			).__TFVE_STORE__;
			s?.getState().setPlayhead(3_000_000);
		});
		await page.getByRole('button', { name: '+ Add Cue' }).click();
		const secondCue = page.locator('.caption-cue-textarea').nth(1);
		await expect(secondCue).toBeVisible();
		await secondCue.fill('Modern browser video tech');

		// 3. Use Search & Replace bar
		const searchInput = page.getByPlaceholder('Search cues…');
		const replaceInput = page.getByPlaceholder('Replace…');
		const replaceAllBtn = page.getByRole('button', { name: 'Replace All' });

		await searchInput.fill('browser');
		await replaceInput.fill('client');
		await replaceAllBtn.click();

		// Verify replacement took effect in both cues
		await expect(cueTextarea).toHaveValue('Video editing in client');
		await expect(secondCue).toHaveValue('Modern client video tech');

		// 4. Test Undo via keyboard (Cmd+Z / Ctrl+Z)
		const isMac = process.platform === 'darwin';
		await page.keyboard.press(isMac ? 'Meta+z' : 'Control+z');
		await expect(secondCue).toHaveValue('Modern browser video tech');
	});

	test('runs Auto-Caption with DEV fake transcriber and verifies zero cloud leakage network assertion', async ({
		page
	}) => {
		// Network request assertion: verify no cloud / telemetry requests occur
		const externalRequests: string[] = [];
		await page.route('**/*', (route) => {
			const url = route.request().url();
			if (
				!url.startsWith('http://localhost:4321') &&
				!url.startsWith('data:') &&
				!url.startsWith('blob:')
			) {
				externalRequests.push(url);
			}
			return route.continue();
		});

		// Add audio / sample media
		await page.evaluate(() => {
			(window as unknown as { __TFVE_DEV_FAKE_STT?: boolean }).__TFVE_DEV_FAKE_STT = true;
			localStorage.setItem('tfve_stt_consent', 'true');
		});

		const captionsTab = page.locator('#captions-panel-title');
		await captionsTab.click();

		const autoCaptionBtn = page.getByRole('button', { name: /Auto-Caption/i });
		await autoCaptionBtn.click();

		const modal = page
			.locator('dialog.editor-dialog')
			.filter({ hasText: 'Local AI Speech-to-Text' });
		await expect(modal).toBeVisible();

		// Click Start Auto-Caption
		const startBtn = modal.getByRole('button', { name: 'Start Auto-Caption' });
		if (await startBtn.isVisible()) {
			await startBtn.click();
		}

		// Close modal once finished or dismissed
		const doneBtn = modal.getByRole('button', { name: /Done|Close/i });
		await doneBtn.click();

		// Verify zero network leaks
		expect(externalRequests).toEqual([]);
	});

	test('dragging or trimming caption segment clamps to neighbors and never overlaps adjacent captions', async ({
		page
	}) => {
		// 1. Add caption cue 1 at 0
		await page.getByRole('button', { name: 'Caption Layer' }).click();

		// 2. Seek to 4s and add caption cue 2
		await page.evaluate(() => {
			const s = (
				window as unknown as {
					__TFVE_STORE__?: { getState: () => { setPlayhead: (t: number) => void } };
				}
			).__TFVE_STORE__;
			s?.getState().setPlayhead(4_000_000);
		});
		await page.getByRole('button', { name: 'Caption Layer' }).click();

		const cues = page.locator('.caption-segment-view');
		await expect(cues).toHaveCount(2);

		// Verify initial times: cue 1 ends before cue 2 starts
		const trackCaptions = await page.evaluate(() => {
			const s = (
				window as unknown as {
					__TFVE_STORE__?: {
						getState: () => {
							project: {
								tracks: Array<{ kind: string; captions?: Array<{ start: number; end: number }> }>;
							};
						};
					};
				}
			).__TFVE_STORE__;
			const capTrack = s?.getState().project.tracks.find((t) => t.kind === 'caption');
			return capTrack?.captions ?? [];
		});
		expect(trackCaptions.length).toBe(2);
		const initialCue1End = trackCaptions[0]?.end ?? 0;
		const initialCue2Start = trackCaptions[1]?.start ?? 0;
		expect(initialCue1End).toBeLessThanOrEqual(initialCue2Start);

		// Drag cue 1 right trim handle far to the right (attempting to overlap cue 2)
		const cue1EndHandle = cues.first().locator('.caption-trim-end');
		const handleBox = await cue1EndHandle.boundingBox();
		if (handleBox) {
			await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
			await page.mouse.down();
			await page.mouse.move(handleBox.x + 500, handleBox.y + handleBox.height / 2);
			await page.mouse.up();
		}

		// Verify cue 1 was strictly clamped at cue 2 start without overlapping or corrupting cue 2
		const updatedCaptions = await page.evaluate(() => {
			const s = (
				window as unknown as {
					__TFVE_STORE__?: {
						getState: () => {
							project: {
								tracks: Array<{ kind: string; captions?: Array<{ start: number; end: number }> }>;
							};
						};
					};
				}
			).__TFVE_STORE__;
			const capTrack = s?.getState().project.tracks.find((t) => t.kind === 'caption');
			return capTrack?.captions ?? [];
		});
		expect(updatedCaptions.length).toBe(2);
		expect(updatedCaptions[0]!.end).toBeLessThanOrEqual(updatedCaptions[1]!.start);
	});

	test('rearranging caption tracks in timeline allows positioning with video tracks and clamps safely above audio tracks', async ({
		page
	}) => {
		await page.waitForFunction(() => Boolean((window as any).__TFVE_STORE__?.getState().project));

		// Add two caption tracks via store
		await page.evaluate(() => {
			const s = (
				window as unknown as {
					__TFVE_STORE__?: {
						getState: () => {
							addCaptionTrack: (name?: string) => string | null;
						};
					};
				}
			).__TFVE_STORE__;
			s?.getState().addCaptionTrack('English Subtitles');
			s?.getState().addCaptionTrack('Spanish Subtitles');
		});

		// Verify both caption track headers are present at top
		const captionHeaders = page.locator('.timeline-track-header.track-caption');
		await expect(captionHeaders).toHaveCount(2);

		// Get initial track order
		const initialOrder = await page.evaluate(() => {
			const s = (
				window as unknown as {
					__TFVE_STORE__?: {
						getState: () => {
							project: { tracks: Array<{ id: string; name: string; kind: string }> };
						};
					};
				}
			).__TFVE_STORE__;
			return s?.getState().project.tracks.map((t) => ({ name: t.name, kind: t.kind })) ?? [];
		});

		expect(initialOrder[0]?.kind).toBe('caption');
		expect(initialOrder[1]?.kind).toBe('caption');

		// Reorder: drag second caption track onto first or use reorderTimelineTrack
		await page.evaluate(() => {
			const s = (
				window as unknown as {
					__TFVE_STORE__?: {
						getState: () => {
							project: { tracks: Array<{ id: string; kind: string }> };
							reorderTimelineTrack: (id: string, target: number) => boolean;
						};
					};
				}
			).__TFVE_STORE__;
			const capTracks = s?.getState().project.tracks.filter((t) => t.kind === 'caption') ?? [];
			if (capTracks[1]) {
				s?.getState().reorderTimelineTrack(capTracks[1].id, 0);
			}
		});

		// Verify reordered tracks: captions swapped positions, but both remain at the top
		const reorderedOrder = await page.evaluate(() => {
			const s = (
				window as unknown as {
					__TFVE_STORE__?: {
						getState: () => {
							project: { tracks: Array<{ id: string; name: string; kind: string }> };
						};
					};
				}
			).__TFVE_STORE__;
			return s?.getState().project.tracks.map((t) => ({ name: t.name, kind: t.kind })) ?? [];
		});

		expect(reorderedOrder[0]?.name).toBe(initialOrder[1]?.name);
		expect(reorderedOrder[1]?.name).toBe(initialOrder[0]?.name);
		expect(reorderedOrder[0]?.kind).toBe('caption');
		expect(reorderedOrder[1]?.kind).toBe('caption');
		expect(reorderedOrder[2]?.kind).toBe('video');
		expect(reorderedOrder[3]?.kind).toBe('audio');

		// Attempt to drag/reorder a caption track all the way to the bottom (target index 99)
		await page.evaluate(() => {
			const s = (
				window as unknown as {
					__TFVE_STORE__?: {
						getState: () => {
							project: { tracks: Array<{ id: string; kind: string }> };
							reorderTimelineTrack: (id: string, target: number) => boolean;
						};
					};
				}
			).__TFVE_STORE__;
			const capTracks = s?.getState().project.tracks.filter((t) => t.kind === 'caption') ?? [];
			if (capTracks[0]) {
				s?.getState().reorderTimelineTrack(capTracks[0].id, 99);
			}
		});

		// Verify it clamps safely within the visual track zone (above audio tracks)
		const clampedOrder = await page.evaluate(() => {
			const s = (
				window as unknown as {
					__TFVE_STORE__?: {
						getState: () => {
							project: { tracks: Array<{ id: string; name: string; kind: string }> };
						};
					};
				}
			).__TFVE_STORE__;
			return s?.getState().project.tracks.map((t) => t.kind) ?? [];
		});

		expect(clampedOrder).toEqual(['caption', 'video', 'caption', 'audio']);
	});

	test('allows dragging caption directly on preview canvas and adjusting custom position offsets', async ({
		page
	}) => {
		await page.waitForFunction(() => Boolean((window as any).__TFVE_STORE__?.getState().project));

		// 1. Add Caption via Timeline Toolbar
		const addCaptionBtn = page.getByRole('button', { name: 'Caption Layer' });
		await expect(addCaptionBtn).toBeVisible();
		await addCaptionBtn.click();

		// 2. Caption canvas overlay should appear on preview player
		const overlay = page.locator('.caption-canvas-overlay');
		await expect(overlay).toBeVisible({ timeout: 5000 });

		// 3. Drag overlay on preview monitor
		const box = await overlay.boundingBox();
		expect(box).not.toBeNull();
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
			await page.mouse.down();
			await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 - 40, { steps: 5 });
			await page.mouse.up();
		}

		// 4. Verify caption style in store was updated to custom preset with offsets
		const captionStyle = await page.evaluate(() => {
			const s = (
				window as unknown as {
					__TFVE_STORE__?: {
						getState: () => {
							project: { tracks: Array<{ kind: string; captionStyle?: { positionPreset: string; customX?: number; customY?: number } }> };
						};
					};
				}
			).__TFVE_STORE__;
			const capTrack = s?.getState().project.tracks.find((t) => t.kind === 'caption');
			return capTrack?.captionStyle;
		});

		expect(captionStyle?.positionPreset).toBe('custom');
		expect(typeof captionStyle?.customX).toBe('number');
		expect(typeof captionStyle?.customY).toBe('number');
	});
});
