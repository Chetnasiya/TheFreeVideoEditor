import { useState, useRef, useMemo } from 'react';
import type { Clip, EffectInstance } from '../../core';
import type { CurvePoint } from '../../core/curves';
import { evaluateSpline } from '../../core/curves';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import './color.css';

export default function ColorPanel() {
	const store = useEditorStoreApi();
	const project = useEditorStore((state) => state.project);
	const activeTab = useEditorStore((state) => state.colorUi.activeTab);
	const selectedClipIds = useEditorStore((state) => state.timeline.selection.clipIds);

	const [curveChannel, setCurveChannel] = useState<'master' | 'red' | 'green' | 'blue'>('master');
	const [lutError, setLutError] = useState<string | null>(null);
	const [isLutDragOver, setIsLutDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const selectedClip: Clip | null =
		project && selectedClipIds.length === 1
			? (project.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipIds[0]) ?? null)
			: null;

	const ccEffect = (selectedClip?.effects ?? []).find((e) => e.type === 'colorCorrection');
	const curvesEffect = (selectedClip?.effects ?? []).find((e) => e.type === 'curves');
	const lutEffect = (selectedClip?.effects ?? []).find((e) => e.type === 'lut3d');

	const paramKeyForCurve = {
		master: 'rgb',
		red: 'red',
		green: 'green',
		blue: 'blue'
	}[curveChannel];

	const currentPoints: CurvePoint[] = useMemo(() => {
		const raw = curvesEffect?.params[paramKeyForCurve];
		if (Array.isArray(raw) && raw.length >= 2) return raw as unknown as CurvePoint[];
		return [
			{ x: 0, y: 0 },
			{ x: 1, y: 1 }
		];
	}, [curvesEffect, paramKeyForCurve]);

	if (!project || !selectedClip) {
		return (
			<div className="color-panel">
				<div className="effects-empty">Select a single clip in the timeline to grade color.</div>
			</div>
		);
	}

	// Helper to set a param on the active colorCorrection effect
	const setCcParam = (paramName: string, value: number) => {
		const eff = ccEffect ?? store.getState().ensureColorCorrection(selectedClip.id);
		if (!eff) return;
		store.getState().setEffectParam(selectedClip.id, eff.id, paramName, value, { autoKey: true });
	};

	// Helper to get raw param value
	const getCcParam = (paramName: string, fallback: number): number => {
		if (!ccEffect) return fallback;
		const raw = ccEffect.params[paramName];
		if (typeof raw === 'number') return raw;
		if (typeof raw === 'object' && raw !== null && 'value' in raw) {
			return Number((raw as { value: unknown }).value);
		}
		return fallback;
	};

	// Curves helpers
	const ensureCurvesEffect = (): EffectInstance | null => {
		if (curvesEffect) return curvesEffect;
		return store.getState().addEffect(selectedClip.id, 'curves');
	};

	const updateCurvePoints = (newPoints: CurvePoint[]) => {
		const eff = ensureCurvesEffect();
		if (!eff) return;
		const sorted = [...newPoints].sort((a, b) => a.x - b.x);
		store.getState().setEffectParam(selectedClip.id, eff.id, paramKeyForCurve, sorted);
	};

	// LUT helpers
	const handleImportLutFile = async (file: File) => {
		setLutError(null);
		try {
			const text = await file.text();
			const assetId = await store.getState().importLut(file.name, text);
			if (assetId) {
				const eff = lutEffect ?? store.getState().addEffect(selectedClip.id, 'lut3d');
				if (eff) {
					store.getState().setEffectParam(selectedClip.id, eff.id, 'lutAssetId', assetId);
				}
			}
		} catch (err: unknown) {
			setLutError(err instanceof Error ? err.message : 'Could not parse LUT file.');
		}
	};

	const lutAssets = Object.values(project.assets).filter((a) => a.kind === 'lut');

	return (
		<div className="color-panel" aria-label="Color Grading Panel">
			<div className="color-panel-tabs" role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'basic'}
					className={`color-tab-btn ${activeTab === 'basic' ? 'is-active' : ''}`}
					onClick={() => store.getState().setColorTab('basic')}
				>
					Basic
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'curves'}
					className={`color-tab-btn ${activeTab === 'curves' ? 'is-active' : ''}`}
					onClick={() => store.getState().setColorTab('curves')}
				>
					Curves
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'wheels'}
					className={`color-tab-btn ${activeTab === 'wheels' ? 'is-active' : ''}`}
					onClick={() => store.getState().setColorTab('wheels')}
				>
					Wheels
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'lut'}
					className={`color-tab-btn ${activeTab === 'lut' ? 'is-active' : ''}`}
					onClick={() => store.getState().setColorTab('lut')}
				>
					LUT
				</button>
			</div>

			<div className="color-tab-content">
				{activeTab === 'basic' && (
					<div className="basic-tab">
						<ColorSlider
							label="Exposure"
							value={getCcParam('exposure', 0)}
							min={-5}
							max={5}
							step={0.05}
							unit="EV"
							onChange={(v) => setCcParam('exposure', v)}
						/>
						<ColorSlider
							label="Contrast"
							value={getCcParam('contrast', 0)}
							min={-1}
							max={1}
							step={0.01}
							onChange={(v) => setCcParam('contrast', v)}
						/>
						<ColorSlider
							label="Highlights"
							value={getCcParam('highlights', 0)}
							min={-1}
							max={1}
							step={0.01}
							onChange={(v) => setCcParam('highlights', v)}
						/>
						<ColorSlider
							label="Shadows"
							value={getCcParam('shadows', 0)}
							min={-1}
							max={1}
							step={0.01}
							onChange={(v) => setCcParam('shadows', v)}
						/>
						<ColorSlider
							label="Whites"
							value={getCcParam('whites', 0)}
							min={-1}
							max={1}
							step={0.01}
							onChange={(v) => setCcParam('whites', v)}
						/>
						<ColorSlider
							label="Blacks"
							value={getCcParam('blacks', 0)}
							min={-1}
							max={1}
							step={0.01}
							onChange={(v) => setCcParam('blacks', v)}
						/>
						<ColorSlider
							label="Temperature"
							value={getCcParam('temperature', 0)}
							min={-1}
							max={1}
							step={0.01}
							onChange={(v) => setCcParam('temperature', v)}
						/>
						<ColorSlider
							label="Tint"
							value={getCcParam('tint', 0)}
							min={-1}
							max={1}
							step={0.01}
							onChange={(v) => setCcParam('tint', v)}
						/>
						<ColorSlider
							label="Saturation"
							value={getCcParam('saturation', 1)}
							min={0}
							max={2}
							step={0.01}
							unit="×"
							onChange={(v) => setCcParam('saturation', v)}
						/>
						<ColorSlider
							label="Vibrance"
							value={getCcParam('vibrance', 0)}
							min={-1}
							max={1}
							step={0.01}
							onChange={(v) => setCcParam('vibrance', v)}
						/>
					</div>
				)}

				{activeTab === 'curves' && (
					<div className="curves-container">
						<div className="curves-channel-tabs">
							{(['master', 'red', 'green', 'blue'] as const).map((ch) => (
								<button
									key={ch}
									type="button"
									className={`curves-channel-btn is-${ch} ${curveChannel === ch ? 'is-active' : ''}`}
									onClick={() => setCurveChannel(ch)}
								>
									{ch.charAt(0).toUpperCase() + ch.slice(1)}
								</button>
							))}
						</div>

						<CurveEditor
							points={currentPoints}
							channel={curveChannel}
							onChange={updateCurvePoints}
						/>

						<p className="curves-help-text">
							Click line to add point. Double-click point to remove.
						</p>
					</div>
				)}

				{activeTab === 'wheels' && (
					<div className="wheels-grid">
						<ColorWheel
							title="Lift (Shadows)"
							r={getCcParam('liftR', 0)}
							g={getCcParam('liftG', 0)}
							b={getCcParam('liftB', 0)}
							onChange={(r, g, b) => {
								setCcParam('liftR', r);
								setCcParam('liftG', g);
								setCcParam('liftB', b);
							}}
						/>
						<ColorWheel
							title="Gamma (Midtones)"
							r={getCcParam('gammaR', 0)}
							g={getCcParam('gammaG', 0)}
							b={getCcParam('gammaB', 0)}
							onChange={(r, g, b) => {
								setCcParam('gammaR', r);
								setCcParam('gammaG', g);
								setCcParam('gammaB', b);
							}}
						/>
						<ColorWheel
							title="Gain (Highlights)"
							r={getCcParam('gainR', 0)}
							g={getCcParam('gainG', 0)}
							b={getCcParam('gainB', 0)}
							onChange={(r, g, b) => {
								setCcParam('gainR', r);
								setCcParam('gainG', g);
								setCcParam('gainB', b);
							}}
						/>
					</div>
				)}

				{activeTab === 'lut' && (
					<div className="lut-container">
						<div className="lut-select-field">
							<span className="property-label">Select 3D LUT</span>
							<select
								className="lut-select"
								value={(lutEffect?.params.lutAssetId as string) || ''}
								onChange={(e) => {
									const assetId = e.target.value;
									const eff = lutEffect ?? store.getState().addEffect(selectedClip.id, 'lut3d');
									if (eff) {
										store.getState().setEffectParam(selectedClip.id, eff.id, 'lutAssetId', assetId);
									}
								}}
							>
								<option value="">(None)</option>
								{lutAssets.map((asset) => (
									<option key={asset.id} value={asset.id}>
										{asset.name}
									</option>
								))}
							</select>
						</div>

						{lutEffect && (
							<ColorSlider
								label="LUT Intensity"
								value={Number(lutEffect.params.mix ?? 1)}
								min={0}
								max={1}
								step={0.01}
								onChange={(v) =>
									store.getState().setEffectParam(selectedClip.id, lutEffect.id, 'mix', v)
								}
							/>
						)}

						<div
							className={`lut-dropzone ${isLutDragOver ? 'is-drag-over' : ''}`}
							onDragOver={(e) => {
								e.preventDefault();
								setIsLutDragOver(true);
							}}
							onDragLeave={() => setIsLutDragOver(false)}
							onDrop={(e) => {
								e.preventDefault();
								setIsLutDragOver(false);
								const file = e.dataTransfer.files[0];
								if (file) void handleImportLutFile(file);
							}}
							onClick={() => fileInputRef.current?.click()}
						>
							<span>Drop .cube file here or click to import</span>
							<input
								ref={fileInputRef}
								type="file"
								accept=".cube"
								style={{ display: 'none' }}
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (file) void handleImportLutFile(file);
								}}
							/>
						</div>

						{lutError && <div className="lut-error-msg">{lutError}</div>}
					</div>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------
