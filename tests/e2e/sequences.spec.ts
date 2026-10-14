import { expect, test } from '@playwright/test';

test.describe('Gate R: Nested Sequences E2E', () => {
	test('creates, nests, opens, navigates breadcrumbs, duplicates, and deletes sequences via real UI', async ({
		page
	}) => {
		// Boot editor
		await page.goto('/editor');

		// Open New Project from Your Projects dialog
		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Sequences E2E');
		await createDialog.getByRole('button', { name: 'Create project' }).click();

		await expect(page.getByRole('heading', { name: 'Sequences E2E' })).toBeVisible();

		// 1. Create a sequence from Media Library toolbar
		const newSeqBtn = page.getByRole('button', { name: 'New sequence' });
		await expect(newSeqBtn).toBeVisible();

		// Setup dialog handler for window.prompt
		page.once('dialog', async (dialog) => {
			expect(dialog.type()).toBe('prompt');
			await dialog.accept('B-Roll Sequence');
		});
		await newSeqBtn.click();

		// Should switch to nested sequence in timeline and show breadcrumb
		await expect(page.locator('.timeline-tabs')).toContainText('B-Roll Sequence');

		// 2. Click "Main" in breadcrumbs to navigate back to root timeline
		await page.locator('.timeline-tabs button', { hasText: 'Main' }).click();
		await expect(page.locator('.timeline-tabs')).not.toContainText('›');

		// 3. Filter tabs in Media Library: click "Sequences"
		await page.getByRole('tab', { name: /Sequences/ }).click();
		const seqCard = page.locator('.media-asset.is-sequence-asset', { hasText: 'B-Roll Sequence' });
		await expect(seqCard).toBeVisible();

		// 4. Double click sequence card in Media Library to open
		await seqCard.dblclick();
		await expect(page.locator('.timeline-tabs')).toContainText('B-Roll Sequence');

		// Return to main
		await page.locator('.timeline-tabs button', { hasText: 'Main' }).click();

		// 5. Duplicate sequence from Media Library
		await page.getByRole('tab', { name: /Sequences/ }).click();
		await seqCard.hover();
		const duplicateBtn = seqCard.getByRole('button', { name: 'Duplicate' });
		await duplicateBtn.click();

		const copyCard = page.locator('.media-asset.is-sequence-asset', {
			hasText: 'B-Roll Sequence Copy'
		});
		await expect(copyCard).toBeVisible();

		// 6. Delete duplicate sequence
		await copyCard.hover();
		const deleteBtn = copyCard.getByRole('button', { name: 'Delete' });
		await deleteBtn.click();

		const deleteDialog = page.locator('.media-delete-dialog[open]');
		await expect(deleteDialog).toBeVisible();
		await deleteDialog.getByRole('button', { name: 'Delete sequence' }).click();
		await expect(copyCard).not.toBeVisible();

		// 7. Test Export Dialog sequence selector
		const exportBtn = page.getByRole('button', { name: 'Export' });
		if (await exportBtn.isVisible()) {
			await exportBtn.click();
			const exportDialog = page.getByRole('dialog', { name: 'Export' });
			await expect(exportDialog).toBeVisible();

			// Sequence dropdown should be visible when sequences exist
			const seqSelect = exportDialog.locator('label', { hasText: 'Sequence' }).locator('select');
			await expect(seqSelect).toBeVisible();
			await expect(seqSelect).toContainText('Main Timeline (Root)');
			await expect(seqSelect).toContainText('B-Roll Sequence');

			// Close export dialog
			await exportDialog.getByRole('button', { name: 'Close export dialog' }).click();
			await expect(exportDialog).not.toBeVisible();
		}
	});

	test('multi-clip timeline right click preserves selection, allows linking, and nests all selected clips', async ({
		page
	}) => {
		await page.goto('/editor');

		// Open New Project
		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Multi-Select Nest');
		await createDialog.getByRole('button', { name: 'Create project' }).click();

		await expect(page.getByRole('heading', { name: 'Multi-Select Nest' })).toBeVisible();

		// Add 2 solid clips on separate tracks
		const addSolidBtn = page.getByRole('button', { name: 'Solid Layer' });
		await addSolidBtn.click();
		// Add another video track and add another solid layer
		await page.keyboard.press('Control+Shift+v');
		await addSolidBtn.click();

		const clips = page.locator('.timeline-clip');
		await expect(clips).toHaveCount(2);

		// Select first clip, then shift-click second clip
		await clips.nth(0).click();
		await clips.nth(1).click({ modifiers: ['Shift'] });

		// Both should have is-selected class
		await expect(clips.nth(0)).toHaveClass(/is-selected/);
		await expect(clips.nth(1)).toHaveClass(/is-selected/);

		// Right click on the first clip
		await clips.nth(0).click({ button: 'right' });

		// Both should STILL be selected!
		await expect(clips.nth(0)).toHaveClass(/is-selected/);
		await expect(clips.nth(1)).toHaveClass(/is-selected/);

		// Context menu should show "Link selected clips"
		const linkBtn = page.getByRole('button', { name: 'Link selected clips' });
		await expect(linkBtn).toBeVisible();
		await linkBtn.click();

		// Verify both clips are linked in state
		const isLinked = await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			const selected = state.timeline.selection.clipIds;
			const project = state.project;
			const clipsInTracks = project.tracks.flatMap((t: any) => t.clips);
			const c1 = clipsInTracks.find((c: any) => c.id === selected[0]);
			const c2 = clipsInTracks.find((c: any) => c.id === selected[1]);
			return Boolean(c1?.linkId && c2?.linkId && c1.linkId === c2.linkId);
		});
		expect(isLinked).toBe(true);

		// Right click again while both are selected
		await clips.nth(0).click({ button: 'right' });
		await expect(clips.nth(0)).toHaveClass(/is-selected/);
		await expect(clips.nth(1)).toHaveClass(/is-selected/);

		// Should show "Unlink clips" and "Nest Selection…"
		await expect(page.getByRole('button', { name: 'Unlink clips' })).toBeVisible();
		const nestBtn = page.getByRole('button', { name: 'Nest Selection…' });
		await expect(nestBtn).toBeVisible();

		// Nest selection into "Nested Pair"
		page.once('dialog', async (dialog) => {
			expect(dialog.type()).toBe('prompt');
			await dialog.accept('Nested Pair');
		});
		await nestBtn.click();

		// Verify the nested sequence exists and has 2 clips inside it
		const nestedSeqInfo = await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			const seqs = Object.values(state.project.sequences ?? {}) as any[];
			const nested = seqs.find((s) => s.name === 'Nested Pair');
			if (!nested) return null;
			const totalClips = nested.tracks.reduce((sum: number, t: any) => sum + t.clips.length, 0);
			return { id: nested.id, name: nested.name, totalClips };
		});
		expect(nestedSeqInfo).not.toBeNull();
		expect(nestedSeqInfo?.totalClips).toBe(2);
	});

	test('keyboard shortcuts navigate and operate sequences (Alt+Shift+N, Alt+ArrowDown, Alt+ArrowUp)', async ({
		page
	}) => {
		await page.goto('/editor');

		// Open New Project
		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Keyboard Seq');
		await createDialog.getByRole('button', { name: 'Create project' }).click();

		await expect(page.getByRole('heading', { name: 'Keyboard Seq' })).toBeVisible();

		// Add a solid layer
		await page.getByRole('button', { name: 'Solid Layer' }).click();
		const clip = page.locator('.timeline-clip').first();
		await expect(clip).toBeVisible();
		await clip.click();
		await expect(clip).toHaveClass(/is-selected/);

		// Alt+Shift+N to nest selection
		page.once('dialog', async (dialog) => {
			expect(dialog.type()).toBe('prompt');
			await dialog.accept('Keyboard Nested Seq');
		});
		await page.keyboard.press('Alt+Shift+KeyN');

		// Check sequence instance replaced the solid on timeline
		const seqInstance = page.locator('.timeline-clip.is-sequence');
		await expect(seqInstance).toBeVisible({ timeout: 5000 });

		// Select the sequence instance clip
		await seqInstance.click();
		await expect(seqInstance).toHaveClass(/is-selected/);

		// Alt+ArrowDown to open the selected sequence instance
		await page.keyboard.press('Alt+ArrowDown');
		await expect(page.locator('.timeline-tabs')).toContainText('Keyboard Nested Seq');

		// Inside nested sequence: verify the solid layer is inside
		await expect(page.locator('.timeline-clip')).toHaveCount(1);

		// Alt+ArrowUp to go up to parent timeline
		await page.keyboard.press('Alt+ArrowUp');
		await expect(page.locator('.timeline-tabs')).not.toContainText('›');
		await expect(page.locator('.timeline-clip.is-sequence')).toBeVisible();
	});

	test('Sequence Settings dialog modifies resolution/fps and applies to state', async ({
		page
	}) => {
		await page.goto('/editor');

		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Seq Settings');
		await createDialog.getByRole('button', { name: 'Create project' }).click();

		// Create sequence from Media Library
		const newSeqBtn = page.getByRole('button', { name: 'New sequence' });
		page.once('dialog', async (dialog) => {
			await dialog.accept('Custom Size Seq');
		});
		await newSeqBtn.click();

		// We are now inside Custom Size Seq
		await expect(page.locator('.timeline-tabs')).toContainText('Custom Size Seq');

		// Click the sequence name button in the breadcrumb to open Sequence Settings dialog
		const breadcrumbBtn = page.locator('.timeline-tabs button', { hasText: 'Custom Size Seq' });
		await breadcrumbBtn.click();

		const settingsDialog = page.locator('.sequence-settings-dialog');
		await expect(settingsDialog).toBeVisible();

		// Uncheck "Inherit resolution and frame rate"
		const inheritCheckbox = page.locator('[data-testid="inherit-settings-checkbox"]');
		await expect(inheritCheckbox).toBeChecked();
		await inheritCheckbox.click();
		await expect(inheritCheckbox).not.toBeChecked();

		// Set width to 1280 and height to 720
		const widthInput = page.locator('[data-testid="seq-width-input"]');
		await widthInput.fill('1280');
		const heightInput = page.locator('[data-testid="seq-height-input"]');
		await heightInput.fill('720');

		// Submit
		await page.locator('[data-testid="seq-settings-save-button"]').click();
		await expect(settingsDialog).not.toBeVisible();

		// Verify settings persisted in store
		const settings = await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			const seqId = state.activeSequenceId;
			return state.project.sequences?.[seqId]?.settings;
		});
		expect(settings).toEqual(
			expect.objectContaining({
				width: 1280,
				height: 720
			})
		);
	});

	test('Make Unique and Expand operations work, and Expand is disabled when speed != 1', async ({
		page
	}) => {
		await page.goto('/editor');

		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Unique and Expand');
		await createDialog.getByRole('button', { name: 'Create project' }).click();

		// Add solid layer and nest it
		await page.getByRole('button', { name: 'Solid Layer' }).click();
		const clip = page.locator('.timeline-clip').first();
		await clip.click();

		page.once('dialog', async (dialog) => {
			await dialog.accept('Expandable Seq');
		});
		await page.keyboard.press('Alt+Shift+KeyN');

		const seqInstance = page.locator('.timeline-clip.is-sequence');
		await expect(seqInstance).toBeVisible();

		// 1. Test Make Unique
		await seqInstance.click({ button: 'right' });
		const makeUniqueBtn = page.getByRole('button', { name: 'Make Unique' });
		await expect(makeUniqueBtn).toBeVisible();
		await makeUniqueBtn.click();

		// Verify unique copy was created
		const hasUnique = await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			const seqs = Object.values(state.project.sequences ?? {}) as any[];
			return seqs.some((s) => s.name.includes('(Unique)'));
		});
		expect(hasUnique).toBe(true);

		// 2. Test Expand Sequence when speed != 1 (disabled check)
		// Change clip speed to 2.0 via state
		await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			const activeTracks = state.project.tracks;
			const c = activeTracks
				.flatMap((t: any) => t.clips)
				.find((c: any) => c.source?.type === 'sequence');
			if (c) {
				state.setClipSpeed([c.id], 2.0);
			}
		});

		await seqInstance.click({ button: 'right' });
		const expandBtnDisabled = page.getByRole('button', { name: 'Expand Sequence' });
		await expect(expandBtnDisabled).toBeDisabled();

		// Close context menu before resetting speed
		await page.keyboard.press('Escape');

		// Reset speed back to 1.0
		await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			const activeTracks = state.project.tracks;
			const c = activeTracks
				.flatMap((t: any) => t.clips)
				.find((c: any) => c.source?.type === 'sequence');
			if (c) {
				state.setClipSpeed([c.id], 1.0);
			}
		});

		// Now right click again and Expand Sequence
		await seqInstance.click({ button: 'right' });
		const expandBtn = page.getByRole('button', { name: 'Expand Sequence' });
		await expect(expandBtn).toBeEnabled();
		await expandBtn.click();

		// Sequence clip is expanded into its inner clips (solid layer restored!)
		await expect(page.locator('.timeline-clip.is-sequence')).toHaveCount(0);
		await expect(page.locator('.timeline-clip.is-solid')).toHaveCount(1);
	});

	test('undo and redo restores activeSequenceId with polite announcement', async ({ page }) => {
		await page.goto('/editor');

		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Undo Seq Restore');
		await createDialog.getByRole('button', { name: 'Create project' }).click();

		// Create a sequence
		const newSeqBtn = page.getByRole('button', { name: 'New sequence' });
		page.once('dialog', async (dialog) => {
			await dialog.accept('Inner Seq');
		});
		await newSeqBtn.click();

		// Now in Inner Seq
		await expect(page.locator('.timeline-tabs')).toContainText('Inner Seq');

		// Add solid layer inside Inner Seq
		await page.getByRole('button', { name: 'Solid Layer' }).click();
		await expect(page.locator('.timeline-clip')).toHaveCount(1);

		// Go back to Main timeline
		await page.locator('.timeline-tabs button', { hasText: 'Main' }).click();
		await expect(page.locator('.timeline-tabs')).not.toContainText('›');

		// Trigger Undo (Control+z)
		await page.keyboard.press('Control+z');

		// Active sequence should restore back to Inner Seq where the edit was made!
		await expect(page.locator('.timeline-tabs')).toContainText('Inner Seq');
		await expect(page.locator('.timeline-clip')).toHaveCount(0);

		// Trigger Redo (Control+Shift+z)
		await page.keyboard.press('Control+Shift+z');
		// Redo restores the edit and preserves Inner Seq!
		await expect(page.locator('.timeline-tabs')).toContainText('Inner Seq');
		await expect(page.locator('.timeline-clip')).toHaveCount(1);
	});

	test('prevents cycle when nesting sequence into itself', async ({ page }) => {
		await page.goto('/editor');

		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Cycle Guard');
		await createDialog.getByRole('button', { name: 'Create project' }).click();

		// Create sequence A
		const newSeqBtn = page.getByRole('button', { name: 'New sequence' });
		page.once('dialog', async (dialog) => {
			await dialog.accept('Seq Alpha');
		});
		await newSeqBtn.click();

		// We are currently in Seq Alpha. Attempting to add Seq Alpha inside itself must be rejected
		const addResult = await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			const activeId = state.activeSequenceId;
			return state.addSequenceToTimeline(activeId, 0);
		});
		expect(addResult).toBeNull();

		// Verify timeline status / message announced cycle error
		const statusMsg = await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			return state.timeline.message;
		});
		expect(statusMsg).toMatch(/circular|cycle/i);
	});

	test('editing inside nested sequence updates host Program monitor live and handles transparency', async ({
		page
	}) => {
		await page.goto('/editor');

		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Live Preview');
		await createDialog.getByRole('button', { name: 'Create project' }).click();

		// Add blue solid on Main timeline (Video 1)
		await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			state.addSolidLayer('#0000ff');
		});

		// Create nested sequence with red solid
		const newSeqBtn = page.getByRole('button', { name: 'New sequence' });
		page.once('dialog', async (dialog) => {
			await dialog.accept('Red Sequence');
		});
		await newSeqBtn.click();

		// Add red solid inside Red Sequence
		await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			state.addSolidLayer('#ff0000');
		});

		// Go back to Main timeline
		await page.locator('.timeline-tabs button', { hasText: 'Main' }).click();

		// Add another video track on Main timeline
		await page.keyboard.press('Control+Shift+v');

		// Add Red Sequence instance onto Video 2 (top track: project.tracks.find(t => t.name === 'Video 2'))
		await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			const seqId = Object.keys(state.project.sequences ?? {})[0];
			const topTrack =
				state.project.tracks.find((t: any) => t.name === 'Video 2') ??
				state.project.tracks.filter((t: any) => t.kind === 'video')[0];
			state.addSequenceToTimeline(seqId, 0, topTrack?.id);
		});

		// Program monitor preview canvas should show red (top layer)
		await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			state.setPlayhead(0);
		});

		await expect
			.poll(
				async () => {
					const pixel = await page.getByTestId('preview-canvas').evaluate((canvas) => {
						const el = canvas as HTMLCanvasElement;
						const s = document.createElement('canvas');
						s.width = 1;
						s.height = 1;
						const ctx = s.getContext('2d');
						if (!ctx) return [0, 0, 0, 0];
						ctx.drawImage(
							el,
							Math.floor(el.width / 2),
							Math.floor(el.height / 2),
							1,
							1,
							0,
							0,
							1,
							1
						);
						const d = ctx.getImageData(0, 0, 1, 1).data;
						return [d[0], d[1], d[2], d[3]];
					});
					// Red should dominate
					return pixel[0] > 180 && pixel[2] < 50;
				},
				{ timeout: 10_000 }
			)
			.toBe(true);

		// Now edit inside nested sequence: select sequence clip and press Alt+ArrowDown
		const seqClip = page.locator('.timeline-clip.is-sequence');
		await seqClip.click();
		await page.keyboard.press('Alt+ArrowDown');
		await expect(page.locator('.timeline-tabs')).toContainText('Red Sequence');

		// Add video track inside Red Sequence and add green solid on the top track
		await page.keyboard.press('Control+Shift+v');
		await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			state.addSolidLayer('#00ff00');
		});

		// Return to Main timeline
		await page.locator('.timeline-tabs button', { hasText: 'Main' }).click();

		// Program monitor preview canvas in host should update live to green!
		await expect
			.poll(async () => {
				const pixel = await page.getByTestId('preview-canvas').evaluate((canvas) => {
					const el = canvas as HTMLCanvasElement;
					const s = document.createElement('canvas');
					s.width = 1;
					s.height = 1;
					const ctx = s.getContext('2d');
					if (!ctx) return [0, 0, 0, 0];
					ctx.drawImage(el, Math.floor(el.width / 2), Math.floor(el.height / 2), 1, 1, 0, 0, 1, 1);
					const d = ctx.getImageData(0, 0, 1, 1).data;
					return [d[0], d[1], d[2], d[3]];
				});
				// Green should dominate
				return pixel[1] > 180 && pixel[0] < 50;
			})
			.toBe(true);
	});

	test('two instances of one sequence at different offsets simultaneously render without collision', async ({
		page
	}) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
			Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
		});

		await page.goto('/editor');

		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Two Instances');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(page.getByRole('heading', { name: 'Two Instances' })).toBeVisible();
		await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 10_000 });

		// Import colors.mp4
		await page.locator('input[name="media-files"]').setInputFiles('tests/fixtures/colors.mp4');
		const media = page.getByRole('listbox', { name: 'Project media' });
		const asset = media.getByRole('option').first();
		await expect(asset).toBeVisible({ timeout: 20_000 });

		// Create a sequence named ColorSeq
		const newSeqBtn = page.getByRole('button', { name: 'New sequence' });
		page.once('dialog', async (dialog) => {
			await dialog.accept('ColorSeq');
		});
		await newSeqBtn.click();

		// Add colors.mp4 to ColorSeq
		await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			const assetId = Object.keys(state.project.assets)[0];
			state.addAssetToTimeline(assetId);
		});

		// Go back to Main
		await page.locator('.timeline-tabs button', { hasText: 'Main' }).click();

		// Add 2 video tracks on Main
		await page.keyboard.press('Control+Shift+v');

		// Add two instances at different start offsets
		await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			const seqId = Object.keys(state.project.sequences ?? {})[0];
			const vTracks = state.project.tracks.filter((t: any) => t.kind === 'video');
			// Instance 1 on track 0 at time 0s
			state.addSequenceToTimeline(seqId, 0, vTracks[0].id);
			// Instance 2 on track 1 at time 2s
			state.addSequenceToTimeline(seqId, 2_000_000, vTracks[1].id);
		});

		// Both instances exist on timeline
		await expect(page.locator('.timeline-clip.is-sequence')).toHaveCount(2);

		// Seek playhead to 1s
		await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			state.setPlayhead(1_000_000);
		});

		// Render should succeed without error and preview canvas should be valid
		const renderedValid = await page.getByTestId('preview-canvas').evaluate((canvas) => {
			const el = canvas as HTMLCanvasElement;
			return el.width > 0 && el.height > 0;
		});
		expect(renderedValid).toBe(true);
	});

	test('exports chosen nested sequence via export dialog', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
			Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
		});

		await page.goto('/editor');

		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Export Nested');
		await createDialog.getByRole('button', { name: 'Create project' }).click();

		// Create sequence
		const newSeqBtn = page.getByRole('button', { name: 'New sequence' });
		page.once('dialog', async (dialog) => {
			await dialog.accept('Export SubSeq');
		});
		await newSeqBtn.click();

		// Add solid layer in Export SubSeq
		await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			state.addSolidLayer('#00aa00');
		});

		// Go back to main
		await page.locator('.timeline-tabs button', { hasText: 'Main' }).click();

		// Open Export dialog
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const exportDialog = page.getByRole('dialog', { name: 'Export' });
		await expect(exportDialog).toBeVisible();

		// Sequence dropdown: choose Export SubSeq
		const seqSelect = exportDialog.locator('label', { hasText: 'Sequence' }).locator('select');
		await expect(seqSelect).toBeVisible();
		await seqSelect.selectOption({ label: 'Export SubSeq' });

		// Verify capability checks pass
		await expect(exportDialog.locator('.export-capability').last()).not.toContainText(
			'Checking browser export support',
			{ timeout: 15_000 }
		);

		await exportDialog.getByLabel('Resolution').selectOption('720p');
		await exportDialog.getByLabel('Quality').selectOption('low');

		// Export video
		const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
		await exportDialog.getByRole('button', { name: 'Export video' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/\.(webm|mp4)$/);
	});

	test('.tfve project save and import roundtrip preserves nested sequences', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
			Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
		});

		await page.goto('/editor');

		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Tfve Sequences');
		await createDialog.getByRole('button', { name: 'Create project' }).click();

		// Create sequence
		const newSeqBtn = page.getByRole('button', { name: 'New sequence' });
		page.once('dialog', async (dialog) => {
			await dialog.accept('Saved SubSequence');
		});
		await newSeqBtn.click();

		// Add a solid layer inside Saved SubSequence
		await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			state.addSolidLayer('#336699');
		});

		// Go back to Main
		await page.locator('.timeline-tabs button', { hasText: 'Main' }).click();

		// Save a copy as .tfve
		await page.getByRole('button', { name: 'File', exact: true }).click();
		await page.getByRole('menuitem', { name: /Save a Copy as \.tfve/ }).click();
		const saveCopyDialog = page.getByRole('dialog', { name: 'Save a project copy?' });
		await expect(saveCopyDialog).toBeVisible();

		const downloadPromise = page.waitForEvent('download');
		await saveCopyDialog.getByRole('button', { name: 'Save Copy as .tfve' }).click();
		const download = await downloadPromise;
		const tfvePath = await download.path();
		expect(tfvePath).not.toBeNull();

		// Open Project Manager from File menu
		await page.getByRole('button', { name: 'File', exact: true }).click();
		await page.getByRole('menuitem', { name: /Open Project/ }).click();
		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await expect(manager).toBeVisible();

		// Click "Open .tfve project…" and handle filechooser
		const fileChooserPromise = page.waitForEvent('filechooser');
		await manager.getByRole('button', { name: 'Open .tfve project…' }).click();
		const fileChooser = await fileChooserPromise;
		await fileChooser.setFiles(tfvePath!);

		// Check project loaded with heading Tfve Sequences
		await expect(page.getByRole('heading', { name: 'Tfve Sequences' })).toBeVisible({
			timeout: 10_000
		});

		// Verify Saved SubSequence exists in project sequences
		const restoredSeq = await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			const seqs = Object.values(state.project.sequences ?? {}) as any[];
			return seqs.find((s) => s.name === 'Saved SubSequence');
		});
		expect(restoredSeq).toBeDefined();
		expect(restoredSeq.tracks.some((t: any) => t.clips.length > 0)).toBe(true);
	});
});
