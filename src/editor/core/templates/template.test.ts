import { describe, expect, it } from 'vitest';
import type { Clip, Project, Track } from '../types';
import {
	computeResponsiveTemplateTime,
	createTemplateFromClips,
	deserializeTemplate,
	detectPublishableProperties,
	instantiateTemplateIntoProject,
	serializeTemplate,
	unpackTemplateInstanceClip
} from './templateService';
import { resolveFrame } from '../playback';
import { createEmptyProject } from '../factory';

function createMockProject(): Project {
	return createEmptyProject({ name: 'Mock Project' });
}

describe('Motion Graphic Templates System', () => {
	const sampleTextClip: Clip = {
		id: 'c_text' as Clip['id'],
		start: 2_000_000,
		duration: 3_000_000,
		sourceIn: 0,
		sourceOut: 3_000_000,
		speed: 1,
		volume: 1,
		text: 'BREAKING NEWS',
		source: {
			type: 'text',
			text: 'BREAKING NEWS',
			style: { fontFamily: 'Montserrat', fontWeight: 'bold' },
			colorRuns: [{ startIndex: 0, endIndex: 13, fillColor: { r: 1, g: 1, b: 0, a: 1 } }]
		}
	};

	const sampleShapeClip: Clip = {
		id: 'c_shape' as Clip['id'],
		start: 1_500_000,
		duration: 4_000_000,
		sourceIn: 0,
		sourceOut: 4_000_000,
		speed: 1,
		volume: 1,
		source: {
			type: 'shape',
			shapeType: 'rect',
			width: 600,
			height: 120,
			fillColor: { r: 0.1, g: 0.1, b: 0.8, a: 1 },
			strokeColor: { r: 1, g: 1, b: 1, a: 1 },
			strokeWidth: 4
		}
	};

	it('detects publishable properties from text and shape clips', () => {
		const detected = detectPublishableProperties([sampleTextClip, sampleShapeClip]);
		expect(detected.length).toBeGreaterThanOrEqual(4);

		const textParam = detected.find((p) => p.targetProperty === 'text.content');
		expect(textParam).toBeDefined();
		expect(textParam?.defaultValue).toBe('BREAKING NEWS');

		const shapeFillParam = detected.find((p) => p.targetProperty === 'shape.fill');
		expect(shapeFillParam).toBeDefined();
		expect(shapeFillParam?.defaultValue).toEqual({ r: 0.1, g: 0.1, b: 0.8, a: 1 });
	});

	it('creates a normalized template with offset start times at 0', () => {
		const tracks: Track[] = [
			{
				id: 'trk1' as Track['id'],
				kind: 'video',
				name: 'Graphics',
				muted: false,
				locked: false,
				hidden: false,
				clips: [sampleTextClip, sampleShapeClip]
			}
		];
		const params = detectPublishableProperties([sampleTextClip, sampleShapeClip]);

		const template = createTemplateFromClips({
			name: 'Modern News Lower Third',
			category: 'Lower Thirds',
			clips: [sampleTextClip, sampleShapeClip],
			tracks,
			publishedParams: params
		});

		expect(template.name).toBe('Modern News Lower Third');
		expect(template.category).toBe('Lower Thirds');
		// Earliest start was 1_500_000, so clips should be shifted
		const packagedClips = template.tracks[0]?.clips;
		expect(packagedClips).toHaveLength(2);
		expect(Math.min(...packagedClips!.map((c) => c.start))).toBe(0);
	});

	it('serializes and deserializes a template with fidelity', () => {
		const tracks: Track[] = [
			{
				id: 'trk1' as Track['id'],
				kind: 'video',
				name: 'Graphics',
				muted: false,
				locked: false,
				hidden: false,
				clips: [sampleTextClip]
			}
		];
		const params = detectPublishableProperties([sampleTextClip]);
		const template = createTemplateFromClips({
			name: 'Title Card',
			clips: [sampleTextClip],
			tracks,
			publishedParams: params
		});

		const json = serializeTemplate(template);
		const restored = deserializeTemplate(json);

		expect(restored.name).toBe('Title Card');
		expect(restored.tracks[0]?.clips[0]?.text).toBe('BREAKING NEWS');
		expect(restored.publishedParams).toHaveLength(params.length);
	});

	it('instantiates template into project as a single compound clip', () => {
		const project = createMockProject();
		const tracks: Track[] = [
			{
				id: 'trk1' as Track['id'],
				kind: 'video',
				name: 'Graphics',
				muted: false,
				locked: false,
				hidden: false,
				clips: [sampleTextClip, sampleShapeClip]
			}
		];
		const params = detectPublishableProperties([sampleTextClip, sampleShapeClip]);
		const template = createTemplateFromClips({
			name: 'News Banner',
			clips: [sampleTextClip, sampleShapeClip],
			tracks,
			publishedParams: params
		});

		const { project: updated, instanceClipId } = instantiateTemplateIntoProject(
			project,
			'root' as any,
			template,
			1_000_000
		);

		// Host track has exactly 1 new clip
		const hostClips = updated.tracks[0]!.clips;
		expect(hostClips).toHaveLength(1);
		expect(hostClips[0]!.id).toBe(instanceClipId);
		expect(hostClips[0]!.source?.type).toBe('sequence');

		// New sequence exists in project.sequences
		const subSeqId = (hostClips[0]!.source as any).sequenceId;
		expect(updated.sequences?.[subSeqId]).toBeDefined();
	});

	it('applies parameter overrides to sequence in real time and renders in resolveFrame', () => {
		const project = createMockProject();
		const tracks: Track[] = [
			{
				id: 'trk1' as Track['id'],
				kind: 'video',
				name: 'Graphics',
				muted: false,
				locked: false,
				hidden: false,
				clips: [sampleTextClip]
			}
		];
		const params = detectPublishableProperties([sampleTextClip]);
		const template = createTemplateFromClips({
			name: 'Customizable Text',
			clips: [sampleTextClip],
			tracks,
			publishedParams: params
		});

		const { project: updated, instanceClipId } = instantiateTemplateIntoProject(
			project,
			'root' as any,
			template,
			0
		);

		const instanceClip = updated.tracks[0]!.clips.find((c) => c.id === instanceClipId)!;
		const textParam = (instanceClip.source as any).publishedParams.find(
			(p: any) => p.targetProperty === 'text.content'
		);

		// Apply override directly on the instance clip
		(instanceClip.source as any).paramOverrides = {
			[textParam.id]: 'SUPER EXCITING ANNOUNCEMENT'
		};

		// When resolveFrame resolves the sequence at 1_000_000 us:
		const frame = resolveFrame(updated, 1_000_000);
		expect(frame.videoLayers).toHaveLength(1);
		const seqLayer = frame.videoLayers[0];
		expect(seqLayer?.nested?.layers).toBeDefined();

		const textLayer = seqLayer?.nested?.layers[0];
		expect(textLayer?.kind).toBe('text');
		expect(textLayer?.textData?.text).toBe('SUPER EXCITING ANNOUNCEMENT');
	});

	it('computes responsive time remapping protecting intro and outro animations', () => {
		const responsiveTiming = {
			introDuration: 800_000,
			outroDuration: 600_000
		};
		const templateDuration = 4_000_000;
		// Instance is stretched to 10 seconds (10_000_000)
		const instanceDuration = 10_000_000;

		// 1. Within intro: exactly 1:1 speed
		expect(computeResponsiveTemplateTime(200_000, instanceDuration, templateDuration, responsiveTiming)).toBe(200_000);
		expect(computeResponsiveTemplateTime(800_000, instanceDuration, templateDuration, responsiveTiming)).toBe(800_000);

		// 2. Near the end (outro phase): 200ms before instance end should map to 200ms before template end
		const nearEnd = instanceDuration - 200_000;
		expect(computeResponsiveTemplateTime(nearEnd, instanceDuration, templateDuration, responsiveTiming)).toBe(
			templateDuration - 200_000
		);

		// 3. Middle phase: maps within the middle hold range
		const midTime = computeResponsiveTemplateTime(5_000_000, instanceDuration, templateDuration, responsiveTiming);
		expect(midTime).toBeGreaterThanOrEqual(800_000);
		expect(midTime).toBeLessThanOrEqual(templateDuration - 600_000);
	});

	it('unpacks template instance clip back into tracks preserving user edits', () => {
		const project = createMockProject();
		const tracks: Track[] = [
			{
				id: 'trk1' as Track['id'],
				kind: 'video',
				name: 'Graphics',
				muted: false,
				locked: false,
				hidden: false,
				clips: [sampleTextClip]
			}
		];
		const params = detectPublishableProperties([sampleTextClip]);
		const template = createTemplateFromClips({
			name: 'Unpackable Title',
			clips: [sampleTextClip],
			tracks,
			publishedParams: params
		});

		const { project: instantiated, instanceClipId } = instantiateTemplateIntoProject(
			project,
			'root' as any,
			template,
			0
		);

		const instanceClip = instantiated.tracks[0]!.clips.find((c) => c.id === instanceClipId)!;
		const textParam = (instanceClip.source as any).publishedParams[0];
		(instanceClip.source as any).paramOverrides = {
			[textParam.id]: 'EDITED BEFORE UNPACK'
		};

		const unpacked = unpackTemplateInstanceClip(instantiated, 'root' as any, instanceClipId);
		const unpackedClips = unpacked.tracks.flatMap((t) => t.clips);
		expect(unpackedClips).toHaveLength(1);
		expect(unpackedClips[0]!.source?.type).toBe('text');
		expect(unpackedClips[0]!.text).toBe('EDITED BEFORE UNPACK');
	});

	it('computes tight bounding box for graphic elements instead of full 1920x1080 canvas', () => {
		const centeredShape: Clip = {
			id: 'shape_box' as Clip['id'],
			start: 0,
			duration: 2_000_000,
			sourceIn: 0,
			sourceOut: 2_000_000,
			speed: 1,
			volume: 1,
			transform: {
				x: 0,
				y: 200,
				scaleX: 1,
				scaleY: 1,
				rotation: 0,
				opacity: 1
			},
			source: {
				type: 'shape',
				shapeType: 'rect',
				width: 400,
				height: 150,
				fillColor: { r: 0.5, g: 0.2, b: 0.8, a: 1 }
			}
		};

		const titleText: Clip = {
			id: 'title_txt' as Clip['id'],
			start: 0,
			duration: 2_000_000,
			sourceIn: 0,
			sourceOut: 2_000_000,
			speed: 1,
			volume: 1,
			transform: {
				x: 0,
				y: 200,
				scaleX: 1,
				scaleY: 1,
				rotation: 0,
				opacity: 1
			},
			text: 'Title Text',
			source: {
				type: 'text',
				text: 'Title Text',
				style: { fontFamily: 'Montserrat' }
			}
		};

		const tracks: Track[] = [
			{
				id: 'trk1' as Track['id'],
				kind: 'video',
				name: 'Shape Layer',
				muted: false,
				locked: false,
				hidden: false,
				clips: [centeredShape]
			},
			{
				id: 'trk2' as Track['id'],
				kind: 'video',
				name: 'Text Layer',
				muted: false,
				locked: false,
				hidden: false,
				clips: [titleText]
			}
		];

		const template = createTemplateFromClips({
			name: 'Tight Lower Third',
			clips: [centeredShape, titleText],
			tracks,
			publishedParams: [],
			projectSettings: { width: 1920, height: 1080 }
		});

		expect(template.bounds).toBeDefined();
		// Bounding box should wrap the ~400x150 graphic with padding, NOT 1920x1080!
		expect(template.bounds!.width).toBeLessThan(600);
		expect(template.bounds!.width).toBeGreaterThanOrEqual(400);
		expect(template.bounds!.height).toBeLessThan(300);
		expect(template.bounds!.height).toBeGreaterThanOrEqual(150);
		// Origin Y should be around 200 (since both elements are centered at y=200)
		expect(template.bounds!.originY).toBeCloseTo(200, -1);

		// Inside the template sequence, the clips should be centered (offset by originY)
		const packagedClips = template.tracks.flatMap((t) => t.clips);
		expect(packagedClips).toHaveLength(2);
		expect(packagedClips[0]!.transform?.y).toBeCloseTo(0, -1);
		expect(packagedClips[1]!.transform?.y).toBeCloseTo(0, -1);

		// Now instantiate into project:
		const project = createMockProject();
		const { project: instantiated, instanceClipId } = instantiateTemplateIntoProject(
			project,
			'root' as any,
			template,
			0
		);

		const instanceClip = instantiated.tracks[0]!.clips.find((c) => c.id === instanceClipId)!;
		// Instance clip should be placed at originX, originY
		expect(instanceClip.transform?.y).toBeCloseTo(200, -1);

		// The nested sequence settings should match the tight bounding box
		const subSeqId = (instanceClip.source as any).sequenceId;
		const subSeq = instantiated.sequences![subSeqId]!;
		expect(subSeq.settings?.width).toBe(template.bounds!.width);
		expect(subSeq.settings?.height).toBe(template.bounds!.height);

		// Resolve frame to verify renderer treats it with fit: 'none'
		const resolved = resolveFrame(instantiated, 500_000);
		const seqLayer = resolved.videoLayers.find((l) => l.clipId === instanceClipId);
		expect(seqLayer).toBeDefined();
		expect(seqLayer?.fit).toBe('none');
		expect(seqLayer?.nested?.size.width).toBe(template.bounds!.width);
		expect(seqLayer?.nested?.size.height).toBe(template.bounds!.height);
	});
});
