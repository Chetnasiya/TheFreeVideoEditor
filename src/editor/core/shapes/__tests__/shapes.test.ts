import { describe, expect, it } from 'vitest';
import { createShapeClip } from '../../adjustment';
import { SHAPE_PRESETS, type ShapeConfig } from '../shapeTypes';
import { rasterizeShape } from '../../../services/render/shapes/shapeRasterizer';
import { createEditorStore } from '../../../state/store';
import { createEmptyProject } from '../../factory';
import { resolveFrame } from '../../playback';
import { readProperty } from '../../properties';
import { validateAndNormalizeLayout, collectPanels } from '../../../ui/layout/operations';
import { PRESET_EDITING } from '../../../ui/layout/presets';
import type { LayoutNode } from '../../../ui/layout/types';

describe('Shapes Core Feature & Library', () => {
	it('SHAPE_PRESETS has valid presets across categories with unique IDs', () => {
		expect(SHAPE_PRESETS.length).toBeGreaterThanOrEqual(12);
		const ids = new Set(SHAPE_PRESETS.map((p) => p.id));
		expect(ids.size).toBe(SHAPE_PRESETS.length);

		for (const preset of SHAPE_PRESETS) {
			expect(preset.name).toBeTruthy();
			expect(preset.config.shapeType).toBeTruthy();
			expect(preset.config.width).toBeGreaterThan(0);
			expect(preset.config.height).toBeGreaterThan(0);
			expect(preset.config.fillColor).toBeDefined();
		}
	});

	it('createShapeClip produces valid Clip with shape source and properties', () => {
		const config: ShapeConfig = {
			shapeType: 'star',
			width: 250,
			height: 250,
			fillColor: { r: 1, g: 0.8, b: 0, a: 1 },
			strokeColor: { r: 1, g: 1, b: 1, a: 1 },
			strokeWidth: 4,
			strokeStyle: 'dashed',
			points: 5,
			innerRadius: 0.5
		};

		const clip = createShapeClip(1_000_000, 3_000_000, config);
		expect(clip.start).toBe(1_000_000);
		expect(clip.duration).toBe(3_000_000);
		expect(clip.source?.type).toBe('shape');

		if (clip.source?.type === 'shape') {
			expect(clip.source.shapeType).toBe('star');
			expect(clip.source.width).toBe(250);
			expect(clip.source.height).toBe(250);
			expect(clip.source.points).toBe(5);
			expect(clip.source.strokeStyle).toBe('dashed');
		}

		expect(readProperty(clip, 'shape.width', 0)).toBe(250);
		expect(readProperty(clip, 'shape.height', 0)).toBe(250);
	});

	it('rasterizeShape rasterizes basic shapes and caches results', () => {
		const config: ShapeConfig = {
			shapeType: 'circle',
			width: 100,
			height: 100,
			fillColor: { r: 0, g: 1, b: 0, a: 1 },
			strokeColor: { r: 0, g: 0, b: 0, a: 1 },
			strokeWidth: 2,
			strokeStyle: 'solid'
		};

		const canvas1 = rasterizeShape(config);
		expect(canvas1).toBeDefined();
		expect(canvas1.width).toBeGreaterThanOrEqual(100);

		// Cache hit
		const canvas2 = rasterizeShape(config);
		expect(canvas1).toBe(canvas2);
	});

	it('rasterizeShape rasterizes polygons, stars, and symbols safely', () => {
		const shapes: ShapeConfig['shapeType'][] = [
			'rect',
			'rounded-rect',
			'circle',
			'ellipse',
			'triangle',
			'diamond',
			'star',
			'polygon',
			'heart',
			'arrow',
			'line',
			'badge',
			'callout'
		];

		for (const shapeType of shapes) {
			const canvas = rasterizeShape({
				shapeType,
				width: 120,
				height: 120,
				fillColor: { r: 1, g: 0.2, b: 0.5, a: 0.9 },
				strokeColor: { r: 1, g: 1, b: 1, a: 1 },
				strokeWidth: 2,
				strokeStyle: 'solid',
				cornerRadius: 15,
				points: 6,
				shadowColor: { r: 0, g: 0, b: 0, a: 0.5 },
				shadowBlur: 10
			});
			expect(canvas).toBeDefined();
			expect(canvas.width).toBeGreaterThan(0);
		}
	});

	it('Store addShapeClip inserts clip and updateShapeProperties modifies it', () => {
		const store = createEditorStore();
		const project = createEmptyProject({ name: 'Shape Test' });
		store.setState({ project });

		const clipId = store.getState().addShapeClip({
			shapeType: 'heart',
			width: 200,
			height: 200,
			fillColor: { r: 1, g: 0, b: 0, a: 1 }
		});

		expect(clipId).toBeTruthy();
		const tracks = store.getState().project?.tracks;
		const addedClip = tracks?.flatMap((t) => t.clips).find((c) => c.id === clipId);
		expect(addedClip).toBeDefined();
		expect(addedClip?.source?.type).toBe('shape');

		// Modify shape property
		const updated = store.getState().updateShapeProperties(clipId!, {
			width: 320,
			fillColor: { r: 0, g: 0, b: 1, a: 1 }
		});
		expect(updated).toBe(true);

		const updatedTracks = store.getState().project?.tracks;
		const modifiedClip = updatedTracks?.flatMap((t) => t.clips).find((c) => c.id === clipId);
		expect(modifiedClip).toBeDefined();
		expect(readProperty(modifiedClip!, 'shape.width', 0)).toBe(320);
		expect(readProperty(modifiedClip!, 'shape.fillColor', 0)).toEqual([0, 0, 1, 1]);
	});

	it('Layout places shapes panel between graphics (Titles) and media (Project)', () => {
		// Editing preset panel stack order
		const editingPanels = collectPanels(PRESET_EDITING.layout);
		expect(editingPanels).toContain('shapes');
		expect(editingPanels).toContain('graphics');
		expect(editingPanels).toContain('media');

		// Check normalization inserts shapes right between graphics and media
		const oldLayoutWithoutShapes: LayoutNode = {
			type: 'split',
			direction: 'vertical',
			sizes: [60, 40],
			children: [
				{
					type: 'stack',
					panelIds: ['captions', 'graphics', 'media'],
					activeId: 'media'
				},
				{
					type: 'stack',
					panelIds: ['program', 'timeline'],
					activeId: 'program'
				}
			]
		};

		const normalized = validateAndNormalizeLayout(oldLayoutWithoutShapes);
		const topStack = (normalized as any).children[0];
		expect(topStack.panelIds).toEqual(['captions', 'graphics', 'shapes', 'media']);
		// 'shapes' is immediately after 'graphics' and immediately before 'media'
		const shapesIdx = topStack.panelIds.indexOf('shapes');
		const graphicsIdx = topStack.panelIds.indexOf('graphics');
		const mediaIdx = topStack.panelIds.indexOf('media');
		expect(shapesIdx).toBe(graphicsIdx + 1);
		expect(mediaIdx).toBe(shapesIdx + 1);
	});

	it('resolveFrame produces an ActiveLayer for shapes on video tracks', () => {
		const store = createEditorStore();
		const project = createEmptyProject({ name: 'Playback Shape Test' });
		store.setState({ project });

		const clipId = store.getState().addShapeClip({
			shapeType: 'circle',
			width: 300,
			height: 300,
			fillColor: { r: 1, g: 0.5, b: 0, a: 1 },
			strokeWidth: 4,
			strokeColor: { r: 1, g: 1, b: 1, a: 1 }
		});

		const currentProject = store.getState().project!;
		const frame = resolveFrame(currentProject, 1_000_000);
		expect(frame.videoLayers.length).toBe(1);

		const shapeLayer = frame.videoLayers[0]!;
		expect(shapeLayer.clipId).toBe(clipId);
		expect(shapeLayer.kind).toBe('shape');
		expect(shapeLayer.fit).toBe('none');
		expect(shapeLayer.shapeData).toBeDefined();
		expect(shapeLayer.shapeData?.shapeType).toBe('circle');
		expect(shapeLayer.shapeData?.width).toBe(300);
		expect(shapeLayer.shapeData?.height).toBe(300);
		expect(shapeLayer.shapeData?.fillColor).toEqual({ r: 1, g: 0.5, b: 0, a: 1 });
		expect(shapeLayer.shapeData?.strokeWidth).toBe(4);
	});

	it('Timeline drag session for shape commits clip to target track', () => {
		const store = createEditorStore();
		const project = createEmptyProject({ name: 'Drag Shape Test' });
		store.setState({ project });

		const videoTrack = project.tracks.find((t) => t.kind === 'video')!;
		expect(videoTrack).toBeDefined();

		const shapeConfig: ShapeConfig = {
			shapeType: 'rounded-rect',
			width: 400,
			height: 250,
			fillColor: { r: 0.2, g: 0.6, b: 1, a: 1 }
		};

		store.getState().beginTimelineDrag({
			kind: 'shape',
			clipIds: [],
			original: [],
			preview: [],
			pointerStartTime: 0,
			pointerTime: 2_000_000,
			targetTrackId: videoTrack.id,
			shapeConfig,
			allowed: true,
			unlink: false
		});

		store.getState().updateTimelineDrag(2_000_000, { targetTrackId: videoTrack.id });
		store.getState().commitTimelineDrag();

		const updatedProject = store.getState().project!;
		const track = updatedProject.tracks.find((t) => t.id === videoTrack.id)!;
		const placedClip = track.clips.find((c) => c.source?.type === 'shape');
		expect(placedClip).toBeDefined();
		expect(placedClip?.start).toBe(2_000_000);
		expect(placedClip?.duration).toBe(5_000_000);
		if (placedClip?.source?.type === 'shape') {
			expect(placedClip.source.shapeType).toBe('rounded-rect');
			expect(placedClip.source.width).toBe(400);
		}
	});
});
