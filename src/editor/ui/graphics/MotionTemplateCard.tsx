import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MotionGraphicTemplate } from '../../core/templates/templateTypes';
import { readProperty } from '../../core/properties';
import { setTransparentDragImage, startDragGhost, stopDragGhost } from '../drag/dragOverlayService';
import { useEditorStoreApi } from '../../state/EditorProvider';

function rgbaToCss(c?: { r: number; g: number; b: number; a: number }): string {
	if (!c) return 'transparent';
	const r = Math.round(Math.max(0, Math.min(1, c.r)) * 255);
	const g = Math.round(Math.max(0, Math.min(1, c.g)) * 255);
	const b = Math.round(Math.max(0, Math.min(1, c.b)) * 255);
	const a = Math.max(0, Math.min(1, c.a ?? 1));
	return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Checks whether any clip in the template has animated properties/keyframes or presets */
export function checkTemplateHasMotion(template: MotionGraphicTemplate): boolean {
	for (const track of template.tracks) {
		for (const clip of track.clips) {
			if (clip.properties) {
				for (const val of Object.values(clip.properties)) {
					if (
						val &&
						typeof val === 'object' &&
						'keyframes' in val &&
						Array.isArray((val as any).keyframes) &&
						(val as any).keyframes.length > 1
					) {
						return true;
					}
				}
			}
			if (
				clip.source?.type === 'text' &&
				(clip.source.animationPresetId || clip.source.graphicTemplateId)
			) {
				return true;
			}
		}
	}
	return false;
}

interface MotionTemplateCardProps {
	template: MotionGraphicTemplate;
	onAdd: () => void;
	onExport: () => void;
	onDelete: () => void;
}

export function MotionTemplateCard({
	template,
	onAdd,
	onExport,
	onDelete
}: MotionTemplateCardProps) {
	const store = useEditorStoreApi();
	const hasMotion = useMemo(() => checkTemplateHasMotion(template), [template]);

	// Settled time for static thumbnail display
	const settledTime = useMemo(() => {
		const intro = template.responsiveTiming?.introDuration ?? 500_000;
		return Math.min(intro + 200_000, template.duration * 0.45);
	}, [template]);

	const [isHovered, setIsHovered] = useState(false);
	const [previewTime, setPreviewTime] = useState(settledTime);
	const [progress, setProgress] = useState(0);
	const animFrameRef = useRef<number | null>(null);

	// Animation loop on hover if template has motion
	useEffect(() => {
		if (!isHovered || !hasMotion) {
			setPreviewTime(settledTime);
			setProgress(0);
			if (animFrameRef.current !== null) {
				cancelAnimationFrame(animFrameRef.current);
				animFrameRef.current = null;
			}
			return;
		}

		let startTime: number | null = null;
		// 2.2s loop duration for a snappy, pleasant preview
		const loopDurationMs = 2200;

		const tick = (now: number) => {
			if (startTime === null) startTime = now;
			const elapsed = now - startTime;
			const frac = (elapsed % loopDurationMs) / loopDurationMs;
			const localTime = Math.round(frac * template.duration);
			setPreviewTime(localTime);
			setProgress(frac);
			animFrameRef.current = requestAnimationFrame(tick);
		};

		animFrameRef.current = requestAnimationFrame(tick);

		return () => {
			if (animFrameRef.current !== null) {
				cancelAnimationFrame(animFrameRef.current);
				animFrameRef.current = null;
			}
		};
	}, [isHovered, hasMotion, settledTime, template.duration]);

	// Calculate proportional SVG viewBox around the graphic bounds
	const { viewBoxX, viewBoxY, viewBoxW, viewBoxH } = useMemo(() => {
		const bw = template.bounds?.width ?? 400;
		const bh = template.bounds?.height ?? 225;
		// Add padding around graphic so nothing clips at the edge
		let w = Math.max(bw * 1.3, 240);
		let h = Math.max(bh * 1.3, 135);
		// Maintain a clean 16:9 preview aspect ratio
		const aspect = 16 / 9;
		if (w / h < aspect) {
			w = h * aspect;
		} else {
			h = w / aspect;
		}
		return {
			viewBoxX: -w / 2,
			viewBoxY: -h / 2,
			viewBoxW: w,
			viewBoxH: h
		};
	}, [template.bounds]);

	// Drag start handler for timeline dropping
	const handleDragStart = (e: React.DragEvent) => {
		setTransparentDragImage(e.dataTransfer);
		startDragGhost({
			title: template.name,
			kind: 'graphic',
			badge: template.category
		});
		e.dataTransfer.setData('application/x-tfve-motion-template', JSON.stringify(template));
		e.dataTransfer.setData('text/plain', template.name);
		e.dataTransfer.effectAllowed = 'copy';
		store.getState().beginTimelineDrag({
			kind: 'graphic-template',
			clipIds: [],
			original: [],
			preview: [],
			pointerStartTime: 0,
			pointerTime: 0,
			graphicTemplateId: template.id,
			allowed: true,
			unlink: false
		});
	};

	const handleDragEnd = () => {
		stopDragGhost();
		store.getState().cancelTimelineDrag();
	};

	const durationSec = (template.duration / 1_000_000).toFixed(1);
	const paramCount = template.publishedParams.length;

	// Collect clips in rendering order (bottom tracks first, top tracks last)
	const tracksInOrder = useMemo(() => [...template.tracks].reverse(), [template.tracks]);

	return (
		<div
			className={`graphic-card custom-template-grid-card ${isHovered ? 'is-hovered' : ''}`}
			draggable
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDoubleClick={onAdd}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			role="listitem"
			aria-label={`${template.name} motion graphic template`}
		>
			{/* Preview Box */}
			<div className="custom-template-preview-box">
				{/* Top Badges */}
				<div className="custom-template-header-badges">
					<span className="custom-template-cat-pill">{template.category}</span>
					{hasMotion ? (
						<span className={`custom-template-motion-pill ${isHovered ? 'is-playing' : ''}`}>
							{isHovered ? (
								<>
									<span className="pulse-indicator" /> Playing
								</>
							) : (
								`⚡ ${durationSec}s`
							)}
						</span>
					) : (
						<span className="custom-template-mogrt-pill">✦ MOGRT</span>
					)}
				</div>

				{/* Quick Action Overlay (Export & Delete) */}
				<div className="custom-template-hover-actions">
					<button
						type="button"
						className="custom-template-quick-btn"
						onClick={(e) => {
							e.stopPropagation();
							onExport();
						}}
						title="Export .tfvetemplate file"
						aria-label="Export template"
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
							<polyline points="7 10 12 15 17 10" />
							<line x1="12" y1="15" x2="12" y2="3" />
						</svg>
					</button>
					<button
						type="button"
						className="custom-template-quick-btn delete"
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
						title="Delete template"
						aria-label="Delete template"
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>

				{/* Live Visual SVG Preview */}
				<div className="custom-template-svg-wrap">
					<svg
						viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`}
						preserveAspectRatio="xMidYMid meet"
						className="custom-template-svg"
					>
						<defs>
							{tracksInOrder.flatMap((t) =>
								t.clips.map((clip) => {
									if (
										clip.source?.type === 'shape' &&
										clip.source.gradientType &&
										clip.source.gradientType !== 'none' &&
										clip.source.gradientColorEnd
									) {
										const startColor = rgbaToCss(clip.source.fillColor);
										const endColor = rgbaToCss(clip.source.gradientColorEnd);
										const isVert = clip.source.gradientType === 'linear-vertical';
										return (
											<linearGradient
												key={`grad_${clip.id}`}
												id={`grad_${clip.id}`}
												x1="0%"
												y1="0%"
												x2={isVert ? '0%' : '100%'}
												y2={isVert ? '100%' : '0%'}
											>
												<stop offset="0%" stopColor={startColor} />
												<stop offset="100%" stopColor={endColor} />
											</linearGradient>
										);
									}
									return null;
								})
							)}
						</defs>

						{/* Render layers */}
						{tracksInOrder.map((track) =>
							track.clips.map((clip) => {
								let posX = clip.transform?.x ?? 0;
								let posY = clip.transform?.y ?? 0;
								let scaleX = clip.transform?.scaleX ?? 1;
								let scaleY = clip.transform?.scaleY ?? 1;
								let rotation = clip.transform?.rotation ?? 0;
								let opacity = clip.transform?.opacity ?? 1;

								try {
									const p = readProperty(clip, 'position', previewTime) as [number, number];
									if (Array.isArray(p)) {
										posX = p[0];
										posY = p[1];
									}
								} catch {}

								try {
									const s = readProperty(clip, 'scale', previewTime) as [number, number];
									if (Array.isArray(s)) {
										scaleX = s[0];
										scaleY = s[1];
									}
								} catch {}

								try {
									const r = readProperty(clip, 'rotation', previewTime) as number;
									if (typeof r === 'number' && Number.isFinite(r)) rotation = r;
								} catch {}

								try {
									const o = readProperty(clip, 'opacity', previewTime) as number;
									if (typeof o === 'number' && Number.isFinite(o)) {
										opacity = Math.max(0, Math.min(1, o));
									}
								} catch {}

								return (
									<g
										key={clip.id}
										transform={`translate(${posX}, ${posY}) rotate(${rotation}) scale(${scaleX}, ${scaleY})`}
										opacity={opacity}
									>
										{/* Shape Layer */}
										{clip.source?.type === 'shape' && (() => {
											let sw = clip.source.width ?? 300;
											let sh = clip.source.height ?? 150;
											try {
												const wProp = readProperty(clip, 'shape.width', previewTime) as number;
												if (typeof wProp === 'number' && wProp > 0) sw = wProp;
												const hProp = readProperty(clip, 'shape.height', previewTime) as number;
												if (typeof hProp === 'number' && hProp > 0) sh = hProp;
											} catch {}

											const hasGrad =
												clip.source.gradientType &&
												clip.source.gradientType !== 'none' &&
												clip.source.gradientColorEnd;
											const fill = hasGrad
												? `url(#grad_${clip.id})`
												: rgbaToCss(clip.source.fillColor) || '#38bdf8';
											const stroke = clip.source.strokeColor
												? rgbaToCss(clip.source.strokeColor)
												: undefined;
											const strokeWidth = clip.source.strokeWidth || 0;
											const rx = clip.source.cornerRadius ?? 8;
											const shapeType = clip.source.shapeType || 'rect';

											if (shapeType === 'circle' || shapeType === 'ellipse') {
												return (
													<ellipse
														cx={0}
														cy={0}
														rx={sw / 2}
														ry={sh / 2}
														fill={fill}
														stroke={stroke}
														strokeWidth={strokeWidth}
													/>
												);
											}
											if (shapeType === 'triangle') {
												return (
													<polygon
														points={`0,${-sh / 2} ${sw / 2},${sh / 2} ${-sw / 2},${sh / 2}`}
														fill={fill}
														stroke={stroke}
														strokeWidth={strokeWidth}
													/>
												);
											}
											if (shapeType === 'diamond') {
												return (
													<polygon
														points={`0,${-sh / 2} ${sw / 2},0 0,${sh / 2} ${-sw / 2},0`}
														fill={fill}
														stroke={stroke}
														strokeWidth={strokeWidth}
													/>
												);
											}
											if (shapeType === 'star') {
												const pts = 5;
												const outerR = Math.min(sw, sh) / 2;
												const innerR = outerR * 0.45;
												const res: string[] = [];
												for (let i = 0; i < 2 * pts; i++) {
													const r = i % 2 === 0 ? outerR : innerR;
													const angle = (i * Math.PI) / pts - Math.PI / 2;
													res.push(`${r * Math.cos(angle)},${r * Math.sin(angle)}`);
												}
												return (
													<polygon
														points={res.join(' ')}
														fill={fill}
														stroke={stroke}
														strokeWidth={strokeWidth}
													/>
												);
											}
											// Default rectangle / rounded rectangle
											return (
												<rect
													x={-sw / 2}
													y={-sh / 2}
													width={sw}
													height={sh}
													rx={rx}
													ry={rx}
													fill={fill}
													stroke={stroke}
													strokeWidth={strokeWidth}
												/>
											);
										})()}

										{/* Text Layer */}
										{clip.source?.type === 'text' && (() => {
											const text = clip.source.text || clip.text || 'Title';
											const lines = text.split('\n');
											let fontSize = 44;
											try {
												const fs = readProperty(clip, 'text.fontSize', previewTime) as number;
												if (typeof fs === 'number' && fs > 0) fontSize = fs;
												else if (clip.source.style?.lineHeight && clip.source.style.lineHeight > 10) {
													fontSize = clip.source.style.lineHeight;
												}
											} catch {}

											const fillColor = clip.source.colorRuns?.[0]?.fillColor
												? rgbaToCss(clip.source.colorRuns[0].fillColor)
												: '#ffffff';
											const fontFamily = clip.source.style?.fontFamily || 'Montserrat, sans-serif';
											const fontWeight = clip.source.style?.fontWeight || 'bold';
											const letterSpacing = clip.source.style?.letterSpacing
												? `${clip.source.style.letterSpacing}px`
												: undefined;

											const startY = -(lines.length - 1) * fontSize * 0.6;

											return (
												<text
													x={0}
													y={startY}
													textAnchor="middle"
													dominantBaseline="central"
													fill={fillColor}
													fontFamily={fontFamily}
													fontWeight={fontWeight}
													fontSize={fontSize}
													letterSpacing={letterSpacing}
												>
													{lines.map((line, idx) => (
														<tspan key={idx} x={0} dy={idx === 0 ? 0 : fontSize * 1.2}>
															{line}
														</tspan>
													))}
												</text>
											);
										})()}

										{/* Solid Layer */}
										{clip.source?.type === 'solid' && (
											<rect
												x={-viewBoxW / 2}
												y={-viewBoxH / 2}
												width={viewBoxW}
												height={viewBoxH}
												fill={rgbaToCss(clip.source.color) || '#1e293b'}
											/>
										)}
									</g>
								);
							})
						)}
					</svg>
				</div>

				{/* Scrub / Progress Bar during hover playback */}
				{hasMotion && isHovered && (
					<div className="custom-template-scrub-bar">
						<div
							className="custom-template-scrub-fill"
							style={{ width: `${Math.round(progress * 100)}%` }}
						/>
					</div>
				)}
			</div>

			{/* Card Footer */}
			<div className="graphic-card-footer">
				<div className="graphic-card-meta">
					<span className="graphic-card-title" title={template.name}>
						{template.name}
					</span>
					<span className="graphic-card-tag">
						{template.category} • {paramCount} {paramCount === 1 ? 'property' : 'properties'}
					</span>
				</div>
				<div className="graphic-card-actions">
					<button
						type="button"
						className="graphic-add-btn"
						onClick={(e) => {
							e.stopPropagation();
							onAdd();
						}}
						title="Add to timeline at playhead"
					>
						+ Add
					</button>
				</div>
			</div>
		</div>
	);
}
export default MotionTemplateCard;
