import { expect, test } from '@playwright/test';

test.describe('AI Script & Best-Take Selection', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/editor');
		await page.evaluate(() => {
			window.localStorage.removeItem('tfve:workspace-state');
		});
		await expect(page.locator('.editor-shell')).toBeVisible();

		const manager = page.getByRole('dialog', { name: 'Your Projects' });
		await expect(manager).toBeVisible();
		await manager.getByRole('button', { name: 'New project' }).click();
		const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
		await createDialog.getByRole('textbox', { name: 'Project name' }).fill('AI Takes Test');
		await createDialog.getByRole('button', { name: 'Create project' }).click();
		await expect(createDialog).toHaveCount(0);
		await expect(manager).toHaveCount(0);
		await expect(page.locator('.editor-workspace')).toBeVisible();
	});

	test('switches to AI workspace and manages script import & editing', async ({ page }) => {
		await page.click('.workspace-tab:has-text("AI")');

		// Switch to Script panel in the AI stack
		await page.click('.layout-tab:has-text("Script")');
		const scriptPanel = page.getByTestId('script-panel');
		await expect(scriptPanel).toBeVisible();

		// Initially shows empty script prompt
		await expect(scriptPanel.getByText('No script imported')).toBeVisible();

		// Click Paste button to open modal
		await scriptPanel.getByRole('button', { name: 'Paste Text' }).click();
		await expect(scriptPanel.getByText('Paste Script Text')).toBeVisible();

		// Fill dialogue script text
		const sampleScript = `HOST: Welcome to our video demonstration.
HOST: In this episode we test automatic take selection.
GUEST: It is wonderful to pair-program with you.`;

		await scriptPanel.locator('textarea').fill(sampleScript);
		await scriptPanel.getByRole('button', { name: 'Import' }).click();

		// Verify script lines parsed
		await expect(scriptPanel.getByText('3 Lines (PASTED)')).toBeVisible();
		await expect(scriptPanel.getByText('Speaker Track Mapping')).toBeVisible();
		await expect(scriptPanel.getByText('HOST').first()).toBeVisible();
		await expect(scriptPanel.getByText('GUEST').first()).toBeVisible();

		// Verify line text
		await expect(scriptPanel.getByText('Welcome to our video demonstration.')).toBeVisible();
		await expect(
			scriptPanel.getByText('In this episode we test automatic take selection.')
		).toBeVisible();

		// Toggle optional on line 3
		const optionalBtn = scriptPanel.getByRole('button', { name: 'Optional' }).nth(2);
		await optionalBtn.click();
		await expect(scriptPanel.getByRole('button', { name: 'Required' })).toBeVisible();
	});

	test('evaluates candidate takes with defect tags, scores, and rough-cut assembly', async ({
		page
	}) => {
		await page.click('.workspace-tab:has-text("AI")');

		// Set up a mock script, asset, and take groups directly on window.__TFVE_STORE__
		await page.evaluate(() => {
			const store = (
				window as unknown as {
					__TFVE_STORE__?: {
						getState: () => {
							setParsedScript: (script: unknown) => void;
							setTakeGroups: (groups: unknown[]) => void;
							project: {
								tracks: Array<{ id: string; kind: string; clips: unknown[] }>;
								assets: Record<string, unknown>;
							};
						};
						setState: (fn: (s: any) => void) => void;
					};
				}
			).__TFVE_STORE__;

			if (!store) return;
			store.setState((s) => {
				if (!s.project) return;
				s.project.assets['asset_1'] = {
					id: 'asset_1',
					kind: 'video',
					name: 'interview.mp4',
					mimeType: 'video/mp4',
					size: 1000,
					duration: 30_000_000,
					hasAudio: true,
					width: 1920,
					height: 1080,
					fps: 30,
					opfsPath: 'interview.mp4',
					offline: true
				};
			});

			const s = store.getState();
			const vTrack = s.project.tracks.find((t) => t.kind === 'video');
			const aTrack = s.project.tracks.find((t) => t.kind === 'audio');

			s.setParsedScript({
				id: 'script_test',
				title: 'Documentary Demo',
				speakers: ['NARRATOR'],
				lines: [
					{
						id: 'line_1',
						lineIndex: 1,
						speaker: 'NARRATOR',
						text: 'Welcome to this production.',
						optional: false
					},
					{
						id: 'line_2',
						lineIndex: 2,
						speaker: 'NARRATOR',
						text: 'This is the second line of the sequence.',
						optional: false
					}
				],
				format: 'txt'
			});

			s.setTakeGroups([
				{
					id: 'tg_line_1',
					scriptLineId: 'line_1',
					lineIndex: 1,
					selectedTakeId: 'take_1_b',
					candidates: [
						{
							id: 'take_1_a',
							scriptLineId: 'line_1',
							lineIndex: 1,
							clipId: 'c1',
							trackId: vTrack?.id ?? 'track-v1',
							audioTrackId: aTrack?.id ?? 'track-a1',
							assetId: 'asset_1',
							startUs: 0,
							endUs: 3_000_000,
							durationUs: 3_000_000,
							sourceIn: 0,
							sourceOut: 3_000_000,
							transcript: 'Um welcome to this production.',
							confidence: 0.82,
							alignmentScore: 18,
							defects: {
								clipping: false,
								lowSnr: false,
								stumble: true,
								restart: false,
								fillerWords: ['um'],
								longPause: false,
								incomplete: false
							},
							score: 72,
							scoreBreakdown: {
								accuracy: 80,
								completeness: 100,
								fluency: 60,
								audioQuality: 90,
								recency: 50
							}
						},
						{
							id: 'take_1_b',
							scriptLineId: 'line_1',
							lineIndex: 1,
							clipId: 'c2',
							trackId: vTrack?.id ?? 'track-v1',
							audioTrackId: aTrack?.id ?? 'track-a1',
							assetId: 'asset_1',
							startUs: 4_000_000,
							endUs: 7_000_000,
							durationUs: 3_000_000,
							sourceIn: 4_000_000,
							sourceOut: 7_000_000,
							transcript: 'Welcome to this production.',
							confidence: 0.98,
							alignmentScore: 24,
							defects: {
								clipping: false,
								lowSnr: false,
								stumble: false,
								restart: false,
								fillerWords: [],
								longPause: false,
								incomplete: false
							},
							score: 95,
							scoreBreakdown: {
								accuracy: 98,
								completeness: 100,
								fluency: 95,
								audioQuality: 92,
								recency: 100
							},
							isChosen: true
						}
					]
				}
			]);
		});

		const takesPanel = page.getByTestId('takes-panel');
		await expect(takesPanel).toBeVisible();

		// Check defect tag and scores in TakesPanel
		await expect(takesPanel.getByText('Stumble')).toBeVisible();
		await expect(takesPanel.getByText('Filler: "um"')).toBeVisible();
		await expect(takesPanel.getByText('Score: 95')).toBeVisible();
		await expect(takesPanel.getByText('Score: 72')).toBeVisible();
		await expect(takesPanel.getByText('✓ Selected')).toBeVisible();

		// Switch chosen take to Take 1
		const chooseTake1Btn = takesPanel.getByRole('button', { name: 'Choose Take' });
		await chooseTake1Btn.click();
		await expect(takesPanel.getByRole('button', { name: '✓ Selected' })).toBeVisible();

		// Assemble rough cut
		const assembleBtn = takesPanel.getByRole('button', { name: 'Assemble Rough Cut' });
		await assembleBtn.click();

		// Verify Rough Cut sequence is created and active
		await page.waitForTimeout(300);
		const seqName = await page.evaluate(() => {
			const store = (
				window as unknown as {
					__TFVE_STORE__?: {
						getState: () => {
							project: { sequences?: Record<string, { name: string }> };
							activeSequenceId: string | null;
						};
					};
				}
			).__TFVE_STORE__;
			const s = store?.getState();
			if (!s?.activeSequenceId || !s.project.sequences) return null;
			return s.project.sequences[s.activeSequenceId]?.name;
		});

		expect(seqName).toContain('Rough Cut');

		// Verify clip on timeline displays Take badge
		const badge = page.getByTestId('clip-take-badge').first();
		await expect(badge).toBeVisible();
		await expect(badge).toContainText('Take');
	});

	test('swaps alternate take via timeline clip context menu', async ({ page }) => {
		await page.click('.workspace-tab:has-text("AI")');

		// Populate rough cut sequence with take metadata
		await page.evaluate(() => {
			const store = (
				window as unknown as {
					__TFVE_STORE__?: {
						getState: () => {
							assembleRoughCut: () => void;
							setParsedScript: (script: unknown) => void;
							setTakeGroups: (groups: unknown[]) => void;
							project: {
								tracks: Array<{ id: string; kind: string; clips: unknown[] }>;
							};
						};
						setState: (fn: (s: any) => void) => void;
					};
				}
			).__TFVE_STORE__;

			if (!store) return;
			store.setState((s) => {
				if (!s.project) return;
				s.project.assets['asset_1'] = {
					id: 'asset_1',
					kind: 'video',
					name: 'interview.mp4',
					mimeType: 'video/mp4',
					size: 1000,
					duration: 30_000_000,
					hasAudio: true,
					width: 1920,
					height: 1080,
					fps: 30,
					opfsPath: 'interview.mp4',
					offline: true
				};
			});

			const s = store.getState();
			const vTrack = s.project.tracks.find((t) => t.kind === 'video');
			const aTrack = s.project.tracks.find((t) => t.kind === 'audio');

			s.setParsedScript({
				id: 'script_context',
				title: 'Context Test Script',
				speakers: [],
				lines: [
					{
						id: 'line_ctx_1',
						lineIndex: 1,
						text: 'Here is line one of the script.',
						optional: false
					}
				],
				format: 'txt'
			});

			s.setTakeGroups([
				{
					id: 'tg_ctx_1',
					scriptLineId: 'line_ctx_1',
					lineIndex: 1,
					selectedTakeId: 'take_opt_1',
					candidates: [
						{
							id: 'take_opt_1',
							scriptLineId: 'line_ctx_1',
							lineIndex: 1,
							clipId: 'c_opt_1',
							trackId: vTrack?.id ?? 'track-v1',
							audioTrackId: aTrack?.id ?? 'track-a1',
							assetId: 'asset_1',
							startUs: 0,
							endUs: 2_000_000,
							durationUs: 2_000_000,
							sourceIn: 0,
							sourceOut: 2_000_000,
							transcript: 'Take one audio delivery.',
							confidence: 0.9,
							alignmentScore: 20,
							defects: {
								clipping: false,
								lowSnr: false,
								stumble: false,
								restart: false,
								fillerWords: [],
								longPause: false,
								incomplete: false
							},
							score: 88,
							scoreBreakdown: {
								accuracy: 90,
								completeness: 100,
								fluency: 90,
								audioQuality: 90,
								recency: 50
							},
							isChosen: true
						},
						{
							id: 'take_opt_2',
							scriptLineId: 'line_ctx_1',
							lineIndex: 1,
							clipId: 'c_opt_2',
							trackId: vTrack?.id ?? 'track-v1',
							audioTrackId: aTrack?.id ?? 'track-a1',
							assetId: 'asset_1',
							startUs: 3_000_000,
							endUs: 6_000_000,
							durationUs: 3_000_000,
							sourceIn: 3_000_000,
							sourceOut: 6_000_000,
							transcript: 'Take two alternate delivery.',
							confidence: 0.95,
							alignmentScore: 22,
							defects: {
								clipping: false,
								lowSnr: false,
								stumble: false,
								restart: false,
								fillerWords: [],
								longPause: false,
								incomplete: false
							},
							score: 94,
							scoreBreakdown: {
								accuracy: 95,
								completeness: 100,
								fluency: 92,
								audioQuality: 95,
								recency: 100
							}
						}
					]
				}
			]);

			// Assemble rough cut
			s.assembleRoughCut();
		});

		// Timeline clip should now have take badge
		const clipView = page.locator('.timeline-clip').first();
		await expect(clipView).toBeVisible();

		// Right click on the clip to open context menu
		await clipView.click({ button: 'right' });
		const contextMenu = page.locator('.timeline-context-menu');
		await expect(contextMenu).toBeVisible();

		// Verify alternate take options
		await expect(contextMenu.getByText('Choose Alternate Take:')).toBeVisible();
		await expect(contextMenu.getByText('Take 1 (Active)')).toBeVisible();
		await expect(contextMenu.getByText('Take 2')).toBeVisible();

		// Click Take 2 to swap
		await contextMenu.getByRole('button', { name: /Take 2/ }).click();

		// Verify context menu closed and candidate swapped
		await expect(contextMenu).toHaveCount(0);

		// Reopen context menu to verify Take 2 is now Active
		await clipView.click({ button: 'right' });
		await expect(page.locator('.timeline-context-menu').getByText('Take 2 (Active)')).toBeVisible();
	});
});
