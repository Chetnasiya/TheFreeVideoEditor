/**
 * Font loading management for text rendering.
 * Handles FontFace registration and loading in preview and export worker contexts.
 */

export interface FontSpec {
	family: string;
	url: string;
	weight?: string;
	style?: string;
}

class FontLoader {
	private loadedFonts = new Set<string>();
	private pendingFonts = new Map<string, Promise<void>>();

	/**
	 * Register and load a font via FontFace API.
	 * Works in both main thread and Worker contexts.
	 */
	async loadFont(spec: FontSpec): Promise<void> {
		const key = `${spec.family}|${spec.weight}|${spec.style}`;

		// Already loaded
		if (this.loadedFonts.has(key)) {
			return;
		}

		// Already loading
		if (this.pendingFonts.has(key)) {
			return this.pendingFonts.get(key);
		}

		// Start loading
		const promise = this.doLoadFont(spec, key);
		this.pendingFonts.set(key, promise);

		try {
			await promise;
			this.loadedFonts.add(key);
		} finally {
			this.pendingFonts.delete(key);
		}
	}

	private async doLoadFont(spec: FontSpec, key: string): Promise<void> {
		try {
			const fontFace = new FontFace(spec.family, `url(${spec.url})`, {
				weight: spec.weight || 'normal',
				style: spec.style || 'normal'
			});

			const loaded = await fontFace.load();
			if (document.fonts) {
				document.fonts.add(loaded);
			}
		} catch (err) {
			console.warn(`Failed to load font ${spec.family}:`, err);
			// Don't throw - allow rendering to continue with fallback font
		}
	}

	/**
	 * Load a font from a File object (used in export worker).
	 */
	async loadFontFromFile(family: string, file: File, weight?: string, style?: string): Promise<void> {
		const key = `${family}|${weight}|${style}`;

		if (this.loadedFonts.has(key)) {
			return;
		}

		try {
			const url = URL.createObjectURL(file);
			await this.loadFont({
				family,
				url,
				weight,
				style
			});
		} catch (err) {
			console.warn(`Failed to load font from file:`, err);
		}
	}

	/**
	 * Check if a font is loaded or loading.
	 */
	isFontLoaded(family: string, weight?: string, style?: string): boolean {
		const key = `${family}|${weight}|${style}`;
		return this.loadedFonts.has(key);
	}

	/**
	 * Clear all loaded fonts.
	 */
	reset() {
		this.loadedFonts.clear();
		this.pendingFonts.clear();
	}
}

// Global singleton
let globalFontLoader: FontLoader | null = null;

export function getGlobalFontLoader(): FontLoader {
	if (!globalFontLoader) {
		globalFontLoader = new FontLoader();
	}
	return globalFontLoader;
}

/**
 * Bundled fonts configuration.
 * These ship with the editor and are self-hosted (no external network requests).
 */
export const BUNDLED_FONTS: Record<string, FontSpec[]> = {
	'Inter': [
		{
			family: 'Inter',
			url: '/fonts/inter-regular.woff2',
			weight: '400',
			style: 'normal'
		},
		{
			family: 'Inter',
			url: '/fonts/inter-bold.woff2',
			weight: '700',
			style: 'normal'
		}
	],
	'Oswald': [
		{
			family: 'Oswald',
			url: '/fonts/oswald-bold.woff2',
			weight: '700',
			style: 'normal'
		}
	],
	'Playfair Display': [
		{
			family: 'Playfair Display',
			url: '/fonts/playfair-display-bold.woff2',
			weight: '700',
			style: 'normal'
		}
	],
	'Roboto Mono': [
		{
			family: 'Roboto Mono',
			url: '/fonts/roboto-mono-regular.woff2',
			weight: '400',
			style: 'normal'
		}
	],
	'Caveat': [
		{
			family: 'Caveat',
			url: '/fonts/caveat-regular.woff2',
			weight: '400',
			style: 'normal'
		}
	],
	'Bebas Neue': [
		{
			family: 'Bebas Neue',
			url: '/fonts/bebas-neue-regular.woff2',
			weight: '400',
			style: 'normal'
		}
	]
};

/**
 * Preload all bundled fonts on app startup.
 */
export async function preloadBundledFonts() {
	const loader = getGlobalFontLoader();
	const fontPromises: Promise<void>[] = [];

	for (const specs of Object.values(BUNDLED_FONTS)) {
		for (const spec of specs) {
			fontPromises.push(loader.loadFont(spec));
		}
	}

	await Promise.all(fontPromises);
}

/**
 * Get available font families (bundled + user fonts).
 */
export function getAvailableFonts(userFonts?: string[]): string[] {
	const bundled = Object.keys(BUNDLED_FONTS);
	return userFonts ? [...bundled, ...userFonts] : bundled;
}
