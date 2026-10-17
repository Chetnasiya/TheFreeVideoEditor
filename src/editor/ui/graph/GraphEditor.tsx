import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent
} from 'react';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import { trackFeatureUsed } from '../../../services/activityTracking';
import {
	descriptorFor,
	evaluate,
	isAnimated,
	propertyCurve,
	type BezierHandle,
	type Clip,
	type Keyframe,
	type PropertyDescriptor,
	type PropertyId,
	type PropertyValue,
	type Time
} from '../../core';
import './graph-editor.css';

export interface GraphEditorCurve {
	id: string;
	propertyId: PropertyId;
	channelIdx: number;
	label: string;
	color: string;
	desc: PropertyDescriptor;
	keyframes: {
		time: Time;
		value: number;
		interpolation: Keyframe<PropertyValue>['interpolation'];
		easeIn?: BezierHandle;
		easeOut?: BezierHandle;
	}[];
}

const PROPERTY_COLORS: Record<string, string> = {
	'position:0': '#ef4444',
	'position:1': '#22c55e',
	'scale:0': '#f97316',
	'scale:1': '#eab308',
	rotation: '#3b82f6',
	'anchor:0': '#ec4899',
	'anchor:1': '#d946ef',
	opacity: '#a855f7',
	'crop:0': '#06b6d4',
	'crop:1': '#14b8a6',
	'crop:2': '#0ea5e9',
	'crop:3': '#6366f1'
};

const FILTER_PROPERTIES: PropertyId[] = ['position', 'scale', 'rotation', 'opacity', 'crop'];

