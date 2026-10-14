import { strFromU8, unzipSync } from 'fflate';
import type { InterchangeTimeline } from '../../../core/interchange/ir';
import type { InterchangeFormat } from '../export';
import { parseOtio } from './importOtio';
import { parseEdl } from './importEdl';
import { parseFcpxml } from './importFcpxml';
import { parseXmeml } from './importXmeml';

export interface UnpackedInterchange {
	format: InterchangeFormat;
	timeline: InterchangeTimeline;
	packageFiles: Map<string, Uint8Array>;
}

export function detectInterchangeFormat(
	filename: string,
	content: string
): InterchangeFormat | 'zip' | 'unknown' {
	const lower = filename.toLowerCase();
	if (lower.endsWith('.zip')) return 'zip';
	if (lower.endsWith('.otio')) return 'otio';
	if (lower.endsWith('.fcpxml')) return 'fcpxml';
	if (lower.endsWith('.edl')) return 'edl';

	// Content sniffing
	const head = content.slice(0, 500).trim();
	if (head.startsWith('{') && content.includes('"OTIO_SCHEMA"')) return 'otio';
	if (head.includes('<fcpxml')) return 'fcpxml';
	if (head.includes('<xmeml') || head.includes('<!DOCTYPE xmeml>')) return 'xmeml';
	if (head.startsWith('TITLE:') || head.includes('FCM:')) return 'edl';
	if (head.includes('<sequence') && head.includes('<media>')) return 'xmeml';

	return 'unknown';
}

export function parseInterchangeContent(
	format: InterchangeFormat,
	text: string
): InterchangeTimeline {
	switch (format) {
		case 'otio':
			return parseOtio(text);
		case 'edl':
			return parseEdl(text);
		case 'fcpxml':
			return parseFcpxml(text);
		case 'xmeml':
			return parseXmeml(text);
		default:
			throw new Error(`Unsupported interchange format: "${format}"`);
	}
}

export async function unpackInterchangePackage(
	file: File | { name: string; buffer: ArrayBuffer }
): Promise<UnpackedInterchange> {
	const buffer = 'arrayBuffer' in file ? await file.arrayBuffer() : file.buffer;
	const files = unzipSync(new Uint8Array(buffer));
	const packageFiles = new Map<string, Uint8Array>();

	let projectFileName = '';
	let projectFileContent = '';
	let detectedFormat: InterchangeFormat | 'unknown' = 'unknown';

	for (const [path, bytes] of Object.entries(files)) {
		if (path.endsWith('/') || bytes.byteLength === 0) continue;
		packageFiles.set(path, bytes);

		const lower = path.toLowerCase();
		if (
			lower.endsWith('.otio') ||
			lower.endsWith('.fcpxml') ||
			lower.endsWith('.xml') ||
			lower.endsWith('.edl')
		) {
			const text = strFromU8(bytes);
			const fmt = detectInterchangeFormat(path, text);
			if (fmt !== 'zip' && fmt !== 'unknown') {
				projectFileName = path;
				projectFileContent = text;
				detectedFormat = fmt;
			}
		}
	}

	if (!projectFileName || detectedFormat === 'unknown') {
		throw new Error(
			'No valid interchange project file (.otio, .fcpxml, .xml, .edl) found inside ZIP package.'
		);
	}

	const timeline = parseInterchangeContent(detectedFormat, projectFileContent);

	return {
		format: detectedFormat,
		timeline,
		packageFiles
	};
}
