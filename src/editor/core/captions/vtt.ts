import type { CaptionSegment, Time } from '../types';
import { generateCaptionSegmentId } from './operations';
import { stripSubtitleTags } from './srt';

/**
 * Formats integer microseconds to WebVTT timestamp: HH:MM:SS.mmm
 */
export function timeToVttTimestamp(us: Time): string {
	const clamped = Math.max(0, Math.floor(us));
	const totalMs = Math.floor(clamped / 1000);
	const ms = totalMs % 1000;
	const totalSec = Math.floor(totalMs / 1000);
	const sec = totalSec % 60;
	const totalMin = Math.floor(totalSec / 60);
	const min = totalMin % 60;
	const hours = Math.floor(totalMin / 60);

	return `${String(hours).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Parses WebVTT timestamp to integer microseconds.
 */
export function vttTimestampToTime(ts: string): Time {
	const cleaned = ts.trim();
	const parts = cleaned.split(':');
	if (parts.length < 2) {
		throw new Error(`Invalid WebVTT timestamp format: "${ts}"`);
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
 * Extracts speaker from WebVTT cue text (e.g. "<v Alice>Hello") if present.
 */
function extractSpeakerAndText(rawText: string): { text: string; speaker?: string } {
	const voiceMatch = rawText.match(/<v\s+([^>]+)>(.*)/s);
	if (voiceMatch) {
		return {
			speaker: voiceMatch[1]!.trim(),
			text: stripSubtitleTags(voiceMatch[2]!)
		};
	}
	return {
		text: stripSubtitleTags(rawText)
	};
}

/**
 * Parses WebVTT content into an array of CaptionSegments.
 */
export function parseVtt(content: string): CaptionSegment[] {
	if (!content) return [];

	// Strip BOM & normalize newlines
	const sanitized = content
		.replace(/^\uFEFF/, '')
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n');

	if (!sanitized.startsWith('WEBVTT')) {
		// Tolerant fallback: check if WEBVTT is anywhere in the first few lines
		if (!sanitized.includes('WEBVTT')) {
			throw new Error('Invalid WebVTT format: missing WEBVTT header.');
		}
	}

	const blocks = sanitized.split(/\n\n+/);
	const rawSegments: CaptionSegment[] = [];

	const timeRegex =
		/(\d{1,2}:\d{2}:\d{2}\.\d{1,3}|\d{1,2}:\d{2}\.\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}\.\d{1,3}|\d{1,2}:\d{2}\.\d{1,3})/;

	for (const block of blocks) {
		const trimmed = block.trim();
		if (!trimmed) continue;

		// Skip header, comments (NOTE), styles (STYLE), region (REGION)
		if (
			trimmed.startsWith('WEBVTT') ||
			trimmed.startsWith('NOTE') ||
			trimmed.startsWith('STYLE') ||
			trimmed.startsWith('REGION')
		) {
			continue;
		}

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
			const start = vttTimestampToTime(match[1]!);
			const end = vttTimestampToTime(match[2]!);

			if (end <= start) continue;

			const textLines = lines.slice(timeLineIdx + 1);
			const rawText = textLines.join('\n');
			const { text: cleanText, speaker } = extractSpeakerAndText(rawText);

			if (!cleanText) continue;

			rawSegments.push({
				id: generateCaptionSegmentId(),
				start,
				end,
				text: cleanText,
				speaker
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
			if (seg.start > prev.start) {
				prev.end = seg.start;
				segments.push(seg);
			} else {
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
 * Serializes CaptionSegments into WebVTT format.
 */
export function serializeVtt(captions: readonly CaptionSegment[]): string {
	const sorted = [...(captions || [])].sort((a, b) => a.start - b.start);
	const blocks: string[] = ['WEBVTT'];

	for (let i = 0; i < sorted.length; i++) {
		const cap = sorted[i]!;
		const startTs = timeToVttTimestamp(cap.start);
		const endTs = timeToVttTimestamp(cap.end);
		const textContent = cap.speaker ? `<v ${cap.speaker}>${cap.text}` : cap.text;
		blocks.push(`${startTs} --> ${endTs}\n${textContent}`);
	}

	return blocks.join('\n\n') + '\n';
}
