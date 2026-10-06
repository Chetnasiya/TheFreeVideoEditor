export type ThemeMode = 'dark' | 'light';

export interface ThemeInitialization {
	mode: ThemeMode;
	persistenceAvailable: boolean;
}

const THEME_STORAGE_KEY = 'tfve:theme';

function isThemeMode(value: string | null): value is ThemeMode {
	return value === 'dark' || value === 'light';
}

function updateThemeColorMeta(): void {
	const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
	if (!meta) return;

	const canvasColor = getComputedStyle(document.documentElement)
		.getPropertyValue('--color-canvas')
		.trim();
	if (canvasColor) meta.content = canvasColor;
}

export function initializeTheme(): ThemeInitialization {
	let mode: ThemeMode = 'dark';
	let persistenceAvailable = true;

	try {
		const storedMode = window.localStorage.getItem(THEME_STORAGE_KEY);
		if (isThemeMode(storedMode)) mode = storedMode;
	} catch {
		persistenceAvailable = false;
	}

	document.documentElement.dataset.theme = mode;
	updateThemeColorMeta();

	return { mode, persistenceAvailable };
}

export function applyTheme(mode: ThemeMode): boolean {
	document.documentElement.dataset.theme = mode;
	updateThemeColorMeta();

	try {
		window.localStorage.setItem(THEME_STORAGE_KEY, mode);
		return true;
	} catch {
		return false;
	}
}
