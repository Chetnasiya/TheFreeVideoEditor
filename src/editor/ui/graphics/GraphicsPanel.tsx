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
import { setTransparentDragImage, startDragGhost, stopDragGhost } from '../drag/dragOverlayService';
import type { Clip, GraphicFrameStyle } from '../../core/types';
import './graphics.css';

const CATEGORIES: Array<{ id: GraphicCategory; label: string }> = [
	{ id: 'all', label: 'All' },
	{ id: 'kinetic', label: 'Kinetic' },
	{ id: 'lower-third', label: 'Lower Thirds' },
	{ id: 'titles', label: 'Titles' },
	{ id: 'social', label: 'Social' },
	{ id: 'callouts', label: 'Callouts' },
	{ id: 'badge', label: 'Badges' },
	{ id: 'neon', label: 'Neon' },
	{ id: 'minimal', label: 'Minimal' }
];

const FRAME_STYLES: Array<{ id: GraphicFrameStyle; label: string }> = [
	{ id: 'none', label: 'Standard' },
	{ id: 'card', label: 'White Card' },
	{ id: 'frame', label: 'Outline Frame' },
	{ id: 'circle', label: 'Circle Seal' },
	{ id: 'accent-bar', label: 'Accent Bar' },
	{ id: 'badge-header', label: 'Badge Split' },
	{ id: 'title-badge', label: 'Title Badge' },
	{ id: 'split-slash', label: 'Diagonal Slash' },
	{ id: 'divided-box', label: 'Divided Box' },
	{ id: 'diagonal-repeat', label: 'Marquee Repeat' },
	{ id: 'lower-third-line', label: 'Broadcast Rule' },
	{ id: 'lower-third-glass', label: 'Glass Ribbon' },
	{ id: 'social-pill', label: 'Social Pill' },
	{ id: 'callout-pointer', label: 'Pointer Callout' },
	{ id: 'cinematic-box', label: 'Letterbox Frame' }
];

/**
 * Visual Preview renderer matching the 12 kinetic typography graphics
 * depicted in the reference image.
 */
