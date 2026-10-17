import { useState, useMemo, type DragEvent } from 'react';
import { useEditorStoreApi } from '../../state/EditorProvider';
import {
	SHAPE_PRESETS,
	type ShapeConfig,
	type ShapeKind,
	type RgbaColor
} from '../../core/shapes/shapeTypes';
import { ColorPickerField } from '../inspector/ColorPickerField';
import { ShapeIcon, SHAPE_GEOMETRIES } from './ShapeIcons';
import { setTransparentDragImage, startDragGhost, stopDragGhost } from '../drag/dragOverlayService';
import './shapes.css';

function rgbaToString(c?: RgbaColor): string {
	if (!c) return 'transparent';
	return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`;
}

/**
 * Clean SVG renderer for displaying shapes crisply inside cards and previews.
 */
export function ShapeSvgPreview({ config }: { config: ShapeConfig }) {
	const w = config.width || 100;
	const h = config.height || 100;
	const strokeWidth = config.strokeWidth ?? 2;
	const stroke = rgbaToString(config.strokeColor ?? { r: 1, g: 1, b: 1, a: 0.9 });
	const fill = config.shapeType === 'line' ? 'transparent' : rgbaToString(config.fillColor);
	const dash =
		config.strokeStyle === 'dashed' ? '6,4' : config.strokeStyle === 'dotted' ? '2,3' : undefined;

	const pad = Math.max(10, strokeWidth * 2);
	const viewBox = `0 0 ${w + pad * 2} ${h + pad * 2}`;
	const cx = (w + pad * 2) / 2;
	const cy = (h + pad * 2) / 2;
	const x = pad;
	const y = pad;

	return (
		<svg viewBox={viewBox} width="100%" height="100%" style={{ overflow: 'visible' }}>
			{config.shapeType === 'rect' && (
				<rect
					x={x}
					y={y}
					width={w}
					height={h}
					fill={fill}
					stroke={stroke}
					strokeWidth={strokeWidth}
					strokeDasharray={dash}
				/>
			)}
			{config.shapeType === 'rounded-rect' && (
				<rect
					x={x}
					y={y}
					width={w}
					height={h}
					rx={config.cornerRadius ?? 16}
					fill={fill}
					stroke={stroke}
					strokeWidth={strokeWidth}
					strokeDasharray={dash}
				/>
			)}
			{config.shapeType === 'circle' && (
				<circle
					cx={cx}
					cy={cy}
					r={Math.min(w, h) / 2}
					fill={fill}
					stroke={stroke}
					strokeWidth={strokeWidth}
					strokeDasharray={dash}
				/>
			)}
			{config.shapeType === 'ellipse' && (
				<ellipse
					cx={cx}
					cy={cy}
					rx={w / 2}
					ry={h / 2}
					fill={fill}
					stroke={stroke}
					strokeWidth={strokeWidth}
					strokeDasharray={dash}
				/>
			)}
			{config.shapeType === 'triangle' && (
				<polygon
					points={`${cx},${y} ${x + w},${y + h} ${x},${y + h}`}
					fill={fill}
					stroke={stroke}
					strokeWidth={strokeWidth}
					strokeDasharray={dash}
				/>
			)}
			{config.shapeType === 'diamond' && (
				<polygon
					points={`${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`}
					fill={fill}
					stroke={stroke}
					strokeWidth={strokeWidth}
					strokeDasharray={dash}
				/>
			)}
			{config.shapeType === 'star' && (
				<polygon
					points={(() => {
						const pts = config.points ?? 5;
						const outerR = Math.min(w, h) / 2;
						const innerR = outerR * (config.innerRadius ?? 0.45);
						const res: string[] = [];
						for (let i = 0; i < 2 * pts; i++) {
							const r = i % 2 === 0 ? outerR : innerR;
							const angle = (i * Math.PI) / pts - Math.PI / 2;
							res.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
						}
						return res.join(' ');
					})()}
					fill={fill}
					stroke={stroke}
					strokeWidth={strokeWidth}
					strokeDasharray={dash}
				/>
			)}
			{config.shapeType === 'polygon' && (
				<polygon
					points={(() => {
						const sides = config.points ?? 6;
						const r = Math.min(w, h) / 2;
						const res: string[] = [];
						for (let i = 0; i < sides; i++) {
							const angle = (i * Math.PI * 2) / sides - Math.PI / 2;
							res.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
						}
						return res.join(' ');
					})()}
					fill={fill}
					stroke={stroke}
					strokeWidth={strokeWidth}
					strokeDasharray={dash}
				/>
			)}
			{config.shapeType === 'heart' && (
				<path
					d={`M ${cx} ${y + h * 0.3} C ${cx} ${y}, ${x} ${y}, ${x} ${y + h * 0.35} C ${x} ${y + h * 0.65}, ${cx} ${y + h * 0.85}, ${cx} ${y + h} C ${cx} ${y + h * 0.85}, ${x + w} ${y + h * 0.65}, ${x + w} ${y + h * 0.35} C ${x + w} ${y}, ${cx} ${y}, ${cx} ${y + h * 0.3} Z`}
					fill={fill}
					stroke={stroke}
					strokeWidth={strokeWidth}
					strokeDasharray={dash}
				/>
			)}
			{config.shapeType === 'arrow' && (
				<polygon
					points={`${x},${cy - h * 0.2} ${x + w * 0.6},${cy - h * 0.2} ${x + w * 0.6},${y} ${x + w},${cy} ${x + w * 0.6},${y + h} ${x + w * 0.6},${cy + h * 0.2} ${x},${cy + h * 0.2}`}
					fill={fill}
					stroke={stroke}
					strokeWidth={strokeWidth}
					strokeDasharray={dash}
				/>
			)}
			{config.shapeType === 'line' && (
				<line
					x1={x}
					y1={cy}
					x2={x + w}
					y2={cy}
					stroke={stroke}
					strokeWidth={strokeWidth || 4}
					strokeDasharray={dash}
					strokeLinecap="round"
				/>
			)}
			{config.shapeType === 'callout' && (
				<path
					d={`M ${x + 12} ${y} H ${x + w - 12} A 12 12 0 0 1 ${x + w} ${y + 12} V ${y + h * 0.7} A 12 12 0 0 1 ${x + w - 12} ${y + h * 0.8} H ${x + w * 0.4} L ${x + w * 0.2} ${y + h} L ${x + w * 0.25} ${y + h * 0.8} H ${x + 12} A 12 12 0 0 1 ${x} ${y + h * 0.7} V ${y + 12} A 12 12 0 0 1 ${x + 12} ${y} Z`}
					fill={fill}
					stroke={stroke}
					strokeWidth={strokeWidth}
					strokeDasharray={dash}
				/>
			)}
			{config.shapeType === 'badge' && (
				<polygon
					points={(() => {
						const pts = config.points ?? 12;
						const outerR = Math.min(w, h) / 2;
						const innerR = outerR * (config.innerRadius ?? 0.82);
						const res: string[] = [];
						for (let i = 0; i < 2 * pts; i++) {
							const r = i % 2 === 0 ? outerR : innerR;
							const angle = (i * Math.PI) / pts;
							res.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
						}
						return res.join(' ');
					})()}
					fill={fill}
					stroke={stroke}
					strokeWidth={strokeWidth}
					strokeDasharray={dash}
				/>
			)}
		</svg>
	);
}

export function ShapesPanel() {
	const store = useEditorStoreApi();
	const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');
	const [category, setCategory] = useState<'all' | 'basic' | 'symbols' | 'badges' | 'neon'>('all');
	const [searchQuery, setSearchQuery] = useState('');

	// Customizer draft state
	const [customConfig, setCustomConfig] = useState<ShapeConfig>({
		shapeType: 'rounded-rect',
		width: 360,
		height: 240,
		fillColor: { r: 0.02, g: 0.71, b: 0.83, a: 1 },
		strokeColor: { r: 1, g: 1, b: 1, a: 0.8 },
		strokeWidth: 3,
		strokeStyle: 'solid',
		cornerRadius: 20,
		shadowColor: { r: 0.02, g: 0.71, b: 0.83, a: 0.6 },
		shadowBlur: 20,
		shadowOffsetX: 0,
		shadowOffsetY: 4
	});

	const filteredPresets = useMemo(() => {
		return SHAPE_PRESETS.filter((item) => {
			if (category !== 'all' && item.category !== category) return false;
			if (
				searchQuery &&
				!item.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
				!item.config.shapeType.toLowerCase().includes(searchQuery.toLowerCase())
			) {
				return false;
			}
			return true;
		});
	}, [category, searchQuery]);

	const handleAddShape = (config: ShapeConfig) => {
		store.getState().addShapeClip(config);
	};

	const handleDragStart = (e: DragEvent<HTMLDivElement>, config: ShapeConfig, name: string) => {
		setTransparentDragImage(e.dataTransfer);
		startDragGhost({
			title: name,
			kind: 'shape',
			badge: 'Shape'
		});
		e.dataTransfer.setData('application/x-tfve-shape', JSON.stringify(config));
		e.dataTransfer.setData('application/x-tfve-shape-name', name);
		e.dataTransfer.setData('text/plain', name);
		e.dataTransfer.effectAllowed = 'copy';
		store.getState().beginTimelineDrag({
			kind: 'shape',
			clipIds: [],
			original: [],
			preview: [],
			pointerStartTime: 0,
			pointerTime: 0,
			shapeConfig: config,
			allowed: true,
			unlink: false
		});
	};

	return (
		<div className="shapes-panel" role="region" aria-label="Shapes Library">
			<div className="shapes-header">
				<div className="shapes-header-row">
					<span className="shapes-title-text">Shapes & Vectors</span>
					<div className="shapes-header-tabs">
						<button
							type="button"
							className={`shapes-tab-btn ${activeTab === 'presets' ? 'is-active' : ''}`}
							onClick={() => setActiveTab('presets')}
						>
							Presets
						</button>
						<button
							type="button"
							className={`shapes-tab-btn ${activeTab === 'custom' ? 'is-active' : ''}`}
							onClick={() => setActiveTab('custom')}
						>
							Customizer
						</button>
					</div>
				</div>

				{activeTab === 'presets' && (
					<>
						<input
							type="text"
							className="shapes-search-input"
							placeholder="Search shapes (e.g. star, arrow, card)..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
						<div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px' }}>
							{(['all', 'basic', 'symbols', 'badges', 'neon'] as const).map((cat) => (
								<button
									key={cat}
									type="button"
									className={`shapes-tab-btn ${category === cat ? 'is-active' : ''}`}
									style={{ textTransform: 'capitalize' }}
									onClick={() => setCategory(cat)}
								>
									{cat}
								</button>
							))}
						</div>
					</>
				)}
			</div>

			<div className="shapes-content">
				{activeTab === 'presets' ? (
					<div className="shapes-grid">
						{filteredPresets.map((preset) => (
							<div
								key={preset.id}
								className="shape-card"
								draggable
								onDragStart={(e) => handleDragStart(e, preset.config, preset.name)}
								onDragEnd={() => {
									stopDragGhost();
									store.getState().cancelTimelineDrag();
								}}
								onClick={() => handleAddShape(preset.config)}
								title={`Click or drag "${preset.name}" onto timeline`}
							>
								<div className="shape-card-preview">
									<ShapeSvgPreview config={preset.config} />
								</div>
								<div className="shape-card-info">
									<span className="shape-card-name">{preset.name}</span>
									<button
										type="button"
										className="shape-card-add-btn"
										title="Add to timeline"
										onClick={(e) => {
											e.stopPropagation();
											handleAddShape(preset.config);
										}}
									>
										+
									</button>
								</div>
							</div>
						))}
					</div>
				) : (
					/* Customizer Tab */
					<div className="shape-customizer-panel">
						<div
							className="customizer-preview-box"
							draggable
							onDragStart={(e) => handleDragStart(e, customConfig, 'Custom Shape')}
							onDragEnd={() => {
								stopDragGhost();
								store.getState().cancelTimelineDrag();
							}}
							title="Drag onto timeline or click Add below"
						>
							<ShapeSvgPreview config={customConfig} />
						</div>

						{/* Shape Geometry Selector */}
						<div>
							<span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
								Select Shape
							</span>
							<div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
								{SHAPE_GEOMETRIES.map((item) => (
									<button
										key={item.type}
										type="button"
										style={{
											display: 'flex',
											flexDirection: 'column',
											alignItems: 'center',
											padding: '6px 2px',
											background: customConfig.shapeType === item.type ? 'rgba(56, 189, 248, 0.2)' : '#161622',
											border: customConfig.shapeType === item.type ? '1px solid #38bdf8' : '1px solid #232332',
											borderRadius: '4px',
											color: customConfig.shapeType === item.type ? '#38bdf8' : '#94a3b8',
											cursor: 'pointer'
										}}
										onClick={() =>
											setCustomConfig((prev) => ({
												...prev,
												shapeType: item.type,
												cornerRadius: item.type === 'rounded-rect' ? 20 : 0
											}))
										}
										title={item.label}
									>
										<span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px' }}>
											<ShapeIcon type={item.type} size={16} />
										</span>
										<span style={{ fontSize: '0.58rem', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: 'center' }}>
											{item.label}
										</span>
									</button>
								))}
							</div>
						</div>

						{/* Fill Color */}
						{customConfig.shapeType !== 'line' && (
							<ColorPickerField
								label="Fill Color"
								value={customConfig.fillColor}
								onChange={([r, g, b, a]) => setCustomConfig((prev) => ({ ...prev, fillColor: { r, g, b, a } }))}
								hasAlpha={true}
							/>
						)}

						{/* Stroke */}
						<ColorPickerField
							label="Stroke Color"
							value={customConfig.strokeColor ?? { r: 1, g: 1, b: 1, a: 1 }}
							onChange={([r, g, b, a]) => setCustomConfig((prev) => ({ ...prev, strokeColor: { r, g, b, a } }))}
							hasAlpha={true}
						/>

						<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
							<span style={{ fontSize: '0.7rem', color: '#94a3b8', width: '80px' }}>
								Stroke: {Math.round(customConfig.strokeWidth ?? 2)}px
							</span>
							<input
								type="range"
								min={0}
								max={40}
								value={customConfig.strokeWidth ?? 2}
								onChange={(e) => setCustomConfig((prev) => ({ ...prev, strokeWidth: Number(e.target.value) }))}
								style={{ flex: 1 }}
							/>
						</div>

						{/* Dimensions */}
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
							<div>
								<span style={{ fontSize: '0.65rem', color: '#64748b' }}>Width: {customConfig.width}px</span>
								<input
									type="range"
									min={40}
									max={800}
									value={customConfig.width}
									onChange={(e) => setCustomConfig((prev) => ({ ...prev, width: Number(e.target.value) }))}
									style={{ width: '100%' }}
								/>
							</div>
							<div>
								<span style={{ fontSize: '0.65rem', color: '#64748b' }}>Height: {customConfig.height}px</span>
								<input
									type="range"
									min={40}
									max={800}
									value={customConfig.height}
									onChange={(e) => setCustomConfig((prev) => ({ ...prev, height: Number(e.target.value) }))}
									style={{ width: '100%' }}
								/>
							</div>
						</div>

						<button
							type="button"
							className="shape-create-btn"
							onClick={() => handleAddShape(customConfig)}
						>
							<span>+ Add Shape to Timeline</span>
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
export default ShapesPanel;
