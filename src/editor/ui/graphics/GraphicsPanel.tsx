import { useState, useMemo, type DragEvent } from 'react';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import {
	GRAPHIC_TEMPLATES,
	GRAPHIC_ANIMATION_PRESETS,
	getGraphicTemplate,
	type GraphicTemplate,
	type GraphicCategory
} from '../../core/text/graphicsTemplates';
import { readProperty } from '../../core/properties';
import { ColorPickerField } from '../inspector/ColorPickerField';
import type { Clip } from '../../core/types';
import './graphics.css';

const CATEGORIES: Array<{ id: GraphicCategory; label: string }> = [
	{ id: 'all', label: 'All' },
	{ id: 'kinetic', label: 'Kinetic' },
	{ id: 'minimal', label: 'Minimal' },
	{ id: 'badge', label: 'Badges' },
	{ id: 'neon', label: 'Neon' },
	{ id: 'social', label: 'Social' }
];

export default function GraphicsPanel() {
	const store = useEditorStoreApi();
	const project = useEditorStore((state) => state.project);
	const selectedClipIds = useEditorStore((state) => state.timeline.selection.clipIds);
	const playhead = useEditorStore((state) => state.timeline.playhead);
	const history = useEditorStore((state) => state.history);

	const [searchQuery, setSearchQuery] = useState('');
	const [activeCategory, setActiveCategory] = useState<GraphicCategory>('all');
	const [activeTab, setActiveTab] = useState<'templates' | 'editor'>('templates');
	const [announcement, setAnnouncement] = useState('');

	// Currently selected clip on timeline
	const selectedClip: Clip | null = useMemo(() => {
		if (!project || selectedClipIds.length === 0) return null;
		const id = selectedClipIds[0]!;
		return project.tracks.flatMap((t) => t.clips).find((c) => c.id === id) ?? null;
	}, [project, selectedClipIds]);

	const textSource = selectedClip?.source?.type === 'text' ? selectedClip.source : null;
	const isTextClipSelected = Boolean(textSource && selectedClip);

	const canUndo = history.canUndo;
	const canRedo = history.canRedo;

	const handleUndo = () => {
		const undone = store.getState().undo();
		if (undone) {
			setAnnouncement('Undid graphic change.');
		}
	};

	const handleRedo = () => {
		const redone = store.getState().redo();
		if (redone) {
			setAnnouncement('Redid graphic change.');
		}
	};

	// Capture Undo / Redo even when focused inside inputs or textareas
	const handlePanelKeyDown = (e: React.KeyboardEvent) => {
		const isMod = e.metaKey || e.ctrlKey;
		if (!isMod) return;

		const key = e.key.toLowerCase();
		if (key === 'z') {
			e.preventDefault();
			e.stopPropagation();
			if (e.shiftKey) {
				handleRedo();
			} else {
				handleUndo();
			}
		} else if (key === 'y' && !e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			handleRedo();
		}
	};

	// Filtered templates by category and search query
	const filteredTemplates = useMemo(() => {
		const query = searchQuery.toLowerCase().trim();
		return GRAPHIC_TEMPLATES.filter((tpl) => {
			if (activeCategory !== 'all' && tpl.category !== activeCategory) {
				return false;
			}
			if (!query) return true;
			return (
				tpl.name.toLowerCase().includes(query) ||
				tpl.description.toLowerCase().includes(query) ||
				tpl.defaultText.toLowerCase().includes(query) ||
				tpl.tags.some((tag) => tag.toLowerCase().includes(query))
			);
		});
	}, [searchQuery, activeCategory]);

	// Add template to timeline at playhead
	const handleAddTemplate = (template: GraphicTemplate) => {
		const createdId = store.getState().addGraphicClip(template.id);
		if (createdId) {
			setAnnouncement(`Added ${template.name} graphic to timeline.`);
			setActiveTab('editor');
		} else {
			setAnnouncement(`Could not add graphic. Check timeline track.`);
		}
	};

	// Apply template to currently selected clip
	const handleApplyToSelected = (template: GraphicTemplate) => {
		if (!selectedClip || !isTextClipSelected) return;
		store.getState().applyGraphicTemplate(selectedClip.id, template.id, undefined);
		setAnnouncement(`Applied ${template.name} style to selected clip.`);
	};

	// Drag start handler for timeline drop
	const handleDragStart = (e: DragEvent, template: GraphicTemplate) => {
		e.dataTransfer.setData('application/x-tfve-graphic-template', template.id);
		e.dataTransfer.setData('text/plain', template.id);
		e.dataTransfer.effectAllowed = 'copy';
	};

	// Text edits in Quick Editor
	const handlePrimaryTextChange = (newVal: string) => {
		if (!selectedClip || !textSource) return;
		const currentText = textSource.text || '';
		const lines = currentText.split('\n');
		const rest = lines.slice(1);
		const updatedText = [newVal, ...rest].join('\n');
		store.getState().setTextContent(selectedClip.id, updatedText);
	};

	const handleSecondaryTextChange = (newVal: string) => {
		if (!selectedClip || !textSource) return;
		const currentText = textSource.text || '';
		const lines = currentText.split('\n');
		const head = lines[0] ?? '';
		const rest = lines.slice(2);
		const updatedText = [head, newVal, ...rest].join('\n');
		store.getState().setTextContent(selectedClip.id, updatedText);
	};

	const handleFullTextChange = (newVal: string) => {
		if (!selectedClip || !isTextClipSelected) return;
		store.getState().setTextContent(selectedClip.id, newVal);
	};

	// Color adjustments in Quick Editor
	const handleFillColorChange = (rgba: [number, number, number, number]) => {
		if (!selectedClip || !isTextClipSelected) return;
		store
			.getState()
			.setProperty(selectedClip.id, 'text.fillColor', rgba, { autoKey: true, coalesce: true });
	};

	const handleAccentColorChange = (rgba: [number, number, number, number]) => {
		if (!selectedClip || !isTextClipSelected) return;
		store
			.getState()
			.setGraphicAccentColor(selectedClip.id, { r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3] });
	};

	const handleAnimationChange = (animPresetId: string) => {
		if (!selectedClip || !isTextClipSelected) return;
		store.getState().applyTextAnimation(selectedClip.id, animPresetId);
		setAnnouncement(`Applied animation preset.`);
	};

	const handleClearAnimations = () => {
		if (!selectedClip || !isTextClipSelected) return;
		store.getState().clearTextAnimations(selectedClip.id);
		setAnnouncement(`Cleared animation keyframes.`);
	};

	// Parse current text lines for editor inputs
	const currentText = selectedClip?.source?.type === 'text' ? selectedClip.source.text : '';
	const textLines = currentText.split('\n');
	const primaryLine = textLines[0] ?? '';
	const secondaryLine = textLines[1] ?? '';

	// Active template for selected clip
	const selectedTemplateId =
		selectedClip?.source?.type === 'text' ? selectedClip.source.graphicTemplateId : undefined;
	const selectedTemplate = selectedTemplateId ? getGraphicTemplate(selectedTemplateId) : undefined;

	// Active animation preset for selected clip
	const currentAnimationId =
		selectedClip?.source?.type === 'text'
			? (selectedClip.source.animationPresetId ?? selectedTemplate?.animationPresetId ?? '')
			: '';

	// Active text alignment
	const currentAlignment =
		(selectedClip?.source?.type === 'text' && selectedClip.source.style?.alignment) || 'center';

	// Live primary fill color evaluated at playhead
	const localTime = selectedClip ? Math.max(0, playhead - selectedClip.start) : 0;
	const fillColorValue: [number, number, number, number] = useMemo(() => {
		if (!selectedClip) return [1, 1, 1, 1];
		try {
			const val = readProperty(selectedClip, 'text.fillColor', localTime);
			if (Array.isArray(val) && val.length === 4) {
				return val as [number, number, number, number];
			}
		} catch {}
		return [1, 1, 1, 1];
	}, [selectedClip, localTime]);

	// Live neon accent color evaluated from colorRuns or template default
	const accentColorValue: [number, number, number, number] = useMemo(() => {
		if (
			textSource?.colorRuns &&
			textSource.colorRuns.length > 0 &&
			textSource.colorRuns[0].fillColor
		) {
			const c = textSource.colorRuns[0].fillColor;
			return [c.r, c.g, c.b, c.a ?? 1.0];
		}
		if (selectedTemplate) {
			const c = selectedTemplate.accentColor;
			return [c.r, c.g, c.b, c.a ?? 1.0];
		}
		return [0.706, 1.0, 0.0, 1.0];
	}, [textSource, selectedTemplate]);

	return (
		<div className="graphics-panel" aria-label="Graphics Library" onKeyDown={handlePanelKeyDown}>
			<div className="graphics-header">
				{/* Top row with Mode Nav Tabs and Persistent Undo/Redo */}
				<div className="graphics-header-top-row">
					<div className="graphics-mode-nav" role="tablist" aria-label="Graphics Views">
						<button
							type="button"
							role="tab"
							aria-selected={activeTab === 'templates'}
							className={`graphics-mode-tab ${activeTab === 'templates' ? 'is-active' : ''}`}
							onClick={() => setActiveTab('templates')}
							data-testid="tab-graphic-templates"
						>
							<span>Templates</span>
							<span style={{ opacity: 0.65, fontSize: '10px' }}>{GRAPHIC_TEMPLATES.length}</span>
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={activeTab === 'editor'}
							className={`graphics-mode-tab ${activeTab === 'editor' ? 'is-active' : ''}`}
							onClick={() => setActiveTab('editor')}
							data-testid="tab-graphic-editor"
						>
							<span>Edit Graphic</span>
							{isTextClipSelected && <span className="graphics-live-dot" title="Clip selected" />}
						</button>
					</div>

					<div className="graphics-header-history-btns">
						<button
							type="button"
							className="graphic-undo-btn"
							onClick={handleUndo}
							disabled={!canUndo}
							title={canUndo ? `Undo (${history.undoLabel ?? 'Action'})` : 'Nothing to undo'}
							aria-label="Undo graphic action"
							data-testid="graphics-header-undo-btn"
						>
							↺ Undo
						</button>
						<button
							type="button"
							className="graphic-redo-btn"
							onClick={handleRedo}
							disabled={!canRedo}
							title={canRedo ? `Redo (${history.redoLabel ?? 'Action'})` : 'Nothing to redo'}
							aria-label="Redo graphic action"
							data-testid="graphics-header-redo-btn"
						>
							↻ Redo
						</button>
					</div>
				</div>

				{activeTab === 'templates' && (
					<>
						{/* Search Input */}
						<input
							type="search"
							className="graphics-search-input"
							placeholder="Search graphic templates…"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							aria-label="Search graphic templates"
						/>

						{/* Category Pills */}
						<div className="graphics-category-tabs" role="tablist" aria-label="Graphic categories">
							{CATEGORIES.map((cat) => (
								<button
									key={cat.id}
									type="button"
									role="tab"
									aria-selected={activeCategory === cat.id}
									className={`graphics-cat-btn ${activeCategory === cat.id ? 'is-active' : ''}`}
									onClick={() => setActiveCategory(cat.id)}
								>
									{cat.label}
								</button>
							))}
						</div>
					</>
				)}
			</div>

			<div className="graphics-content">
				{activeTab === 'templates' ? (
					<div className="graphics-grid" role="list">
						{filteredTemplates.length === 0 ? (
							<div className="graphics-empty-state">
								<div className="graphics-empty-title">No templates found</div>
								<div className="graphics-empty-desc">
									No graphic templates match “{searchQuery}”. Try clearing your search filter.
								</div>
							</div>
						) : (
							filteredTemplates.map((template) => {
								const lines = template.defaultText.split('\n');
								return (
									<div
										key={template.id}
										className="graphic-card"
										draggable
										onDragStart={(e) => handleDragStart(e, template)}
										onDoubleClick={() => handleAddTemplate(template)}
										role="listitem"
										aria-label={`${template.name} graphic template`}
										data-testid={`graphic-card-${template.id}`}
									>
										{/* Stylized Visual Preview */}
										<div
											className="graphic-preview-box"
											style={{ background: template.previewColors.background }}
										>
											<div className="graphic-motion-badge">
												<span>⚡</span>
												<span>{template.animationPresetId}</span>
											</div>

											<div className="graphic-preview-text">
												{lines.map((line, idx) => {
													const isHighlight =
														template.highlightWord &&
														line.toLowerCase().includes(template.highlightWord.toLowerCase());
													const color = isHighlight
														? template.previewColors.accent
														: template.previewColors.primary;
													const isFramed =
														template.category === 'badge' && idx === lines.length - 1;

													return (
														<span
															key={idx}
															style={{
																fontFamily: template.style.fontFamily,
																fontWeight: template.style.fontWeight ?? 'bold',
																fontStyle: template.style.fontStyle ?? 'normal',
																letterSpacing: `${Math.min(template.style.letterSpacing ?? 2, 4)}px`,
																color,
																fontSize: idx === 0 && lines.length > 1 ? '15px' : '17px',
																padding: isFramed ? '2px 8px' : undefined,
																border: isFramed
																	? `1px solid ${template.previewColors.accent}`
																	: undefined,
																borderRadius: isFramed ? '4px' : undefined,
																background: isFramed
																	? (template.previewColors.badge ?? 'rgba(0,0,0,0.5)')
																	: undefined,
																textShadow:
																	template.category === 'neon'
																		? `0 0 10px ${template.previewColors.accent}`
																		: undefined
															}}
														>
															{line}
														</span>
													);
												})}
											</div>
										</div>

										{/* Card Footer */}
										<div className="graphic-card-footer">
											<div className="graphic-card-meta">
												<span className="graphic-card-title">{template.name}</span>
												<span className="graphic-card-tag">{template.category}</span>
											</div>
											<div className="graphic-card-actions">
												{isTextClipSelected && (
													<button
														type="button"
														className="graphic-apply-btn"
														onClick={() => handleApplyToSelected(template)}
														title="Apply style to selected clip"
													>
														Apply
													</button>
												)}
												<button
													type="button"
													className="graphic-add-btn"
													onClick={() => handleAddTemplate(template)}
													title="Add to timeline at playhead"
												>
													+ Add
												</button>
											</div>
										</div>
									</div>
								);
							})
						)}
					</div>
				) : (
					/* Quick Editor View */
					<div className="graphics-editor-view">
						{isTextClipSelected ? (
							<>
								<div className="graphics-selected-banner">
									<div className="graphics-selected-title">
										<span>✏</span>
										<span>Selected Graphic</span>
									</div>
									<div className="graphics-banner-actions">
										<button
											type="button"
											className="graphic-undo-btn"
											onClick={handleUndo}
											disabled={!canUndo}
											title={
												canUndo ? `Undo (${history.undoLabel ?? 'Action'})` : 'Nothing to undo'
											}
											aria-label="Undo graphic action"
											data-testid="graphic-undo-btn"
										>
											↺ Undo
										</button>
										<button
											type="button"
											className="graphic-redo-btn"
											onClick={handleRedo}
											disabled={!canRedo}
											title={
												canRedo ? `Redo (${history.redoLabel ?? 'Action'})` : 'Nothing to redo'
											}
											aria-label="Redo graphic action"
											data-testid="graphic-redo-btn"
										>
											↻ Redo
										</button>
										<button
											type="button"
											className="graphic-apply-btn"
											onClick={() => {
												const created = store.getState().addGraphicClip('dream-big');
												if (created) setActiveTab('editor');
											}}
										>
											+ Add Another
										</button>
									</div>
								</div>

								{/* Primary Line */}
								<div className="graphics-field-group">
									<label className="graphics-field-label">Headline / Primary Text</label>
									<input
										type="text"
										className="graphics-text-input"
										value={primaryLine}
										onChange={(e) => handlePrimaryTextChange(e.target.value)}
										placeholder="Headline text…"
									/>
								</div>

								{/* Secondary Line */}
								<div className="graphics-field-group">
									<label className="graphics-field-label">Subtitle / Accent Line</label>
									<input
										type="text"
										className="graphics-text-input"
										value={secondaryLine}
										onChange={(e) => handleSecondaryTextChange(e.target.value)}
										placeholder="Secondary or accent text…"
									/>
								</div>

								{/* Full Multi-line Text Area */}
								<div className="graphics-field-group">
									<label className="graphics-field-label">All Text Lines</label>
									<textarea
										className="graphics-textarea"
										value={currentText}
										onChange={(e) => handleFullTextChange(e.target.value)}
										rows={3}
									/>
								</div>

								{/* Style Template Switcher */}
								<div className="graphics-field-group">
									<label className="graphics-field-label">Graphic Design Template</label>
									<select
										className="graphics-select"
										value={selectedTemplateId ?? ''}
										onChange={(e) => {
											if (selectedClip && e.target.value) {
												store.getState().applyGraphicTemplate(selectedClip.id, e.target.value);
											}
										}}
									>
										<option value="" disabled>
											Choose Template Design…
										</option>
										{GRAPHIC_TEMPLATES.map((tpl) => (
											<option key={tpl.id} value={tpl.id}>
												{tpl.name} ({tpl.category})
											</option>
										))}
									</select>
								</div>

								{/* Animation Presets */}
								<div className="graphics-field-group">
									<div className="graphics-field-label">
										<span>Motion Animation</span>
										<button
											type="button"
											onClick={handleClearAnimations}
											className="graphic-apply-btn"
											style={{ padding: '2px 6px', fontSize: '10px' }}
										>
											Clear
										</button>
									</div>
									<select
										className="graphics-select"
										value={currentAnimationId}
										onChange={(e) => {
											if (e.target.value) handleAnimationChange(e.target.value);
										}}
									>
										<option value="" disabled>
											Choose Animation Preset…
										</option>
										{GRAPHIC_ANIMATION_PRESETS.map((anim) => (
											<option key={anim.id} value={anim.id}>
												{anim.name} ({anim.kind})
											</option>
										))}
									</select>
								</div>

								{/* Color Customization */}
								<div className="graphics-row-2">
									<div className="graphics-field-group" style={{ flex: 1 }}>
										<label className="graphics-field-label">Primary Color</label>
										<ColorPickerField
											value={fillColorValue}
											onChange={handleFillColorChange}
											label="Fill Color"
										/>
									</div>
									<div className="graphics-field-group" style={{ flex: 1 }}>
										<label className="graphics-field-label">Neon Accent Color</label>
										<ColorPickerField
											value={accentColorValue}
											onChange={handleAccentColorChange}
											label="Accent Color"
										/>
									</div>
								</div>

								{/* Alignment Shortcuts */}
								<div className="graphics-field-group">
									<label className="graphics-field-label">Alignment</label>
									<div style={{ display: 'flex', gap: '4px' }}>
										{(['left', 'center', 'right'] as const).map((align) => {
											const isActive = currentAlignment === align;
											return (
												<button
													key={align}
													type="button"
													className={`graphic-apply-btn ${isActive ? 'is-active' : ''}`}
													style={{
														flex: 1,
														textTransform: 'capitalize',
														background: isActive ? '#38bdf8' : undefined,
														color: isActive ? '#0b1120' : undefined,
														borderColor: isActive ? '#38bdf8' : undefined,
														fontWeight: isActive ? 700 : undefined
													}}
													onClick={() => {
														if (selectedClip) {
															store.getState().setTextStyle(selectedClip.id, { alignment: align });
														}
													}}
												>
													{align}
												</button>
											);
										})}
									</div>
								</div>
							</>
						) : (
							<div className="graphics-empty-state">
								<div className="graphics-empty-icon">✨</div>
								<div className="graphics-empty-title">No Text Clip Selected</div>
								<div className="graphics-empty-desc">
									Select any text or graphic clip on the timeline to edit its lines, colors, and
									motion — or click below to insert a new animated graphic title.
								</div>
								<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
									<button
										type="button"
										className="graphics-create-btn"
										onClick={() => {
											const created = store.getState().addGraphicClip('dream-big');
											if (created) setActiveTab('editor');
										}}
									>
										+ Add Graphic Title
									</button>
									{canRedo && (
										<button
											type="button"
											className="graphic-redo-btn"
											style={{ padding: '8px 14px', fontSize: '12px' }}
											onClick={handleRedo}
											title={`Redo: ${history.redoLabel ?? 'Action'}`}
											data-testid="graphics-empty-redo-btn"
										>
											↻ Redo ({history.redoLabel ?? 'Action'})
										</button>
									)}
								</div>
							</div>
						)}
					</div>
				)}
			</div>

			<div className="sr-only" role="status" aria-live="polite">
				{announcement}
			</div>
		</div>
	);
}