// Sub-components
// ---------------------------------------------------------

interface ColorSliderProps {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	unit?: string;
	onChange: (v: number) => void;
}

function ColorSlider({ label, value, min, max, step, unit = '', onChange }: ColorSliderProps) {
	return (
		<div className="color-slider-row">
			<div className="color-slider-label">
				<span>{label}</span>
				<span className="color-slider-val">
					{value.toFixed(2)}
					{unit}
				</span>
			</div>
			<input
				type="range"
				className="color-range-input"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(e) => onChange(parseFloat(e.target.value))}
			/>
		</div>
	);
}

interface CurveEditorProps {
	points: CurvePoint[];
	channel: 'master' | 'red' | 'green' | 'blue';
	onChange: (points: CurvePoint[]) => void;
}

function CurveEditor({ points, channel, onChange }: CurveEditorProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

	const channelColor = {
		master: '#fff',
		red: '#ef4444',
		green: '#22c55e',
		blue: '#3b82f6'
	}[channel];

	// Generate spline path pathData
	const pathData = useMemo(() => {
		const steps = 64;
		const d: string[] = [];
		for (let i = 0; i <= steps; i++) {
			const x = i / steps;
			const y = evaluateSpline(points, x);
			const svgX = x * 100;
			const svgY = (1 - y) * 100; // Invert Y
			if (i === 0) d.push(`M ${svgX} ${svgY}`);
			else d.push(`L ${svgX} ${svgY}`);
		}
		return d.join(' ');
	}, [points]);

	const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
		const rect = svgRef.current?.getBoundingClientRect();
		if (!rect) return;
		const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		const ny = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));

		// Check if clicked near existing point
		const hitIdx = points.findIndex((p) => Math.hypot(p.x - nx, p.y - ny) < 0.08);
		if (hitIdx !== -1) {
			setDraggingIdx(hitIdx);
			(e.target as Element).setPointerCapture(e.pointerId);
		} else {
			// Add new point
			const newPoints = [...points, { x: nx, y: ny }].sort((a, b) => a.x - b.x);
			onChange(newPoints);
			const newIdx = newPoints.findIndex((p) => p.x === nx && p.y === ny);
			setDraggingIdx(newIdx);
			(e.target as Element).setPointerCapture(e.pointerId);
		}
	};

	const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
		if (draggingIdx === null) return;
		const rect = svgRef.current?.getBoundingClientRect();
		if (!rect) return;
		let nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		const ny = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));

		// Keep endpoints pinned to x=0 and x=1
		if (draggingIdx === 0) nx = 0;
		if (draggingIdx === points.length - 1) nx = 1;

		const updated = points.map((p, i) => (i === draggingIdx ? { x: nx, y: ny } : p));
		onChange(updated);
	};

	const handlePointerUp = () => {
		setDraggingIdx(null);
	};

	const handleDoubleClick = (idx: number) => {
		if (idx === 0 || idx === points.length - 1) return; // Cannot delete endpoints
		const filtered = points.filter((_, i) => i !== idx);
		onChange(filtered);
	};

	return (
		<svg
			ref={svgRef}
			viewBox="0 0 100 100"
			className="curves-svg-box"
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
		>
			{/* Grid lines */}
			<line x1="25" y1="0" x2="25" y2="100" stroke="#222" strokeWidth="0.5" />
			<line x1="50" y1="0" x2="50" y2="100" stroke="#222" strokeWidth="0.5" />
			<line x1="75" y1="0" x2="75" y2="100" stroke="#222" strokeWidth="0.5" />
			<line x1="0" y1="25" x2="100" y2="25" stroke="#222" strokeWidth="0.5" />
			<line x1="0" y1="50" x2="100" y2="50" stroke="#222" strokeWidth="0.5" />
			<line x1="0" y1="75" x2="100" y2="75" stroke="#222" strokeWidth="0.5" />

			{/* Diagonal identity line */}
			<line x1="0" y1="100" x2="100" y2="0" stroke="#444" strokeWidth="0.8" strokeDasharray="2 2" />

			{/* Spline curve path */}
			<path d={pathData} fill="none" stroke={channelColor} strokeWidth="1.8" />

			{/* Control points */}
			{points.map((p, i) => (
				<circle
					key={i}
					cx={p.x * 100}
					cy={(1 - p.y) * 100}
					r="3.5"
					fill={channelColor}
					stroke="#000"
					strokeWidth="1"
					onDoubleClick={(e) => {
						e.stopPropagation();
						handleDoubleClick(i);
					}}
				/>
			))}
		</svg>
	);
}

