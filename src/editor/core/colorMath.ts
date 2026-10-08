/**
 * Color math reference implementations in 8-bit gamma-encoded sRGB / Rec.709 color space.
 * All RGB inputs and outputs are normalized to [0, 1] unless specified otherwise.
 */

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export function clamp01(v: number): number {
	return Math.min(1, Math.max(0, v));
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/** Rec.709 luma coefficients. */
export function rec709Luma(r: number, g: number, b: number): number {
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Converts RGB [0, 1] to HSL [h: 0-360, s: 0-1, l: 0-1]. */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;

	if (delta > 1e-6) {
		s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
		if (max === r) {
			h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
		} else if (max === g) {
			h = ((b - r) / delta + 2) * 60;
		} else {
			h = ((r - g) / delta + 4) * 60;
		}
	}

	return [h, s, l];
}

/** Converts HSL [h: 0-360, s: 0-1, l: 0-1] to RGB [0, 1]. */
export function hslToRgb(h: number, s: number, l: number): RGB {
	if (s < 1e-6) return [l, l, l];

	const hue2rgb = (p: number, q: number, t: number): number => {
		let tt = t;
		if (tt < 0) tt += 1;
		if (tt > 1) tt -= 1;
		if (tt < 1 / 6) return p + (q - p) * 6 * tt;
		if (tt < 1 / 2) return q;
		if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
		return p;
	};

	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const hk = h / 360;

	return [
		clamp01(hue2rgb(p, q, hk + 1 / 3)),
		clamp01(hue2rgb(p, q, hk)),
		clamp01(hue2rgb(p, q, hk - 1 / 3))
	];
}

/** Converts RGB [0, 1] to BT.709 YCbCr [Y: 0-1, Cb: -0.5 to 0.5, Cr: -0.5 to 0.5]. */
export function rgbToYcbcr(r: number, g: number, b: number): [number, number, number] {
	const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	const cb = (b - y) / 1.8556;
	const cr = (r - y) / 1.5748;
	return [y, cb, cr];
}

/** Converts BT.709 YCbCr [Y: 0-1, Cb: -0.5 to 0.5, Cr: -0.5 to 0.5] to RGB [0, 1]. */
export function ycbcrToRgb(y: number, cb: number, cr: number): RGB {
	const r = y + 1.5748 * cr;
	const g = y - 0.1873 * cb - 0.4681 * cr;
	const b = y + 1.8556 * cb;
	return [clamp01(r), clamp01(g), clamp01(b)];
}

/** Exposure adjustment in EV stops: color * 2^EV. */
export function applyExposure(r: number, g: number, b: number, ev: number): RGB {
	if (Math.abs(ev) < 1e-5) return [r, g, b];
	const factor = Math.pow(2, ev);
	return [clamp01(r * factor), clamp01(g * factor), clamp01(b * factor)];
}

/** Contrast adjustment pivoted at 0.5: (c - 0.5) * (1 + contrast) + 0.5. */
export function applyContrast(r: number, g: number, b: number, contrast: number): RGB {
	if (Math.abs(contrast) < 1e-5) return [r, g, b];
	const factor = 1 + contrast;
	return [
		clamp01((r - 0.5) * factor + 0.5),
		clamp01((g - 0.5) * factor + 0.5),
		clamp01((b - 0.5) * factor + 0.5)
	];
}

/** Temperature & Tint adjustments: temp shifts Blue/Red, tint shifts Green. */
export function applyTemperatureTint(
	r: number,
	g: number,
	b: number,
	temperature: number,
	tint: number
): RGB {
	let nr = r;
	let ng = g;
	let nb = b;

	if (Math.abs(temperature) >= 1e-5) {
		nr += temperature * 0.15;
		nb -= temperature * 0.15;
	}
	if (Math.abs(tint) >= 1e-5) {
		ng -= tint * 0.15;
	}

	return [clamp01(nr), clamp01(ng), clamp01(nb)];
}

/** Saturation adjustment: lerp between Rec.709 luma and color. */
export function applySaturation(r: number, g: number, b: number, saturation: number): RGB {
	if (Math.abs(saturation) < 1e-5) return [r, g, b];
	const luma = rec709Luma(r, g, b);
	const factor = 1 + saturation;
	return [
		clamp01(lerp(luma, r, factor)),
		clamp01(lerp(luma, g, factor)),
		clamp01(lerp(luma, b, factor))
	];
}

/** Vibrance adjustment: selectively increases saturation of less saturated pixels. */
export function applyVibrance(r: number, g: number, b: number, vibrance: number): RGB {
	if (Math.abs(vibrance) < 1e-5) return [r, g, b];
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const sat = max - min;
	const luma = rec709Luma(r, g, b);
	// Boost is inversely proportional to existing saturation
	const factor = 1 + vibrance * (1 - sat);
	return [
		clamp01(lerp(luma, r, factor)),
		clamp01(lerp(luma, g, factor)),
		clamp01(lerp(luma, b, factor))
	];
}

/** Tonal curve for highlights, shadows, whites, blacks. */
export function applyTone(
	r: number,
	g: number,
	b: number,
	highlights: number,
	shadows: number,
	whites: number,
	blacks: number
): RGB {
	const luma = rec709Luma(r, g, b);
	let offset = 0;

	// Shadows (smooth falloff towards midtone)
	if (Math.abs(shadows) >= 1e-5) {
		const shadowWeight = Math.pow(Math.max(0, 1 - luma * 2), 1.5);
		offset += shadows * shadowWeight * 0.25;
	}

	// Highlights (smooth falloff towards midtone)
	if (Math.abs(highlights) >= 1e-5) {
		const highlightWeight = Math.pow(Math.max(0, (luma - 0.5) * 2), 1.5);
		offset += highlights * highlightWeight * 0.25;
	}

	// Blacks (deep toe)
	if (Math.abs(blacks) >= 1e-5) {
		const blackWeight = Math.pow(Math.max(0, 1 - luma * 4), 2);
		offset += blacks * blackWeight * 0.2;
	}

	// Whites (top shoulder)
	if (Math.abs(whites) >= 1e-5) {
		const whiteWeight = Math.pow(Math.max(0, (luma - 0.75) * 4), 2);
		offset += whites * whiteWeight * 0.2;
	}

	return [clamp01(r + offset), clamp01(g + offset), clamp01(b + offset)];
}

export interface ColorCorrectionParams {
	exposure?: number;
	contrast?: number;
	highlights?: number;
	shadows?: number;
	whites?: number;
	blacks?: number;
	temperature?: number;
	tint?: number;
	saturation?: number;
	vibrance?: number;
	mix?: number;
}

/** Combined primary color correction on a single RGB pixel. */
export function applyColorCorrection(
	r: number,
	g: number,
	b: number,
	params: ColorCorrectionParams
): RGB {
	const mix = params.mix ?? 1;
	if (mix <= 0) return [r, g, b];

	let [cr, cg, cb]: RGB = [r, g, b];

	// 1. Exposure
	if (params.exposure) [cr, cg, cb] = applyExposure(cr, cg, cb, params.exposure);
	// 2. Temp & Tint
	if (params.temperature || params.tint) {
		[cr, cg, cb] = applyTemperatureTint(cr, cg, cb, params.temperature ?? 0, params.tint ?? 0);
	}
	// 3. Contrast
	if (params.contrast) [cr, cg, cb] = applyContrast(cr, cg, cb, params.contrast);
	// 4. Highlights / Shadows / Whites / Blacks
	if (params.highlights || params.shadows || params.whites || params.blacks) {
		[cr, cg, cb] = applyTone(
			cr,
			cg,
			cb,
			params.highlights ?? 0,
			params.shadows ?? 0,
			params.whites ?? 0,
			params.blacks ?? 0
		);
	}
	// 5. Vibrance
	if (params.vibrance) [cr, cg, cb] = applyVibrance(cr, cg, cb, params.vibrance);
	// 6. Saturation
	if (params.saturation) [cr, cg, cb] = applySaturation(cr, cg, cb, params.saturation);

	if (mix >= 1) return [cr, cg, cb];
	return [lerp(r, cr, mix), lerp(g, cg, mix), lerp(b, cb, mix)];
}

/** Lift, Gamma, Gain, Offset grading model. */
export function applyLiftGammaGain(
	r: number,
	g: number,
	b: number,
	lift: RGB = [0, 0, 0],
	gamma: RGB = [1, 1, 1],
	gain: RGB = [1, 1, 1],
	offset: RGB = [0, 0, 0]
): RGB {
	const calcChannel = (c: number, l: number, gm: number, gn: number, off: number): number => {
		// Lift acts on blacks, gain on whites, gamma on midtones
		let val = c * gn + off;
		val = val + l * (1 - val);
		const safeGamma = Math.max(0.01, gm);
		val = Math.pow(Math.max(0, val), 1 / safeGamma);
		return clamp01(val);
	};

	return [
		calcChannel(r, lift[0], gamma[0], gain[0], offset[0]),
		calcChannel(g, lift[1], gamma[1], gain[1], offset[1]),
		calcChannel(b, lift[2], gamma[2], gain[2], offset[2])
	];
}

/** Trilinear sampling of a 3D LUT on CPU. Data is ordered R-fastest or as standard cube. */
export function sample3dLut(
	lutData: Float32Array,
	lutSize: number,
	r: number,
	g: number,
	b: number
): RGB {
	const n = lutSize;
	const cr = clamp01(r) * (n - 1);
	const cg = clamp01(g) * (n - 1);
	const cb = clamp01(b) * (n - 1);

	const r0 = Math.floor(cr);
	const r1 = Math.min(n - 1, r0 + 1);
	const g0 = Math.floor(cg);
	const g1 = Math.min(n - 1, g0 + 1);
	const b0 = Math.floor(cb);
	const b1 = Math.min(n - 1, b0 + 1);

	const dr = cr - r0;
	const dg = cg - g0;
	const db = cb - b0;

	// Cube index: r + g * n + b * n * n, with 3 (or 4) floats per entry
	const stride = lutData.length === n * n * n * 4 ? 4 : 3;
	const getEntry = (ir: number, ig: number, ib: number): RGB => {
		const idx = (ir + ig * n + ib * n * n) * stride;
		return [lutData[idx] ?? 0, lutData[idx + 1] ?? 0, lutData[idx + 2] ?? 0];
	};

	const c000 = getEntry(r0, g0, b0);
	const c100 = getEntry(r1, g0, b0);
	const c010 = getEntry(r0, g1, b0);
	const c110 = getEntry(r1, g1, b0);
	const c001 = getEntry(r0, g0, b1);
	const c101 = getEntry(r1, g0, b1);
	const c011 = getEntry(r0, g1, b1);
	const c111 = getEntry(r1, g1, b1);

	// Interpolate along R
	const c00 = [lerp(c000[0], c100[0], dr), lerp(c000[1], c100[1], dr), lerp(c000[2], c100[2], dr)];
	const c10 = [lerp(c010[0], c110[0], dr), lerp(c010[1], c110[1], dr), lerp(c010[2], c110[2], dr)];
	const c01 = [lerp(c001[0], c101[0], dr), lerp(c001[1], c101[1], dr), lerp(c001[2], c101[2], dr)];
	const c11 = [lerp(c011[0], c111[0], dr), lerp(c011[1], c111[1], dr), lerp(c011[2], c111[2], dr)];

	// Interpolate along G
	const c0 = [lerp(c00[0], c10[0], dg), lerp(c00[1], c10[1], dg), lerp(c00[2], c10[2], dg)];
	const c1 = [lerp(c01[0], c11[0], dg), lerp(c01[1], c11[1], dg), lerp(c01[2], c11[2], dg)];

	// Interpolate along B
	return [
		clamp01(lerp(c0[0], c1[0], db)),
		clamp01(lerp(c0[1], c1[1], db)),
		clamp01(lerp(c0[2], c1[2], db))
	];
}

/** Converts normalized RGB [0, 1] into uppercase 6-character hex string (#RRGGBB). */
export function rgbToHex(r: number, g: number, b: number): string {
	const toHex = (c: number) =>
		Math.round(clamp01(c) * 255)
			.toString(16)
			.padStart(2, '0')
			.toUpperCase();
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Parses hex string (#RGB, #RRGGBB, or #RRGGBBAA) into normalized RGB [0, 1]. Returns null if invalid. */
export function hexToRgb(hex: string): RGB | null {
	if (!hex || typeof hex !== 'string') return null;
	const clean = hex.trim().replace(/^#/, '');
	if (clean.length === 3) {
		const r = parseInt(clean[0]! + clean[0]!, 16);
		const g = parseInt(clean[1]! + clean[1]!, 16);
		const b = parseInt(clean[2]! + clean[2]!, 16);
		if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
			return [r / 255, g / 255, b / 255];
		}
	} else if (clean.length === 6 || clean.length === 8) {
		const r = parseInt(clean.slice(0, 2), 16);
		const g = parseInt(clean.slice(2, 4), 16);
		const b = parseInt(clean.slice(4, 6), 16);
		if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
			return [r / 255, g / 255, b / 255];
		}
	}
	return null;
}
