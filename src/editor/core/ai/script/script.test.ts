import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
	assignSpeakerTrack,
	deleteScriptLine,
	mergeScriptLines,
	parseScriptFromDocx,
	parseScriptFromSrtOrVtt,
	parseScriptFromText,
	splitScriptLine,
	toggleScriptLineOptional
} from './parser';
import {
	alignScriptWithAudioWords,
	cleanToken,
	levenshteinDistance,
	type TranscribedAudioWord
} from './alignment';
import type { ClipId, TrackId } from '../../../core/types';

describe('Script Parser', () => {
	it('parses plain text script and detects speakers', () => {
		const raw = `
HOST: Welcome to our podcast!
GUEST: Thanks for having me.
We have an exciting show today.
`;
		const parsed = parseScriptFromText(raw, 'Test Podcast');
		expect(parsed.title).toBe('Test Podcast');
		expect(parsed.lines.length).toBe(3);
		expect(parsed.lines[0]!.speaker).toBe('HOST');
		expect(parsed.lines[0]!.text).toBe('Welcome to our podcast!');
		expect(parsed.lines[1]!.speaker).toBe('GUEST');
		expect(parsed.lines[1]!.text).toBe('Thanks for having me.');
		expect(parsed.lines[2]!.speaker).toBe('GUEST'); // persists previous speaker
		expect(parsed.lines[2]!.text).toBe('We have an exciting show today.');
		expect(parsed.speakers).toEqual(['HOST', 'GUEST']);
	});

	it('parses markdown script stripping headings and emphasis', () => {
		const md = `
# Episode 1 Intro
**HOST:** Today we are exploring the deep ocean.
* The pressure is immense.
- Life finds a way.
`;
		const parsed = parseScriptFromText(md, 'Ocean Doc', 'md');
		expect(parsed.lines.length).toBe(4);
		expect(parsed.lines[0]!.text).toBe('Episode 1 Intro');
		expect(parsed.lines[1]!.text).toBe('Today we are exploring the deep ocean.');
		expect(parsed.lines[2]!.text).toBe('The pressure is immense.');
		expect(parsed.lines[3]!.text).toBe('Life finds a way.');
	});

	it('parses SRT subtitles with timestamps and formatting tags', () => {
		const srt = `1
00:00:01,000 --> 00:00:03,500
Hello and welcome.

2
00:00:04,000 --> 00:00:08,200
<i>This is an extraordinary discovery.</i>
`;
		const parsed = parseScriptFromSrtOrVtt(srt, 'Subtitles');
		expect(parsed.lines.length).toBe(2);
		expect(parsed.lines[0]!.text).toBe('Hello and welcome.');
		expect(parsed.lines[1]!.text).toBe('This is an extraordinary discovery.');
	});

	it('parses in-house .docx archive via fflate without cloud or binaries', () => {
		const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>DIRECTOR: Quiet on set.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>ACTOR: I am ready for the scene.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

		const zipData = zipSync({
			'word/document.xml': strToU8(documentXml)
		});

		const parsed = parseScriptFromDocx(zipData, 'Movie Script');
		expect(parsed.lines.length).toBe(2);
		expect(parsed.lines[0]!.speaker).toBe('DIRECTOR');
		expect(parsed.lines[0]!.text).toBe('Quiet on set.');
		expect(parsed.lines[1]!.speaker).toBe('ACTOR');
		expect(parsed.lines[1]!.text).toBe('I am ready for the scene.');
	});

	it('supports merge, split, delete, and optional toggling on lines', () => {
		const raw = `
Line 1: First part.
Line 2: Second part.
Line 3: Third part.
`;
		let script = parseScriptFromText(raw);
		expect(script.lines.length).toBe(3);

		// Merge lines 1 and 2
		script = mergeScriptLines(script, [script.lines[0]!.id, script.lines[1]!.id]);
		expect(script.lines.length).toBe(2);
		expect(script.lines[0]!.text).toBe('First part. Second part.');

		// Split line 1 at index 11
		script = splitScriptLine(script, script.lines[0]!.id, 11);
		expect(script.lines.length).toBe(3);
		expect(script.lines[0]!.text).toBe('First part.');
		expect(script.lines[1]!.text).toBe('Second part.');

		// Toggle optional on line 2
		script = toggleScriptLineOptional(script, script.lines[1]!.id);
		expect(script.lines[1]!.optional).toBe(true);

		// Assign speaker track
		script = assignSpeakerTrack(script, 'Line 1', 'track_audio_1' as TrackId);
		expect(script.lines[0]!.trackId).toBe('track_audio_1');

		// Delete line 3
		script = deleteScriptLine(script, script.lines[2]!.id);
		expect(script.lines.length).toBe(2);
	});
});

