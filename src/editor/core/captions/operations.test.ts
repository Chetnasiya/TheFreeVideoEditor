import { describe, expect, it } from 'vitest';
import {
	addCaptionSegment,
	createCaptionTrack,
	deleteCaptionSegment,
	getActiveWordAtTime,
	getCaptionAtTime,
	mergeCaptionSegments,
	retimeCaptionSegment,
	setCaptionText,
	splitCaptionSegment
} from './operations';

describe('caption operations', () => {
	it('creates a caption track with defaults', () => {
		const track = createCaptionTrack('Subtitle 1');
		expect(track.kind).toBe('caption');
		expect(track.name).toBe('Subtitle 1');
		expect(track.captions).toEqual([]);
		expect(track.captionStyle).toBeDefined();
		expect(track.captionStyle?.positionPreset).toBe('bottom');
	});

	it('adds caption segments and keeps them sorted', () => {
		const track = createCaptionTrack();
		const s1 = addCaptionSegment(track, { start: 2_000_000, end: 4_000_000, text: 'Second' });
		const s2 = addCaptionSegment(track, { start: 0, end: 1_500_000, text: 'First' });
		const s3 = addCaptionSegment(track, { start: 5_000_000, end: 7_000_000, text: 'Third' });

		expect(track.captions?.map((c) => c.text)).toEqual(['First', 'Second', 'Third']);
		expect(track.captions?.[0]?.id).toBe(s2.id);
		expect(track.captions?.[1]?.id).toBe(s1.id);
		expect(track.captions?.[2]?.id).toBe(s3.id);
	});

	it('enforces non-overlapping invariant by trimming overlapping left neighbor', () => {
		const track = createCaptionTrack();
		addCaptionSegment(track, { start: 1_000_000, end: 4_000_000, text: 'Early' });
		// Add segment starting at 3_000_000
		addCaptionSegment(track, { start: 3_000_000, end: 6_000_000, text: 'Overlap' });

		expect(track.captions).toHaveLength(2);
		expect(track.captions![0]!.start).toBe(1_000_000);
		expect(track.captions![0]!.end).toBe(3_000_000); // clamped!
		expect(track.captions![1]!.start).toBe(3_000_000);
		expect(track.captions![1]!.end).toBe(6_000_000);
	});

	it('enforces non-overlapping invariant by trimming overlapping right neighbor', () => {
		const track = createCaptionTrack();
		addCaptionSegment(track, { start: 3_000_000, end: 6_000_000, text: 'Late' });
		// Add segment ending at 4_000_000
		addCaptionSegment(track, { start: 1_000_000, end: 4_000_000, text: 'Overlap' });

		expect(track.captions).toHaveLength(2);
		expect(track.captions![0]!.start).toBe(1_000_000);
		expect(track.captions![0]!.end).toBe(4_000_000);
		expect(track.captions![1]!.start).toBe(4_000_000); // clamped!
		expect(track.captions![1]!.end).toBe(6_000_000);
	});

	it('enforces non-overlapping invariant by dropping completely covered segment', () => {
		const track = createCaptionTrack();
		addCaptionSegment(track, { start: 2_000_000, end: 3_000_000, text: 'Small' });
		// Add big segment completely covering it
		addCaptionSegment(track, { start: 1_000_000, end: 5_000_000, text: 'Big' });

		expect(track.captions).toHaveLength(1);
		expect(track.captions![0]!.text).toBe('Big');
		expect(track.captions![0]!.start).toBe(1_000_000);
		expect(track.captions![0]!.end).toBe(5_000_000);
	});

	it('enforces non-overlapping invariant by splitting containing segment', () => {
		const track = createCaptionTrack();
		addCaptionSegment(track, { start: 1_000_000, end: 8_000_000, text: 'Huge' });
		// Punch a hole in the middle
		addCaptionSegment(track, { start: 3_000_000, end: 5_000_000, text: 'Middle' });

		expect(track.captions).toHaveLength(3);
		expect(track.captions![0]!.start).toBe(1_000_000);
		expect(track.captions![0]!.end).toBe(3_000_000);
		expect(track.captions![1]!.start).toBe(3_000_000);
		expect(track.captions![1]!.end).toBe(5_000_000);
		expect(track.captions![2]!.start).toBe(5_000_000);
		expect(track.captions![2]!.end).toBe(8_000_000);
	});

	it('splits a caption segment with words', () => {
		const track = createCaptionTrack();
		const seg = addCaptionSegment(track, {
			start: 1_000_000,
			end: 4_000_000,
			text: 'Hello lovely world',
			words: [
				{ text: 'Hello', start: 1_000_000, end: 1_800_000 },
				{ text: 'lovely', start: 1_900_000, end: 2_500_000 },
				{ text: 'world', start: 2_600_000, end: 3_800_000 }
			]
		});

		const result = splitCaptionSegment(track, seg.id, 2_550_000);
		expect(result).not.toBeNull();
		const [left, right] = result!;

		expect(left.end).toBe(2_550_000);
		expect(left.text).toBe('Hello lovely');
		expect(right.start).toBe(2_550_000);
		expect(right.text).toBe('world');
		expect(track.captions).toHaveLength(2);
	});

	it('merges adjacent caption segments', () => {
		const track = createCaptionTrack();
		const s1 = addCaptionSegment(track, { start: 1_000_000, end: 2_000_000, text: 'First part' });
		const s2 = addCaptionSegment(track, { start: 2_500_000, end: 4_000_000, text: 'second part' });

		const merged = mergeCaptionSegments(track, s1.id, s2.id);
		expect(merged).not.toBeNull();
		expect(merged!.start).toBe(1_000_000);
		expect(merged!.end).toBe(4_000_000);
		expect(merged!.text).toBe('First part second part');
		expect(track.captions).toHaveLength(1);
	});

	it('retimes caption segment and clamps neighbors', () => {
		const track = createCaptionTrack();
		const s1 = addCaptionSegment(track, { start: 1_000_000, end: 3_000_000, text: 'First' });
		addCaptionSegment(track, { start: 4_000_000, end: 6_000_000, text: 'Second' });

		// Extend s1 into s2
		retimeCaptionSegment(track, s1.id, 1_000_000, 5_000_000);

		expect(track.captions).toHaveLength(2);
		expect(track.captions![0]!.start).toBe(1_000_000);
		expect(track.captions![0]!.end).toBe(5_000_000);
		expect(track.captions![1]!.start).toBe(5_000_000);
		expect(track.captions![1]!.end).toBe(6_000_000);
	});

	it('retrieves active caption and active word at given timeline time', () => {
		const track = createCaptionTrack();
		const seg = addCaptionSegment(track, {
			start: 1_000_000,
			end: 4_000_000,
			text: 'Hello world',
			words: [
				{ text: 'Hello', start: 1_000_000, end: 2_000_000 },
				{ text: 'world', start: 2_000_000, end: 3_500_000 }
			]
		});

		expect(getCaptionAtTime(track, 500_000)).toBeUndefined();
		expect(getCaptionAtTime(track, 1_500_000)?.id).toBe(seg.id);
		expect(getCaptionAtTime(track, 4_000_000)).toBeUndefined();

		const activeWord1 = getActiveWordAtTime(seg, 1_500_000);
		expect(activeWord1?.word.text).toBe('Hello');
		expect(activeWord1?.index).toBe(0);

		const activeWord2 = getActiveWordAtTime(seg, 2_500_000);
		expect(activeWord2?.word.text).toBe('world');
		expect(activeWord2?.index).toBe(1);

		const activeWordPast = getActiveWordAtTime(seg, 3_800_000);
		expect(activeWordPast).toBeUndefined();
	});

	it('deletes caption segment and updates text', () => {
		const track = createCaptionTrack();
		const s1 = addCaptionSegment(track, { start: 1_000_000, end: 2_000_000, text: 'Old' });
		setCaptionText(track, s1.id, 'New text');
		expect(track.captions![0]!.text).toBe('New text');

		deleteCaptionSegment(track, s1.id);
		expect(track.captions).toHaveLength(0);
	});
});
