import { describe, expect, it } from 'vitest';
import type { Clip, ClipId, Marker, MarkerColor, MarkerId, MarkerType } from '../../types';
import {
	addMarker,
	convertMarkerRange,
	createMarker,
	deleteMarker,
	deleteMarkers,
	distributeClipMarkersOnSplit,
	duplicateMarker,
	findNextMarker,
	findPrevMarker,
	moveMarker,
	queryMarkersInRange,
	setMarkerColor,
	setMarkerType,
	snapTimeToFps,
	updateMarker,
	validateMarker,
	clipMarkerToTimeline,
	timelineToClipMarker,
	isClipMarkerVisible
} from '../operations';
import { createEmptyProject, duplicateProject } from '../../factory';
import { framesToTicks, ticksToFrames } from '../../time';
import { collectSnapPoints } from '../../timeline';
import { applyToSequence, viewProject } from '../../sequences/access';

describe('core marker operations', () => {
	it('creates and validates point and range markers', () => {
		const point = createMarker({
			id: 'm1' as MarkerId,
			time: 1_000_000,
			name: 'Intro',
			color: 'green',
			type: 'comment'
		});
		expect(validateMarker(point)).toBe(true);
		expect(point.duration).toBeUndefined();
		expect(point.color).toBe('green');

		const range = createMarker({
			id: 'm2' as MarkerId,
			time: 2_000_000,
			duration: 1_500_000,
			name: 'Interview segment',
			color: 'blue',
			type: 'segment',
			comment: 'A/B roll cut here'
		});
		expect(validateMarker(range)).toBe(true);
		expect(range.duration).toBe(1_500_000);
		expect(range.type).toBe('segment');

		// Invalid cases
		expect(validateMarker({ ...point, id: '' as MarkerId })).toBe(false);
		expect(validateMarker({ ...point, time: -100 })).toBe(false);
		expect(validateMarker({ ...point, time: NaN })).toBe(false);
		expect(validateMarker({ ...point, name: '', label: '' })).toBe(false);
		expect(validateMarker({ ...point, color: 'invalid-color' as MarkerColor })).toBe(false);
		expect(validateMarker({ ...range, duration: -50 })).toBe(false);
	});

	it('snaps marker times to frame boundaries', () => {
		const fps = 30; // 33,333 µs per frame
		const snapped = snapTimeToFps(35_000, fps);
		expect(snapped).toBe(33_333); // 1 frame

		const marker = createMarker({
			time: 50_000,
			duration: 70_000,
			name: 'Frame snapped',
			fps
		});
		expect(framesToTicks(ticksToFrames(marker.time, fps), fps)).toBe(marker.time);
		expect(framesToTicks(ticksToFrames(marker.duration ?? 0, fps), fps)).toBe(marker.duration);
	});

	it('adds and sorts markers deterministically', () => {
		let markers: Marker[] = [];
		markers = addMarker(markers, {
			time: 5_000_000,
			name: 'Third',
			id: 'm3' as MarkerId,
			color: 'green'
		});
		markers = addMarker(markers, {
			time: 1_000_000,
			name: 'First',
			id: 'm1' as MarkerId,
			color: 'red'
		});
		markers = addMarker(markers, {
			time: 3_000_000,
			name: 'Second',
			id: 'm2' as MarkerId,
			color: 'yellow'
		});

		expect(markers.map((m) => m.name)).toEqual(['First', 'Second', 'Third']);
		expect(markers.map((m) => m.time)).toEqual([1_000_000, 3_000_000, 5_000_000]);
	});

	it('updates, moves, and deletes markers', () => {
		let markers: Marker[] = [
			createMarker({ id: 'm1' as MarkerId, time: 1_000_000, name: 'Old Name', color: 'green' }),
			createMarker({ id: 'm2' as MarkerId, time: 2_000_000, name: 'Target', color: 'orange' })
		];

		// Update name & comment
		markers = updateMarker(markers, 'm1' as MarkerId, {
			name: 'New Name',
			comment: 'Updated notes'
		});
		expect(markers.find((m) => m.id === 'm1')?.name).toBe('New Name');
		expect(markers.find((m) => m.id === 'm1')?.comment).toBe('Updated notes');

		// Move marker
		markers = moveMarker(markers, 'm1' as MarkerId, 3_500_000);
		expect(markers.map((m) => m.id)).toEqual(['m2', 'm1']); // m1 is now after m2
		expect(markers.find((m) => m.id === 'm1')?.time).toBe(3_500_000);

		// Delete single
		markers = deleteMarker(markers, 'm2' as MarkerId);
		expect(markers.length).toBe(1);
		expect(markers[0]?.id).toBe('m1');

		// Delete bulk
		markers = deleteMarkers(markers, ['m1' as MarkerId]);
		expect(markers.length).toBe(0);
	});

	it('duplicates and converts between point and range markers', () => {
		let markers: Marker[] = [
			createMarker({ id: 'm1' as MarkerId, time: 1_000_000, name: 'Point', color: 'purple' })
		];

		// Convert to range
		markers = convertMarkerRange(markers, 'm1' as MarkerId, 2_000_000);
		expect(markers[0]?.duration).toBe(2_000_000);

		// Convert back to point
		markers = convertMarkerRange(markers, 'm1' as MarkerId, 0);
		expect(markers[0]?.duration).toBeUndefined();

		// Duplicate
		markers = duplicateMarker(markers, 'm1' as MarkerId, 500_000);
		expect(markers.length).toBe(2);
		expect(markers[1]?.time).toBe(1_500_000);
		expect(markers[1]?.name).toBe('Point (Copy)');
		expect(markers[1]?.id).not.toBe('m1');
	});

	it('updates colors and types in bulk', () => {
		let markers: Marker[] = [
			createMarker({ id: 'm1' as MarkerId, time: 1_000_000, name: 'One', color: 'green' }),
			createMarker({ id: 'm2' as MarkerId, time: 2_000_000, name: 'Two', color: 'green' }),
			createMarker({ id: 'm3' as MarkerId, time: 3_000_000, name: 'Three', color: 'yellow' })
		];

		// Bulk color
		markers = setMarkerColor(markers, ['m1' as MarkerId, 'm2' as MarkerId], 'cyan');
		expect(markers[0]?.color).toBe('cyan');
		expect(markers[1]?.color).toBe('cyan');
		expect(markers[2]?.color).toBe('yellow');

		// Bulk type
		markers = setMarkerType(markers, ['m1' as MarkerId, 'm3' as MarkerId], 'chapter');
		expect(markers[0]?.type).toBe('chapter');
		expect(markers[1]?.type).toBe('comment');
		expect(markers[2]?.type).toBe('chapter');
	});

	it('navigates next and previous markers with edge cases and wrap', () => {
		const markers: Marker[] = [
			createMarker({ id: 'm1' as MarkerId, time: 1_000_000, name: 'M1', color: 'green' }),
			createMarker({ id: 'm2' as MarkerId, time: 3_000_000, name: 'M2', color: 'blue' }),
			createMarker({ id: 'm3' as MarkerId, time: 5_000_000, name: 'M3', color: 'red' })
		];

		// Next
		expect(findNextMarker(markers, 500_000)?.id).toBe('m1');
		expect(findNextMarker(markers, 1_000_000)?.id).toBe('m2');
		expect(findNextMarker(markers, 4_000_000)?.id).toBe('m3');
		expect(findNextMarker(markers, 5_000_000)).toBeNull();
		expect(findNextMarker(markers, 5_000_000, { wrap: true })?.id).toBe('m1');

		// Prev
		expect(findPrevMarker(markers, 6_000_000)?.id).toBe('m3');
		expect(findPrevMarker(markers, 5_000_000)?.id).toBe('m2');
		expect(findPrevMarker(markers, 2_000_000)?.id).toBe('m1');
		expect(findPrevMarker(markers, 1_000_000)).toBeNull();
		expect(findPrevMarker(markers, 500_000, { wrap: true })?.id).toBe('m3');
	});

	it('queries markers in range correctly for both points and ranges', () => {
		const markers: Marker[] = [
			createMarker({ id: 'm1' as MarkerId, time: 1_000_000, name: 'Point before', color: 'green' }),
			createMarker({ id: 'm2' as MarkerId, time: 3_000_000, name: 'Point inside', color: 'green' }),
			createMarker({
				id: 'm3' as MarkerId,
				time: 4_000_000,
				duration: 3_000_000, // 4s to 7s
				name: 'Overlapping range',
				color: 'orange'
			}),
			createMarker({ id: 'm4' as MarkerId, time: 9_000_000, name: 'Point after', color: 'green' })
		];

		// Window from 2.5s to 5s
		const found = queryMarkersInRange(markers, 2_500_000, 5_000_000);
		expect(found.map((m) => m.id)).toEqual(['m2', 'm3']);
	});
});