describe('Script Alignment & Multi-Take Heuristic Scoring', () => {
	it('calculates string token distance correctly', () => {
		expect(cleanToken('Hello, World! 123')).toBe('helloworld123');
		expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
		expect(levenshteinDistance('speaking', 'speaking')).toBe(0);
	});

	it('detects multiple takes, flags defects, and picks the best take', () => {
		const script = parseScriptFromText(
			'Welcome back to the show, today we are discussing quantum physics.'
		);
		const targetLine = script.lines[0]!;

		// Synthetic transcribed audio fixture with 3 takes:
		// Take 1 (false start / abort): "Welcome back to the... wait, let me start again."
		// Take 2 (stumble + filler): "Welcome back to the show, today we're um discussing quantum physics."
		// Take 3 (clean, complete): "Welcome back to the show, today we are discussing quantum physics."
		const words: TranscribedAudioWord[] = [
			// Take 1: 0.0s - 3.0s
			{
				word: 'Welcome',
				cleanWord: 'welcome',
				startUs: 0,
				endUs: 400_000,
				confidence: 0.95,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'back',
				cleanWord: 'back',
				startUs: 450_000,
				endUs: 700_000,
				confidence: 0.95,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'to',
				cleanWord: 'to',
				startUs: 720_000,
				endUs: 850_000,
				confidence: 0.95,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'the',
				cleanWord: 'the',
				startUs: 870_000,
				endUs: 1_000_000,
				confidence: 0.9,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'wait',
				cleanWord: 'wait',
				startUs: 1_200_000,
				endUs: 1_600_000,
				confidence: 0.9,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'again',
				cleanWord: 'again',
				startUs: 1_700_000,
				endUs: 2_100_000,
				confidence: 0.9,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},

			// Pause between takes: 2.1s - 5.0s

			// Take 2: 5.0s - 10.0s
			{
				word: 'Welcome',
				cleanWord: 'welcome',
				startUs: 5_000_000,
				endUs: 5_400_000,
				confidence: 0.94,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'back',
				cleanWord: 'back',
				startUs: 5_450_000,
				endUs: 5_700_000,
				confidence: 0.95,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'to',
				cleanWord: 'to',
				startUs: 5_720_000,
				endUs: 5_850_000,
				confidence: 0.95,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'the',
				cleanWord: 'the',
				startUs: 5_870_000,
				endUs: 6_000_000,
				confidence: 0.95,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'show',
				cleanWord: 'show',
				startUs: 6_050_000,
				endUs: 6_350_000,
				confidence: 0.96,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'today',
				cleanWord: 'today',
				startUs: 6_450_000,
				endUs: 6_800_000,
				confidence: 0.93,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: "we're",
				cleanWord: 'were',
				startUs: 6_850_000,
				endUs: 7_100_000,
				confidence: 0.9,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'um',
				cleanWord: 'um',
				startUs: 7_200_000,
				endUs: 7_550_000,
				confidence: 0.9,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'discussing',
				cleanWord: 'discussing',
				startUs: 7_650_000,
				endUs: 8_200_000,
				confidence: 0.95,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'quantum',
				cleanWord: 'quantum',
				startUs: 8_250_000,
				endUs: 8_700_000,
				confidence: 0.95,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'physics',
				cleanWord: 'physics',
				startUs: 8_750_000,
				endUs: 9_200_000,
				confidence: 0.96,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},

			// Pause between takes: 9.2s - 12.0s

			// Take 3: 12.0s - 16.5s (clean, complete)
			{
				word: 'Welcome',
				cleanWord: 'welcome',
				startUs: 12_000_000,
				endUs: 12_400_000,
				confidence: 0.98,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'back',
				cleanWord: 'back',
				startUs: 12_450_000,
				endUs: 12_700_000,
				confidence: 0.98,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'to',
				cleanWord: 'to',
				startUs: 12_720_000,
				endUs: 12_850_000,
				confidence: 0.98,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'the',
				cleanWord: 'the',
				startUs: 12_870_000,
				endUs: 13_000_000,
				confidence: 0.98,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'show',
				cleanWord: 'show',
				startUs: 13_050_000,
				endUs: 13_350_000,
				confidence: 0.98,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'today',
				cleanWord: 'today',
				startUs: 13_400_000,
				endUs: 13_750_000,
				confidence: 0.97,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'we',
				cleanWord: 'we',
				startUs: 13_780_000,
				endUs: 13_950_000,
				confidence: 0.97,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'are',
				cleanWord: 'are',
				startUs: 13_970_000,
				endUs: 14_150_000,
				confidence: 0.97,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'discussing',
				cleanWord: 'discussing',
				startUs: 14_200_000,
				endUs: 14_750_000,
				confidence: 0.98,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'quantum',
				cleanWord: 'quantum',
				startUs: 14_800_000,
				endUs: 15_250_000,
				confidence: 0.98,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			},
			{
				word: 'physics',
				cleanWord: 'physics',
				startUs: 15_300_000,
				endUs: 15_750_000,
				confidence: 0.99,
				clipId: 'c1' as ClipId,
				trackId: 't1' as TrackId
			}
		];

		const groups = alignScriptWithAudioWords(script, words);
		expect(groups.length).toBe(1);

		const group = groups[0]!;
		expect(group.scriptLineId).toBe(targetLine.id);

		// All 3 takes should be identified
		expect(group.candidates.length).toBe(3);

		// Highest scoring candidate is chosen by default
		const chosen = group.candidates.find((c) => c.isChosen)!;
		expect(chosen).toBeDefined();

		// Check defect flags on candidates:
		const takeWithFiller = group.candidates.find((c) => c.defects.fillerWords.length > 0)!;
		expect(takeWithFiller).toBeDefined();
		expect(takeWithFiller.defects.fillerWords).toContain('um');

		const falseStartTake = group.candidates.find((c) => c.defects.incomplete || c.defects.restart)!;
		expect(falseStartTake).toBeDefined();

		// Clean take (Take 3) must be the chosen take with the highest score
		expect(chosen.defects.fillerWords.length).toBe(0);
		expect(chosen.defects.stumble).toBe(false);
		expect(chosen.defects.incomplete).toBe(false);
		expect(chosen.transcript).toContain('discussing quantum physics');
		expect(chosen.score).toBeGreaterThan(takeWithFiller.score);
		expect(chosen.score).toBeGreaterThan(falseStartTake.score);

		// Explainable breakdown verification
		expect(chosen.scoreBreakdown.accuracy).toBeGreaterThan(90);
		expect(chosen.scoreBreakdown.completeness).toBe(100);
		expect(chosen.scoreBreakdown.fluency).toBe(100);
	});
});
