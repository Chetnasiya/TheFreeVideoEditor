import { describe, expect, it } from 'vitest';
import { ROOT_SEQUENCE_ID, applyToSequence } from './access';
import { createEmptyProject } from '../factory';
import { insertClip } from '../operations/clips';
import { resolveFrame } from '../playback';
import type { Clip, ClipId, Project, Track } from '../types';
import { addSequenceInstance, createSequence, nestSelection } from './operations';

function makeTrack(id: Track['id'], kind: Track['kind'], name: string): Track {
	return {
		id,
		kind,
		name,
		muted: false,
		locked: false,
		hidden: false,
		clips: []
	};
}

function makeSolid(id: string, start: number, duration: number): Clip {
	return {
		id: id as ClipId,
		start,
		duration,
		sourceIn: 0,
		sourceOut: duration,
		speed: 1,
		volume: 1,
		source: { type: 'solid', color: { r: 0.2, g: 0.4, b: 0.8, a: 1 } }
	};
}

describe('Gate R Slice 4 Performance Benchmarks', () => {
	it('measures resolveFrame throughput across Nesting Depth 1, 2, 3 and two instances', () => {
		const project: Project = createEmptyProject({ name: 'Depth Benchmark' });
		const vTrack = project.tracks.find((t) => t.kind === 'video')!;

		// Depth 1: Root -> Sequence A (contains 1 solid)
		const { project: pA, sequenceId: seqA } = createSequence(project, 'Seq A');
		const p1 = applyToSequence(pA, seqA, (view) => {
			const track = view.tracks.find((t) => t.kind === 'video')!;
			return insertClip(view, track.id, makeSolid('clip-a', 0, 10_000_000));
		});
		const { project: pDepth1 } = addSequenceInstance(p1, ROOT_SEQUENCE_ID, seqA, 0, vTrack.id);

		// Depth 2: Root -> Sequence B -> Sequence A
		const { project: pB, sequenceId: seqB } = createSequence(pDepth1, 'Seq B');
		const p2 = pB;
		const { project: pBwithA } = addSequenceInstance(p2, seqB, seqA, 0);
		let pDepth2Proj = createEmptyProject({ name: 'Depth 2 Project' });
		const vTrack2 = pDepth2Proj.tracks.find((t) => t.kind === 'video')!;
		pDepth2Proj = {
			...pDepth2Proj,
			sequences: pBwithA.sequences
		};
		const { project: pDepth2 } = addSequenceInstance(
			pDepth2Proj,
			ROOT_SEQUENCE_ID,
			seqB,
			0,
			vTrack2.id
		);

		// Depth 3: Root -> Sequence C -> Sequence B -> Sequence A
		const { project: pC, sequenceId: seqC } = createSequence(pDepth2, 'Seq C');
		const { project: pCwithB } = addSequenceInstance(pC, seqC, seqB, 0);
		let pDepth3Proj = createEmptyProject({ name: 'Depth 3 Project' });
		const vTrack3 = pDepth3Proj.tracks.find((t) => t.kind === 'video')!;
		pDepth3Proj = {
			...pDepth3Proj,
			sequences: pCwithB.sequences
		};
		const { project: pDepth3 } = addSequenceInstance(
			pDepth3Proj,
			ROOT_SEQUENCE_ID,
			seqC,
			0,
			vTrack3.id
		);

		// Flat baseline: Root contains 1 solid
		let pFlat = createEmptyProject({ name: 'Flat Baseline' });
		const vTrackFlat = pFlat.tracks.find((t) => t.kind === 'video')!;
		pFlat = insertClip(pFlat, vTrackFlat.id, makeSolid('clip-flat', 0, 10_000_000));

		// Two instances: Root has 2 instances of Sequence A
		let pTwoInstProj = createEmptyProject({ name: 'Two Instances' });
		pTwoInstProj = { ...pTwoInstProj, sequences: pA.sequences };
		const track1 = pTwoInstProj.tracks.find((t) => t.kind === 'video')!;
		const track2 = makeTrack(crypto.randomUUID() as Track['id'], 'video', 'Video 2');
		pTwoInstProj = { ...pTwoInstProj, tracks: [...pTwoInstProj.tracks, track2] };
		const { project: pTwo1 } = addSequenceInstance(
			pTwoInstProj,
			ROOT_SEQUENCE_ID,
			seqA,
			0,
			track1.id
		);
		const { project: pTwoInstances } = addSequenceInstance(
			pTwo1,
			ROOT_SEQUENCE_ID,
			seqA,
			0,
			track2.id
		);

		const ITERATIONS = 10_000;

		// Warmup
		for (let i = 0; i < 500; i++) {
			resolveFrame(pFlat, 1_000_000);
			resolveFrame(pDepth1, 1_000_000);
			resolveFrame(pDepth2, 1_000_000);
			resolveFrame(pDepth3, 1_000_000);
			resolveFrame(pTwoInstances, 1_000_000);
		}

		// Benchmark Flat
		const tFlat0 = performance.now();
		for (let i = 0; i < ITERATIONS; i++) {
			resolveFrame(pFlat, (i * 33_333) % 10_000_000);
		}
		const dFlat = performance.now() - tFlat0;

		// Benchmark Depth 1
		const tD1_0 = performance.now();
		for (let i = 0; i < ITERATIONS; i++) {
			resolveFrame(pDepth1, (i * 33_333) % 10_000_000);
		}
		const dD1 = performance.now() - tD1_0;

		// Benchmark Depth 2
		const tD2_0 = performance.now();
		for (let i = 0; i < ITERATIONS; i++) {
			resolveFrame(pDepth2, (i * 33_333) % 10_000_000);
		}
		const dD2 = performance.now() - tD2_0;

		// Benchmark Depth 3
		const tD3_0 = performance.now();
		for (let i = 0; i < ITERATIONS; i++) {
			resolveFrame(pDepth3, (i * 33_333) % 10_000_000);
		}
		const dD3 = performance.now() - tD3_0;

		// Benchmark Two Instances
		const tTwo_0 = performance.now();
		for (let i = 0; i < ITERATIONS; i++) {
			resolveFrame(pTwoInstances, (i * 33_333) % 10_000_000);
		}
		const dTwo = performance.now() - tTwo_0;

		const flatUsPerFrame = (dFlat / ITERATIONS) * 1000;
		const d1UsPerFrame = (dD1 / ITERATIONS) * 1000;
		const d2UsPerFrame = (dD2 / ITERATIONS) * 1000;
		const d3UsPerFrame = (dD3 / ITERATIONS) * 1000;
		const twoUsPerFrame = (dTwo / ITERATIONS) * 1000;

		console.log(
			`[Gate R Benchmark] Flat baseline: ${flatUsPerFrame.toFixed(2)} µs/frame (${(1_000_000 / flatUsPerFrame).toFixed(0)} fps)`
		);
		console.log(
			`[Gate R Benchmark] Depth 1: ${d1UsPerFrame.toFixed(2)} µs/frame (${(1_000_000 / d1UsPerFrame).toFixed(0)} fps)`
		);
		console.log(
			`[Gate R Benchmark] Depth 2: ${d2UsPerFrame.toFixed(2)} µs/frame (${(1_000_000 / d2UsPerFrame).toFixed(0)} fps)`
		);
		console.log(
			`[Gate R Benchmark] Depth 3: ${d3UsPerFrame.toFixed(2)} µs/frame (${(1_000_000 / d3UsPerFrame).toFixed(0)} fps)`
		);
		console.log(
			`[Gate R Benchmark] Two instances: ${twoUsPerFrame.toFixed(2)} µs/frame (${(1_000_000 / twoUsPerFrame).toFixed(0)} fps)`
		);

		expect(d1UsPerFrame).toBeLessThan(100); // well under 0.1ms
		expect(d2UsPerFrame).toBeLessThan(100);
		expect(d3UsPerFrame).toBeLessThan(100);
	});

	it('benchmarks nest operation on 200 clips', () => {
		let project = createEmptyProject({ name: '200 Clips Project' });
		const vTrack = project.tracks.find((t) => t.kind === 'video')!;

		// Add 200 non-overlapping 1-second clips
		const clipIds: ClipId[] = [];
		for (let i = 0; i < 200; i++) {
			const id = `clip-200-${i}` as ClipId;
			clipIds.push(id);
			project = insertClip(project, vTrack.id, makeSolid(id, i * 1_000_000, 1_000_000));
		}

		expect(project.tracks[0]!.clips.length).toBe(200);

		const t0 = performance.now();
		const result = nestSelection(project, ROOT_SEQUENCE_ID, clipIds, 'Nested 200');
		const elapsedMs = performance.now() - t0;

		console.log(`[Gate R Benchmark] Nest 200 clips took: ${elapsedMs.toFixed(2)} ms`);

		expect(elapsedMs).toBeLessThan(50); // Spec requires smooth synchronous execution (< 50ms)
		expect(result.project.sequences).toBeDefined();
		expect(result.videoInstanceClipId).toBeDefined();
		const nestedSeq = Object.values(result.project.sequences!)[0]!;
		expect(nestedSeq.tracks[0]!.clips.length).toBe(200);
	});

	it('benchmarks 500-clip sequence virtualization filtering', () => {
		let project = createEmptyProject({ name: '500 Clips Project' });
		const vTrack = project.tracks.find((t) => t.kind === 'video')!;

		for (let i = 0; i < 500; i++) {
			project = insertClip(project, vTrack.id, makeSolid(`clip-500-${i}`, i * 100_000, 100_000));
		}

		// Virtual window filter across 10,000 timeline scrolls
		const windowStart = 20_000_000;
		const windowEnd = 25_000_000;

		const t0 = performance.now();
		let visibleCount = 0;
		for (let i = 0; i < 10_000; i++) {
			const clips = project.tracks[0]!.clips;
			const visible = clips.filter(
				(c) => c.start + c.duration > windowStart && c.start < windowEnd
			);
			visibleCount += visible.length;
		}
		const elapsedMs = performance.now() - t0;
		const usPerScroll = (elapsedMs / 10_000) * 1000;

		console.log(
			`[Gate R Benchmark] 500-clip virtualization filter: ${usPerScroll.toFixed(2)} µs/scroll`
		);
		expect(visibleCount).toBeGreaterThan(0);
		expect(usPerScroll).toBeLessThan(100); // < 0.1ms per scroll
	});
});
