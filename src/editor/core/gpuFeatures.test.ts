import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './factory';
import { projectNeedsGpu } from './gpuFeatures';
import type { AssetId, ClipId, Project, SequenceId } from './types';

function withClip(extra: Record<string, unknown>): Project {
	const project = createEmptyProject({ name: 'gpu' });
	project.tracks[0]!.clips.push({
		id: 'c' as ClipId,
		assetId: 'a' as AssetId,
		start: 0,
		duration: 1,
		sourceIn: 0,
		sourceOut: 1,
		speed: 1,
		volume: 1,
		...extra
	});
	return project;
}

describe('projectNeedsGpu', () => {
	it('keeps Phase 1 projects on Canvas2D', () => {
		expect(projectNeedsGpu(createEmptyProject({ name: 'x' }))).toBe(false);
		expect(projectNeedsGpu(withClip({ transform: undefined }))).toBe(false);
	});

	it('requires the GPU for effects, masks, blend modes, generated sources and time remap', () => {
		expect(projectNeedsGpu(withClip({ effects: [{ id: 'e', type: 'blur', params: {} }] }))).toBe(
			true
		);
		expect(projectNeedsGpu(withClip({ blendMode: 'screen' }))).toBe(true);
		expect(projectNeedsGpu(withClip({ blendMode: 'normal' }))).toBe(false);
		expect(projectNeedsGpu(withClip({ source: { type: 'adjustment' } }))).toBe(true);
		expect(projectNeedsGpu(withClip({ source: { type: 'asset' } }))).toBe(false);
		expect(projectNeedsGpu(withClip({ timeRemap: { value: 1 } }))).toBe(true);
	});

	it('requires the GPU for sequences', () => {
		const project = createEmptyProject({ name: 'seq' });
		const id = 's' as SequenceId;
		project.sequences = { [id]: { id, name: 's', tracks: [] } };
		expect(projectNeedsGpu(project)).toBe(true);
	});
});
