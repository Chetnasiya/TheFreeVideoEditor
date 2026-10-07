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
 * Parses an Adobe / DaVinci Resolve .cube 3D LUT file.
 * Supports sizes between 2 and 65.
 */
export function parseCubeLut(text: string): ParsedLut3D {
	const lines = text.split(/\r?\n/);
	let title: string | undefined;
	let size: number | undefined;
	let domainMin: [number, number, number] | undefined;
	let domainMax: [number, number, number] | undefined;

	const rgbValues: number[] = [];
	let expectedTotal = 0;

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const rawLine = lines[lineIndex]!;
		const line = rawLine.trim();
		const lineNum = lineIndex + 1;

		if (!line || line.startsWith('#')) {
			continue;
		}

		if (line.startsWith('TITLE')) {
			const match = line.match(/^TITLE\s+"?([^"]*)"?$/i);
			if (match) title = match[1];
			continue;
		}

		if (line.startsWith('LUT_3D_SIZE')) {
			const parts = line.split(/\s+/);
			const parsedSize = parseInt(parts[1] ?? '', 10);
			if (Number.isNaN(parsedSize) || parsedSize < 2 || parsedSize > 65) {
				throw new LutParseError(
					`LUT_3D_SIZE must be an integer between 2 and 65, got "${parts[1]}"`,
					lineNum
				);
			}
			size = parsedSize;
			expectedTotal = size * size * size * 3;
			continue;
		}

		if (line.startsWith('LUT_1D_SIZE')) {
			throw new LutParseError('LUT_1D_SIZE is not supported in this 3D LUT parser', lineNum);
		}

		if (line.startsWith('DOMAIN_MIN')) {
			const parts = line.split(/\s+/).slice(1).map(Number);
			if (parts.length === 3 && parts.every((v) => !Number.isNaN(v))) {
				domainMin = [parts[0]!, parts[1]!, parts[2]!];
			}
			continue;
		}

		if (line.startsWith('DOMAIN_MAX')) {
			const parts = line.split(/\s+/).slice(1).map(Number);
			if (parts.length === 3 && parts.every((v) => !Number.isNaN(v))) {
				domainMax = [parts[0]!, parts[1]!, parts[2]!];
			}
			continue;
		}

		// Data line: R G B
		const tokens = line.split(/\s+/);
		if (tokens.length >= 3) {
			const r = parseFloat(tokens[0]!);
			const g = parseFloat(tokens[1]!);
			const b = parseFloat(tokens[2]!);
			if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
				throw new LutParseError(`Invalid RGB numbers: "${line}"`, lineNum);
			}
			rgbValues.push(r, g, b);
		} else {
			throw new LutParseError(`Unexpected line format: "${line}"`, lineNum);
		}
	}

	if (!size) {
		throw new LutParseError('Missing LUT_3D_SIZE header');
	}

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
