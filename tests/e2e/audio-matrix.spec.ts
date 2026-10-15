import { expect, test, type Page } from '@playwright/test';

interface MatrixResult {
	control: string;
	uiWorks: boolean;
	previewChanges: boolean;
	exportChanges: boolean;
	measuredPreviewDeltaDb?: number;
	measuredExportDeltaDb?: number;
	rootCause: string;
}

const matrixResults: MatrixResult[] = [];

async function setupEditorWithFixture(
	page: Page,
	fixtureFile = 'tests/fixtures/audio/sine-1khz.wav'
): Promise<void> {
	await page.goto('/editor');
	await page.evaluate(() => localStorage.clear());
	await page.goto('/editor');

	// Create project
	await page
		.getByRole('dialog', { name: 'Your Projects' })
		.getByRole('button', { name: 'New project' })
		.click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Audio Matrix Diagnostic');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(createDialog).not.toBeVisible();

	// Import fixture
	await page.locator('input[name="media-files"]').setInputFiles(fixtureFile);
	const media = page.getByRole('listbox', { name: 'Project media' });
	const mediaClip = media.getByRole('option').first();
	await expect(mediaClip).toBeVisible({ timeout: 10_000 });

	// Drag to Audio 1 track lane
	await mediaClip.dragTo(page.getByRole('gridcell', { name: 'Audio 1 track lane' }), {
		targetPosition: { x: 30, y: 20 }
	});
	await expect(page.locator('.timeline-clip').first()).toBeVisible();

	// Ensure clip starts at t=0 so preview playback captures signal immediately
	await page.evaluate(() => {
		const store = (window as any).__TFVE_STORE__.getState();
		const track = store.project.tracks.find((t: any) => t.kind === 'audio');
		if (track?.clips[0] && track.clips[0].start > 0) {
			store.moveClips([track.clips[0].id], -track.clips[0].start);
		}
	});

	// Open Mixer (Alt+M)
	await page.keyboard.press('Alt+m');
	const mixer = page.locator('aside[aria-label="Audio Mixer"]');
	await expect(mixer).toBeVisible();
}

