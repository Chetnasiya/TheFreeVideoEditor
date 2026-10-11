import { expect, test } from '@playwright/test';

test.describe('Opt-in Real Whisper STT Recognition Test', () => {
	test('transcribes speech-sample fixture using real on-device model', async ({ page }) => {
		test.setTimeout(240_000);
		// Only run when explicitly executed via test:captions:real or TFVE_REAL_STT=1
		const enabled =
			process.env.TFVE_REAL_STT === '1' || process.env.npm_lifecycle_event === 'test:captions:real';
		test.skip(
			!enabled,
			'Opt-in test skipped by default. Run with `npm run test:captions:real` to execute.'
		);

		await page.goto('/editor');
		const manager = page.locator('.project-manager-dialog');
		try {
			await manager.waitFor({ state: 'visible', timeout: 5000 });
			await manager.getByRole('button', { name: 'New project' }).click();
			const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
			await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Real STT Test');
			await createDialog.getByRole('button', { name: 'Create project' }).click();
			await expect(manager).not.toBeVisible();
			await expect(page.getByRole('heading', { name: /Real STT Test/ })).toBeVisible();
		} catch {}

		// Import speech audio fixture
		await page
			.locator('input[name="media-files"]')
			.setInputFiles('tests/fixtures/audio/speech-sample.wav');
		const media = page.getByRole('listbox', { name: 'Project media' });
		const mediaClip = media.getByRole('option').first();
		await expect(mediaClip).toBeVisible({ timeout: 20_000 });
		await mediaClip.dragTo(page.locator('[data-track-lane]').nth(1));
		await expect(page.locator('.timeline-clip').first()).toBeVisible();

		// Grant consent in localStorage
		await page.evaluate(() => {
			localStorage.setItem('tfve_stt_consent', 'true');
		});

		// 1. Open Captions tab
		const captionsTab = page.locator('#captions-panel-title');
		await captionsTab.click();

		// 2. Open Auto-Caption Modal
		await page.getByRole('button', { name: /Auto-Caption/i }).click();
		const modal = page
			.locator('dialog.editor-dialog')
			.filter({ hasText: 'Local AI Speech-to-Text' });
		await expect(modal).toBeVisible();

		// 3. Select Whisper Tiny (English)
		await modal.locator('select').first().selectOption('whisper-tiny.en');

		// 4. Click Start Auto-Caption
		const startBtn = modal.getByRole('button', { name: 'Start Auto-Caption' });
		await expect(startBtn).toBeVisible();
		await startBtn.click();

		// Wait for progress/completion (timeout up to 4 minutes for initial model download & shader compilation)
		const doneBtn = modal.getByRole('button', { name: 'Done' });
		await expect(doneBtn).toBeVisible({ timeout: 240_000 });
		await doneBtn.click();

		// Verify that caption cues exist and are editable
		const cue = page.locator('.caption-cue-textarea').first();
		await expect(cue).toBeVisible();
		const text = await cue.inputValue();
		expect(text.length).toBeGreaterThan(0);
	});
});
