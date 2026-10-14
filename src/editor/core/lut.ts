export interface ParsedLut3D {
	title?: string;
	size: number;
	data: Float32Array; // RGBA packed (size^3 * 4)
	rawRgbData: Float32Array; // RGB packed (size^3 * 3)
	domainMin?: [number, number, number];
	domainMax?: [number, number, number];
}

export class LutParseError extends Error {
	constructor(
		message: string,
		public readonly line?: number
	) {
		super(line !== undefined ? `Line ${line}: ${message}` : message);
		this.name = 'LutParseError';
	}
}

/**
 * Parses an Adobe / DaVinci Resolve .cube 3D or 1D LUT file.
 * Supports sizes between 2 and 128 for 3D LUTs, and converts 1D LUTs to 3D.
 */
export function parseCubeLut(text: string): ParsedLut3D {
	const lines = text.split(/\r?\n/);
	let title: string | undefined;
	let size: number | undefined;
	let size1d: number | undefined;
	let domainMin: [number, number, number] | undefined;
	let domainMax: [number, number, number] | undefined;

	const rgbValues: number[] = [];
	let expectedTotal = 0;

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const rawLine = lines[lineIndex]!;
		const line = rawLine.trim();
		const lineNum = lineIndex + 1;

		if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith(';')) {
			continue;
		}

		// Handle TITLE header (may contain quotes or spaces)
		if (/^TITLE\b/i.test(line)) {
			const match = line.match(/^TITLE\s+(?:"([^"]*)"|'([^']*)'|(.*))$/i);
			if (match) title = (match[1] ?? match[2] ?? match[3] ?? '').trim();
			continue;
		}

		// Strip inline comments (# or //) for non-title lines
		const stripped = line
			.replace(/#.*$/, '')
			.replace(/\/\/.*$/, '')
			.trim();
		if (!stripped) continue;

		if (/^LUT_3D_SIZE\b/i.test(stripped)) {
			const parts = stripped.split(/\s+/);
			const parsedSize = parseInt(parts[1] ?? '', 10);
			if (Number.isNaN(parsedSize) || parsedSize < 2 || parsedSize > 128) {
				throw new LutParseError(
					`LUT_3D_SIZE must be an integer between 2 and 128, got "${parts[1]}"`,
					lineNum
				);
			}
			size = parsedSize;
			expectedTotal = size * size * size * 3;
			continue;
		}

		if (/^LUT_1D_SIZE\b/i.test(stripped)) {
			const parts = stripped.split(/\s+/);
			const parsed1D = parseInt(parts[1] ?? '', 10);
			if (Number.isNaN(parsed1D) || parsed1D < 2 || parsed1D > 65536) {
				throw new LutParseError(
					`LUT_1D_SIZE must be an integer between 2 and 65536, got "${parts[1]}"`,
					lineNum
				);
			}
			size1d = parsed1D;
			continue;
		}

		if (/^DOMAIN_MIN\b/i.test(stripped)) {
			const parts = stripped.split(/\s+/).slice(1).map(Number);
			if (parts.length === 3 && parts.every((v) => !Number.isNaN(v))) {
				domainMin = [parts[0]!, parts[1]!, parts[2]!];
			}
			continue;
		}

		if (/^DOMAIN_MAX\b/i.test(stripped)) {
			const parts = stripped.split(/\s+/).slice(1).map(Number);
			if (parts.length === 3 && parts.every((v) => !Number.isNaN(v))) {
				domainMax = [parts[0]!, parts[1]!, parts[2]!];
			}
			continue;
		}

		// Skip other recognized metadata/header keywords (e.g. LUT_3D_INPUT_RANGE, etc.)
		if (/^(?:LUT_\w+|INPUT_\w+|OUTPUT_\w+|DOMAIN_\w+)\b/i.test(stripped)) {
			continue;
		}

		// Data line: R G B (or single channel in some 1D LUTs)
		const tokens = stripped.split(/\s+/).filter(Boolean);
		for (const token of tokens) {
			const val = parseFloat(token);
			if (Number.isNaN(val)) {
				throw new LutParseError(`Invalid RGB numbers: "${stripped}"`, lineNum);
			}
			rgbValues.push(val);
		}
	}

	if (!size && !size1d) {
		throw new LutParseError('Missing LUT_3D_SIZE header');
	}

	if (size !== undefined) {
		if (rgbValues.length !== expectedTotal) {
			const parsedEntries = Math.floor(rgbValues.length / 3);
			const expectedEntries = size * size * size;
			throw new LutParseError(
				`Expected ${expectedEntries} LUT entries for size ${size}^3, found ${parsedEntries}`
			);
		}

		const rawRgbData = new Float32Array(rgbValues);
		const numEntries = size * size * size;
		const rgbaData = new Float32Array(numEntries * 4);

		for (let i = 0; i < numEntries; i += 1) {
			rgbaData[i * 4] = rgbValues[i * 3]!;
			rgbaData[i * 4 + 1] = rgbValues[i * 3 + 1]!;
			rgbaData[i * 4 + 2] = rgbValues[i * 3 + 2]!;
			rgbaData[i * 4 + 3] = 1.0;
		}

		return {
			title,
			size,
			data: rgbaData,
			rawRgbData,
			domainMin,
			domainMax
		};
	}

	// 1D LUT support: convert to 3D LUT (size 33)
	const isRgb = rgbValues.length === size1d! * 3;
	if (!isRgb && rgbValues.length !== size1d!) {
		throw new LutParseError(
			`Expected ${size1d} or ${size1d! * 3} LUT entries for 1D LUT of size ${size1d}, found ${rgbValues.length}`
		);
	}

	const sample1D = (t: number, channel: number): number => {
		const clamped = Math.max(0, Math.min(1, t));
		const pos = clamped * (size1d! - 1);
		const i = Math.floor(pos);
		const frac = pos - i;
		if (i >= size1d! - 1) {
			return isRgb ? rgbValues[(size1d! - 1) * 3 + channel]! : rgbValues[size1d! - 1]!;
		}
		const v0 = isRgb ? rgbValues[i * 3 + channel]! : rgbValues[i]!;
		const v1 = isRgb ? rgbValues[(i + 1) * 3 + channel]! : rgbValues[i + 1]!;
		return v0 * (1 - frac) + v1 * frac;
	};

	const S = 33;
	const numEntries = S * S * S;
	const rgbaData = new Float32Array(numEntries * 4);
	const rawRgbData = new Float32Array(numEntries * 3);
	let idx = 0;

	for (let b = 0; b < S; b += 1) {
		const bf = b / (S - 1);
		const outB = sample1D(bf, 2);
		for (let g = 0; g < S; g += 1) {
			const gf = g / (S - 1);
			const outG = sample1D(gf, 1);
			for (let r = 0; r < S; r += 1) {
				const rf = r / (S - 1);
				const outR = sample1D(rf, 0);

				rgbaData[idx * 4] = outR;
				rgbaData[idx * 4 + 1] = outG;
				rgbaData[idx * 4 + 2] = outB;
				rgbaData[idx * 4 + 3] = 1.0;

				rawRgbData[idx * 3] = outR;
				rawRgbData[idx * 3 + 1] = outG;
				rawRgbData[idx * 3 + 2] = outB;
				idx += 1;
			}
		}
	}

	return {
		title,
		size: S,
		data: rgbaData,
		rawRgbData,
		domainMin,
		domainMax
	};
}

/**
 * Generates an identity 3D LUT .cube text for a given size.
 */
export function generateIdentityCubeText(size = 17, title = 'Identity'): string {
	const lines = [`TITLE "${title}"`, `# Generated identity LUT`, `LUT_3D_SIZE ${size}`];
	for (let b = 0; b < size; b += 1) {
		for (let g = 0; g < size; g += 1) {
			for (let r = 0; r < size; r += 1) {
				const rf = (r / (size - 1)).toFixed(6);
				const gf = (g / (size - 1)).toFixed(6);
				const bf = (b / (size - 1)).toFixed(6);
				lines.push(`${rf} ${gf} ${bf}`);
			}
		}
	}
	return lines.join('\n');
}
