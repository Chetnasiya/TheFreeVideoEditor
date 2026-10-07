import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
	evaluateMask,
	layerAffine,
	resolveFrame,
	type Clip,
	type EvaluatedMask,
	type Point2D,
	type Project
} from '../../core';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';

interface MaskOverlayProps {
	project: Project;
	renderedWidth: number;
	renderedHeight: number;
}

interface DraggingPoint {
	maskId: string;
	pointIndex: number;
	handle?: 'in' | 'out';
	startPos: Point2D;
	originalShape: number[];
}

export default function MaskOverlay({ project, renderedWidth, renderedHeight }: MaskOverlayProps) {
	const store = useEditorStoreApi();
	const selectedClipIds = useEditorStore((state) => state.timeline.selection.clipIds);
	const playhead = useEditorStore((state) => state.timeline.playhead);
	const maskTool = useEditorStore((state) => state.maskTool);

	const [dragging, setDragging] = useState<DraggingPoint | null>(null);
	const svgRef = useRef<SVGSVGElement>(null);

	// Find the single selected clip
	const selectedClip: Clip | null = useMemo(() => {
		if (selectedClipIds.length !== 1) return null;
		for (const track of project.tracks) {
			if (track.kind !== 'video') continue;
			const clip = track.clips.find((c) => c.id === selectedClipIds[0]);
			if (clip) return clip;
		}
		return null;
	}, [project, selectedClipIds]);

	const masks = selectedClip?.masks ?? [];
	const showOverlay = maskTool.showOverlay && masks.length > 0;

	// Compute transform matrix from normalized layer space to monitor space
	const { toMonitor, fromMonitor } = useMemo(() => {
		if (!selectedClip) {
			const identity = (p: Point2D) => p;
			return { toMonitor: identity, fromMonitor: identity };
		}

		const resolved = resolveFrame(project, playhead);
		const layer = resolved.videoLayers.find((l) => l.clipId === selectedClip.id);

		const compW = project.settings.width;
		const compH = project.settings.height;
		const scale = renderedWidth / Math.max(1, compW);

		if (!layer) {
			const fallbackToMon = (p: Point2D) => ({
				x: p.x * renderedWidth,
				y: p.y * renderedHeight
			});
			const fallbackFromMon = (p: Point2D) => ({
				x: p.x / renderedWidth,
				y: p.y / renderedHeight
			});
			return { toMonitor: fallbackToMon, fromMonitor: fallbackFromMon };
		}

		const affine = layerAffine(layer, compW, compH, compW, compH);
		// [x_comp, y_comp] = [a*x + c*y + e, b*x + d*y + f]
		// Then scale to monitor pixels

		const toMon = (p: Point2D): Point2D => {
			const cx = affine.a * p.x + affine.c * p.y + affine.e;
			const cy = affine.b * p.x + affine.d * p.y + affine.f;
			return { x: cx * scale, y: cy * scale };
		};

		// 2x2 inverse for normalized coords
		const det = affine.a * affine.d - affine.b * affine.c;
		const fromMon = (p: Point2D): Point2D => {
			if (Math.abs(det) < 0.000001) return { x: 0.5, y: 0.5 };
			const cx = p.x / scale - affine.e;
			const cy = p.y / scale - affine.f;
			const x = (affine.d * cx - affine.c * cy) / det;
			const y = (-affine.b * cx + affine.a * cy) / det;
			return { x, y };
		};

		return { toMonitor: toMon, fromMonitor: fromMon };
	}, [project, selectedClip, playhead, renderedWidth, renderedHeight]);

	if (!showOverlay || !selectedClip) return null;

	const localTime = playhead - selectedClip.start;
	const evaluatedMasks = masks.map((m) => evaluateMask(m, localTime));
	const activeMaskId = maskTool.selectedMaskId ?? (masks.length > 0 ? masks[0]!.id : null);

	const handlePointerDownAnchor = (e: ReactPointerEvent, mask: EvaluatedMask, idx: number) => {
		e.stopPropagation();
		e.preventDefault();
		(e.target as SVGElement).setPointerCapture(e.pointerId);

		const svg = svgRef.current;
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		const p = fromMonitor({ x: e.clientX - rect.left, y: e.clientY - rect.top });

		setDragging({
			maskId: mask.id,
			pointIndex: idx,
			startPos: p,
			originalShape: [...mask.shape]
		});
		store.getState().selectMask(mask.id);
		store.getState().selectMaskPoint(idx);
	};

	const handlePointerMove = (e: ReactPointerEvent) => {
		if (!dragging) return;
		const svg = svgRef.current;
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		const currentNorm = fromMonitor({ x: e.clientX - rect.left, y: e.clientY - rect.top });

		const dx = currentNorm.x - dragging.startPos.x;
		const dy = currentNorm.y - dragging.startPos.y;

		const currentMask = masks.find((m) => m.id === dragging.maskId);
		if (!currentMask) return;

		if (currentMask.type === 'rect') {
			const shape = [...dragging.originalShape];
			shape[0] = Math.max(0, Math.min(1, shape[0]! + dx));
			shape[1] = Math.max(0, Math.min(1, shape[1]! + dy));
			store.getState().updateMask(selectedClip.id, dragging.maskId, { shape }, { coalesce: true });
		} else if (currentMask.type === 'ellipse') {
			const shape = [...dragging.originalShape];
			shape[0] = Math.max(0, Math.min(1, shape[0]! + dx));
			shape[1] = Math.max(0, Math.min(1, shape[1]! + dy));
			store.getState().updateMask(selectedClip.id, dragging.maskId, { shape }, { coalesce: true });
		} else if (currentMask.type === 'path') {
			const points = (currentMask.points ?? []).map((pt) => ({ ...pt }));
			const pt = points[dragging.pointIndex];
			if (pt) {
				pt.x = Math.max(0, Math.min(1, pt.x + dx));
				pt.y = Math.max(0, Math.min(1, pt.y + dy));
				store
					.getState()
					.updateMask(selectedClip.id, dragging.maskId, { points }, { coalesce: true });
			}
		}
	};

	const handlePointerUp = () => {
		if (!dragging) return;
		setDragging(null);
	};

	return (
		<svg
			ref={svgRef}
			className="mask-canvas-overlay"
			width={renderedWidth}
			height={renderedHeight}
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				pointerEvents: 'all',
				userSelect: 'none',
				zIndex: 20
			}}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
		>
			{evaluatedMasks.map((mask) => {
				const isSelected = mask.id === activeMaskId;
				const strokeColor = isSelected ? '#3b82f6' : 'rgba(255, 255, 255, 0.6)';

				if (mask.type === 'rect') {
					const [cx, cy, w, h] = mask.shape;
					const p0 = toMonitor({ x: cx - w / 2, y: cy - h / 2 });
					const p1 = toMonitor({ x: cx + w / 2, y: cy - h / 2 });
					const p2 = toMonitor({ x: cx + w / 2, y: cy + h / 2 });
					const p3 = toMonitor({ x: cx - w / 2, y: cy + h / 2 });
					const center = toMonitor({ x: cx, y: cy });

					return (
						<g key={mask.id}>
							<polygon
								points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`}
								fill="none"
								stroke={strokeColor}
								strokeWidth={1.5}
								strokeDasharray={isSelected ? undefined : '4 4'}
							/>
							{/* Center move handle */}
							<circle
								cx={center.x}
								cy={center.y}
								r={5}
								fill="#ffffff"
								stroke={strokeColor}
								strokeWidth={2}
								style={{ cursor: 'move' }}
								onPointerDown={(e) => handlePointerDownAnchor(e, mask, 0)}
							/>
						</g>
					);
				}

				if (mask.type === 'ellipse') {
					const [cx, cy, rx, ry] = mask.shape;
					const center = toMonitor({ x: cx, y: cy });
					const pRx = toMonitor({ x: cx + rx, y: cy });
					const pRy = toMonitor({ x: cx, y: cy + ry });
					const screenRx = Math.hypot(pRx.x - center.x, pRx.y - center.y);
					const screenRy = Math.hypot(pRy.x - center.x, pRy.y - center.y);

					return (
						<g key={mask.id}>
							<ellipse
								cx={center.x}
								cy={center.y}
								rx={screenRx}
								ry={screenRy}
								fill="none"
								stroke={strokeColor}
								strokeWidth={1.5}
								strokeDasharray={isSelected ? undefined : '4 4'}
							/>
							<circle
								cx={center.x}
								cy={center.y}
								r={5}
								fill="#ffffff"
								stroke={strokeColor}
								strokeWidth={2}
								style={{ cursor: 'move' }}
								onPointerDown={(e) => handlePointerDownAnchor(e, mask, 0)}
							/>
						</g>
					);
				}

				if (mask.type === 'path' && mask.points && mask.points.length > 0) {
					const pts = mask.points;
					const screenPts = pts.map((p) => toMonitor({ x: p.x, y: p.y }));

					let d = `M ${screenPts[0]!.x} ${screenPts[0]!.y}`;
					for (let i = 1; i < screenPts.length; i++) {
						const prevPt = pts[i - 1]!;
						const currPt = pts[i]!;
						if (prevPt.outHandle || currPt.inHandle) {
							const cp1 = toMonitor({
								x: prevPt.x + (prevPt.outHandle?.x ?? 0),
								y: prevPt.y + (prevPt.outHandle?.y ?? 0)
							});
							const cp2 = toMonitor({
								x: currPt.x + (currPt.inHandle?.x ?? 0),
								y: currPt.y + (currPt.inHandle?.y ?? 0)
							});
							d += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${screenPts[i]!.x} ${screenPts[i]!.y}`;
						} else {
							d += ` L ${screenPts[i]!.x} ${screenPts[i]!.y}`;
						}
					}
					if (mask.closed && pts.length >= 3) {
						const lastPt = pts[pts.length - 1]!;
						const firstPt = pts[0]!;
						if (lastPt.outHandle || firstPt.inHandle) {
							const cp1 = toMonitor({
								x: lastPt.x + (lastPt.outHandle?.x ?? 0),
								y: lastPt.y + (lastPt.outHandle?.y ?? 0)
							});
							const cp2 = toMonitor({
								x: firstPt.x + (firstPt.inHandle?.x ?? 0),
								y: firstPt.y + (firstPt.inHandle?.y ?? 0)
							});
							d += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${screenPts[0]!.x} ${screenPts[0]!.y}`;
						}
						d += ' Z';
					}

					return (
						<g key={mask.id}>
							<path
								d={d}
								fill="none"
								stroke={strokeColor}
								strokeWidth={1.5}
								strokeDasharray={isSelected ? undefined : '4 4'}
							/>
							{/* Vertices */}
							{screenPts.map((p, idx) => (
								<circle
									key={idx}
									cx={p.x}
									cy={p.y}
									r={4.5}
									fill={maskTool.selectedPointIndex === idx ? '#3b82f6' : '#ffffff'}
									stroke="#000000"
									strokeWidth={1.5}
									style={{ cursor: 'pointer' }}
									onPointerDown={(e) => handlePointerDownAnchor(e, mask, idx)}
								/>
							))}
						</g>
					);
				}

				return null;
			})}
		</svg>
	);
}
