import { expect, test } from '@playwright/test';
import * as path from 'path';

const ARTIFACT_DIR = '/Users/gajananpalepwad/.gemini/antigravity/brain/fcf7ed63-3029-4ec5-b062-4e16714deed9';

test.describe('Effects & Graphic Templates Drag and Drop with Animations', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/editor');
		const manager = page.locator('.project-manager-dialog');
		try {
			await manager.waitFor({ state: 'visible', timeout: 3000 });
			await manager.getByRole('button', { name: 'New project' }).click();
			const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
			await createDialog.getByRole('textbox', { name: 'Project name' }).fill('DnD Animation Test');
			await createDialog.getByRole('button', { name: 'Create project' }).click();
			await expect(manager).not.toBeVisible();
		} catch {
			const fileMenu = page.getByRole('button', { name: 'File' });
			if (await fileMenu.isVisible()) {
				await fileMenu.click();
				const newProjBtn = page.getByRole('menuitem', { name: /New Project/i });
				if (await newProjBtn.isVisible()) {
					await newProjBtn.click();
					const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
					await createDialog.getByRole('textbox', { name: 'Project name' }).fill('DnD Animation Test');
					await createDialog.getByRole('button', { name: 'Create project' }).click();
				}
			}
		}
		await page.waitForFunction(() => Boolean((window as any).__TFVE_STORE__));
	});

	test('Effect drag and drop onto timeline clip with satisfying celebration animations and FX badge', async ({
		page
	}) => {
		// 1. Add an adjustment layer to have a video clip in timeline
		const addAdjustmentBtn = page.getByRole('button', { name: 'Adjustment Layer' });
		await expect(addAdjustmentBtn).toBeVisible();
		await addAdjustmentBtn.click();

		const clips = page.locator('.timeline-clip:not(.is-ghost)');
		await expect(clips).toHaveCount(1);
		const targetClip = clips.first();

		// 2. Open Effects panel
		const effectsTab = page.locator('#effects-panel-title');
		await expect(effectsTab).toBeVisible();
		await effectsTab.click();

		const effectCards = page.locator('.effect-card');
		await expect(effectCards.first()).toBeVisible();

		// 3. Simulate dragging Gaussian Blur effect onto target clip
		const clipBox = await targetClip.boundingBox();
		expect(clipBox).not.toBeNull();
		if (!clipBox) return;

		// Dispatch dragenter and dragover
		await page.evaluate((box) => {
			const clipEl = document.querySelector('.timeline-clip:not(.is-ghost)');
			if (!clipEl) return;

			const dt = new DataTransfer();
			dt.setData('application/x-tfve-effect', 'blur');
			dt.setData('application/x-tfve-effect-name', 'Gaussian Blur');

			clipEl.dispatchEvent(
				new DragEvent('dragenter', {
					bubbles: true,
					cancelable: true,
					clientX: box.x + box.width / 2,
					clientY: box.y + box.height / 2,
					dataTransfer: dt
				})
			);
			clipEl.dispatchEvent(
				new DragEvent('dragover', {
					bubbles: true,
					cancelable: true,
					clientX: box.x + box.width / 2,
					clientY: box.y + box.height / 2,
					dataTransfer: dt
				})
			);
		}, clipBox);

		// Verify target glow and badge
		await expect(targetClip).toHaveClass(/is-effect-target/);
		const targetBadge = page.locator('.clip-effect-target-badge');
		await expect(targetBadge).toBeVisible();
		await expect(targetBadge).toContainText('Gaussian Blur');

		await page.screenshot({ path: path.join(ARTIFACT_DIR, 'effect_drag_hover_glow.png') });

		// 4. Drop the effect onto the clip
		await page.evaluate((box) => {
			const clipEl = document.querySelector('.timeline-clip:not(.is-ghost)');
			if (!clipEl) return;

			const dt = new DataTransfer();
			dt.setData('application/x-tfve-effect', 'blur');
			dt.setData('application/x-tfve-effect-name', 'Gaussian Blur');

			clipEl.dispatchEvent(
				new DragEvent('drop', {
					bubbles: true,
					cancelable: true,
					clientX: box.x + box.width / 2,
					clientY: box.y + box.height / 2,
					dataTransfer: dt
				})
			);
		}, clipBox);

		// Verify celebration animation overlay: success badge, flash ring, and is-drop-celebrated class
		await expect(targetClip).toHaveClass(/is-drop-celebrated/);
		const successBadge = page.locator('.clip-drop-success-badge');
		await expect(successBadge).toBeVisible();
		await expect(successBadge).toContainText('Gaussian Blur Added!');

		await page.screenshot({ path: path.join(ARTIFACT_DIR, 'effect_drop_celebration.png') });

		// Verify persistent Premiere Pro-style fx badge appears on the clip
		const fxBadge = page.locator('.clip-fx-badge');
		await expect(fxBadge).toBeVisible();
		await expect(fxBadge).toHaveText('fx');

		await page.waitForTimeout(1100);
		await page.screenshot({ path: path.join(ARTIFACT_DIR, 'effect_applied_fx_badge.png') });
	});

	test('Graphic template drag and drop onto track and into new track drop zone with V+ preview', async ({
		page
	}) => {
		// 1. Open Graphics panel
		const graphicsTab = page.locator('#graphics-panel-title');
		await expect(graphicsTab).toBeVisible();
		await graphicsTab.click();

		const graphicCard = page.locator('.graphic-card').first();
		await expect(graphicCard).toBeVisible();

		// 2. Drag graphic template onto existing track lane
		const trackLane = page.locator('.timeline-track-lane').first();
		const laneBox = await trackLane.boundingBox();
		expect(laneBox).not.toBeNull();
		if (!laneBox) return;

		await page.evaluate((box) => {
			const lane = document.querySelector('.timeline-track-lane');
			if (!lane) return;

			const dt = new DataTransfer();
			dt.setData('application/x-tfve-graphic-template', 'mixkit-minimal-wipe-lower-third');
			dt.setData('application/x-tfve-graphic-name', 'Clean Minimal Wipe Lower Third');

			lane.dispatchEvent(
				new DragEvent('dragover', {
					bubbles: true,
					cancelable: true,
					clientX: box.x + 120,
					clientY: box.y + box.height / 2,
					dataTransfer: dt
				})
			);
		}, laneBox);

		// Ghost preview should appear
		const ghostClip = page.locator('.timeline-clip.is-ghost');
		await expect(ghostClip).toBeVisible();
		await page.screenshot({ path: path.join(ARTIFACT_DIR, 'graphic_track_ghost_preview.png') });

		// Drop graphic template on existing track
		await page.evaluate((box) => {
			const lane = document.querySelector('.timeline-track-lane');
			if (!lane) return;

			const dt = new DataTransfer();
			dt.setData('application/x-tfve-graphic-template', 'mixkit-minimal-wipe-lower-third');
			dt.setData('application/x-tfve-graphic-name', 'Clean Minimal Wipe Lower Third');

			lane.dispatchEvent(
				new DragEvent('drop', {
					bubbles: true,
					cancelable: true,
					clientX: box.x + 120,
					clientY: box.y + box.height / 2,
					dataTransfer: dt
				})
			);
		}, laneBox);

		// Verify clip was placed
		const clips = page.locator('.timeline-clip:not(.is-ghost)');
		await expect(clips).toHaveCount(1);
		await expect(clips.first()).toContainText('TRENDY TYPOGRAPHY');
		await page.screenshot({ path: path.join(ARTIFACT_DIR, 'graphic_placed_on_track.png') });

		// 3. Test dragging to NEW TRACK drop area
		const initialTrackCount = await page.locator('.timeline-track-row').count();
		const dropArea = page.locator('.timeline-new-track-drop');
		const dropAreaBox = await dropArea.boundingBox();
		expect(dropAreaBox).not.toBeNull();
		if (!dropAreaBox) return;

		await page.evaluate((box) => {
			const area = document.querySelector('.timeline-new-track-drop');
			if (!area) return;

			const dt = new DataTransfer();
			dt.setData('application/x-tfve-graphic-template', 'cyber-nights');
			dt.setData('application/x-tfve-graphic-name', 'Cyberpunk Glitch');

			area.dispatchEvent(
				new DragEvent('dragover', {
					bubbles: true,
					cancelable: true,
					clientX: box.x + 200,
					clientY: box.y + box.height / 2,
					dataTransfer: dt
				})
			);
		}, dropAreaBox);

		// Verify new track preview row appears with V+ badge
		const newTrackPreview = page.locator('.timeline-track-row.is-new-track-preview');
		await expect(newTrackPreview).toBeVisible();
		await expect(newTrackPreview.locator('.track-kind.is-new-badge')).toHaveText('V+');
		await expect(newTrackPreview).toContainText('New Video Track');

		await page.screenshot({ path: path.join(ARTIFACT_DIR, 'graphic_new_track_preview_row.png') });

		// Drop on new track
		await page.evaluate((box) => {
			const area = document.querySelector('.timeline-new-track-drop');
			if (!area) return;

			const dt = new DataTransfer();
			dt.setData('application/x-tfve-graphic-template', 'cyber-nights');
			dt.setData('application/x-tfve-graphic-name', 'Cyberpunk Glitch');

			area.dispatchEvent(
				new DragEvent('drop', {
					bubbles: true,
					cancelable: true,
					clientX: box.x + 200,
					clientY: box.y + box.height / 2,
					dataTransfer: dt
				})
			);
		}, dropAreaBox);

		// Verify new track created
		const finalTrackCount = await page.locator('.timeline-track-row:not(.is-new-track-preview)').count();
		expect(finalTrackCount).toBe(initialTrackCount + 1);

		const finalClips = page.locator('.timeline-clip:not(.is-ghost)');
		await expect(finalClips).toHaveCount(2);
		const clipTexts = await finalClips.allTextContents();
		expect(clipTexts.some((t) => t.includes('CYBER'))).toBe(true);
		expect(clipTexts.some((t) => t.includes('TRENDY TYPOGRAPHY'))).toBe(true);

		await page.screenshot({ path: path.join(ARTIFACT_DIR, 'graphic_new_track_committed.png') });
	});

	test('Graphic template drag near edge reveals new track preview and creates track on drop', async ({
		page
	}) => {
		// 1. Open Graphics panel
		const graphicsTab = page.locator('#graphics-panel-title');
		await expect(graphicsTab).toBeVisible();
		await graphicsTab.click();

		const graphicCard = page.locator('.graphic-card').first();
		await expect(graphicCard).toBeVisible();

		// 2. Locate first video track lane
		const videoTrackLane = page.locator('.timeline-track-row.track-video .timeline-track-lane').first();
		await expect(videoTrackLane).toBeVisible();
		const laneBox = await videoTrackLane.boundingBox();
		expect(laneBox).not.toBeNull();
		if (!laneBox) return;

		const initialTrackCount = await page.locator('.timeline-track-row:not(.is-new-track-preview)').count();
		const initialClipCount = await page.locator('.timeline-clip:not(.is-ghost)').count();

		// 3. Hover near top edge of the video track lane (top 4px)
		await page.evaluate((box) => {
			const lane = document.querySelector('.timeline-track-row.track-video .timeline-track-lane');
			if (!lane) return;

			const dt = new DataTransfer();
			dt.setData('application/x-tfve-graphic-template', 'dream-big');
			dt.setData('application/x-tfve-graphic-name', 'Dream Big Kinetic');

			lane.dispatchEvent(
				new DragEvent('dragover', {
					bubbles: true,
					cancelable: true,
					clientX: box.x + 100,
					clientY: box.y + 4,
					dataTransfer: dt
				})
			);
		}, laneBox);

		// Verify new track preview row appears with V+ badge
		const newTrackPreview = page.locator('.timeline-track-row.is-new-track-preview');
		await expect(newTrackPreview).toBeVisible();
		await expect(newTrackPreview.locator('.track-kind.is-new-badge')).toHaveText('V+');
		await expect(newTrackPreview).toContainText('New Video Track');

		// 4. Drop while preview is active near top edge
		await page.evaluate((box) => {
			const lane = document.querySelector('.timeline-track-row.track-video .timeline-track-lane');
			if (!lane) return;

			const dt = new DataTransfer();
			dt.setData('application/x-tfve-graphic-template', 'dream-big');
			dt.setData('application/x-tfve-graphic-name', 'Dream Big Kinetic');

			lane.dispatchEvent(
				new DragEvent('drop', {
					bubbles: true,
					cancelable: true,
					clientX: box.x + 100,
					clientY: box.y + 4,
					dataTransfer: dt
				})
			);
		}, laneBox);

		// Verify new track was created and has graphic clip
		const finalTrackCount = await page.locator('.timeline-track-row:not(.is-new-track-preview)').count();
		expect(finalTrackCount).toBe(initialTrackCount + 1);

		const finalClipCount = await page.locator('.timeline-clip:not(.is-ghost)').count();
		expect(finalClipCount).toBe(initialClipCount + 1);

		const allClipTexts = await page.locator('.timeline-clip:not(.is-ghost)').allTextContents();
		expect(allClipTexts.some((t) => t.includes('DREAM BIG'))).toBe(true);
	});

	test('creates new tracks for text, caption, solid, adjustment, and graphic layers when clip already exists in existing track', async ({
		page
	}) => {
		await page.waitForFunction(() => Boolean((window as any).__TFVE_STORE__?.getState().project));

		// 1. Put an initial base clip on the existing video track from 0 to 10s
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const initialTrack = store.getState().project.tracks.find((t: any) => t.kind === 'video');
			store.getState().addSolidLayer('#222222', initialTrack?.id, 0, 10_000_000);
			store.getState().setPlayhead(1_000_000);
		});

		// 2. Add Text Layer via Toolbar button
		const textLayerBtn = page.getByRole('button', { name: 'Text Layer' });
		await expect(textLayerBtn).toBeVisible();
		await textLayerBtn.click();

		// Verify 2 video tracks now exist
		const videoTracksAfterText = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			return store.getState().project.tracks.filter((t: any) => t.kind === 'video').length;
		});
		expect(videoTracksAfterText).toBe(2);

		// 3. Add Adjustment Layer via Toolbar button
		const adjLayerBtn = page.getByRole('button', { name: 'Adjustment Layer' });
		await expect(adjLayerBtn).toBeVisible();
		await adjLayerBtn.click();

		// Verify 3 video tracks now exist
		const videoTracksAfterAdj = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			return store.getState().project.tracks.filter((t: any) => t.kind === 'video').length;
		});
		expect(videoTracksAfterAdj).toBe(3);

		// 4. Add Solid Layer via Toolbar button
		const solidLayerBtn = page.getByRole('button', { name: 'Solid Layer' });
		await expect(solidLayerBtn).toBeVisible();
		await solidLayerBtn.click();

		// Verify 4 video tracks now exist
		const videoTracksAfterSolid = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			return store.getState().project.tracks.filter((t: any) => t.kind === 'video').length;
		});
		expect(videoTracksAfterSolid).toBe(4);

		// 5. Add Graphic Template from Graphics Panel
		const graphicsTab = page.locator('#graphics-panel-title');
		await expect(graphicsTab).toBeVisible();
		await graphicsTab.click();

		const templatesTabBtn = page.getByRole('tab', { name: 'Templates' });
		if (await templatesTabBtn.isVisible()) {
			await templatesTabBtn.click();
		}

		const addTemplateBtn = page.locator('.graphic-add-btn').first();
		await expect(addTemplateBtn).toBeVisible();
		await addTemplateBtn.click();

		// Verify 5 video tracks now exist
		const videoTracksAfterGraphic = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			return store.getState().project.tracks.filter((t: any) => t.kind === 'video').length;
		});
		expect(videoTracksAfterGraphic).toBe(5);

		// 6. Add Caption Layer via Toolbar button
		const captionLayerBtn = page.locator('.timeline-toolbar-row').getByRole('button', { name: 'Caption Layer' });
		await expect(captionLayerBtn).toBeVisible();
		await captionLayerBtn.click();

		const capTracksCount1 = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			return store.getState().project.tracks.filter((t: any) => t.kind === 'caption').length;
		});
		expect(capTracksCount1).toBe(1);

		// 7. Add Caption Layer again while playhead is over existing caption cue (at 1s)
		await captionLayerBtn.click();

		const capTracksCount2 = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			return store.getState().project.tracks.filter((t: any) => t.kind === 'caption').length;
		});
		expect(capTracksCount2).toBe(2);

		// 8. ONLY add track if there is another clip in that range:
		// Seek to 20s (where no clips exist in range 20s-25s):
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			store.getState().setPlayhead(20_000_000);
		});

		// Adding text at 20s should NOT add a 6th video track!
		await textLayerBtn.click();
		const videoTracksNonOverlap = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			return store.getState().project.tracks.filter((t: any) => t.kind === 'video').length;
		});
		expect(videoTracksNonOverlap).toBe(5);

		// Adding caption at 20s should NOT add a 3rd caption track!
		await captionLayerBtn.click();
		const capTracksNonOverlap = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			return store.getState().project.tracks.filter((t: any) => t.kind === 'caption').length;
		});
		expect(capTracksNonOverlap).toBe(2);
	});

	test('User sequence: base clips on track 1, add text at 2s, 9s, 15.4s reuses tracks', async ({
		page
	}) => {
		// Base solid layer on initial track spanning 0 to 60s
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const initialTrack = store.getState().project.tracks.find((t: any) => t.kind === 'video');
			store.getState().addSolidLayer('#222222', initialTrack.id, 0, 60_000_000);
		});

		const textLayerBtn = page.getByRole('button', { name: 'Text Layer' });

		// Click Text Layer at 2s
		await page.evaluate(() => (window as any).__TFVE_STORE__.getState().setPlayhead(2_000_000));
		await textLayerBtn.click();

		const tracksCount1 = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			return store.getState().project.tracks.filter((t: any) => t.kind === 'video').length;
		});
		console.log('Video tracks after 1st click:', tracksCount1);

		// Click Text Layer at 9s
		await page.evaluate(() => (window as any).__TFVE_STORE__.getState().setPlayhead(9_000_000));
		await textLayerBtn.click();

		const tracksCount2 = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			return store.getState().project.tracks.filter((t: any) => t.kind === 'video').length;
		});
		console.log('Video tracks after 2nd click:', tracksCount2);

		// Click Text Layer at 15.4s
		await page.evaluate(() => (window as any).__TFVE_STORE__.getState().setPlayhead(15_433_333));
		await textLayerBtn.click();

		const tracksCount3 = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			return store.getState().project.tracks.filter((t: any) => t.kind === 'video').length;
		});
		console.log('Video tracks after 3rd click:', tracksCount3);
	});

	test('Clicking Text Tool on side bar adds layer and keeps pointer tool active', async ({ page }) => {
		// Verify initial tool state on the sidebar: Selection (pointer) tool is active
		const selectionToolBtn = page.getByRole('button', { name: /Selection Tool/i });
		await expect(selectionToolBtn).toBeVisible();
		await expect(selectionToolBtn).toHaveClass(/is-active/);

		const textToolBtn = page.getByRole('button', { name: /Text Tool/i });
		await expect(textToolBtn).toBeVisible();
		await expect(textToolBtn).not.toHaveClass(/is-active/);

		// Count existing text clips before clicking
		const textClipsBefore = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const videoTracks = store.getState().project.tracks.filter((t: any) => t.kind === 'video');
			return videoTracks.flatMap((t: any) => t.clips).filter((c: any) => c.source?.type === 'text').length;
		});

		// Click the Text Tool button on the side bar
		await textToolBtn.click();

		// Verify that a text layer was added
		const textClipsAfter = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			const videoTracks = store.getState().project.tracks.filter((t: any) => t.kind === 'video');
			return videoTracks.flatMap((t: any) => t.clips).filter((c: any) => c.source?.type === 'text').length;
		});
		expect(textClipsAfter).toBe(textClipsBefore + 1);

		// Verify pointer tool REMAINS active, and text tool is NOT selected
		await expect(selectionToolBtn).toHaveClass(/is-active/);
		await expect(textToolBtn).not.toHaveClass(/is-active/);

		const activeTool = await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__;
			return store.getState().timeline.activeTool;
		});
		expect(activeTool).toBe('select');

		// Take screenshot showing text layer added while pointer tool stays selected
		await page.screenshot({ path: path.join(ARTIFACT_DIR, 'text_tool_keeps_pointer.png') });
	});
});

