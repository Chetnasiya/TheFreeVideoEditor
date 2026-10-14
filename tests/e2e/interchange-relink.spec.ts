import { expect, test } from '@playwright/test';

test.describe('Gate S: Interchange & Relinking Verification', () => {
	test('renders What’s transferred feature matrix table for all 4 interchange formats in Export dialog', async ({
		page
	}) => {
		await page.goto('/editor');
		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await manager.getByRole('button', { name: 'New project' }).click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Interchange UI Test');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(page.getByRole('heading', { name: 'Interchange UI Test' })).toBeVisible();

		// Add media to timeline
		await page.locator('input[name="media-files"]').setInputFiles('tests/fixtures/colors.mp4');
		const media = page.getByRole('listbox', { name: 'Project media' });
		const asset = media.getByRole('option').first();
		await expect(asset).toBeVisible({ timeout: 20_000 });
		await asset.dragTo(page.locator('[data-track-lane]').first());
		await expect(page.locator('.timeline-clip')).toHaveCount(2);

		// Open Export dialog
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const exportDialog = page.getByRole('dialog', { name: 'Export' });
		await expect(exportDialog).toBeVisible();

		// Switch to Project file tab
		await exportDialog.getByRole('tab', { name: 'Project file' }).click();

		// Verify matrix for all 4 formats
		const formats = [
			{ value: 'xmeml', label: 'Premiere Pro XML' },
			{ value: 'edl', label: 'CMX3600 EDL' },
			{ value: 'fcpxml', label: 'Final Cut Pro XML' },
			{ value: 'otio', label: 'OpenTimelineIO' }
		];

		for (const fmt of formats) {
			await exportDialog.getByLabel('Format').selectOption(fmt.value);
			const matrix = exportDialog.locator('.interchange-matrix');
			await expect(matrix).toBeVisible();
			await expect(matrix.locator('summary')).toContainText(fmt.label);
			await expect(matrix.locator('.interchange-table tbody tr')).toHaveCount(8);

			// Verify status badges are present (native, approximated, metadata-only, or omitted)
			const badges = matrix.locator('.status-badge');
			await expect(badges.first()).toBeVisible();
		}
	});

	test('interchange roundtrip and offline media relinking audit', async ({ page }) => {
		await page.goto('/editor');
		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await manager.getByRole('button', { name: 'New project' }).click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('Roundtrip Project');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(page.getByRole('heading', { name: 'Roundtrip Project' })).toBeVisible();

		// Add media & clip
		await page.locator('input[name="media-files"]').setInputFiles('tests/fixtures/colors.mp4');
		const media = page.getByRole('listbox', { name: 'Project media' });
		const asset = media.getByRole('option').first();
		await expect(asset).toBeVisible({ timeout: 20_000 });
		await asset.dragTo(page.locator('[data-track-lane]').first());

		// Execute project export and re-import in memory via interop services
		const roundtripResult = await page.evaluate(async () => {
			const project = (window as any).__TFVE_STORE__?.getState()?.project;
			if (!project) throw new Error('Live project not available');

			const interopExport = await import('../../src/editor/services/interop/export');
			const interopImport = await import('../../src/editor/services/interop/import/importProject');
			const relink = await import('../../src/editor/services/interop/import/relink');

			// 1. Export to OTIO
			const otioStr = interopExport.exportInterchangeFile(project, 'otio');
			const otioIr = interopImport.parseInterchangeContent('otio', otioStr);

			// 2. Export to xmeml
			const xmemlStr = interopExport.exportInterchangeFile(project, 'xmeml');
			const xmemlIr = interopImport.parseInterchangeContent('xmeml', xmemlStr);

			// 3. Export to FCPXML
			const fcpxmlStr = interopExport.exportInterchangeFile(project, 'fcpxml');
			const fcpxmlIr = interopImport.parseInterchangeContent('fcpxml', fcpxmlStr);

			// 4. Missing assets and relink test
			const missing = relink.identifyMissingAssets(otioIr, new Map());
			const { project: offlineProj, offlineCount } = relink.interchangeToProject(otioIr);

			return {
				otioTracks: otioIr.tracks.length,
				xmemlTracks: xmemlIr.tracks.length,
				fcpxmlTracks: fcpxmlIr.tracks.length,
				missingCount: missing.length,
				offlineCount,
				offlineProjectDuration: offlineProj.settings.fps
			};
		});

		expect(roundtripResult.otioTracks).toBeGreaterThanOrEqual(1);
		expect(roundtripResult.xmemlTracks).toBeGreaterThanOrEqual(1);
		expect(roundtripResult.fcpxmlTracks).toBeGreaterThanOrEqual(1);
		expect(roundtripResult.missingCount).toBeGreaterThanOrEqual(1);
		expect(roundtripResult.offlineCount).toBeGreaterThanOrEqual(1);
	});
});
