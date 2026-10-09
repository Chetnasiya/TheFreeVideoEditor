import type { CaptionSegment, CaptionWord, Time, Track, TrackId } from '../types';
import { DEFAULT_CAPTION_STYLE } from './presets';

function randomId(): string {
	const cryptoApi = typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto;
	if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();

	const bytes = new Uint8Array(16);
	if (cryptoApi) {
		cryptoApi.getRandomValues(bytes);
	} else {
		for (let index = 0; index < bytes.length; index += 1) {
			bytes[index] = Math.floor(Math.random() * 256);
		}
	}
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function generateCaptionSegmentId(): string {
	return `cap_${randomId().slice(0, 12)}`;
}

export function generateCaptionTrackId(existingTracks?: Iterable<Track>): TrackId {
	const ids = new Set(Array.from(existingTracks ?? []).map((t) => t.id));
	for (let attempts = 0; attempts < 100; attempts++) {
		const id = `track_caption_${randomId().slice(0, 8)}` as TrackId;
		if (!ids.has(id)) return id;
	}
	return `track_caption_${Date.now()}` as TrackId;
}

export function createCaptionTrack(
	name: string = 'Captions',
	existingTracks?: Iterable<Track>
): Track {
	return {
		id: generateCaptionTrackId(existingTracks),
		kind: 'caption',
		name,
		muted: false,
		locked: false,
		hidden: false,
		clips: [],
		captions: [],
		captionStyle: { ...DEFAULT_CAPTION_STYLE }
	};
}

/**
 * Returns the active caption segment at the given timeline time, if any.
 */
export function getCaptionAtTime(track: Track, time: Time): CaptionSegment | undefined {
	if (!track.captions || track.hidden) return undefined;
	return track.captions.find((c) => c.start <= time && time < c.end);
}

/**
 * Returns the active word inside a caption segment at the given timeline time.
 */
export function getActiveWordAtTime(
	segment: CaptionSegment,
	time: Time
): { word: CaptionWord; index: number } | undefined {
	if (!segment.words || segment.words.length === 0) return undefined;
	for (let i = 0; i < segment.words.length; i++) {
		const w = segment.words[i]!;
		if (w.start <= time && time < w.end) {
			return { word: w, index: i };
		}
	}
	return undefined;
}

/**
 * Finds the character start and end index of a word (by word index) inside the displayed text.
 */
export function findWordSpanInText(
	text: string,
	words: readonly CaptionWord[],
	targetIdx: number
): { start: number; end: number } | null {
	if (targetIdx < 0 || targetIdx >= words.length) return null;
	const tokens = text.split(/(\s+)/);
	let wordCount = 0;
	let charOffset = 0;
	for (const token of tokens) {
		if (token.trim().length > 0) {
			if (wordCount === targetIdx) {
				return { start: charOffset, end: charOffset + token.length };
			}
			wordCount++;
		}
		charOffset += token.length;
	}
	return null;
}

/**
 * Adds a caption segment to the track while strictly enforcing the non-overlapping invariant.
 * Existing segments that overlap with the new segment are trimmed, split, or removed.
 */
export function addCaptionSegment(
	track: Track,
	segmentData: {
		start: Time;
		end: Time;
		text: string;
		words?: CaptionWord[];
		speaker?: string;
		id?: string;
	}
): CaptionSegment {
	const start = Math.floor(segmentData.start);
	const end = Math.floor(segmentData.end);

	if (!Number.isSafeInteger(start) || start < 0) {
		throw new RangeError('Caption segment start must be a non-negative integer time.');
	}
	if (!Number.isSafeInteger(end) || end <= start) {
		throw new RangeError('Caption segment end must be greater than start.');
	}

	const newSegment: CaptionSegment = {
		id: segmentData.id || generateCaptionSegmentId(),
		start,
		end,
		text: segmentData.text.trim(),
		words: segmentData.words ? [...segmentData.words] : undefined,
		speaker: segmentData.speaker
	};

	if (!track.captions) {
		track.captions = [];
	}

	const updatedCaptions: CaptionSegment[] = [];

	for (const existing of track.captions) {
		// Case 1: Existing is strictly before newSegment
		if (existing.end <= start) {
			updatedCaptions.push(existing);
			continue;
		}

		// Case 2: Existing is strictly after newSegment
		if (existing.start >= end) {
			updatedCaptions.push(existing);
			continue;
		}

		// Case 3: Existing is completely covered by newSegment -> drop it
		if (existing.start >= start && existing.end <= end) {
			continue;
		}

		// Case 4: Existing completely covers newSegment -> split existing around newSegment
		if (existing.start < start && existing.end > end) {
			// Left remainder
			updatedCaptions.push({
				...existing,
				end: start,
				words: existing.words ? existing.words.filter((w) => w.end <= start) : undefined
			});
			// Right remainder
			updatedCaptions.push({
				...existing,
				id: generateCaptionSegmentId(),
				start: end,
				words: existing.words ? existing.words.filter((w) => w.start >= end) : undefined
			});
			continue;
		}

		// Case 5: Overlaps on the left (starts before newSegment, ends inside it)
		if (existing.start < start && existing.end > start) {
			updatedCaptions.push({
				...existing,
				end: start,
				words: existing.words ? existing.words.filter((w) => w.end <= start) : undefined
			});
			continue;
		}

		// Case 6: Overlaps on the right (starts inside newSegment, ends after it)
		if (existing.start < end && existing.end > end) {
			updatedCaptions.push({
				...existing,
				start: end,
				words: existing.words ? existing.words.filter((w) => w.start >= end) : undefined
			});
			continue;
		}
	}

	updatedCaptions.push(newSegment);
	updatedCaptions.sort((a, b) => a.start - b.start);

	track.captions = updatedCaptions;
	return newSegment;
}

/**
 * Retimes an existing caption segment while preserving the non-overlapping invariant.
 */
export function retimeCaptionSegment(
	track: Track,
	segmentId: string,
	newStart: Time,
	newEnd: Time
): CaptionSegment {
	const start = Math.floor(newStart);
	const end = Math.floor(newEnd);

	if (!Number.isSafeInteger(start) || start < 0) {
		throw new RangeError('Caption segment start must be a non-negative integer time.');
	}
	if (!Number.isSafeInteger(end) || end <= start) {
		throw new RangeError('Caption segment end must be greater than start.');
	}

	const existingIdx = (track.captions ?? []).findIndex((c) => c.id === segmentId);
	if (existingIdx === -1) {
		throw new Error(`Caption segment with id "${segmentId}" not found.`);
	}

	const existing = track.captions![existingIdx]!;
	const savedText = existing.text;
	const savedWords = existing.words;
	const savedSpeaker = existing.speaker;

	// Remove existing segment temporarily, then re-add with new times
	track.captions!.splice(existingIdx, 1);

	return addCaptionSegment(track, {
		id: segmentId,
		start,
		end,
		text: savedText,
		words: savedWords,
		speaker: savedSpeaker
	});
}

/**
 * Splits a caption segment at splitTime into two contiguous, non-overlapping segments.
 */
export function splitCaptionSegment(
	track: Track,
	segmentId: string,
	splitTime: Time
): [CaptionSegment, CaptionSegment] | null {
	const time = Math.floor(splitTime);
	const segment = (track.captions ?? []).find((c) => c.id === segmentId);
	if (!segment || time <= segment.start || time >= segment.end) {
		return null;
	}

	let leftText = segment.text;
	let rightText = segment.text;
	let leftWords: CaptionWord[] | undefined;
	let rightWords: CaptionWord[] | undefined;

	if (segment.words && segment.words.length > 0) {
		leftWords = segment.words.filter((w) => w.end <= time);
		rightWords = segment.words.filter((w) => w.start >= time);

		// If a word spans across the split time, split into the one that started before
		const spanningWord = segment.words.find((w) => w.start < time && w.end > time);
		if (spanningWord) {
			leftWords.push({ ...spanningWord, end: time });
			rightWords.unshift({ ...spanningWord, start: time });
		}

		if (leftWords.length > 0) {
			leftText = leftWords.map((w) => w.text).join(' ');
		}
		if (rightWords.length > 0) {
			rightText = rightWords.map((w) => w.text).join(' ');
		}
	} else {
		// Split text proportionally by word count
		const words = segment.text.split(/\s+/).filter(Boolean);
		if (words.length > 1) {
			const ratio = (time - segment.start) / (segment.end - segment.start);
			const splitIdx = Math.max(1, Math.min(words.length - 1, Math.round(words.length * ratio)));
			leftText = words.slice(0, splitIdx).join(' ');
			rightText = words.slice(splitIdx).join(' ');
		}
	}

	const segIndex = track.captions!.findIndex((c) => c.id === segmentId);

	const leftSegment: CaptionSegment = {
		...segment,
		end: time,
		text: leftText,
		words: leftWords
	};

	const rightSegment: CaptionSegment = {
		id: generateCaptionSegmentId(),
		start: time,
		end: segment.end,
		text: rightText,
		words: rightWords,
		speaker: segment.speaker
	};

	track.captions!.splice(segIndex, 1, leftSegment, rightSegment);
	track.captions!.sort((a, b) => a.start - b.start);

	return [leftSegment, rightSegment];
}

/**
 * Merges two adjacent caption segments into a single segment.
 */
export function mergeCaptionSegments(
	track: Track,
	firstId: string,
	secondId: string
): CaptionSegment | null {
	if (!track.captions) return null;
	const firstIdx = track.captions.findIndex((c) => c.id === firstId);
	const secondIdx = track.captions.findIndex((c) => c.id === secondId);

	if (firstIdx === -1 || secondIdx === -1) return null;

	const c1 = track.captions[firstIdx]!;
	const c2 = track.captions[secondIdx]!;

	const earlier = c1.start <= c2.start ? c1 : c2;
	const later = c1.start <= c2.start ? c2 : c1;

	const mergedText = `${earlier.text.trim()} ${later.text.trim()}`.trim();
	const mergedWords: CaptionWord[] | undefined =
		earlier.words || later.words
			? [...(earlier.words ?? []), ...(later.words ?? [])].sort((a, b) => a.start - b.start)
			: undefined;

	const merged: CaptionSegment = {
		id: earlier.id,
		start: earlier.start,
		end: Math.max(earlier.end, later.end),
		text: mergedText,
		words: mergedWords,
		speaker: earlier.speaker || later.speaker
	};

	// Remove both and insert merged
	track.captions = track.captions.filter((c) => c.id !== firstId && c.id !== secondId);
	track.captions.push(merged);
	track.captions.sort((a, b) => a.start - b.start);

	return merged;
}

/**
 * Deletes a caption segment from the track.
 */
export function deleteCaptionSegment(track: Track, segmentId: string): boolean {
	if (!track.captions) return false;
	const initialLen = track.captions.length;
	track.captions = track.captions.filter((c) => c.id !== segmentId);
	return track.captions.length < initialLen;
}

/**
 * Updates the text content of a caption segment.
 */
export function setCaptionText(track: Track, segmentId: string, newText: string): CaptionSegment {
	if (!track.captions) {
		throw new Error('Track has no captions.');
	}
	const seg = track.captions.find((c) => c.id === segmentId);
	if (!seg) {
		throw new Error(`Caption segment with id "${segmentId}" not found.`);
	}
	const updated = { ...seg, text: newText };
	track.captions = track.captions.map((c) => (c.id === segmentId ? updated : c));
	return updated;
}
