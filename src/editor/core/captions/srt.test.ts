import { describe, expect, it } from 'vitest';
import {
	parseSrt,
	serializeSrt,
	srtTimestampToTime,
	stripSubtitleTags,
	timeToSrtTimestamp
} from './srt';
import type { CaptionSegment } from '../types';

describe('SRT parser and serializer', () => {
	it('converts between microseconds and SRT timestamps', () => {
		// 1h 23m 45s 678ms = 5025678ms = 5025678000us
		const us = (1 * 3600 + 23 * 60 + 45) * 1_000_000 + 678_000;
		const ts = timeToSrtTimestamp(us);
		expect(ts).toBe('01:23:45,678');
		expect(srtTimestampToTime(ts)).toBe(us);
	});

	it('strips HTML tags and style brackets', () => {
		expect(stripSubtitleTags('<b>Hello</b> <i>world</i>!')).toBe('Hello world!');
		expect(stripSubtitleTags('{\\pos(192,200)}Subtitle text')).toBe('Subtitle text');
		expect(stripSubtitleTags('<font color="#ffff00">Yellow</font>')).toBe('Yellow');
	});

	it('parses multi-line SRT with BOM and CRLF', () => {
		const srtContent =
			'\uFEFF1\r\n00:00:01,000 --> 00:00:03,500\r\nHello world!\r\nSecond line.\r\n\r\n2\r\n00:00:04,000 --> 00:00:07,250\r\n<i>Next subtitle cue</i>\r\n';

		const segments = parseSrt(srtContent);
		expect(segments).toHaveLength(2);

		expect(segments[0]!.start).toBe(1_000_000);
		expect(segments[0]!.end).toBe(3_500_000);
		expect(segments[0]!.text).toBe('Hello world!\nSecond line.');

		expect(segments[1]!.start).toBe(4_000_000);
		expect(segments[1]!.end).toBe(7_250_000);
		expect(segments[1]!.text).toBe('Next subtitle cue');
	});

	it('handles overlapping cues by clamping monotonic boundaries', () => {
		const srtContent = `1
00:00:01,000 --> 00:00:05,000
First long cue

2
00:00:03,000 --> 00:00:07,000
Second overlapping cue
`;
		const segments = parseSrt(srtContent);
		expect(segments).toHaveLength(2);
		expect(segments[0]!.start).toBe(1_000_000);
		expect(segments[0]!.end).toBe(3_000_000);
		expect(segments[1]!.start).toBe(3_000_000);
		expect(segments[1]!.end).toBe(7_000_000);
	});

	it('serializes CaptionSegments to SRT and roundtrips', () => {
		const captions: CaptionSegment[] = [
			{ id: '1', start: 1_000_000, end: 3_000_000, text: 'Hello' },
			{ id: '2', start: 4_000_000, end: 6_500_000, text: 'World\nSecond line' }
		];

		const serialized = serializeSrt(captions);
		expect(serialized).toContain('00:00:01,000 --> 00:00:03,000\nHello');
		expect(serialized).toContain('00:00:04,000 --> 00:00:06,500\nWorld\nSecond line');

		const parsed = parseSrt(serialized);
		expect(parsed).toHaveLength(2);
		expect(parsed[0]!.start).toBe(1_000_000);
		expect(parsed[0]!.end).toBe(3_000_000);
		expect(parsed[0]!.text).toBe('Hello');
		expect(parsed[1]!.start).toBe(4_000_000);
		expect(parsed[1]!.end).toBe(6_500_000);
		expect(parsed[1]!.text).toBe('World\nSecond line');
	});
});