function GraphicCardPreview({ template }: { template: GraphicTemplate }) {
	const lines = template.defaultText.split('\n');
	const id = template.id;

	if (id === 'trendy-typography-card') {
		return (
			<div className="preview-card-trendy">
				<div className="preview-trendy-box">
					<span className="preview-trendy-sub">{template.primaryLine}</span>
					<span className="preview-trendy-main">{template.secondaryLine}</span>
				</div>
			</div>
		);
	}

	if (id === 'modern-title-split') {
		return (
			<div className="preview-split-title">
				<div className="preview-split-badge">{template.secondaryLine ?? 'NEW TREND'}</div>
				<div className="preview-split-main">
					<span>{template.primaryLine}</span>
					<div className="preview-split-cut-line" />
				</div>
			</div>
		);
	}

	if (id === 'run-wild-side') {
		return (
			<div className="preview-run-wild">
				<div className="preview-wild-slash" />
				<div className="preview-wild-solid">{template.primaryLine}</div>
				<div className="preview-wild-outline">{template.secondaryLine ?? 'WILD SIDE.'}</div>
			</div>
		);
	}

	if (id === 'tutorial-video-badge') {
		return (
			<div className="preview-tutorial-lockup">
				<div className="preview-tutorial-header">
					<span className="preview-tutorial-title">{template.primaryLine}</span>
					<span className="preview-tutorial-badge">
						{template.badgeText ?? template.secondaryLine ?? 'VIDEO'}
					</span>
				</div>
			</div>
		);
	}

	if (id === 'new-trend-diagonal-repeat') {
		return (
			<div className="preview-diagonal-marquee">
				<div className="preview-marquee-scroller">
					<span className="preview-marquee-solid">NEW NEW NEW</span>
					<span className="preview-marquee-outline">TREND TREND TREND</span>
					<span className="preview-marquee-solid">NEW NEW NEW</span>
					<span className="preview-marquee-outline">TREND TREND TREND</span>
				</div>
			</div>
		);
	}

	if (id === 'new-cubed-box') {
		return (
			<div className="preview-cubed-box">
				<div className="preview-cubed-inner">
					<span>NEW</span>
					<span>NEW</span>
					<span>NEW</span>
				</div>
			</div>
		);
	}

	if (id === 'circular-titles-4k' || id === 'trends-af-circle') {
		return (
			<div className="preview-circle-emblem">
				<div className="preview-circle-outer">
					<div className="preview-circle-inner">
						<span>{lines[0]}</span>
						<span style={{ fontSize: '13px', fontWeight: 900 }}>{lines[1]}</span>
					</div>
				</div>
			</div>
		);
	}

	if (id === 'kinetic-typography-bar') {
		return (
			<div className="preview-kinetic-bar">
				<div className="preview-bar-pipe" />
				<div className="preview-bar-text">
					<span>{lines[0]}</span>
					<span>{lines[1]}</span>
				</div>
			</div>
		);
	}

	if (id === 'stylish-boxed-frame') {
		return (
			<div className="preview-stylish-frame">
				<span>{template.primaryLine}</span>
			</div>
		);
	}

	if (id === 'universal-slanted-box') {
		return (
			<div className="preview-slanted-box">
				<span>{template.primaryLine}</span>
			</div>
		);
	}

	if (id === 'new-trend-italic-slash') {
		return (
			<div className="preview-italic-slash">
				<span className="preview-italic-outline">{lines[0]}</span>
				<span className="preview-italic-solid">{lines[1]}</span>
			</div>
		);
	}

	if (id === 'typography-titles-multiline') {
		return (
			<div className="preview-multiline-frame">
				<div className="preview-multiline-top">{lines[0]}</div>
				<div className="preview-multiline-divider" />
				<div className="preview-multiline-bottom">
					<span>{lines[1]}</span>
					<span style={{ fontSize: '11px', letterSpacing: '3px' }}>{lines[2]}</span>
				</div>
			</div>
		);
	}

	if (id === 'broadcast-news-lower-third') {
		return (
			<div className="preview-broadcast-news">
				<span className="preview-broadcast-title">{template.primaryLine}</span>
				<div className="preview-broadcast-rule" />
				<span className="preview-broadcast-sub">{template.secondaryLine}</span>
			</div>
		);
	}

	if (id === 'minimal-creator-tag') {
		return (
			<div className="preview-creator-tag">
				<div className="preview-creator-bar" />
				<div className="preview-creator-text">
					<span className="preview-creator-name">{template.primaryLine}</span>
					<span className="preview-creator-sub">{template.secondaryLine}</span>
				</div>
			</div>
		);
	}

	if (id === 'glass-streamer-badge') {
		return (
			<div className="preview-glass-ribbon">
				<div className="preview-glass-stripe" />
				<div className="preview-glass-content">
					<span className="preview-glass-main">{template.primaryLine}</span>
					<span className="preview-glass-sub">{template.secondaryLine}</span>
				</div>
			</div>
		);
	}

	if (id === 'documentary-speaker-card') {
		return (
			<div className="preview-documentary-card">
				<span className="preview-doc-speaker">{template.primaryLine}</span>
				<div className="preview-doc-rule" />
				<span className="preview-doc-title">{template.secondaryLine}</span>
			</div>
		);
	}

	if (id === 'blockbuster-trailer') {
		return (
			<div className="preview-blockbuster-box">
				<div className="preview-bracket-tl" />
				<div className="preview-bracket-br" />
				<span className="preview-blockbuster-title">{template.primaryLine}</span>
				<span className="preview-blockbuster-sub">{template.secondaryLine}</span>
			</div>
		);
	}

	if (id === 'editorial-serif-title') {
		return (
			<div className="preview-editorial-title">
				<span className="preview-editorial-main">{template.primaryLine}</span>
				<span className="preview-editorial-sub">{template.secondaryLine}</span>
			</div>
		);
	}

	if (id === 'cyberpunk-glitch-title') {
		return (
			<div className="preview-cyber-matrix">
				<span className="preview-cyber-head">{template.primaryLine}</span>
				<span className="preview-cyber-sub">{template.secondaryLine}</span>
			</div>
		);
	}

	if (id === 'minimal-tech-headline') {
		return (
			<div className="preview-tech-headline">
				<div className="preview-tech-indicator" />
				<div>
					<span className="preview-tech-main">{template.primaryLine}</span>
					<span className="preview-tech-sub">{template.secondaryLine}</span>
				</div>
			</div>
		);
	}

	if (id === 'youtube-subscribe-bell') {
		return (
			<div className="preview-yt-pill">
				<div className="preview-yt-btn">
					<span className="preview-yt-text">SUBSCRIBE</span>
					<span className="preview-yt-bell">🔔</span>
				</div>
			</div>
		);
	}

	if (id === 'reels-hook-headline') {
		return (
			<div className="preview-reels-hook">
				<div className="preview-reels-tag">{template.primaryLine}</div>
				<div className="preview-reels-sub">{template.secondaryLine}</div>
			</div>
		);
	}

	if (id === 'instagram-handle-pill') {
		return (
			<div className="preview-ig-pill">
				<span className="preview-ig-at">@</span>
				<span className="preview-ig-handle">{template.primaryLine.replace('@', '')}</span>
			</div>
		);
	}

	if (id === 'podcast-guest-badge') {
		return (
			<div className="preview-podcast-card">
				<span className="preview-pod-ep">{template.primaryLine}</span>
				<span className="preview-pod-name">{template.secondaryLine}</span>
				<span className="preview-pod-role">{template.tertiaryLine}</span>
			</div>
		);
	}

	if (id === 'pointer-feature-callout') {
		return (
			<div className="preview-pointer-callout">
				<div className="preview-callout-bubble">
					<span>{template.primaryLine}</span>
					<span className="preview-callout-sub">{template.secondaryLine}</span>
				</div>
				<div className="preview-pointer-dot" />
			</div>
		);
	}

	if (id === 'verified-pill-badge') {
		return (
			<div className="preview-verified-pill">
				<span className="preview-verified-check">✓</span>
				<span>{template.primaryLine}</span>
			</div>
		);
	}

	if (id === 'kinetic-bold-punch') {
		return (
			<div className="preview-punch-zoom">
				<span className="preview-punch-main">{template.primaryLine}</span>
				<span className="preview-punch-sub">{template.secondaryLine}</span>
			</div>
		);
	}

	if (id === 'kinetic-stagger-stack') {
		return (
			<div className="preview-stagger-stack">
				<span>{lines[0]}</span>
				<span>{lines[1]}</span>
				<span className="preview-stagger-highlight">{lines[2]}</span>
			</div>
		);
	}
	return (
		<div className="graphic-preview-text">
			{lines.map((line, idx) => {
				const isHighlight =
					template.highlightWord &&
					line.toLowerCase().includes(template.highlightWord.toLowerCase());
				const color = isHighlight ? template.previewColors.accent : template.previewColors.primary;
				return (
					<span
						key={idx}
						style={{
							fontFamily: template.style.fontFamily,
							fontWeight: template.style.fontWeight ?? 'bold',
							fontStyle: template.style.fontStyle ?? 'normal',
							letterSpacing: `${Math.min(template.style.letterSpacing ?? 2, 4)}px`,
							color,
							fontSize: idx === 0 && lines.length > 1 ? '14px' : '16px',
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
	);
}

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
		setTransparentDragImage(e.dataTransfer);
		startDragGhost({
			title: template.name,
			kind: 'graphic',
			badge: template.category
		});
		e.dataTransfer.setData('application/x-tfve-graphic-template', template.id);
		e.dataTransfer.setData('application/x-tfve-graphic-name', template.name);
		e.dataTransfer.setData('text/plain', template.id);
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

	const handleTertiaryTextChange = (newVal: string) => {
		if (!selectedClip || !textSource) return;
		const currentText = textSource.text || '';
		const lines = currentText.split('\n');
		const line0 = lines[0] ?? '';
		const line1 = lines[1] ?? '';
		const rest = lines.slice(3);
		const updatedText = [line0, line1, newVal, ...rest].join('\n');
		store.getState().setTextContent(selectedClip.id, updatedText);
	};

	const handleFullTextChange = (newVal: string) => {
		if (!selectedClip || !isTextClipSelected) return;
		store.getState().setTextContent(selectedClip.id, newVal);
	};

	// Frame Style switcher
	const handleFrameStyleChange = (style: GraphicFrameStyle) => {
		if (!selectedClip || !isTextClipSelected) return;
		store.getState().setTextBox(selectedClip.id, { frameStyle: style });
		if (style === 'card') {
			store
				.getState()
				.setProperty(selectedClip.id, 'text.backgroundBoxColor', [1, 1, 1, 1], { autoKey: true });
			store
				.getState()
				.setProperty(selectedClip.id, 'text.fillColor', [0.06, 0.06, 0.08, 1], { autoKey: true });
		} else if (style === 'frame') {
			store.getState().setProperty(selectedClip.id, 'text.boxBorderWidth', 4, { autoKey: true });
			store
				.getState()
				.setProperty(selectedClip.id, 'text.boxBorderColor', [1, 1, 1, 1], { autoKey: true });
		} else if (style === 'circle') {
			store.getState().setProperty(selectedClip.id, 'text.boxBorderWidth', 6, { autoKey: true });
			store
				.getState()
				.setProperty(selectedClip.id, 'text.boxBorderColor', [1, 1, 1, 1], { autoKey: true });
		}
		setAnnouncement(`Changed frame style to ${style}.`);
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

	const handleBackgroundBoxColorChange = (rgba: [number, number, number, number]) => {
		if (!selectedClip || !isTextClipSelected) return;
		store.getState().setProperty(selectedClip.id, 'text.backgroundBoxColor', rgba, {
			autoKey: true,
			coalesce: true
		});
	};

	const handleBorderColorChange = (rgba: [number, number, number, number]) => {
		if (!selectedClip || !isTextClipSelected) return;
		store
			.getState()
			.setProperty(selectedClip.id, 'text.boxBorderColor', rgba, { autoKey: true, coalesce: true });
	};

	// Sliders adjustments
	const handleFontSizeChange = (size: number) => {
		if (!selectedClip || !isTextClipSelected) return;
		store
			.getState()
			.setProperty(selectedClip.id, 'text.fontSize', size, { autoKey: true, coalesce: true });
	};

	const handleLetterSpacingChange = (spacing: number) => {
		if (!selectedClip || !isTextClipSelected) return;
		store.getState().setProperty(selectedClip.id, 'text.letterSpacing', spacing, {
			autoKey: true,
			coalesce: true
		});
	};

	const handleBorderWidthChange = (bw: number) => {
		if (!selectedClip || !isTextClipSelected) return;
		store
			.getState()
			.setProperty(selectedClip.id, 'text.boxBorderWidth', bw, { autoKey: true, coalesce: true });
	};

	const handleCornerRadiusChange = (radius: number) => {
		if (!selectedClip || !isTextClipSelected) return;
		store.getState().setProperty(selectedClip.id, 'text.backgroundBoxRadius', radius, {
			autoKey: true,
			coalesce: true
		});
	};

	const handleBoxPaddingChange = (padding: number) => {
		if (!selectedClip || !isTextClipSelected) return;
		store.getState().setProperty(selectedClip.id, 'text.backgroundBoxPadding', padding, {
			autoKey: true,
			coalesce: true
		});
		store
			.getState()
			.setTextBox(selectedClip.id, { paddingX: padding, paddingY: Math.round(padding * 0.7) });
	};

	const handleRotationChange = (rot: number) => {
		if (!selectedClip || !isTextClipSelected) return;
		store
			.getState()
			.setProperty(selectedClip.id, 'rotation', rot, { autoKey: true, coalesce: true });
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
	const tertiaryLine = textLines[2] ?? '';

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

	// Active frame style
	const currentFrameStyle: GraphicFrameStyle =
		(selectedClip?.source?.type === 'text' && selectedClip.source.box?.frameStyle) ||
		selectedTemplate?.frameStyle ||
		'none';

	// Live evaluated properties at playhead
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

	const backgroundBoxColorValue: [number, number, number, number] = useMemo(() => {
		if (!selectedClip) return [0, 0, 0, 0];
		try {
			const val = readProperty(selectedClip, 'text.backgroundBoxColor', localTime);
			if (Array.isArray(val) && val.length === 4) return val as [number, number, number, number];
		} catch {}
		return [0, 0, 0, 0];
	}, [selectedClip, localTime]);

	const borderColorValue: [number, number, number, number] = useMemo(() => {
		if (!selectedClip) return [1, 1, 1, 1];
		try {
			const val = readProperty(selectedClip, 'text.boxBorderColor', localTime);
			if (Array.isArray(val) && val.length === 4) return val as [number, number, number, number];
		} catch {}
		return [1, 1, 1, 1];
	}, [selectedClip, localTime]);

	const fontSizeValue = useMemo(() => {
		if (!selectedClip) return 56;
		try {
			const val = readProperty(selectedClip, 'text.fontSize', localTime);
			if (typeof val === 'number') return val;
		} catch {}
		return 56;
	}, [selectedClip, localTime]);

	const letterSpacingValue = useMemo(() => {
		if (!selectedClip) return 2;
		try {
			const val = readProperty(selectedClip, 'text.letterSpacing', localTime);
			if (typeof val === 'number') return val;
		} catch {}
		return 2;
	}, [selectedClip, localTime]);

	const borderWidthValue = useMemo(() => {
		if (!selectedClip) return 0;
		try {
			const val = readProperty(selectedClip, 'text.boxBorderWidth', localTime);
			if (typeof val === 'number') return val;
		} catch {}
		return selectedClip.source?.type === 'text' ? (selectedClip.source.box?.borderWidth ?? 0) : 0;
	}, [selectedClip, localTime]);

	const backgroundBoxRadiusValue = useMemo(() => {
		if (!selectedClip) return 0;
		try {
			const val = readProperty(selectedClip, 'text.backgroundBoxRadius', localTime);
			if (typeof val === 'number') return val;
		} catch {}
		return 0;
	}, [selectedClip, localTime]);

	const backgroundBoxPaddingValue = useMemo(() => {
		if (!selectedClip) return 0;
		try {
			const val = readProperty(selectedClip, 'text.backgroundBoxPadding', localTime);
			if (typeof val === 'number') return val;
		} catch {}
		return selectedClip.source?.type === 'text' ? (selectedClip.source.box?.paddingX ?? 0) : 0;
	}, [selectedClip, localTime]);

	const rotationValue = useMemo(() => {
		if (!selectedClip) return 0;
		try {
			const val = readProperty(selectedClip, 'rotation', localTime);
			if (typeof val === 'number') return val;
		} catch {}
		return 0;
	}, [selectedClip, localTime]);

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
								return (
									<div
										key={template.id}
										className="graphic-card"
										draggable
										onDragStart={(e) => handleDragStart(e, template)}
										onDragEnd={() => {
											stopDragGhost();
											store.getState().cancelTimelineDrag();
										}}
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
												<svg
													width="10"
													height="10"
													viewBox="0 0 24 24"
													fill="currentColor"
													stroke="none"
													aria-hidden="true"
												>
													<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
												</svg>
												<span>{template.animationPresetId}</span>
											</div>

											<GraphicCardPreview template={template} />
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
										<svg
											width="13"
											height="13"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
											aria-hidden="true"
										>
											<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
											<path d="m15 5 4 4" />
										</svg>
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
												const created = store.getState().addGraphicClip('trendy-typography-card');
												if (created) setActiveTab('editor');
											}}
										>
											+ Add Another
										</button>
									</div>
								</div>

								{/* Frame & Badge Style Selector */}
								<div className="graphics-field-group">
									<label className="graphics-field-label">Frame & Badge Style</label>
									<div className="graphics-pills-row">
										{FRAME_STYLES.map((f) => (
											<button
												key={f.id}
												type="button"
												className={`graphics-pill-btn ${currentFrameStyle === f.id ? 'is-active' : ''}`}
												onClick={() => handleFrameStyleChange(f.id)}
											>
												{f.label}
											</button>
										))}
									</div>
								</div>

								{/* Text Lines */}
								<div className="graphics-field-group">
									<label className="graphics-field-label">Line 1 (Headline / Tag)</label>
									<input
										type="text"
										className="graphics-text-input"
										value={primaryLine}
										onChange={(e) => handlePrimaryTextChange(e.target.value)}
										placeholder="Headline text…"
									/>
								</div>

								<div className="graphics-field-group">
									<label className="graphics-field-label">Line 2 (Title / Subtitle)</label>
									<input
										type="text"
										className="graphics-text-input"
										value={secondaryLine}
										onChange={(e) => handleSecondaryTextChange(e.target.value)}
										placeholder="Secondary or accent text…"
									/>
								</div>

								<div className="graphics-field-group">
									<label className="graphics-field-label">Line 3 (Badge / Year / Tag)</label>
									<input
										type="text"
										className="graphics-text-input"
										value={tertiaryLine}
										onChange={(e) => handleTertiaryTextChange(e.target.value)}
										placeholder="Extra tag or badge text…"
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

								{/* Colors & Luminescence */}
								<div className="graphics-section-title">Colors & Luminescence</div>

								{/* Quick Gradient Styles */}
								<div className="graphics-field-group">
									<label className="graphics-field-label">Gradient Presets</label>
									<div className="graphics-gradient-pills">
										{[
											{ label: 'Solid', type: 'none' as const, end: undefined, bg: '#ffffff' },
											{
												label: 'Gold',
												type: 'linear-horizontal' as const,
												end: { r: 0.95, g: 0.75, b: 0.25, a: 1 },
												bg: 'linear-gradient(90deg, #fff, #f59e0b)'
											},
											{
												label: 'Sunset',
												type: 'linear-horizontal' as const,
												end: { r: 0.98, g: 0.25, b: 0.45, a: 1 },
												bg: 'linear-gradient(90deg, #f59e0b, #ec4899)'
											},
											{
												label: 'Cyber',
												type: 'linear-horizontal' as const,
												end: { r: 0.0, g: 0.95, b: 0.95, a: 1 },
												bg: 'linear-gradient(90deg, #a855f7, #06b6d4)'
											},
											{
												label: 'Emerald',
												type: 'linear-horizontal' as const,
												end: { r: 0.1, g: 0.9, b: 0.5, a: 1 },
												bg: 'linear-gradient(90deg, #38bdf8, #10b981)'
											},
											{
												label: 'Silver',
												type: 'linear-vertical' as const,
												end: { r: 0.6, g: 0.65, b: 0.75, a: 1 },
												bg: 'linear-gradient(180deg, #ffffff, #64748b)'
											}
										].map((g) => (
											<button
												key={g.label}
												type="button"
												className="graphics-gradient-btn"
												style={{ background: g.bg, color: g.label === 'Solid' ? '#000' : '#fff' }}
												onClick={() => {
													if (selectedClip) {
														store.getState().setTextBox(selectedClip.id, {
															gradientType: g.type,
															gradientColorEnd: g.end
														});
													}
												}}
											>
												{g.label}
											</button>
										))}
									</div>
								</div>

								<div className="graphics-row-2">
									<div className="graphics-field-group" style={{ flex: 1 }}>
										<label className="graphics-field-label">Text Fill Color</label>
										<ColorPickerField
											value={fillColorValue}
											onChange={handleFillColorChange}
											label="Fill Color"
										/>
									</div>
									<div className="graphics-field-group" style={{ flex: 1 }}>
										<label className="graphics-field-label">Accent / Badge</label>
										<ColorPickerField
											value={accentColorValue}
											onChange={handleAccentColorChange}
											label="Accent Color"
										/>
									</div>
								</div>

								<div className="graphics-row-2">
									<div className="graphics-field-group" style={{ flex: 1 }}>
										<label className="graphics-field-label">Card / Box Background</label>
										<ColorPickerField
											value={backgroundBoxColorValue}
											onChange={handleBackgroundBoxColorChange}
											label="Background Box"
										/>
									</div>
									<div className="graphics-field-group" style={{ flex: 1 }}>
										<label className="graphics-field-label">Border / Frame Color</label>
										<ColorPickerField
											value={borderColorValue}
											onChange={handleBorderColorChange}
											label="Border Color"
										/>
									</div>
								</div>

								{/* Geometry & Typography Controls */}
								<div className="graphics-section-title">Geometry & Typography Controls</div>

								{/* Font Family & Weight */}
								<div className="graphics-row-2">
									<div className="graphics-field-group" style={{ flex: 1 }}>
										<label className="graphics-field-label">Font Family</label>
										<select
											className="graphics-select"
											value={
												selectedClip?.source?.type === 'text'
													? selectedClip.source.style?.fontFamily || 'Montserrat'
													: 'Montserrat'
											}
											onChange={(e) => {
												if (selectedClip) {
													store
														.getState()
														.setTextStyle(selectedClip.id, { fontFamily: e.target.value });
												}
											}}
										>
											<option value="Montserrat">Montserrat (Punch)</option>
											<option value="Inter">Inter (Sans)</option>
											<option value="Bebas Neue">Bebas Neue (Condensed)</option>
											<option value="Playfair Display">Playfair Display (Serif)</option>
											<option value="Bodoni Moda">Bodoni Moda (Luxury)</option>
											<option value="JetBrains Mono">JetBrains Mono (Tech)</option>
											<option value="Anton">Anton (Viral)</option>
											<option value="Roboto">Roboto (Clean)</option>
										</select>
									</div>
									<div className="graphics-field-group" style={{ flex: 1 }}>
										<label className="graphics-field-label">Font Weight</label>
										<select
											className="graphics-select"
											value={
												selectedClip?.source?.type === 'text'
													? selectedClip.source.style?.fontWeight || '700'
													: '700'
											}
											onChange={(e) => {
												if (selectedClip) {
													store.getState().setTextStyle(selectedClip.id, {
														fontWeight: e.target.value as
															'normal' | 'bold' | '500' | '600' | '700' | '800' | '900'
													});
												}
											}}
										>
											<option value="normal">Regular (400)</option>
											<option value="500">Medium (500)</option>
											<option value="600">SemiBold (600)</option>
											<option value="bold">Bold (700)</option>
											<option value="800">ExtraBold (800)</option>
											<option value="900">Black (900)</option>
										</select>
									</div>
								</div>

								{/* Keyframe Actions */}
								<div className="graphics-field-group">
									<label className="graphics-field-label">Keyframes & Motion</label>
									<div style={{ display: 'flex', gap: '6px' }}>
										<button
											type="button"
											className="graphic-apply-btn"
											style={{ flex: 1, padding: '6px 8px', fontSize: '11px' }}
											onClick={() => {
												if (selectedClip) {
													store
														.getState()
														.setProperty(selectedClip.id, 'scale', [1, 1], { autoKey: true });
													store
														.getState()
														.setProperty(selectedClip.id, 'opacity', 1, { autoKey: true });
													setAnnouncement('Added motion keyframe at playhead.');
												}
											}}
										>
											◆ Keyframe at Playhead
										</button>
										<button
											type="button"
											className="graphic-apply-btn"
											style={{
												flex: 1,
												padding: '6px 8px',
												fontSize: '11px',
												background: '#182234',
												borderColor: '#38bdf8',
												color: '#38bdf8'
											}}
											onClick={() => {
												store.getState().switchWorkspace('editing');
												setAnnouncement('Opened editing workspace with keyframe graph.');
											}}
										>
											📈 Open Graph Editor
										</button>
									</div>
								</div>

								<div className="graphics-field-group">
									<div className="graphics-field-label">
										<span>Font Size</span>
										<span className="graphics-slider-val">{Math.round(fontSizeValue)}px</span>
									</div>
									<div className="graphics-slider-row">
										<input
											type="range"
											className="graphics-slider"
											min={24}
											max={140}
											value={Math.round(fontSizeValue)}
											onChange={(e) => handleFontSizeChange(Number(e.target.value))}
										/>
									</div>
								</div>

								<div className="graphics-field-group">
									<div className="graphics-field-label">
										<span>Letter Spacing</span>
										<span className="graphics-slider-val">{Math.round(letterSpacingValue)}px</span>
									</div>
									<div className="graphics-slider-row">
										<input
											type="range"
											className="graphics-slider"
											min={-4}
											max={20}
											value={Math.round(letterSpacingValue)}
											onChange={(e) => handleLetterSpacingChange(Number(e.target.value))}
										/>
									</div>
								</div>

								<div className="graphics-field-group">
									<div className="graphics-field-label">
										<span>Border / Outline Width</span>
										<span className="graphics-slider-val">{Math.round(borderWidthValue)}px</span>
									</div>
									<div className="graphics-slider-row">
										<input
											type="range"
											className="graphics-slider"
											min={0}
											max={16}
											value={Math.round(borderWidthValue)}
											onChange={(e) => handleBorderWidthChange(Number(e.target.value))}
										/>
									</div>
								</div>

								<div className="graphics-field-group">
									<div className="graphics-field-label">
										<span>Corner Radius</span>
										<span className="graphics-slider-val">
											{Math.round(backgroundBoxRadiusValue)}px
										</span>
									</div>
									<div className="graphics-slider-row">
										<input
											type="range"
											className="graphics-slider"
											min={0}
											max={40}
											value={Math.round(backgroundBoxRadiusValue)}
											onChange={(e) => handleCornerRadiusChange(Number(e.target.value))}
										/>
									</div>
								</div>

								<div className="graphics-field-group">
									<div className="graphics-field-label">
										<span>Box Padding</span>
										<span className="graphics-slider-val">
											{Math.round(backgroundBoxPaddingValue)}px
										</span>
									</div>
									<div className="graphics-slider-row">
										<input
											type="range"
											className="graphics-slider"
											min={0}
											max={50}
											value={Math.round(backgroundBoxPaddingValue)}
											onChange={(e) => handleBoxPaddingChange(Number(e.target.value))}
										/>
									</div>
								</div>

								<div className="graphics-field-group">
									<div className="graphics-field-label">
										<span>Rotation / Tilt</span>
										<span className="graphics-slider-val">{Math.round(rotationValue)}°</span>
									</div>
									<div className="graphics-slider-row">
										<input
											type="range"
											className="graphics-slider"
											min={-45}
											max={45}
											value={Math.round(rotationValue)}
											onChange={(e) => handleRotationChange(Number(e.target.value))}
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
								<div className="graphics-empty-icon">
									<svg
										width="24"
										height="24"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										aria-hidden="true"
									>
										<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
									</svg>
								</div>
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
											const created = store.getState().addGraphicClip('trendy-typography-card');
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