describe('clip marker mapping and operations', () => {
	const clip: Clip = {
		id: 'clip-1' as ClipId,
		start: 1_000_000,
		duration: 4_000_000,
		sourceIn: 2_000_000,
		sourceOut: 6_000_000,
		speed: 1,
		volume: 1,
		markers: [
			createMarker({
				id: 'cm1' as MarkerId,
				time: 3_000_000,
				name: 'Cue in source',
				color: 'green'
			}),
			createMarker({
				id: 'cm2' as MarkerId,
				time: 1_000_000,
				name: 'Trimmed out start',
				color: 'red'
			}),
			createMarker({
				id: 'cm3' as MarkerId,
				time: 7_000_000,
				name: 'Trimmed out end',
				color: 'red'
			})
		]
	};

	it('maps clip source marker to timeline and checks visibility', () => {
		// cm1 is at source 3s -> timeline 2s (clip.start + (source - sourceIn))
		expect(clipMarkerToTimeline(3_000_000, clip)).toBe(2_000_000);
		expect(timelineToClipMarker(2_000_000, clip)).toBe(3_000_000);

		// Visibility within source window [2s, 6s]
		expect(isClipMarkerVisible(3_000_000, clip)).toBe(true);
		expect(isClipMarkerVisible(1_000_000, clip)).toBe(false);
		expect(isClipMarkerVisible(7_000_000, clip)).toBe(false);
	});

	it('maps correctly across speed changes', () => {
		const fastClip: Clip = {
			...clip,
			speed: 2, // 200% speed
			duration: 2_000_000,
			sourceIn: 2_000_000,
			sourceOut: 6_000_000
		};
		// Source time 4s is 2s into source -> at 2x speed, that's 1s into timeline -> clip.start + 1s = 2s
		expect(clipMarkerToTimeline(4_000_000, fastClip)).toBe(2_000_000);
	});

	it('distributes clip markers on clip split', () => {
		const clipToSplit: Clip = {
			...clip,
			markers: [
				createMarker({ id: 'cm1' as MarkerId, time: 2_500_000, name: 'Early' }),
				createMarker({ id: 'cm2' as MarkerId, time: 3_500_000, name: 'Mid' }),
				createMarker({ id: 'cm3' as MarkerId, time: 4_500_000, name: 'Late' })
			]
		};

		const splitTime = 3_500_000;
		const { leftMarkers, rightMarkers } = distributeClipMarkersOnSplit(clipToSplit, splitTime);

		expect(leftMarkers.map((m) => m.name)).toEqual(['Early']);
		expect(rightMarkers.map((m) => m.name)).toEqual(['Mid', 'Late']);
	});
});

