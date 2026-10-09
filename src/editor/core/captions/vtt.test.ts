import { describe, expect, it } from 'vitest';
import { parseVtt, serializeVtt, timeToVttTimestamp, vttTimestampToTime } from './vtt';
import type { CaptionSegment } from '../types';

describe('WebVTT parser and serializer', () => {
	it('converts between microseconds and WebVTT timestamps', () => {
		const us = (2 * 3600 + 10 * 60 + 5) * 1_000_000 + 120_000;
		const ts = timeToVttTimestamp(us);
		expect(ts).toBe('02:10:05.120');
		expect(vttTimestampToTime(ts)).toBe(us);
	});

	it('parses WebVTT with comments, voice tags, and cues', () => {
		const vttContent = `WEBVTT - generated file

NOTE This is a commentary block that should be ignored

STYLE
::cue { color: #fff; }

00:00:01.000 --> 00:00:03.500 position:50% line:80%
<v Alice>Hello from Alice!

cue-2
00:00:04.000 --> 00:00:06.000
<c.yellow>Yellow text</c>
`;

		const segments = parseVtt(vttContent);
		expect(segments).toHaveLength(2);

		expect(segments[0]!.start).toBe(1_000_000);
		expect(segments[0]!.end).toBe(3_500_000);
		expect(segments[0]!.speaker).toBe('Alice');
		expect(segments[0]!.text).toBe('Hello from Alice!');

		expect(segments[1]!.start).toBe(4_000_000);
		expect(segments[1]!.end).toBe(6_000_000);
		expect(segments[1]!.text).toBe('Yellow text');
	});

	it('serializes CaptionSegments to WebVTT and roundtrips', () => {
		const captions: CaptionSegment[] = [
			{ id: '1', start: 1_000_000, end: 3_000_000, text: 'Hello', speaker: 'Bob' },
			{ id: '2', start: 4_000_000, end: 6_000_000, text: 'World' }
		];

		const serialized = serializeVtt(captions);
		expect(serialized).toContain('WEBVTT');
		expect(serialized).toContain('00:00:01.000 --> 00:00:03.000\n<v Bob>Hello');
		expect(serialized).toContain('00:00:04.000 --> 00:00:06.000\nWorld');

		const parsed = parseVtt(serialized);
		expect(parsed).toHaveLength(2);
		expect(parsed[0]!.start).toBe(1_000_000);
		expect(parsed[0]!.end).toBe(3_000_000);
		expect(parsed[0]!.speaker).toBe('Bob');
		expect(parsed[0]!.text).toBe('Hello');

		expect(parsed[1]!.start).toBe(4_000_000);
		expect(parsed[1]!.end).toBe(6_000_000);
		expect(parsed[1]!.speaker).toBeUndefined();
		expect(parsed[1]!.text).toBe('World');
	});
});
