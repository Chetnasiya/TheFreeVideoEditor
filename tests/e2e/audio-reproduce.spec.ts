import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

test.describe('Part 1 — Audio System Reproductions & Diagnostics', () => {
	test.use({ viewport: { width: 1920, height: 1080 } });

	test('Reproduce 5 owner observations on running application', async ({ page }) => {
		// Ensure test-results directory exists
		const resultsDir = path.resolve('test-results');
		if (!fs.existsSync(resultsDir)) {
			fs.mkdirSync(resultsDir, { recursive: true });
		}

		await page.goto('/editor');
		await page.evaluate(() => localStorage.clear());
		await page.goto('/editor');

		// Create project
		await page
			.getByRole('dialog', { name: 'Your Projects' })
			.getByRole('button', { name: 'New project' })
			.click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog
			.getByRole('textbox', { name: 'Project name' })
			.fill('Audio Reproduction Diagnostic');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(createDialog).not.toBeVisible();

		// Import sine-1khz fixture
		const fixtureFile = 'tests/fixtures/audio/sine-1khz.wav';
		await page.locator('input[name="media-files"]').setInputFiles(fixtureFile);
		const media = page.getByRole('listbox', { name: 'Project media' });
		const mediaClip = media.getByRole('option').first();
		await expect(mediaClip).toBeVisible({ timeout: 10_000 });

		// Drag to Audio 1 track lane
		await mediaClip.dragTo(page.getByRole('gridcell', { name: 'Audio 1 track lane' }), {
			targetPosition: { x: 50, y: 20 }
		});
		await expect(page.locator('.timeline-clip').first()).toBeVisible();

		// -------------------------------------------------------------
		// ITEM 1: Pan control inspection on new audio track
		// -------------------------------------------------------------
		// Open Mixer via Alt+M
		await page.keyboard.press('Alt+m');
		const mixer = page.locator('aside[aria-label="Audio Mixer"]');
		await expect(mixer).toBeVisible();

		const trackStrip = mixer.locator('.mixer-strip').first();
		const panLabel = await trackStrip.locator('.strip-pan-value').textContent();
		const panSlider = trackStrip.locator('.strip-pan-slider');
		const panInputValue = await panSlider.inputValue();
		const panSliderBox = await panSlider.boundingBox();

		const item1Result = {
			label: panLabel?.trim(),
			inputValue: panInputValue,
			hasCenterDetent: false, // input type=range with step 0.05 has no center snap
			sliderWidth: panSliderBox?.width
		};

		// -------------------------------------------------------------
		// ITEM 2: "Add to Audio" in Effects workspace
		// -------------------------------------------------------------
		// Select the clip on timeline
		await page.locator('.timeline-clip').first().click();

		// Switch to Effects workspace via store
		await page.evaluate(() => {
			(window as any).__TFVE_STORE__.getState().switchWorkspace('effects');
		});
		await page.waitForTimeout(500);

		// Take full-viewport screenshot of Effects workspace
		await page.screenshot({
			path: 'test-results/effects-workspace-1920x1080.png',
			fullPage: true
		});

		// Switch to Audio tab in Effects panel
		const audioTabBtn = page.getByTestId('tab-audio-effects');
		await audioTabBtn.click();
		await page.waitForTimeout(300);

		// Find "Add to Audio" button on Parametric EQ or first effect
		const firstAddBtn = page.locator('.effect-card-add-btn').first();
		const firstCardTitle = await page.locator('.effect-card-title').first().textContent();
		await firstAddBtn.click();
		await page.waitForTimeout(300);

		// Check project state
		const clipAudioEffectsState = await page.evaluate(() => {
			const proj = (window as any).__TFVE_STORE__.getState().project;
			const audioTrack = proj.tracks.find((t: any) => t.kind === 'audio');
			return audioTrack?.clips[0]?.audioEffects ?? [];
		});

		// Check if any effect appears in Inspector or UI
		const inspectorText = await page.locator('.inspector-panel, .panel-stack').allTextContents();
		const effectVisibleInUI = inspectorText.some((txt) => txt.includes(firstCardTitle ?? 'EQ'));

		const item2Result = {
			effectName: firstCardTitle,
			addedToState: clipAudioEffectsState.length > 0,
			effectVisibleInUI,
			effectsCountInState: clipAudioEffectsState.length
		};

		// -------------------------------------------------------------
		// ITEM 3: Audio workspace preset panels enumeration
		// -------------------------------------------------------------
		await page.evaluate(() => {
			(window as any).__TFVE_STORE__.getState().switchWorkspace('audio');
		});
		await page.waitForTimeout(500);

		// Take full-viewport screenshot of Audio workspace
		await page.screenshot({
			path: 'test-results/audio-workspace-1920x1080.png',
			fullPage: true
		});

		const audioWorkspacePanels = await page.evaluate(() => {
			const state = (window as any).__TFVE_STORE__.getState();
			const layout = state.activeLayout;
			const collect = (node: any): string[] => {
				if (!node) return [];
				if (node.type === 'stack') return node.panelIds ?? [];
				if (node.type === 'split' && node.children) return node.children.flatMap(collect);
				return [];
			};
			return collect(layout);
		});

		const item3Result = {
			panelsInAudioWorkspace: audioWorkspacePanels,
			hasEffectsPanel: audioWorkspacePanels.includes('effects'),
			hasEssentialSound: audioWorkspacePanels.includes('essential-sound'),
			hasLoudnessPanel: audioWorkspacePanels.includes('loudness'),
			hasEffectControlsAudio: audioWorkspacePanels.includes('effect-controls-audio')
		};

		// -------------------------------------------------------------
		// ITEM 4: Master strip True-Peak & LUFS with Limiter
		// -------------------------------------------------------------
		// Start playback
		await page.keyboard.press('Space');
		await page.waitForTimeout(1000);

		const masterStrip = page.locator('.mixer-strip.is-master');
		const tpTextBefore = await masterStrip
			.locator('.strip-pan-header')
			.first()
			.locator('span')
			.nth(1)
			.textContent();
		const lufsTextBefore = await masterStrip
			.locator('.strip-pan-header')
			.nth(1)
			.locator('span')
			.nth(1)
			.textContent();

		// Toggle Limiter
		const limiterBtn = masterStrip.locator('button', { hasText: /LIMITER/i });
		await limiterBtn.click();
		await page.waitForTimeout(1000);

		const tpTextWithLimiter = await masterStrip
			.locator('.strip-pan-header')
			.first()
			.locator('span')
			.nth(1)
			.textContent();
		const lufsTextWithLimiter = await masterStrip
			.locator('.strip-pan-header')
			.nth(1)
			.locator('span')
			.nth(1)
			.textContent();

		await page.keyboard.press('Space'); // pause

		const item4Result = {
			tpTextBefore: tpTextBefore?.trim(),
			lufsTextBefore: lufsTextBefore?.trim(),
			tpTextWithLimiter: tpTextWithLimiter?.trim(),
			lufsTextWithLimiter: lufsTextWithLimiter?.trim(),
			limiterExceedsCeiling: parseFloat(tpTextWithLimiter || '0') > -0.5
		};

		// -------------------------------------------------------------
		// ITEM 5: Default automation mode
		// -------------------------------------------------------------
		const trackAutoSelect = trackStrip.locator('.strip-auto-select');
		const defaultAutoMode = await trackAutoSelect.inputValue();

		const item5Result = {
			defaultAutoMode
		};

		// Output complete JSON report of reproductions
		const diagnosticReport = {
			item1_panControl: item1Result,
			item2_addAudioEffect: item2Result,
			item3_audioWorkspacePanels: item3Result,
			item4_masterMetersLimiter: item4Result,
			item5_defaultAutomationMode: item5Result
		};

		console.log('\n================ PART 1 REPRODUCTION DIAGNOSTIC ================');
		console.log(JSON.stringify(diagnosticReport, null, 2));
		console.log('=================================================================\n');

		// Assertions that prove reproductions have been executed and recorded
		expect(fs.existsSync('test-results/effects-workspace-1920x1080.png')).toBe(true);
		expect(fs.existsSync('test-results/audio-workspace-1920x1080.png')).toBe(true);
	});
});
