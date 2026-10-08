export interface BundledFont {
	family: string;
	displayName: string;
	category: 'sans' | 'display' | 'serif' | 'mono' | 'handwriting' | 'condensed';
	url: string;
	license: string;
}

export const BUNDLED_FONTS: readonly BundledFont[] = [
	{
		family: 'Inter',
		displayName: 'Inter (Sans)',
		category: 'sans',
		url: '/fonts/Inter-VariableFont_opsz,wght.ttf',
		license: 'OFL-1.1'
	},
	{
		family: 'Montserrat',
		displayName: 'Montserrat (Display Sans)',
		category: 'display',
		url: '/fonts/Montserrat-VariableFont_wght.ttf',
		license: 'OFL-1.1'
	},
	{
		family: 'Playfair Display',
		displayName: 'Playfair Display (Serif)',
		category: 'serif',
		url: '/fonts/PlayfairDisplay-VariableFont_wght.ttf',
		license: 'OFL-1.1'
	},
	{
		family: 'Roboto Mono',
		displayName: 'Roboto Mono (Monospace)',
		category: 'mono',
		url: '/fonts/RobotoMono-VariableFont_wght.ttf',
		license: 'Apache-2.0'
	},
	{
		family: 'Caveat',
		displayName: 'Caveat (Handwriting)',
		category: 'handwriting',
		url: '/fonts/Caveat-VariableFont_wght.ttf',
		license: 'OFL-1.1'
	},
	{
		family: 'Bebas Neue',
		displayName: 'Bebas Neue (Condensed Bold)',
		category: 'condensed',
		url: '/fonts/BebasNeue-Regular.ttf',
		license: 'OFL-1.1'
	}
];

const loadedFonts = new Set<string>();
const loadingPromises = new Map<string, Promise<boolean>>();

/**
 * Ensures a font family is loaded via FontFace.
 * Works in Window and DedicatedWorker contexts where FontFace is available.
 */
export async function ensureFontLoaded(family: string, url?: string): Promise<boolean> {
	if (loadedFonts.has(family)) return true;
	if (loadingPromises.has(family)) return loadingPromises.get(family)!;

	const loadPromise = (async () => {
		try {
			if (typeof FontFace === 'undefined') return true;

			// If font is bundled or custom url is given
			const fontInfo = BUNDLED_FONTS.find((f) => f.family.toLowerCase() === family.toLowerCase());
			const fontUrl = url || fontInfo?.url;

			if (!fontUrl) {
				// System fallback font (sans-serif, monospace, etc.)
				loadedFonts.add(family);
				return true;
			}

			const fontFace = new FontFace(family, `url(${fontUrl})`);
			const loadedFace = await fontFace.load();

			interface WithFonts {
				fonts?: FontFaceSet;
			}
			const globalFonts =
				typeof document !== 'undefined' ? document.fonts : (self as unknown as WithFonts).fonts;
			if (globalFonts) {
				globalFonts.add(loadedFace);
			}

			loadedFonts.add(family);
			return true;
		} catch {
			return false;
		} finally {
			loadingPromises.delete(family);
		}
	})();

	loadingPromises.set(family, loadPromise);
	return loadPromise;
}

/**
 * Synchronous check whether font is already loaded.
 */
export function isFontLoaded(family: string): boolean {
	if (
		[
			'sans-serif',
			'serif',
			'monospace',
			'cursive',
			'fantasy',
			'system-ui',
			'arial',
			'helvetica'
		].includes(family.toLowerCase())
	) {
		return true;
	}
	return loadedFonts.has(family);
}
