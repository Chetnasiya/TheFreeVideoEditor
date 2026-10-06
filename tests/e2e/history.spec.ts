import { expect, test } from '@playwright/test';

test('session history, shortcut modal, keyboard undo and redo work accessibly', async ({
	page
}) => {
	const browserProblems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			browserProblems.push(`${message.type()}: ${message.text()}`);
		}
	});
	page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));

	await page.goto('/editor');
	await page
		.getByRole('dialog', { name: 'Your Projects' })
		.getByRole('button', { name: 'New project' })
		.click();
	const createDialog = page.getByRole('dialog', { name: 'Create a Project' });
	await createDialog.getByRole('textbox', { name: 'Project name' }).fill('History acceptance');
	await createDialog.getByRole('button', { name: 'Create project' }).click();
	await expect(page.getByRole('heading', { name: 'History acceptance' })).toBeVisible();

	await page.getByRole('button', { name: 'Rename project: History acceptance' }).click();
	const nameInput = page.getByRole('textbox', { name: 'Project name' });
	await nameInput.fill('Renamed with history');
	await nameInput.press('Enter');
	await expect(page.getByRole('heading', { name: 'Renamed with history' })).toBeVisible();
	await page.keyboard.press('Control+z');
	await expect(page.getByRole('heading', { name: 'History acceptance' })).toBeVisible();
	await page.keyboard.press('Control+Shift+z');
	await expect(page.getByRole('heading', { name: 'Renamed with history' })).toBeVisible();

	const tracks = page.locator('.timeline-track-row');
	await expect(tracks).toHaveCount(2);
	await page.keyboard.press('Control+Shift+v');
	await expect(tracks).toHaveCount(3);
	await page.keyboard.press('Control+z');
	await expect(tracks).toHaveCount(2);
	await page.keyboard.press('Control+Shift+z');
	await expect(tracks).toHaveCount(3);

	const helpButton = page.getByRole('button', { name: 'Help' });
	await helpButton.click();
	await page.getByRole('menuitem', { name: /Keyboard Shortcuts/ }).click();
	const shortcutsDialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
	await expect(shortcutsDialog).toBeVisible();
	await page.keyboard.press('Control+n');
	await expect(shortcutsDialog).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Create a Project' })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(shortcutsDialog).toHaveCount(0);
	await expect(helpButton).toBeFocused();

	await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 10_000 });
	expect(browserProblems).toEqual([]);
});
