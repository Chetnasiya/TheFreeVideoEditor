import { expect, test } from '@playwright/test';

test('project manager, autosave, duplication, deletion, and TFVE recovery work end to end', async ({
	page
}) => {
	test.setTimeout(90_000);
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
		Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
		Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
	});
	await page.goto('/editor');
	const manager = page.getByRole('dialog', { name: 'Your Projects' });
	await expect(manager).toBeVisible();
	await expect(manager.getByRole('heading', { name: 'No projects yet' })).toBeVisible();

	await manager.getByRole('button', { name: 'New project' }).click();
	const newProjectDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await newProjectDialog.getByRole('textbox', { name: 'Project name' }).fill('My First Cut');
	await newProjectDialog.getByLabel('Resolution').selectOption('1920x1080');
	await newProjectDialog.getByLabel('Frame rate').selectOption('30');
	await newProjectDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'My First Cut' })).toBeVisible();
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 10_000 });

	await page.getByRole('button', { name: 'Rename project: My First Cut' }).click();
	await page.getByRole('textbox', { name: 'Project name' }).fill('My First Cut');
	await page.locator('.save-status').evaluate((status) => {
		const observed: string[] = [];
		Object.defineProperty(window, 'tfveSaveStatuses', { value: observed, configurable: true });
		new MutationObserver(() => observed.push(status.textContent?.trim() ?? '')).observe(status, {
			characterData: true,
			childList: true,
			subtree: true
		});
	});
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 10_000 });
	const observedSaveStatuses = await page.evaluate(
		() => (window as Window & { tfveSaveStatuses?: string[] }).tfveSaveStatuses ?? []
	);
	expect(observedSaveStatuses).toContain('Saving…');
	expect(observedSaveStatuses).toContain('Saved');
	await page.keyboard.press('Control+s');
	const savePrompt = page.getByRole('dialog', { name: 'Save a project copy?' });
	await expect(savePrompt).toBeVisible();
	await savePrompt.getByRole('button', { name: 'Not now' }).click();

	await page.reload();
	await expect(page.getByRole('heading', { name: 'My First Cut' })).toBeVisible();

	await page.keyboard.press('Control+n');
	await page
		.getByRole('dialog', { name: 'Create a Project' })
		.getByRole('textbox', {
			name: 'Project name'
		})
		.fill('Second Project');
	await page
		.getByRole('dialog', { name: 'Create a Project' })
		.getByRole('button', {
			name: 'Create project'
		})
		.click();
	await expect(page.getByRole('heading', { name: 'Second Project' })).toBeVisible();
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 10_000 });

	await page.keyboard.press('Control+o');
	await expect(manager.getByText('My First Cut', { exact: true })).toBeVisible();
	await expect(manager.getByText('Second Project', { exact: true })).toBeVisible();
	await expect(manager.locator('.project-manager-row')).toHaveCount(2);
	const originalRow = manager.locator('.project-manager-row').nth(1);
	await originalRow.getByRole('button', { name: 'Duplicate' }).click();
	await expect(page.getByRole('heading', { name: 'My First Cut copy' })).toBeVisible();
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 10_000 });

	await page.getByRole('button', { name: 'File', exact: true }).click();
	await page.getByRole('menuitem', { name: /Open Project/ }).click();
	const duplicateRow = manager.locator('.project-manager-row').first();
	await duplicateRow.getByRole('button', { name: 'Delete' }).click();
	const deleteDialog = page.getByRole('dialog', { name: 'Delete “My First Cut copy”?' });
	await expect(deleteDialog).toBeVisible();
	await expect(deleteDialog).toContainText('media storage from this device');
	await deleteDialog.getByRole('button', { name: 'Delete project' }).click();
	await expect(manager.getByText('My First Cut copy', { exact: true })).toHaveCount(0);
	await page.reload();
	await expect(manager).toBeVisible();

	const originalAfterReload = manager.locator('.project-manager-row').nth(1);
	await originalAfterReload.getByRole('button', { name: 'Open' }).click();
	await expect(page.getByRole('heading', { name: 'My First Cut' })).toBeVisible();
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 10_000 });

	await page.getByRole('button', { name: 'File', exact: true }).click();
	await page.getByRole('menuitem', { name: /Save a Copy as \.tfve/ }).click();
	const saveCopyDialog = page.getByRole('dialog', { name: 'Save a project copy?' });
	await expect(saveCopyDialog).toBeVisible();
	const downloadPromise = page.waitForEvent('download');
	await saveCopyDialog.getByRole('button', { name: 'Save Copy as .tfve' }).click();
	const download = await downloadPromise;
	const projectFilePath = await download.path();
	expect(projectFilePath).not.toBeNull();

	await page.getByRole('button', { name: 'File', exact: true }).click();
	await page.getByRole('menuitem', { name: /Open Project/ }).click();
	const originalToDelete = manager.locator('.project-manager-row').nth(1);
	await originalToDelete.getByRole('button', { name: 'Delete' }).click();
	await page
		.getByRole('dialog', { name: 'Delete “My First Cut”?' })
		.getByRole('button', { name: 'Delete project' })
		.click();
	await expect(manager.getByText('My First Cut', { exact: true })).toHaveCount(0);

	const fileChooserPromise = page.waitForEvent('filechooser');
	await manager.getByRole('button', { name: 'Open .tfve project' }).click();
	const fileChooser = await fileChooserPromise;
	await fileChooser.setFiles(projectFilePath as string);
	await expect(page.getByRole('heading', { name: 'My First Cut' })).toBeVisible();
	await expect(page.locator('.workspace-resolution')).toContainText('1920 × 1080');
	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 10_000 });

	await page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('tfve');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(['meta', 'projects'], 'readwrite');
			const meta = transaction.objectStore('meta').get('lastOpenedProjectId');
			meta.onsuccess = () => {
				const id = meta.result?.value as string | undefined;
				if (!id) {
					reject(new Error('The last opened project id is missing.'));
					return;
				}
				const projects = transaction.objectStore('projects');
				const projectRequest = projects.get(id);
				projectRequest.onsuccess = () => {
					const record = projectRequest.result as
						{ id: string; updatedAt: string; value: { schemaVersion: number } } | undefined;
					if (!record) {
						reject(new Error('The saved project record is missing.'));
						return;
					}
					record.value.schemaVersion = 99;
					projects.put(record);
				};
				projectRequest.onerror = () => reject(projectRequest.error);
			};
			meta.onerror = () => reject(meta.error);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
		db.close();
	});

	await page.reload();
	const recovery = page.getByRole('dialog', { name: 'This project could not be opened' });
	await expect(recovery).toBeVisible();
	await expect(recovery).toContainText('newer than this editor supports');
	await recovery.getByRole('button', { name: 'Delete…' }).click();
	await recovery.getByRole('button', { name: 'Delete corrupt project' }).click();
	await expect(manager).toBeVisible();
	await expect(manager.getByText('My First Cut', { exact: true })).toHaveCount(0);

	expect(browserProblems).toEqual([]);
});
