import { describe, expect, it } from 'vitest';
import {
	applyDrag,
	compositionGuides,
	hitTest,
	pivotPoint,
	snapToGuides,
	stateCorners,
	type GizmoGeometry,
	type GizmoState
} from './gizmo';

describe('on-canvas gizmo core math', () => {
	const geometry: GizmoGeometry = {
		sourceWidth: 1920,
		sourceHeight: 1080,
		width: 1920,
		height: 1080
	};

	const baseState: GizmoState = {
		position: [0, 0],
		scale: [1, 1],
		rotation: 0,
		anchor: [0, 0]
	};

	it('computes layerCorners accurately via layerAffine', () => {
		const corners = stateCorners(baseState, geometry);
		expect(corners[0]?.x).toBeCloseTo(0, 1);
		expect(corners[0]?.y).toBeCloseTo(0, 1);
		expect(corners[1]?.x).toBeCloseTo(1920, 1);
		expect(corners[1]?.y).toBeCloseTo(0, 1);
		expect(corners[2]?.x).toBeCloseTo(1920, 1);
		expect(corners[2]?.y).toBeCloseTo(1080, 1);
		expect(corners[3]?.x).toBeCloseTo(0, 1);
		expect(corners[3]?.y).toBeCloseTo(1080, 1);
	});

	it('hit-tests handles with monitor scale and tolerance', () => {
		const corners = stateCorners(baseState, geometry);
		const pivot = pivotPoint(baseState, geometry);
		const monitorScale = 0.5;
		const tolerance = 10;

		// Hit anchor
		expect(hitTest(pivot, corners, pivot, monitorScale, tolerance)).toBe('anchor');

		// Hit top-left corner
		expect(hitTest(corners[0]!, corners, pivot, monitorScale, tolerance)).toBe('scale-corner:0');

		// Hit center body -> move
		expect(hitTest({ x: 500, y: 500 }, corners, pivot, monitorScale, tolerance)).toBe('move');

		// Far outside quad -> null
		expect(hitTest({ x: -500, y: -500 }, corners, pivot, monitorScale, tolerance)).toBeNull();
	});

	it('moving the anchor keeps the 4 layerCorners fixed in composition space', () => {
		const startCorners = stateCorners(baseState, geometry);

		const result = applyDrag(
			'anchor',
			baseState,
			geometry,
			{ start: { x: 960, y: 540 }, current: { x: 1060, y: 640 } },
			{ shift: false, alt: false }
		);

		const nextState: GizmoState = {
			...baseState,
			anchor: result.anchor ?? baseState.anchor,
			position: result.position ?? baseState.position
		};

		const endCorners = stateCorners(nextState, geometry);
		for (let i = 0; i < 4; i += 1) {
			expect(endCorners[i]?.x).toBeCloseTo(startCorners[i]!.x, 2);
			expect(endCorners[i]?.y).toBeCloseTo(startCorners[i]!.y, 2);
		}
	});

	it('dragging a corner keeps the opposite corner fixed', () => {
		// Corner 0 is top-left, opposite is corner 2 (bottom-right: [1920, 1080])
		const startCorners = stateCorners(baseState, geometry);
		const opp = startCorners[2]!;

		// Uniform drag
		const dragResult = applyDrag(
			'scale-corner:0',
			baseState,
			geometry,
			{ start: { x: 0, y: 0 }, current: { x: 100, y: 100 } },
			{ shift: false, alt: false }
		);

		const nextState: GizmoState = {
			...baseState,
			scale: dragResult.scale ?? baseState.scale,
			position: dragResult.position ?? baseState.position
		};

		const endCorners = stateCorners(nextState, geometry);
		expect(endCorners[2]?.x).toBeCloseTo(opp.x, 2);
		expect(endCorners[2]?.y).toBeCloseTo(opp.y, 2);

		// Free (Shift) drag
		const freeDragResult = applyDrag(
			'scale-corner:0',
			baseState,
			geometry,
			{ start: { x: 0, y: 0 }, current: { x: 150, y: 50 } },
			{ shift: true, alt: false }
		);

		const freeState: GizmoState = {
			...baseState,
			scale: freeDragResult.scale ?? baseState.scale,
			position: freeDragResult.position ?? baseState.position
		};
		const freeEndCorners = stateCorners(freeState, geometry);
		expect(freeEndCorners[2]?.x).toBeCloseTo(opp.x, 2);
		expect(freeEndCorners[2]?.y).toBeCloseTo(opp.y, 2);
	});

	it('rotate then inverse-rotate returns start state', () => {
		const rotated = applyDrag(
			'rotate',
			baseState,
			geometry,
			{ start: { x: 960, y: 200 }, current: { x: 1200, y: 200 } },
			{ shift: false, alt: false }
		);

		const rotatedState: GizmoState = {
			...baseState,
			rotation: rotated.rotation ?? 0
		};

		const unrotated = applyDrag(
			'rotate',
			rotatedState,
			geometry,
			{ start: { x: 1200, y: 200 }, current: { x: 960, y: 200 } },
			{ shift: false, alt: false }
		);

		expect(unrotated.rotation ?? 0).toBeCloseTo(baseState.rotation, 2);
	});

	it('snaps rotation to 15 degree increments when Shift is held', () => {
		const rotated = applyDrag(
			'rotate',
			baseState,
			geometry,
			{ start: { x: 960, y: 200 }, current: { x: 1000, y: 200 } },
			{ shift: true, alt: false }
		);
		expect((rotated.rotation ?? 0) % 15).toBeCloseTo(0, 4);
	});

	it('snaps to composition guides', () => {
		const guides = compositionGuides(1920, 1080);
		expect(guides.length).toBeGreaterThan(0);

		// Box near center (960, 540)
		const box = {
			left: 955,
			top: 535,
			right: 965,
			bottom: 545
		};

		const snap = snapToGuides(box, guides, 10);
		expect(snap.dx).toBe(0); // center is at 960, (955+965)/2 = 960 -> delta = 0
		expect(snap.dy).toBe(0); // center is at 540, (535+545)/2 = 540 -> delta = 0
		expect(snap.hits.length).toBeGreaterThanOrEqual(2);
	});
});
