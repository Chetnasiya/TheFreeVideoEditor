import { strFromU8, unzipSync } from 'fflate';
import type { ParsedScript, ScriptLine } from '../types';
import type { TrackId } from '../../../core/types';

/**
 * Generates an integer-based or unique identifier for script lines.
 */
function createScriptLineId(index: number): string {
	return `line_${index + 1}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Checks if a string looks like an all-caps speaker tag on its own line (e.g. "ALICE", "HOST 1").
 */
function isStandaloneSpeakerHeader(line: string): boolean {
	const trimmed = line.trim();
	if (trimmed.length < 2 || trimmed.length > 30) return false;
	// All uppercase letters, numbers, spaces, or hyphens, no end punctuation (. , ? !)
	return /^[A-Z0-9_\-\s]+$/.test(trimmed) && !/[.,?!:;]/.test(trimmed);
}

/**
 * Parses inline speaker prefix: e.g. "HOST: Welcome everyone" or "[SARAH] - Good morning"
 */
function parseInlineSpeaker(line: string): { speaker?: string; text: string } {
	const trimmed = line.trim();
	// Format 1: [Speaker] Text or (Speaker) Text
	const bracketMatch = trimmed.match(/^\[([^\]]+)\]\s*[:\-–—]?\s*(.*)$/);
	if (bracketMatch && bracketMatch[1] && bracketMatch[2]) {
		return { speaker: bracketMatch[1].trim(), text: bracketMatch[2].trim() };
	}

	// Format 2: NAME: Text
	const colonMatch = trimmed.match(/^([A-Za-z0-9_\-\s]{2,25})\s*[:]\s*(.*)$/);
	if (colonMatch && colonMatch[1] && colonMatch[2]) {
		const name = colonMatch[1].trim();
		// Avoid matching URLs like "http: ..." or "note: ..." if too long
		if (!/^(https?|ftp|file)$/i.test(name)) {
			return { speaker: name, text: colonMatch[2].trim() };
		}
	}

	return { text: trimmed };
}

/**
 * Normalizes script text into clean lines and extracts speakers.
 */
export function parseScriptFromText(
	rawText: string,
	title = 'Imported Script',
	format: ParsedScript['format'] = 'txt'
): ParsedScript {
	const rawLines = rawText.split(/\r?\n/);
	const lines: ScriptLine[] = [];
	const speakersSet = new Set<string>();

	let currentSpeaker: string | undefined = undefined;
	let lineIndex = 1;

	for (let i = 0; i < rawLines.length; i++) {
		let line = rawLines[i]!.trim();
		if (!line) continue;

		// Clean markdown headings, lists, bold/italic markers if md format
		if (format === 'md') {
			line = line
				.replace(/^#{1,6}\s+/, '') // Remove # headings
				.replace(/^[-*+]\s+/, '') // Remove bullet points
				.replace(/^\d+\.\s+/, '') // Remove numbered lists
				.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1'); // Remove bold/italic
			line = line.trim();
			if (!line) continue;
		}

		if (isStandaloneSpeakerHeader(line)) {
			currentSpeaker = line;
			speakersSet.add(currentSpeaker);
			continue;
		}

		const parsed = parseInlineSpeaker(line);
		const lineSpeaker: string | undefined = parsed.speaker ? parsed.speaker : currentSpeaker;
		if (lineSpeaker) {
			currentSpeaker = lineSpeaker;
			speakersSet.add(lineSpeaker);
		}

		const cleanText = parsed.text;
		if (!cleanText) continue;

		lines.push({
			id: createScriptLineId(lineIndex - 1),
			lineIndex,
			speaker: lineSpeaker,
			text: cleanText,
			optional: false
		});

		lineIndex++;
	}

	return {
		id: `script_${Date.now()}`,
		title,
		lines,
		rawText,
		speakers: Array.from(speakersSet),
		format
	};
}

/**
 * Parses SRT or WebVTT subtitle files into script lines.
 */
export function parseScriptFromSrtOrVtt(content: string, title = 'Subtitle Script'): ParsedScript {
	// Strip WEBVTT header if present
	const cleaned = content.replace(/^WEBVTT[^\n]*\n+/i, '');
	const blocks = cleaned.split(/\n\s*\n/);
	const rawLines: string[] = [];

	for (const block of blocks) {
		const lines = block
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter(Boolean);
		if (lines.length === 0) continue;

		// Skip index number if first line is digits only
		let startIdx = 0;
		if (/^\d+$/.test(lines[0]!)) {
			startIdx = 1;
		}

		// Skip timing line (e.g. "00:00:01,000 --> 00:00:04,000" or "00:00:01.000 --> 00:00:04.000")
		if (startIdx < lines.length && lines[startIdx]!.includes('-->')) {
			startIdx++;
		}

		const textLines = lines.slice(startIdx);
		if (textLines.length > 0) {
			// Strip HTML/formatting tags like <i>, <b>, <v Speaker>
			const fullText = textLines
				.join(' ')
				.replace(/<v\s+([^>]+)>/gi, '$1: ')
				.replace(/<\/?[^>]+(>|$)/g, '')
				.trim();
			if (fullText) {
				rawLines.push(fullText);
			}
		}
	}

	return parseScriptFromText(rawLines.join('\n'), title, 'srt');
}

/**
 * Parses a Microsoft Word (.docx) file by reading word/document.xml with fflate.
 * No external binaries, 100% on-device and offline.
 */
export function parseScriptFromDocx(
	data: ArrayBuffer | Uint8Array,
	title = 'Document Script'
): ParsedScript {
	const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
	const unzipped = unzipSync(u8);

	const docXmlU8 = unzipped['word/document.xml'];
	if (!docXmlU8) {
		throw new Error('Invalid .docx file: missing word/document.xml');
	}

	const xml = strFromU8(docXmlU8);

	// Extract paragraphs: <w:p ...>...</w:p>
	const pRegex = /<w:p(?:\s[^>]*)?>(.*?)<\/w:p>/gs;
	const tRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/gs;

	const paragraphs: string[] = [];
	let pMatch: RegExpExecArray | null;

	while ((pMatch = pRegex.exec(xml)) !== null) {
		const pContent = pMatch[1]!;
		let pText = '';
		let tMatch: RegExpExecArray | null;

		while ((tMatch = tRegex.exec(pContent)) !== null) {
			pText += tMatch[1]!;
		}

		const trimmed = pText.trim();
		if (trimmed) {
			paragraphs.push(trimmed);
		}
	}

	return parseScriptFromText(paragraphs.join('\n'), title, 'docx');
}

/**
 * Universal file parser for Script Import.
 */
export async function parseScriptFile(file: File): Promise<ParsedScript> {
	const name = file.name.toLowerCase();
	const title = file.name.replace(/\.[^/.]+$/, '');

	if (name.endsWith('.docx')) {
		const buffer = await file.arrayBuffer();
		return parseScriptFromDocx(buffer, title);
	}

	const text = await file.text();

	if (name.endsWith('.srt') || name.endsWith('.vtt')) {
		return parseScriptFromSrtOrVtt(text, title);
	}

	if (name.endsWith('.md')) {
		return parseScriptFromText(text, title, 'md');
	}

	return parseScriptFromText(text, title, 'txt');
}

/**
 * Merges multiple adjacent script lines into one.
 */
export function mergeScriptLines(script: ParsedScript, lineIds: string[]): ParsedScript {
	if (lineIds.length <= 1) return script;

	const idSet = new Set(lineIds);
	const selectedLines = script.lines.filter((l) => idSet.has(l.id));
	if (selectedLines.length <= 1) return script;

	const firstLine = selectedLines[0]!;
	const mergedText = selectedLines.map((l) => l.text).join(' ');

	const newLines: ScriptLine[] = [];
	let mergedAdded = false;

	for (const line of script.lines) {
		if (idSet.has(line.id)) {
			if (!mergedAdded) {
				newLines.push({
					...firstLine,
					text: mergedText
				});
				mergedAdded = true;
			}
		} else {
			newLines.push(line);
		}
	}

	// Re-index
	const reindexed = newLines.map((l, idx) => ({ ...l, lineIndex: idx + 1 }));

	return {
		...script,
		lines: reindexed
	};
}

/**
 * Splits a script line into two at the specified character offset.
 */
export function splitScriptLine(
	script: ParsedScript,
	lineId: string,
	splitOffset: number
): ParsedScript {
	const targetIdx = script.lines.findIndex((l) => l.id === lineId);
	if (targetIdx === -1) return script;

	const target = script.lines[targetIdx]!;
	const text = target.text;
	if (splitOffset <= 0 || splitOffset >= text.length) return script;

	const part1 = text.slice(0, splitOffset).trim();
	const part2 = text.slice(splitOffset).trim();

	const line1: ScriptLine = {
		...target,
		text: part1
	};

	const line2: ScriptLine = {
		id: createScriptLineId(target.lineIndex),
		lineIndex: target.lineIndex + 1,
		speaker: target.speaker,
		text: part2,
		trackId: target.trackId,
		optional: target.optional
	};

	const newLines = [
		...script.lines.slice(0, targetIdx),
		line1,
		line2,
		...script.lines.slice(targetIdx + 1)
	].map((l, idx) => ({ ...l, lineIndex: idx + 1 }));

	return {
		...script,
		lines: newLines
	};
}

/**
 * Deletes a script line.
 */
export function deleteScriptLine(script: ParsedScript, lineId: string): ParsedScript {
	const filtered = script.lines
		.filter((l) => l.id !== lineId)
		.map((l, idx) => ({ ...l, lineIndex: idx + 1 }));

	return {
		...script,
		lines: filtered
	};
}

/**
 * Toggles the optional flag on a script line.
 */
export function toggleScriptLineOptional(script: ParsedScript, lineId: string): ParsedScript {
	return {
		...script,
		lines: script.lines.map((l) => (l.id === lineId ? { ...l, optional: !l.optional } : l))
	};
}

/**
 * Assigns a speaker to a specific timeline audio track ID.
 */
export function assignSpeakerTrack(
	script: ParsedScript,
	speaker: string,
	trackId: TrackId | undefined
): ParsedScript {
	return {
		...script,
		lines: script.lines.map((l) => (l.speaker === speaker ? { ...l, trackId } : l))
	};
}