describe('snapping and sequence integration', () => {
	it('collectSnapPoints includes point markers and range ends', () => {
		const project = createEmptyProject({ name: 'Test' });
		project.markers = [
			createMarker({ id: 'm1' as MarkerId, time: 2_000_000, name: 'Point' }),
			createMarker({ id: 'm2' as MarkerId, time: 4_000_000, duration: 1_500_000, name: 'Range' })
		];

		const snapPoints = collectSnapPoints(project, { includeMarkers: true });
		expect(snapPoints).toContain(2_000_000);
		expect(snapPoints).toContain(4_000_000);
		expect(snapPoints).toContain(5_500_000); // 4s + 1.5s range end
	});

	it('viewProject and applyToSequence carry sequence markers', () => {
		const project = createEmptyProject({ name: 'Test' });
		const seqId = 'seq-test' as import('../../types').SequenceId;
		project.sequences = {
			[seqId]: {
				id: seqId,
				name: 'Nested Seq',
				tracks: [],
				markers: [createMarker({ id: 'sm1' as MarkerId, time: 1_200_000, name: 'Seq Marker' })]
			}
		};

		// viewProject projects sequence markers
		const view = viewProject(project, seqId);
		expect(view.markers.length).toBe(1);
		expect(view.markers[0]?.name).toBe('Seq Marker');

		// applyToSequence writes modified markers back to the sequence
		const updated = applyToSequence(project, seqId, (v) => ({
			...v,
			markers: addMarker(v.markers, { time: 3_000_000, name: 'Second Seq Marker' })
		}));

		expect(updated.sequences?.[seqId]?.markers?.length).toBe(2);
		expect(updated.sequences?.[seqId]?.markers?.[1]?.name).toBe('Second Seq Marker');
		// Root project markers remain unaffected
		expect(updated.markers.length).toBe(0);
	});

	it('duplicateProject clones markers with stable and fresh IDs', () => {
		const project = createEmptyProject({ name: 'Test' });
		project.markers = [
			createMarker({ id: 'm1' as MarkerId, time: 1_000_000, name: 'Root Marker' })
		];

		const copy = duplicateProject(project);
		expect(copy.markers.length).toBe(1);
		expect(copy.markers[0]?.name).toBe('Root Marker');
		expect(copy.markers[0]?.id).not.toBe('m1');
	});
});