interface ColorWheelProps {
	title: string;
	r: number;
	g: number;
	b: number;
	onChange: (r: number, g: number, b: number) => void;
}

function ColorWheel({ title, r, g, b, onChange }: ColorWheelProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [isDragging, setIsDragging] = useState(false);

	// Convert RGB offsets to 2D disc coordinates (x, y)
	const discX = (r - b) * 0.5;
	const discY = -(g - (r + b) * 0.5) * 0.5;

	const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
		setIsDragging(true);
		(e.target as Element).setPointerCapture(e.pointerId);
		updateFromPointer(e);
	};

	const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
		if (!isDragging) return;
		updateFromPointer(e);
	};

	const handlePointerUp = () => {
		setIsDragging(false);
	};

	const handleDoubleClick = () => {
		onChange(0, 0, 0); // Reset puck
	};

	const updateFromPointer = (e: React.PointerEvent<SVGSVGElement>) => {
		const rect = svgRef.current?.getBoundingClientRect();
		if (!rect) return;
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		const radius = rect.width / 2;

		let dx = (e.clientX - centerX) / radius;
		let dy = (e.clientY - centerY) / radius;
		const dist = Math.hypot(dx, dy);
		if (dist > 1) {
			dx /= dist;
			dy /= dist;
		}

		// Convert dx, dy back to RGB deltas
		const angle = Math.atan2(-dy, dx);
		const sat = Math.min(1, dist);
		const newR = Math.max(-1, Math.min(1, Math.cos(angle) * sat));
		const newG = Math.max(-1, Math.min(1, Math.sin(angle) * sat));
		const newB = Math.max(-1, Math.min(1, -Math.cos(angle) * sat));
		onChange(newR, newG, newB);
	};

	// Center point is 50, 50 in 100x100 viewBox
	const puckSvgX = 50 + discX * 45;
	const puckSvgY = 50 + discY * 45;

	return (
		<div className="wheel-card">
			<span className="wheel-title">{title}</span>
			<svg
				ref={svgRef}
				viewBox="0 0 100 100"
				className="wheel-svg"
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onDoubleClick={handleDoubleClick}
				role="slider"
				aria-label={title}
			>
				<defs>
					<radialGradient id="wheelGrad">
						<stop offset="0%" stopColor="#808080" />
						<stop offset="100%" stopColor="#333333" />
					</radialGradient>
				</defs>
				<circle cx="50" cy="50" r="48" fill="url(#wheelGrad)" stroke="#444" strokeWidth="1" />
				<line x1="50" y1="2" x2="50" y2="98" stroke="#555" strokeWidth="0.5" />
				<line x1="2" y1="50" x2="98" y2="50" stroke="#555" strokeWidth="0.5" />
				<circle cx={puckSvgX} cy={puckSvgY} r="5" className="wheel-puck" />
			</svg>
		</div>
	);
}
