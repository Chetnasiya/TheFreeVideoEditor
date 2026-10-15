import { test, expect } from '@playwright/test';

test.describe('Gate N: Audio Architecture & Mixer E2E Tests', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/editor');
		// Clear local storage and ensure fresh editor
		await page.evaluate(() => {
			localStorage.clear();
		});
	});

	test('1. Toggle Audio Mixer via Alt+M shortcut and Edit Menu', async ({ page }) => {
		await page.goto('/editor');
		// Create project
		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Audio Mixer Test');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(createDialog).not.toBeVisible();

		// Add an audio track
		await page.evaluate(() => {
			(window as any).__TFVE_STORE__.getState().addTimelineTrack('audio');
		});

		// Press Alt+M to open Mixer
		await page.keyboard.press('Alt+m');
		const mixer = page.locator('aside[aria-label="Audio Mixer"]');
		await expect(mixer).toBeVisible();

		// Press Alt+M again to close Mixer
		await page.keyboard.press('Alt+m');
		await expect(mixer).not.toBeVisible();

		// Open via Edit Menu -> Audio Mixer
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		await page.getByRole('menuitem', { name: /Audio Mixer/i }).click();
		await expect(mixer).toBeVisible();
	});

	test('2. Channel strip fader, pan, mute, and solo controls update store and UI', async ({
		page
	}) => {
		await page.goto('/editor');
		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Audio Controls Test');
		await createDialog.getByRole('button', { name: 'Create project' }).click();

		// Add 2 audio tracks
		await page.evaluate(() => {
			(window as any).__TFVE_STORE__.getState().addTimelineTrack('audio');
			(window as any).__TFVE_STORE__.getState().addTimelineTrack('audio');
			(window as any).__TFVE_STORE__.getState().toggleMixer();
		});

		const mixer = page.locator('aside[aria-label="Audio Mixer"]');
		await expect(mixer).toBeVisible();

		// Find first audio channel strip
		const strip1 = mixer.locator('.channel-strip').first();
		await expect(strip1).toBeVisible();

		// Click Solo (S) button on Track 1
		const soloBtn = strip1.getByRole('button', { name: 'S', exact: true });
		await soloBtn.click();

		// Verify track solo state in store
		const isSolo = await page.evaluate(() => {
			const tracks = (window as any).__TFVE_STORE__.getState().project.tracks;
			const audioTrack = tracks.find((t: any) => t.kind === 'audio');
			return audioTrack.audio?.solo;
		});
		expect(isSolo).toBe(true);

		// Click Mute (M) button
		const muteBtn = strip1.getByRole('button', { name: 'M', exact: true });
		await muteBtn.click();
		const isMuted = await page.evaluate(() => {
			const tracks = (window as any).__TFVE_STORE__.getState().project.tracks;
			const audioTrack = tracks.find((t: any) => t.kind === 'audio');
			return audioTrack.muted;
		});
		expect(isMuted).toBe(true);
	});

	test('3. EQ and Dynamics popups open and update track EQ/compressor', async ({ page }) => {
		await page.goto('/editor');
		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Audio Popups Test');
		await createDialog.getByRole('button', { name: 'Create project' }).click();

		await page.evaluate(() => {
			(window as any).__TFVE_STORE__.getState().addTimelineTrack('audio');
			(window as any).__TFVE_STORE__.getState().toggleMixer();
		});

		const mixer = page.locator('aside[aria-label="Audio Mixer"]');
		const strip = mixer.locator('.channel-strip').first();

		// Open EQ popup
		await strip.getByRole('button', { name: 'EQ' }).click();
		const eqDialog = page.getByRole('dialog', { name: /Track EQ/i });
		await expect(eqDialog).toBeVisible();

		// Toggle EQ Enabled checkbox
		await eqDialog.getByLabel('Enabled').click();
		await eqDialog.getByRole('button', { name: 'Done' }).click();
		await expect(eqDialog).not.toBeVisible();

		// Open Dynamics popup
		await strip.getByRole('button', { name: 'DYN' }).click();
		const compDialog = page.getByRole('dialog', { name: /Compressor/i });
		await expect(compDialog).toBeVisible();

		// Toggle Compressor Enabled checkbox
		await compDialog.getByLabel('Enabled').click();
		await compDialog.getByRole('button', { name: 'Done' }).click();
		await expect(compDialog).not.toBeVisible();

		// Verify state in store
		const eqAndComp = await page.evaluate(() => {
			const tracks = (window as any).__TFVE_STORE__.getState().project.tracks;
			const audioTrack = tracks.find((t: any) => t.kind === 'audio');
			return {
				eqEnabled: audioTrack.audio?.eq?.enabled,
				compEnabled: audioTrack.audio?.compressor?.enabled
			};
		});
		expect(eqAndComp.eqEnabled).toBe(true);
		expect(eqAndComp.compEnabled).toBe(true);
	});

	test('4. Inspector renders Audio section with Volume (dB), Pan, and Fades', async ({ page }) => {
		await page.goto('/editor');
		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Inspector Audio Test');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(createDialog).not.toBeVisible();

		// Add an audio track and an audio clip on it
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__.getState();
			store.addTimelineTrack('audio');
			const project = (window as any).__TFVE_STORE__.getState().project;
			const audioTrack = project.tracks.find((t: any) => t.kind === 'audio');
			const clipId = 'test-audio-clip';
			(window as any).__TFVE_STORE__.setState((s: any) => ({
				...s,
				project: {
					...s.project,
					tracks: s.project.tracks.map((t: any) =>
						t.id === audioTrack.id
							? {
									...t,
									clips: [
										{
											id: clipId,
											start: 0,
											duration: 5_000_000,
											sourceIn: 0,
											sourceOut: 5_000_000,
											speed: 1,
											volume: 1
										}
									]
								}
							: t
					)
				}
			}));
			(window as any).__TFVE_STORE__.getState().selectClips([clipId]);
		});

		// Inspector should show Audio section
		const audioSection = page.locator('.inspector-section', { hasText: 'Audio' });
		await expect(audioSection).toBeVisible();

		// Verify Volume and Pan rows
		await expect(audioSection.locator('.property-label', { hasText: 'Volume' })).toBeVisible();
		await expect(audioSection.locator('.property-label', { hasText: 'Pan' })).toBeVisible();
		await expect(audioSection.getByText('Fade In (s)')).toBeVisible();
		await expect(audioSection.getByText('Fade Out (s)')).toBeVisible();
	});

	test('5. Submix bus can be added and deleted in the mixer', async ({ page }) => {
		await page.goto('/editor');
		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Submix Delete Test');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(createDialog).not.toBeVisible();

		// Open mixer
		await page.keyboard.press('Alt+m');
		const mixer = page.locator('aside[aria-label="Audio Mixer"]');
		await expect(mixer).toBeVisible();

		// Click "+ Add Submix" button
		await mixer.getByRole('button', { name: '+ Add Submix' }).click();

		// Verify Submix strip is rendered
		const submixStrip = mixer.locator('.bus-strip').first();
		await expect(submixStrip).toBeVisible();
		await expect(submixStrip.getByText(/Submix 1/i)).toBeVisible();

		// Verify in store
		const busCountBefore = await page.evaluate(() => {
			return (window as any).__TFVE_STORE__.getState().project.audioBuses?.length ?? 0;
		});
		expect(busCountBefore).toBe(1);

		// Click delete (✕) button on the submix strip
		const deleteBtn = submixStrip.getByRole('button', { name: /Delete Submix 1/i });
		await deleteBtn.click();

		// Verify submix strip is removed from UI
		await expect(submixStrip).not.toBeVisible();

		// Verify in store
		const busCountAfter = await page.evaluate(() => {
			return (window as any).__TFVE_STORE__.getState().project.audioBuses?.length ?? 0;
		});
		expect(busCountAfter).toBe(0);
	});
});