describe('stress & property test: 500 random operations', () => {
	it('preserves invariants (no NaN, non-negative times, valid IDs) across 500 random operations', () => {
		let project = createEmptyProject({ name: 'Test' });
		const colors: MarkerColor[] = [
			'green',
			'red',
			'purple',
			'orange',
			'yellow',
			'white',
			'blue',
			'cyan'
		];
		const types: MarkerType[] = ['comment', 'chapter', 'segment', 'web-link'];

		// Pseudo-random generator with fixed seed
		let seed = 42;
		function nextRandom(): number {
			seed = (seed * 16807) % 2147483647;
			return (seed - 1) / 2147483646;
		}

		for (let step = 0; step < 500; step++) {
			const action = Math.floor(nextRandom() * 7);

			switch (action) {
				case 0: {
					// Add marker
					const time = Math.floor(nextRandom() * 60_000_000);
					const isRange = nextRandom() > 0.5;
					const duration = isRange ? Math.floor(nextRandom() * 5_000_000) + 100_000 : undefined;
					const color = colors[Math.floor(nextRandom() * colors.length)]!;
					const type = types[Math.floor(nextRandom() * types.length)]!;

					project = {
						...project,
						markers: addMarker(project.markers, {
							time,
							duration,
							name: `Marker ${step}`,
							color,
							type
						})
					};
					break;
				}
				case 1: {
					// Move marker
					if (project.markers.length > 0) {
						const idx = Math.floor(nextRandom() * project.markers.length);
						const target = project.markers[idx]!;
						const newTime = Math.floor(nextRandom() * 60_000_000);
						project = {
							...project,
							markers: moveMarker(project.markers, target.id, newTime)
						};
					}
					break;
				}
				case 2: {
					// Delete marker
					if (project.markers.length > 0) {
						const idx = Math.floor(nextRandom() * project.markers.length);
						const target = project.markers[idx]!;
						project = {
							...project,
							markers: deleteMarker(project.markers, target.id)
						};
					}
					break;
				}
				case 3: {
					// Duplicate marker
					if (project.markers.length > 0) {
						const idx = Math.floor(nextRandom() * project.markers.length);
						const target = project.markers[idx]!;
						project = {
							...project,
							markers: duplicateMarker(project.markers, target.id, 500_000)
						};
					}
					break;
				}
				case 4: {
					// Change color/type
					if (project.markers.length > 0) {
						const idx = Math.floor(nextRandom() * project.markers.length);
						const target = project.markers[idx]!;
						const newColor = colors[Math.floor(nextRandom() * colors.length)]!;
						project = {
							...project,
							markers: setMarkerColor(project.markers, [target.id], newColor)
						};
					}
					break;
				}
				case 5: {
					// Convert range <-> point
					if (project.markers.length > 0) {
						const idx = Math.floor(nextRandom() * project.markers.length);
						const target = project.markers[idx]!;
						const dur = target.duration ? 0 : 1_000_000;
						project = {
							...project,
							markers: convertMarkerRange(project.markers, target.id, dur)
						};
					}
					break;
				}
				case 6: {
					// Query next/prev and snap points
					const queryTime = Math.floor(nextRandom() * 60_000_000);
					findNextMarker(project.markers, queryTime, { wrap: true });
					findPrevMarker(project.markers, queryTime, { wrap: true });
					const snapPoints = collectSnapPoints(project, { includeMarkers: true });
					expect(snapPoints.every((p) => Number.isSafeInteger(p) && p >= 0)).toBe(true);
					break;
				}
			}

			// Invariant verification on every iteration
			const ids = new Set<string>();
			for (const m of project.markers) {
				expect(validateMarker(m)).toBe(true);
				expect(Number.isSafeInteger(m.time)).toBe(true);
				expect(m.time).toBeGreaterThanOrEqual(0);
				if (m.duration !== undefined) {
					expect(Number.isSafeInteger(m.duration)).toBe(true);
					expect(m.duration).toBeGreaterThan(0);
				}
				expect(ids.has(m.id)).toBe(false);
				ids.add(m.id);
			}
		}
	});
});