test.describe('Slice 1 Diagnostic: Audio Control-Effect Matrix', () => {
	test.afterAll(() => {
		console.log('\n=================== CONTROL-EFFECT MATRIX DIAGNOSTIC ===================');
		console.table(matrixResults);
		console.log('========================================================================\n');
	});

	test('1. Track Fader (0 dB -> -6 dB)', async ({ page }) => {
		await setupEditorWithFixture(page, 'tests/fixtures/audio/sine-1khz.wav');

		const mixer = page.locator('aside[aria-label="Audio Mixer"]');
		const trackStrip = mixer.locator('.channel-strip').first();

		// Baseline measurements
		const offlineBaseline = await page.evaluate(async () => {
			const project = (window as any).__TFVE_STORE__.getState().project;
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.renderOfflineSnapshot(project, 1000);
		});

		// Start preview playback
		await page.evaluate(async () => {
			await window.__tfvePlaybackTest?.engine?.play();
		});
		await page.waitForTimeout(500);
		const previewBaseline = await page.evaluate(async () => {
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.captureLiveMasterSnapshot(1000);
		});

		// Operate control: drag fader down or use wheel / store action via UI
		// Test UI interaction: double click resets to 0, dragging / clicking on fader column
		const faderCol = trackStrip.locator('.strip-fader-column');
		await faderCol.click({ position: { x: 10, y: 50 } }); // Click lower down on the fader track

		// Verify UI updated
		await expect(trackStrip.locator('.strip-gain-pill')).toBeVisible();
		const gainDbAfter = await page.evaluate(() => {
			const t = (window as any).__TFVE_STORE__
				.getState()
				.project.tracks.find((x: any) => x.kind === 'audio');
			return t.audio?.gainDb ?? 0;
		});
		const uiWorks = gainDbAfter < 0;

		// Measure Preview after change
		await page.waitForTimeout(300);
		const previewAfter = await page.evaluate(async () => {
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.captureLiveMasterSnapshot(1000);
		});

		// Measure Offline / Export after change
		const offlineAfter = await page.evaluate(async () => {
			const project = (window as any).__TFVE_STORE__.getState().project;
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.renderOfflineSnapshot(project, 1000);
		});

		const previewDeltaDb = previewAfter.rmsDb - previewBaseline.rmsDb;
		const offlineDeltaDb = offlineAfter.rmsDb - offlineBaseline.rmsDb;

		// In current un-repaired code:
		// preview does not change (bypasses graph: connects element straight to master)
		// export does not change (mixAudioChunk connects buffer straight to destination)
		const previewChanges = Math.abs(previewDeltaDb) > 1.0;
		const exportChanges = Math.abs(offlineDeltaDb) > 1.0;

		matrixResults.push({
			control: 'Track Fader (Mixer)',
			uiWorks,
			previewChanges,
			exportChanges,
			measuredPreviewDeltaDb: Math.round(previewDeltaDb * 10) / 10,
			measuredExportDeltaDb: Math.round(offlineDeltaDb * 10) / 10,
			rootCause:
				previewChanges && exportChanges
					? 'VERIFIED_WORKING'
					: 'audioEngine.ts connects media elements straight to master; mixAudioChunk in export ignores track.audio'
		});

		expect(uiWorks).toBe(true);
	});

	test('2. Track Pan (Center -> Hard Left)', async ({ page }) => {
		await setupEditorWithFixture(page, 'tests/fixtures/audio/stereo-440-880.wav');

		const mixer = page.locator('aside[aria-label="Audio Mixer"]');
		const trackStrip = mixer.locator('.channel-strip').first();

		// Baseline measurements
		const offlineBaseline = await page.evaluate(async () => {
			const project = (window as any).__TFVE_STORE__.getState().project;
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.renderOfflineSnapshot(project);
		});

		// Start preview playback
		await page.evaluate(async () => {
			await window.__tfvePlaybackTest?.engine?.play();
		});
		await page.waitForTimeout(500);
		const previewBaseline = await page.evaluate(async () => {
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.captureLiveMasterSnapshot();
		});

		// Adjust Pan slider to -1 (Hard Left)
		const panSlider = trackStrip.locator('.strip-pan-slider');
		await panSlider.fill('-1');
		await panSlider.dispatchEvent('change');

		const panVal = await page.evaluate(() => {
			const t = (window as any).__TFVE_STORE__
				.getState()
				.project.tracks.find((x: any) => x.kind === 'audio');
			return t.audio?.pan ?? 0;
		});
		const uiWorks = panVal === -1;

		await page.waitForTimeout(300);
		const previewAfter = await page.evaluate(async () => {
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.captureLiveMasterSnapshot();
		});

		const offlineAfter = await page.evaluate(async () => {
			const project = (window as any).__TFVE_STORE__.getState().project;
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.renderOfflineSnapshot(project);
		});

		const previewChanges = Math.abs(previewAfter.lRBalanceDb - previewBaseline.lRBalanceDb) > 3.0;
		const exportChanges = Math.abs(offlineAfter.lRBalanceDb - offlineBaseline.lRBalanceDb) > 3.0;

		matrixResults.push({
			control: 'Track Pan (Mixer)',
			uiWorks,
			previewChanges,
			exportChanges,
			measuredPreviewDeltaDb:
				Math.round((previewAfter.lRBalanceDb - previewBaseline.lRBalanceDb) * 10) / 10,
			measuredExportDeltaDb:
				Math.round((offlineAfter.lRBalanceDb - offlineBaseline.lRBalanceDb) * 10) / 10,
			rootCause: previewChanges && exportChanges ? 'VERIFIED_WORKING' : 'Pan not connected'
		});

		expect(uiWorks).toBe(true);
	});

	test('3. Track Mute & Solo', async ({ page }) => {
		await setupEditorWithFixture(page, 'tests/fixtures/audio/sine-1khz.wav');

		const mixer = page.locator('aside[aria-label="Audio Mixer"]');
		const trackStrip = mixer.locator('.channel-strip').first();

		// Baseline
		await page.evaluate(async () => {
			await window.__tfvePlaybackTest?.engine?.play();
		});
		await page.waitForTimeout(500);
		const previewBaseline = await page.evaluate(async () => {
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.captureLiveMasterSnapshot(1000);
		});

		// Click Mute (M) button
		const muteBtn = trackStrip.getByRole('button', { name: 'M' });
		await muteBtn.click();

		const isMuted = await page.evaluate(() => {
			const t = (window as any).__TFVE_STORE__
				.getState()
				.project.tracks.find((x: any) => x.kind === 'audio');
			return t.muted;
		});
		const uiWorks = isMuted === true;

		await page.waitForTimeout(300);
		const previewAfterMute = await page.evaluate(async () => {
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.captureLiveMasterSnapshot(1000);
		});

		const offlineAfterMute = await page.evaluate(async () => {
			const project = (window as any).__TFVE_STORE__.getState().project;
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.renderOfflineSnapshot(project, 1000);
		});

		const previewChanges =
			previewAfterMute.rmsDb <= -70 || previewAfterMute.rmsDb < previewBaseline.rmsDb - 20;
		const exportChanges = offlineAfterMute.rmsDb <= -70;

		matrixResults.push({
			control: 'Track Mute / Solo',
			uiWorks,
			previewChanges,
			exportChanges,
			measuredPreviewDeltaDb:
				Math.round((previewAfterMute.rmsDb - previewBaseline.rmsDb) * 10) / 10,
			measuredExportDeltaDb: Math.round(offlineAfterMute.rmsDb * 10) / 10,
			rootCause:
				previewChanges && exportChanges
					? 'VERIFIED_WORKING'
					: 'mixAudioChunk in export renders muted tracks; graph mute/solo gate bypassed in preview'
		});

		expect(uiWorks).toBe(true);
	});

	test('4. Track EQ Popup (Enable & 1 kHz Boost)', async ({ page }) => {
		await setupEditorWithFixture(page, 'tests/fixtures/audio/sine-1khz.wav');

		const mixer = page.locator('aside[aria-label="Audio Mixer"]');
		const trackStrip = mixer.locator('.channel-strip').first();

		// Open EQ popup
		await trackStrip.getByRole('button', { name: 'EQ' }).click();
		const eqDialog = page.getByRole('dialog', { name: /Track EQ/i });
		await expect(eqDialog).toBeVisible();

		// Toggle Enable
		await eqDialog.getByLabel('Enabled').click();

		// Close popup
		await eqDialog.getByRole('button', { name: 'Done' }).click();
		await expect(eqDialog).not.toBeVisible();

		const eqState = await page.evaluate(() => {
			const t = (window as any).__TFVE_STORE__
				.getState()
				.project.tracks.find((x: any) => x.kind === 'audio');
			return t.audio?.eq;
		});
		const uiWorks = eqState?.enabled === true;

		// Baseline measurements before EQ boost
		const offlineBaseline = await page.evaluate(async () => {
			const project = (window as any).__TFVE_STORE__.getState().project;
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.renderOfflineSnapshot(project, 1000);
		});

		await page.evaluate(async () => {
			await window.__tfvePlaybackTest?.engine?.play();
		});
		await page.waitForTimeout(500);
		const previewBaseline = await page.evaluate(async () => {
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.captureLiveMasterSnapshot(1000);
		});

		// Set +12 dB boost at 1 kHz in store
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__.getState();
			const t = store.project.tracks.find((x: any) => x.kind === 'audio');
			const nextEq = {
				...t.audio.eq,
				enabled: true,
				bands: t.audio.eq.bands.map((b: any) =>
					b.type === 'peaking' ? { ...b, frequencyHz: 1000, gainDb: 12 } : b
				)
			};
			store.setTrackAudioEq(t.id, nextEq);
		});

		await page.waitForTimeout(300);
		const previewAfter = await page.evaluate(async () => {
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.captureLiveMasterSnapshot(1000);
		});

		const offlineAfter = await page.evaluate(async () => {
			const project = (window as any).__TFVE_STORE__.getState().project;
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.renderOfflineSnapshot(project, 1000);
		});

		const previewDeltaDb = previewAfter.rmsDb - previewBaseline.rmsDb;
		const offlineDeltaDb = offlineAfter.rmsDb - offlineBaseline.rmsDb;
		const previewChanges = previewDeltaDb > 1.0;
		const exportChanges = offlineDeltaDb > 1.0;

		matrixResults.push({
			control: 'Track EQ Bands & Enable',
			uiWorks,
			previewChanges,
			exportChanges,
			measuredPreviewDeltaDb: Math.round(previewDeltaDb * 10) / 10,
			measuredExportDeltaDb: Math.round(offlineDeltaDb * 10) / 10,
			rootCause: previewChanges && exportChanges ? 'VERIFIED_WORKING' : 'EQ filters not connected'
		});

		expect(uiWorks).toBe(true);
	});

	test('5. Track Compressor / Dynamics Popup', async ({ page }) => {
		await setupEditorWithFixture(page, 'tests/fixtures/audio/sine-1khz.wav');

		const mixer = page.locator('aside[aria-label="Audio Mixer"]');
		const trackStrip = mixer.locator('.channel-strip').first();

		// Baseline measurements
		const offlineBaseline = await page.evaluate(async () => {
			const project = (window as any).__TFVE_STORE__.getState().project;
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.renderOfflineSnapshot(project, 1000);
		});

		await page.evaluate(async () => {
			await window.__tfvePlaybackTest?.engine?.play();
		});
		await page.waitForTimeout(500);
		const previewBaseline = await page.evaluate(async () => {
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.captureLiveMasterSnapshot(1000);
		});

		// Open DYN popup
		await trackStrip.getByRole('button', { name: 'DYN' }).click();
		const compDialog = page.getByRole('dialog', { name: /Compressor/i });
		await expect(compDialog).toBeVisible();

		// Toggle Enable
		await compDialog.getByLabel('Enabled').click();
		await compDialog.getByRole('button', { name: 'Done' }).click();
		await expect(compDialog).not.toBeVisible();

		const compState = await page.evaluate(() => {
			const t = (window as any).__TFVE_STORE__
				.getState()
				.project.tracks.find((x: any) => x.kind === 'audio');
			return t.audio?.compressor;
		});
		const uiWorks = compState?.enabled === true;

		// Set threshold -36 dB, ratio 8:1
		await page.evaluate(() => {
			const store = (window as any).__TFVE_STORE__.getState();
			const t = store.project.tracks.find((x: any) => x.kind === 'audio');
			store.setTrackAudioCompressor(t.id, {
				enabled: true,
				thresholdDb: -36,
				ratio: 8,
				attackMs: 5,
				releaseMs: 50,
				kneeDb: 0,
				makeupDb: 0
			});
		});

		await page.waitForTimeout(300);
		const previewAfter = await page.evaluate(async () => {
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.captureLiveMasterSnapshot(1000);
		});

		const offlineAfter = await page.evaluate(async () => {
			const project = (window as any).__TFVE_STORE__.getState().project;
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.renderOfflineSnapshot(project, 1000);
		});

		const previewDeltaDb = previewAfter.rmsDb - previewBaseline.rmsDb;
		const offlineDeltaDb = offlineAfter.rmsDb - offlineBaseline.rmsDb;
		const previewChanges = previewDeltaDb < -1.0;
		const exportChanges = offlineDeltaDb < -1.0;

		matrixResults.push({
			control: 'Track Compressor & Dynamics',
			uiWorks,
			previewChanges,
			exportChanges,
			measuredPreviewDeltaDb: Math.round(previewDeltaDb * 10) / 10,
			measuredExportDeltaDb: Math.round(offlineDeltaDb * 10) / 10,
			rootCause: previewChanges && exportChanges ? 'VERIFIED_WORKING' : 'Compressor not connected'
		});

		expect(uiWorks).toBe(true);
	});

	test('6. Master Fader & Master Limiter', async ({ page }) => {
		await setupEditorWithFixture(page, 'tests/fixtures/audio/sine-1khz.wav');

		const mixer = page.locator('aside[aria-label="Audio Mixer"]');
		const masterStrip = mixer.locator('.mixer-strip.is-master');

		// Baseline measurements
		const offlineBaseline = await page.evaluate(async () => {
			const project = (window as any).__TFVE_STORE__.getState().project;
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.renderOfflineSnapshot(project, 1000);
		});

		await page.evaluate(async () => {
			await window.__tfvePlaybackTest?.engine?.play();
		});
		await page.waitForTimeout(500);
		const previewBaseline = await page.evaluate(async () => {
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.captureLiveMasterSnapshot(1000);
		});

		// Toggle Limiter
		const limiterBtn = masterStrip.getByRole('button', { name: /LIMITER/ });
		await limiterBtn.click();

		const masterLimiter = await page.evaluate(() => {
			return (window as any).__TFVE_STORE__.getState().project.masterAudio?.limiter;
		});
		const uiWorks = masterLimiter === true;

		// Read True-Peak from master strip with limiter active to verify true-peak ceiling <= -0.5 dBTP
		await page.waitForTimeout(500);
		const tpTextWithLimiter = await masterStrip
			.locator('.strip-pan-header')
			.first()
			.locator('span')
			.nth(1)
			.textContent();
		const tpValue = parseFloat(tpTextWithLimiter?.replace(/[^\d.-]/g, '') || '0');
		const ceilingRespected = tpValue <= -0.5;

		// Set Master Fader -6 dB
		await page.evaluate(() => {
			(window as any).__TFVE_STORE__.getState().setMasterAudioGain(-6);
		});

		await page.waitForTimeout(300);
		const previewAfter = await page.evaluate(async () => {
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.captureLiveMasterSnapshot(1000);
		});

		const offlineAfter = await page.evaluate(async () => {
			const project = (window as any).__TFVE_STORE__.getState().project;
			return (window as any).__TFVE_AUDIO_DEBUG_TAP__.renderOfflineSnapshot(project, 1000);
		});

		const previewDeltaDb = previewAfter.rmsDb - previewBaseline.rmsDb;
		const offlineDeltaDb = offlineAfter.rmsDb - offlineBaseline.rmsDb;
		const previewChanges = Math.abs(previewDeltaDb) > 1.0;
		const exportChanges = Math.abs(offlineDeltaDb) > 1.0;

		matrixResults.push({
			control: 'Master Fader & Limiter',
			uiWorks: uiWorks && ceilingRespected,
			previewChanges,
			exportChanges,
			measuredPreviewDeltaDb: Math.round(previewDeltaDb * 10) / 10,
			measuredExportDeltaDb: Math.round(offlineDeltaDb * 10) / 10,
			rootCause:
				previewChanges && exportChanges ? 'VERIFIED_WORKING' : 'Master fader/limiter not connected'
		});

		expect(uiWorks).toBe(true);
		expect(ceilingRespected).toBe(true);
	});
});
