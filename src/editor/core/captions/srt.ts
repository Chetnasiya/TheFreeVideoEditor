import type { CaptionSegment, Time } from '../types';
import { generateCaptionSegmentId } from './operations';

/**
 * Formats integer microseconds to SRT timestamp: HH:MM:SS,mmm
 */
export function timeToSrtTimestamp(us: Time): string {
	const clamped = Math.max(0, Math.floor(us));
	const totalMs = Math.floor(clamped / 1000);
	const ms = totalMs % 1000;
	const totalSec = Math.floor(totalMs / 1000);
	const sec = totalSec % 60;
	const totalMin = Math.floor(totalSec / 60);
	const min = totalMin % 60;
	const hours = Math.floor(totalMin / 60);

	return `${String(hours).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Parses SRT (or VTT) timestamp string to integer microseconds.
 * Accepts HH:MM:SS,mmm or HH:MM:SS.mmm or MM:SS,mmm
 */
export function srtTimestampToTime(ts: string): Time {
	const cleaned = ts.trim().replace(',', '.');
	const parts = cleaned.split(':');
	if (parts.length < 2) {
		throw new Error(`Invalid timestamp format: "${ts}"`);
	}

	let hours = 0;
	let minutes = 0;
	let seconds = 0;

	if (parts.length === 3) {
		hours = parseInt(parts[0]!, 10);
		minutes = parseInt(parts[1]!, 10);
		seconds = parseFloat(parts[2]!);
	} else {
		minutes = parseInt(parts[0]!, 10);
		seconds = parseFloat(parts[1]!);
	}

	if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
		throw new Error(`Invalid numeric timestamp: "${ts}"`);
	}

	const totalSeconds = hours * 3600 + minutes * 60 + seconds;
	return Math.max(0, Math.round(totalSeconds * 1_000_000));
}

/**
 * Strips HTML and formatting tags from subtitle text.
 */
export function stripSubtitleTags(text: string): string {
	return text
		.replace(/<\/?[^>]+(>|$)/g, '') // remove HTML tags
		.replace(/\{[^}]+\}/g, '') // remove ASS/SSA style tags
		.trim();
}

/**
 * Parses an SRT file content string into an array of CaptionSegments.
 */
export function parseSrt(content: string): CaptionSegment[] {
	if (!content) return [];

	// Strip BOM
	const sanitized = content
		.replace(/^\uFEFF/, '')
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n');

	const blocks = sanitized.split(/\n\n+/);
	const rawSegments: CaptionSegment[] = [];

	const timeRegex =
		/(\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3}|\d{1,2}:\d{2}[,\.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3}|\d{1,2}:\d{2}[,\.]\d{1,3})/;

	for (const block of blocks) {
		const trimmed = block.trim();
		if (!trimmed) continue;

		const lines = trimmed.split('\n').map((l) => l.trim());
		let timeLineIdx = -1;
		let match: RegExpMatchArray | null = null;

		for (let i = 0; i < lines.length; i++) {
			match = lines[i]!.match(timeRegex);
			if (match) {
				timeLineIdx = i;
				break;
			}
		}

		if (timeLineIdx === -1 || !match) continue;

		try {
			const start = srtTimestampToTime(match[1]!);
			const end = srtTimestampToTime(match[2]!);

			if (end <= start) continue;

			const textLines = lines.slice(timeLineIdx + 1);
			const rawText = textLines.join('\n');
			const cleanText = stripSubtitleTags(rawText);

			if (!cleanText) continue;

			rawSegments.push({
				id: generateCaptionSegmentId(),
				start,
				end,
				text: cleanText
			});
		} catch {
			// Skip corrupted cues
			continue;
		}
	}

	if (rawSegments.length === 0) return [];

	// Sort segments by start time
	rawSegments.sort((a, b) => a.start - b.start);

	// Enforce non-overlapping monotonicity
	const segments: CaptionSegment[] = [];
	for (const seg of rawSegments) {
		if (segments.length === 0) {
			segments.push(seg);
			continue;
		}

		const prev = segments[segments.length - 1]!;
		if (seg.start < prev.end) {
			// If cue start is earlier than previous end, clamp previous end
			if (seg.start > prev.start) {
				prev.end = seg.start;
				segments.push(seg);
			} else {
				// Seg starts at or before prev start; adjust seg start to prev end
				if (seg.end > prev.end) {
					segments.push({ ...seg, start: prev.end });
				}
			}
		} else {
			segments.push(seg);
		}
	}

	return segments.filter((s) => s.end > s.start);
}

/**
 * Serializes CaptionSegments into standard SRT format.
 */
export function serializeSrt(captions: readonly CaptionSegment[]): string {
	if (!captions || captions.length === 0) return '';

	const sorted = [...captions].sort((a, b) => a.start - b.start);
	const blocks: string[] = [];

	for (let i = 0; i < sorted.length; i++) {
		const cap = sorted[i]!;
		const index = i + 1;
		const startTs = timeToSrtTimestamp(cap.start);
		const endTs = timeToSrtTimestamp(cap.end);
		blocks.push(`${index}\n${startTs} --> ${endTs}\n${cap.text}`);
	}

	return blocks.join('\n\n') + '\n';
}