export default function GraphEditor() {
	const store = useEditorStoreApi();
	const project = useEditorStore((state) => state.project);
	const playhead = useEditorStore((state) => state.timeline.playhead);
	const selectedClipIds = useEditorStore((state) => state.timeline.selection.clipIds);
	const visibleProperties = useEditorStore(
		(state) => state.keyframes.graph.visibleProperties ?? FILTER_PROPERTIES
	);
	const selectedKeyframeRefs = useEditorStore((state) => state.keyframes.selection);

	const containerRef = useRef<HTMLDivElement>(null);
	const [viewSize, setViewSize] = useState({ width: 800, height: 180 });

	useEffect(() => {
		trackFeatureUsed('keyframe_editor');
	}, []);

	const selectedClip: Clip | null = useMemo(() => {
		if (!project || selectedClipIds.length !== 1) return null;
		return project.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipIds[0]) ?? null;
	}, [project, selectedClipIds]);

	// Filter properties available for this clip
	const availableFilterProperties: PropertyId[] = useMemo(() => {
		const props: PropertyId[] = [...FILTER_PROPERTIES];
		if (selectedClip?.masks) {
			for (const mask of selectedClip.masks) {
				props.push(`mask:${mask.id}:feather` as PropertyId);
				props.push(`mask:${mask.id}:expansion` as PropertyId);
				props.push(`mask:${mask.id}:opacity` as PropertyId);
			}
		}
		return props;
	}, [selectedClip]);

	// Extract curves for animated channels on this clip
	const curves: GraphEditorCurve[] = useMemo(() => {
		if (!selectedClip) return [];
		const result: GraphEditorCurve[] = [];
		const activeProps = [...visibleProperties];
		if (selectedClip.masks) {
			for (const mask of selectedClip.masks) {
				const featherId = `mask:${mask.id}:feather` as PropertyId;
				const expId = `mask:${mask.id}:expansion` as PropertyId;
				const opId = `mask:${mask.id}:opacity` as PropertyId;
				if (
					visibleProperties.includes(featherId) ||
					visibleProperties.includes(expId) ||
					visibleProperties.includes(opId)
				) {
					// already included or selectable
				}
			}
		}
		for (const propId of activeProps) {
			const curve = propertyCurve(selectedClip, propId);
			if (!curve || !isAnimated(curve) || curve.keyframes.length === 0) continue;
			const desc = descriptorFor(propId);
			if (!desc) continue;

			if (desc.shape === 'number') {
				const color = PROPERTY_COLORS[propId] ?? '#8b5cf6';
				result.push({
					id: propId,
					propertyId: propId,
					channelIdx: 0,
					label: desc.label,
					color,
					desc,
					keyframes: curve.keyframes.map((k) => ({
						time: k.time,
						value: (k.value as number) * desc.displayFactor,
						interpolation: k.interpolation,
						easeIn: k.easeIn,
						easeOut: k.easeOut
					}))
				});
			} else {
				desc.channels.forEach((chanLabel, chanIdx) => {
					const colorKey = `${propId}:${chanIdx}`;
					const color = PROPERTY_COLORS[colorKey] ?? '#22c55e';
					result.push({
						id: colorKey,
						propertyId: propId,
						channelIdx: chanIdx,
						label: `${desc.label} ${chanLabel}`,
						color,
						desc,
						keyframes: curve.keyframes.map((k) => {
							const arr = Array.isArray(k.value) ? k.value : [k.value, k.value];
							return {
								time: k.time,
								value: (arr[chanIdx] ?? 0) * desc.displayFactor,
								interpolation: k.interpolation,
								easeIn: k.easeIn,
								easeOut: k.easeOut
							};
						})
					});
				});
			}
		}
		return result;
	}, [selectedClip, visibleProperties]);

	// Compute bounds for mapping:
	const bounds = useMemo(() => {
		if (!selectedClip || curves.length === 0) {
			return { minT: 0, maxT: 1_000_000, minV: 0, maxV: 100 };
		}
		let minV = Infinity;
		let maxV = -Infinity;
		for (const curve of curves) {
			for (const k of curve.keyframes) {
				minV = Math.min(minV, k.value);
				maxV = Math.max(maxV, k.value);
			}
		}
		if (minV === Infinity) minV = 0;
		if (maxV === -Infinity) maxV = 100;
		if (minV === maxV) {
			minV -= 10;
			maxV += 10;
		}
		const pad = (maxV - minV) * 0.15;
		return {
			minT: 0,
			maxT: Math.max(selectedClip.duration, 1_000_000),
			minV: minV - pad,
			maxV: maxV + pad
		};
	}, [selectedClip, curves]);

	const padLeft = 40;
	const padRight = 20;
	const padTop = 15;
	const padBottom = 20;
	const plotW = Math.max(10, viewSize.width - padLeft - padRight);
	const plotH = Math.max(10, viewSize.height - padTop - padBottom);

	const timeToX = useCallback(
		(t: Time) => padLeft + ((t - bounds.minT) / (bounds.maxT - bounds.minT)) * plotW,
		[bounds.minT, bounds.maxT, padLeft, plotW]
	);

	const xToTime = useCallback(
		(x: number) => bounds.minT + ((x - padLeft) / plotW) * (bounds.maxT - bounds.minT),
		[bounds.minT, bounds.maxT, padLeft, plotW]
	);

	const valToY = useCallback(
		(v: number) => padTop + ((bounds.maxV - v) / (bounds.maxV - bounds.minV)) * plotH,
		[bounds.minV, bounds.maxV, padTop, plotH]
	);

	// Dragging keyframes or playhead
	const activeDrag = useRef<{
		kind: 'keyframe' | 'playhead' | 'handle';
		propertyId?: PropertyId;
		keyTime?: Time;
		channelIdx?: number;
		isEaseIn?: boolean;
		startX: number;
		startY: number;
	} | null>(null);

	const handlePointerDownCanvas = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (e.button !== 0 || !selectedClip) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const clickX = e.clientX - rect.left;
		const clickedTime = Math.max(0, Math.min(selectedClip.duration, Math.round(xToTime(clickX))));
		store.getState().setPlayhead(selectedClip.start + clickedTime);
		activeDrag.current = {
			kind: 'playhead',
			startX: e.clientX,
			startY: e.clientY
		};
		e.currentTarget.setPointerCapture(e.pointerId);
	};

	const handlePointerMoveCanvas = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (!activeDrag.current || !selectedClip) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const currentX = e.clientX - rect.left;
		if (activeDrag.current.kind === 'playhead') {
			const clickedTime = Math.max(
				0,
				Math.min(selectedClip.duration, Math.round(xToTime(currentX)))
			);
			store.getState().setPlayhead(selectedClip.start + clickedTime);
		}
	};

	const handlePointerUpCanvas = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (activeDrag.current) {
			activeDrag.current = null;
			try {
				e.currentTarget.releasePointerCapture(e.pointerId);
			} catch {}
		}
	};

	const toggleFilter = (propId: PropertyId) => {
		const next = visibleProperties.includes(propId)
			? visibleProperties.filter((p) => p !== propId)
			: [...visibleProperties, propId];
		store.getState().setGraphVisibleProperties(next);
	};

	const localPlayhead = selectedClip ? playhead - selectedClip.start : -1;
	const playheadX = localPlayhead >= 0 ? timeToX(localPlayhead) : -1;

	return (
		<div className="graph-editor-panel" ref={containerRef}>
			<div className="graph-editor-toolbar">
				<div className="graph-editor-filters">
					{availableFilterProperties.map((propId) => {
						const desc = descriptorFor(propId);
						if (!desc) return null;
						const isActive = visibleProperties.includes(propId);
						return (
							<button
								key={propId}
								type="button"
								className={`graph-filter-btn ${isActive ? 'is-active' : ''}`}
								onClick={() => toggleFilter(propId)}
							>
								{desc.label}
							</button>
						);
					})}
				</div>

				<div className="graph-editor-presets">
					<button
						type="button"
						className="graph-preset-btn"
						onClick={() => store.getState().setKeyframeInterpolation('linear')}
						title="Linear interpolation"
					>
						Linear
					</button>
					<button
						type="button"
						className="graph-preset-btn"
						onClick={() => store.getState().setKeyframeInterpolation('ease-in')}
						title="Ease In"
					>
						Ease In
					</button>
					<button
						type="button"
						className="graph-preset-btn"
						onClick={() => store.getState().setKeyframeInterpolation('ease-out')}
						title="Ease Out"
					>
						Ease Out
					</button>
					<button
						type="button"
						className="graph-preset-btn"
						onClick={() => store.getState().easyEase()}
						title="Ease In-Out"
					>
						Ease Both
					</button>
					<button
						type="button"
						className="graph-preset-btn"
						onClick={() => store.getState().setKeyframeInterpolation('hold')}
						title="Hold interpolation"
					>
						Hold
					</button>
				</div>

				<div className="graph-editor-actions">
					<button
						type="button"
						className="graph-close-btn"
						onClick={() => store.getState().setGraphOpen(false)}
						title="Close Graph Editor"
						aria-label="Close Graph Editor"
					>
						✕
					</button>
				</div>
			</div>

			<div className="graph-canvas-container">
				{!selectedClip ? (
					<div className="graph-empty-state">
						<span>Select a clip with animated properties to view curves</span>
					</div>
				) : curves.length === 0 ? (
					<div className="graph-empty-state">
						<span>No animated properties visible. Turn on animation in the Inspector.</span>
					</div>
				) : (
					<svg
						className="graph-svg"
						onPointerDown={handlePointerDownCanvas}
						onPointerMove={handlePointerMoveCanvas}
						onPointerUp={handlePointerUpCanvas}
						ref={(svg) => {
							if (
								svg &&
								(svg.clientWidth !== viewSize.width || svg.clientHeight !== viewSize.height)
							) {
								if (svg.clientWidth > 0 && svg.clientHeight > 0) {
									setViewSize({ width: svg.clientWidth, height: svg.clientHeight });
								}
							}
						}}
					>
						{/* Horizontal grid lines */}
						{[0, 0.25, 0.5, 0.75, 1].map((frac) => {
							const val = bounds.minV + (bounds.maxV - bounds.minV) * frac;
							const y = valToY(val);
							return (
								<g key={frac}>
									<line
										x1={padLeft}
										y1={y}
										x2={viewSize.width - padRight}
										y2={y}
										className="graph-grid-line"
									/>
									<text x={padLeft - 4} y={y + 3} textAnchor="end" className="graph-axis-label">
										{val.toFixed(0)}
									</text>
								</g>
							);
						})}

						{/* Curves */}
						{curves.map((curve) => {
							const rawCurve = propertyCurve(selectedClip, curve.propertyId);
							if (!rawCurve || !isAnimated(rawCurve)) return null;

							// Sample points across time
							const sampleCount = Math.min(200, Math.max(30, Math.floor(plotW / 4)));
							const points: string[] = [];
							for (let i = 0; i <= sampleCount; i++) {
								const t = bounds.minT + (i / sampleCount) * (bounds.maxT - bounds.minT);
								const ev = evaluate(rawCurve, t);
								const num = Array.isArray(ev) ? (ev[curve.channelIdx] ?? 0) : ev;
								const v = num * curve.desc.displayFactor;
								const x = timeToX(t);
								const y = valToY(v);
								points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
							}

							return (
								<g key={curve.id}>
									<path d={points.join(' ')} stroke={curve.color} className="graph-curve-path" />

									{/* Keyframe diamonds */}
									{curve.keyframes.map((k) => {
										const kx = timeToX(k.time);
										const ky = valToY(k.value);
										const isSelected = selectedKeyframeRefs.some(
											(ref) =>
												ref.clipId === selectedClip.id &&
												ref.propertyId === curve.propertyId &&
												ref.time === k.time
										);

										return (
											<polygon
												key={k.time}
												points={`${kx},${ky - 5} ${kx + 5},${ky} ${kx},${ky + 5} ${kx - 5},${ky}`}
												fill={isSelected ? curve.color : 'var(--color-canvas)'}
												stroke={curve.color}
												className={`graph-keyframe-point ${isSelected ? 'is-selected' : ''}`}
												onPointerDown={(e) => {
													e.stopPropagation();
													store.getState().selectKeyframe(
														{
															clipId: selectedClip.id,
															propertyId: curve.propertyId,
															time: k.time
														},
														e.shiftKey ? 'toggle' : 'set'
													);
												}}
											/>
										);
									})}
								</g>
							);
						})}

						{/* Playhead indicator */}
						{playheadX >= padLeft && playheadX <= viewSize.width - padRight && (
							<line
								x1={playheadX}
								y1={padTop}
								x2={playheadX}
								y2={viewSize.height - padBottom}
								className="graph-playhead-line"
							/>
						)}
					</svg>
				)}
			</div>
		</div>
	);
}
