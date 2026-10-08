import {
	useCallback,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent
} from 'react';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import {
	applyDrag,
	compositionGuides,
	edgeMidpoints,
	hitTest,
	pivotPoint,
	readProperty,
	rotateHandlePoint,
	snapToGuides,
	stateCorners,
	type Crop,
	type GizmoGeometry,
	type GizmoHandle,
	type GizmoState,
	type Guide,
	type Point,
	type Project
} from '../../core';
import { getTextDimensions } from '../../services/render/text/rasterizer';

interface TransformGizmoProps {
	project: Project;
	renderedWidth: number;
	renderedHeight: number;
}

export default function TransformGizmo({
	project,
	renderedWidth,
	renderedHeight
}: TransformGizmoProps) {
	const store = useEditorStoreApi();
	const selectedClipIds = useEditorStore((state) => state.timeline.selection.clipIds);
	const playhead = useEditorStore((state) => state.timeline.playhead);
	const maskTool = useEditorStore((state) => state.maskTool);

	const [activeGuides, setActiveGuides] = useState<Guide[]>([]);

	const selectedClip = useMemo(() => {
		if (selectedClipIds.length !== 1) return null;
		for (const track of project.tracks) {
			if (track.kind !== 'video') continue;
			const clip = track.clips.find((c) => c.id === selectedClipIds[0]);
			if (clip) return clip;
		}
		return null;
	}, [project, selectedClipIds]);

	const monitorScale = renderedWidth / Math.max(1, project.settings.width);
	const localTime = selectedClip ? playhead - selectedClip.start : 0;

	// Read current evaluated properties
	const position = useMemo(() => {
		if (!selectedClip) return [0, 0] as const;
		return (readProperty(selectedClip, 'position', localTime) as [number, number]) ?? [0, 0];
	}, [selectedClip, localTime]);

	const scale = useMemo(() => {
		if (!selectedClip) return [1, 1] as const;
		return (readProperty(selectedClip, 'scale', localTime) as [number, number]) ?? [1, 1];
	}, [selectedClip, localTime]);

	const rotation = useMemo(() => {
		if (!selectedClip) return 0;
		return (readProperty(selectedClip, 'rotation', localTime) as number) ?? 0;
	}, [selectedClip, localTime]);

	const anchor = useMemo(() => {
		if (!selectedClip) return [0, 0] as const;
		return (readProperty(selectedClip, 'anchor', localTime) as [number, number]) ?? [0, 0];
	}, [selectedClip, localTime]);

	const crop = useMemo(() => {
		if (!selectedClip) return [0, 0, 0, 0] as Crop;
		return (readProperty(selectedClip, 'crop', localTime) as unknown as Crop) ?? [0, 0, 0, 0];
	}, [selectedClip, localTime]);

	const geometry: GizmoGeometry = useMemo(() => {
		if (selectedClip?.source?.type === 'text') {
			const fontSize = (readProperty(selectedClip, 'text.fontSize', localTime) as number) ?? 48;
			const dims = getTextDimensions(
				selectedClip.source.text,
				selectedClip.source.style ?? { fontFamily: 'sans-serif' },
				selectedClip.source.box,
				fontSize
			);
			return {
				sourceWidth: dims.width,
				sourceHeight: dims.height,
				width: project.settings.width,
				height: project.settings.height,
				crop
			};
		}
		const asset = selectedClip?.assetId ? project.assets[selectedClip.assetId] : undefined;
		return {
			sourceWidth: asset?.width ?? project.settings.width,
			sourceHeight: asset?.height ?? project.settings.height,
			width: project.settings.width,
			height: project.settings.height,
			crop
		};
	}, [selectedClip, project, crop, localTime]);

	const currentState: GizmoState = useMemo(
		() => ({
			position,
			scale,
			rotation,
			anchor
		}),
		[position, scale, rotation, anchor]
	);

	// Geometry in composition px
	const compCorners = useMemo(() => stateCorners(currentState, geometry), [currentState, geometry]);
	const compPivot = useMemo(() => pivotPoint(currentState, geometry), [currentState, geometry]);
	const compEdges = useMemo(() => edgeMidpoints(compCorners), [compCorners]);
	const compRotate = useMemo(
		() => rotateHandlePoint(compCorners, monitorScale),
		[compCorners, monitorScale]
	);

	// Transform composition points to SVG space
	const c2s = useCallback(
		(pt: Point) => ({
			x: pt.x * monitorScale,
			y: pt.y * monitorScale
		}),
		[monitorScale]
	);

	const svgCorners = useMemo(() => compCorners.map(c2s), [compCorners, c2s]);
	const svgPivot = useMemo(() => c2s(compPivot), [compPivot, c2s]);
	const svgEdges = useMemo(() => compEdges.map(c2s), [compEdges, c2s]);
	const svgRotate = useMemo(() => c2s(compRotate), [compRotate, c2s]);

	// Interactive dragging session
	const dragSession = useRef<{
		handle: GizmoHandle;
		startPointer: Point;
		rectLeft: number;
		rectTop: number;
		startState: GizmoState;
	} | null>(null);

	const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (e.button !== 0 || !selectedClip) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const compPt: Point = {
			x: (e.clientX - rect.left) / monitorScale,
			y: (e.clientY - rect.top) / monitorScale
		};

		const handle = hitTest(compPt, compCorners, compPivot, monitorScale, 8);
		if (!handle) return;

		e.preventDefault();
		e.stopPropagation();

		dragSession.current = {
			handle,
			startPointer: compPt,
			rectLeft: rect.left,
			rectTop: rect.top,
			startState: { ...currentState }
		};

		e.currentTarget.setPointerCapture(e.pointerId);
	};

	const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (!dragSession.current || !selectedClip) return;
		const { handle, startPointer, rectLeft, rectTop, startState } = dragSession.current;

		const currentCompPt: Point = {
			x: (e.clientX - rectLeft) / monitorScale,
			y: (e.clientY - rectTop) / monitorScale
		};

		const partial = applyDrag(
			handle,
			startState,
			geometry,
			{ start: startPointer, current: currentCompPt },
			{
				shift: e.shiftKey,
				alt: e.altKey
			}
		);

		// Snapping to guides on move
		if (handle === 'move' && partial.position) {
			const shiftedCorners = stateCorners({ ...startState, position: partial.position }, geometry);
			const minX = Math.min(...shiftedCorners.map((c) => c.x));
			const maxX = Math.max(...shiftedCorners.map((c) => c.x));
			const minY = Math.min(...shiftedCorners.map((c) => c.y));
			const maxY = Math.max(...shiftedCorners.map((c) => c.y));
			const box = { left: minX, right: maxX, top: minY, bottom: maxY };

			const guides = compositionGuides(geometry.width, geometry.height);
			const snapResult = snapToGuides(box, guides, 8 / monitorScale);

			if (snapResult.dx !== 0 || snapResult.dy !== 0) {
				partial.position = [
					partial.position[0] + snapResult.dx,
					partial.position[1] + snapResult.dy
				];
				setActiveGuides(snapResult.hits);
			} else {
				setActiveGuides([]);
			}
		} else {
			setActiveGuides([]);
		}

		// Apply partial values live
		if (partial.position) {
			store.getState().setProperty(selectedClip.id, 'position', partial.position, {
				autoKey: true,
				coalesce: true
			});
		}
		if (partial.scale) {
			store.getState().setProperty(selectedClip.id, 'scale', partial.scale, {
				autoKey: true,
				coalesce: true
			});
		}
		if (partial.rotation !== undefined) {
			store.getState().setProperty(selectedClip.id, 'rotation', partial.rotation, {
				autoKey: true,
				coalesce: true
			});
		}
		if (partial.anchor) {
			store.getState().setProperty(selectedClip.id, 'anchor', partial.anchor, {
				autoKey: true,
				coalesce: true
			});
		}
	};

	const handlePointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (dragSession.current) {
			dragSession.current = null;
			setActiveGuides([]);
			try {
				e.currentTarget.releasePointerCapture(e.pointerId);
			} catch {}
		}
	};

	const handleKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
		if (!selectedClip) return;
		if (
			e.key === 'ArrowLeft' ||
			e.key === 'ArrowRight' ||
			e.key === 'ArrowUp' ||
			e.key === 'ArrowDown'
		) {
			e.preventDefault();
			const multiplier = e.shiftKey ? 10 : 1;
			const dx = (e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0) * multiplier;
			const dy = (e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0) * multiplier;
			store
				.getState()
				.setProperty(selectedClip.id, 'position', [position[0] + dx, position[1] + dy], {
					autoKey: true
				});
		}
	};

	if (!selectedClip) return null;

	const maskActive =
		maskTool.showOverlay &&
		((selectedClip.masks && selectedClip.masks.length > 0 && maskTool.selectedMaskId !== null) ||
			maskTool.activeTool !== 'select');
	if (maskActive) return null;

	const polygonPoints = svgCorners.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');

	return (
		<svg
			className="transform-gizmo-overlay"
			style={{
				position: 'absolute',
				inset: 0,
				width: '100%',
				height: '100%',
				pointerEvents: 'auto',
				overflow: 'visible',
				outline: 'none'
			}}
			tabIndex={0}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onDoubleClick={() => {
				if (selectedClip?.source?.type === 'text') {
					store.getState().setEditingTextClipId(selectedClip.id);
				}
			}}
			onKeyDown={handleKeyDown}
			data-testid="transform-gizmo"
		>
			{/* Snapping guide lines */}
			{activeGuides.map((guide, idx) => {
				const pos = guide.position * monitorScale;
				return guide.axis === 'x' ? (
					<line
						key={idx}
						x1={pos}
						y1={0}
						x2={pos}
						y2={renderedHeight}
						stroke="#06b6d4"
						strokeWidth="1"
						strokeDasharray="4 2"
					/>
				) : (
					<line
						key={idx}
						x1={0}
						y1={pos}
						x2={renderedWidth}
						y2={pos}
						stroke="#06b6d4"
						strokeWidth="1"
						strokeDasharray="4 2"
					/>
				);
			})}

			{/* Bounding box quad */}
			<polygon
				points={polygonPoints}
				fill="transparent"
				stroke="var(--color-link)"
				strokeWidth="1"
				strokeDasharray="4 2"
				style={{ cursor: 'move' }}
			/>

			{/* Rotation stem */}
			<line
				x1={svgEdges[0]!.x}
				y1={svgEdges[0]!.y}
				x2={svgRotate.x}
				y2={svgRotate.y}
				stroke="var(--color-link)"
				strokeWidth="1"
			/>

			{/* Rotation handle */}
			<circle
				cx={svgRotate.x}
				cy={svgRotate.y}
				r="5"
				fill="#ffffff"
				stroke="var(--color-link)"
				strokeWidth="1.5"
				style={{ cursor: 'grab' }}
			/>

			{/* 4 corner scale handles */}
			{svgCorners.map((pt, i) => (
				<rect
					key={`corner-${i}`}
					x={pt.x - 4}
					y={pt.y - 4}
					width="8"
					height="8"
					fill="#ffffff"
					stroke="var(--color-link)"
					strokeWidth="1.5"
					style={{
						cursor: i === 0 || i === 2 ? 'nwse-resize' : 'nesw-resize'
					}}
				/>
			))}

			{/* 4 edge midpoint handles */}
			{svgEdges.map((pt, i) => (
				<rect
					key={`edge-${i}`}
					x={pt.x - 3}
					y={pt.y - 3}
					width="6"
					height="6"
					fill="#ffffff"
					stroke="var(--color-link)"
					strokeWidth="1"
					style={{
						cursor: i % 2 === 0 ? 'ns-resize' : 'ew-resize'
					}}
				/>
			))}

			{/* Anchor point handle */}
			<g transform={`translate(${svgPivot.x}, ${svgPivot.y})`} style={{ cursor: 'move' }}>
				<circle
					cx="0"
					cy="0"
					r="6"
					fill="transparent"
					stroke="var(--color-link)"
					strokeWidth="1.5"
				/>
				<line x1="-8" y1="0" x2="8" y2="0" stroke="var(--color-link)" strokeWidth="1" />
				<line x1="0" y1="-8" x2="0" y2="8" stroke="var(--color-link)" strokeWidth="1" />
			</g>
		</svg>
	);
}
