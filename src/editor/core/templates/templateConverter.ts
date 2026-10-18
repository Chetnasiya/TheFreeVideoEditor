import type { Clip, Track, TrackId, ClipId, PropertyId, Keyframe } from '../types';
import type {
	MotionGraphicTemplate,
	PublishedTemplateParam,
	TemplateCategory
} from './templateTypes';
import {
	GRAPHIC_TEMPLATES,
	createGraphicClip,
	computeColorRuns,
	type GraphicTemplate,
	type GraphicCategory
} from '../text/graphicsTemplates';
import { createTemplateFromClips } from './templateService';

function hexToRgba(hex: string, alpha = 1): { r: number; g: number; b: number; a: number } {
	let clean = hex.replace('#', '').trim();
	if (clean.length === 3) {
		clean = clean
			.split('')
			.map((c) => c + c)
			.join('');
	}
	const num = parseInt(clean, 16);
	if (Number.isNaN(num)) return { r: 1, g: 1, b: 1, a: alpha };
	const r = ((num >> 16) & 255) / 255;
	const g = ((num >> 8) & 255) / 255;
	const b = (num & 255) / 255;
	return { r, g, b, a: alpha };
}

function arrayToRgba(arr?: unknown): { r: number; g: number; b: number; a: number } {
	if (Array.isArray(arr) && arr.length >= 3) {
		return {
			r: arr[0] ?? 1,
			g: arr[1] ?? 1,
			b: arr[2] ?? 1,
			a: arr[3] ?? 1
		};
	}
	return { r: 1, g: 1, b: 1, a: 1 };
}

export function mapCategory(cat: GraphicCategory): TemplateCategory {
	switch (cat) {
		case 'kinetic':
			return 'Kinetic';
		case 'lower-third':
			return 'Lower Thirds';
		case 'titles':
			return 'Titles';
		case 'social':
			return 'Social';
		case 'callouts':
			return 'Callouts';
		case 'badge':
			return 'Badges';
		case 'neon':
			return 'Kinetic';
		case 'minimal':
			return 'Titles';
		default:
			return 'Titles';
	}
}

/**
 * Converts a legacy GraphicTemplate into a full-featured, multi-layer,
 * animated Motion Graphic Template (.tfvetemplate).
 */
export function convertGraphicTemplateToMotionTemplate(
	template: GraphicTemplate,
	duration: number = 5_000_000
): MotionGraphicTemplate {
	// 1. Build the primary animated text clip
	const textClip = createGraphicClip(template.id, 0, duration, template.defaultText);
	textClip.id = `clip_text_${template.id}` as ClipId;

	// Extract primary text fill color for published params
	const primaryColor =
		textClip.source?.type === 'text' && textClip.source.colorRuns?.[0]?.fillColor
			? textClip.source.colorRuns[0].fillColor
			: template.properties?.['text.fillColor']
				? arrayToRgba(template.properties['text.fillColor'])
				: { r: 1, g: 1, b: 1, a: 1 };

	// 2. Build the Shape / Background frame if applicable
	const frameStyle = template.frameStyle || template.box?.frameStyle;
	let shapeClip: Clip | null = null;

	if (frameStyle && frameStyle !== 'none') {
		const shapeId = `clip_shape_${template.id}` as ClipId;
		let shapeType: 'rect' | 'circle' | 'ellipse' | 'triangle' | 'diamond' | 'star' = 'rect';
		let width = 560;
		let height = 220;
		let cornerRadius = 12;
		let fillColor: { r: number; g: number; b: number; a: number } = { r: 0.1, g: 0.1, b: 0.15, a: 0.9 };
		let strokeColor: { r: number; g: number; b: number; a: number } | undefined = undefined;
		let strokeWidth = 0;
		let shapeRotation = 0;

		const basePos = textClip.properties?.position
			? (textClip.properties.position as any).value ?? [0, 0]
			: [0, 0];
		let shapePos: [number, number] = [basePos[0], basePos[1]];

		switch (frameStyle) {
			case 'card':
				shapeType = 'rect';
				width = 620;
				height = 250;
				cornerRadius = 16;
				fillColor = template.properties?.['text.backgroundBoxColor']
					? arrayToRgba(template.properties['text.backgroundBoxColor'])
					: template.previewColors?.accent
						? hexToRgba(template.previewColors.accent, 1)
						: { r: 0.98, g: 0.98, b: 0.98, a: 1 };
				break;

			case 'circle':
				shapeType = 'circle';
				width = 380;
				height = 380;
				fillColor = { r: 0, g: 0, b: 0, a: 0 };
				strokeColor = template.accentColor;
				strokeWidth = 3;
				break;

			case 'frame':
			case 'cinematic-box':
			case 'divided-box':
				shapeType = 'rect';
				width = 600;
				height = 230;
				cornerRadius = 4;
				fillColor = { r: 0, g: 0, b: 0, a: 0 };
				strokeColor = template.accentColor;
				strokeWidth = 2.5;
				break;

			case 'badge-header':
			case 'title-badge':
			case 'social-pill':
				shapeType = 'rect';
				width = 460;
				height = 68;
				cornerRadius = 34;
				fillColor = template.accentColor;
				break;

			case 'lower-third-line':
				shapeType = 'rect';
				width = 620;
				height = 5;
				cornerRadius = 2;
				fillColor = template.accentColor;
				shapePos = [basePos[0], basePos[1] + 48];
				break;

			case 'lower-third-glass':
				shapeType = 'rect';
				width = 660;
				height = 110;
				cornerRadius = 10;
				fillColor = { r: 0.06, g: 0.09, b: 0.16, a: 0.85 };
				strokeColor = template.accentColor;
				strokeWidth = 1.5;
				shapePos = [basePos[0], basePos[1]];
				break;

			case 'accent-bar':
				shapeType = 'rect';
				width = 6;
				height = 105;
				cornerRadius = 3;
				fillColor = template.accentColor;
				shapePos = [basePos[0] - 220, basePos[1]];
				break;

			case 'callout-pointer':
				shapeType = 'rect';
				width = 360;
				height = 84;
				cornerRadius = 12;
				fillColor = { r: 0.08, g: 0.1, b: 0.16, a: 0.92 };
				strokeColor = template.accentColor;
				strokeWidth = 2;
				break;

			case 'split-slash':
				shapeType = 'rect';
				width = 560;
				height = 5;
				cornerRadius = 3;
				fillColor = template.accentColor;
				shapeRotation = -12;
				break;

			case 'diagonal-repeat':
				shapeType = 'rect';
				width = 660;
				height = 230;
				cornerRadius = 8;
				fillColor = { r: 0.04, g: 0.05, b: 0.08, a: 0.7 };
				strokeColor = template.accentColor;
				strokeWidth = 2;
				shapeRotation = -18;
				break;

			default:
				shapeType = 'rect';
				width = 560;
				height = 200;
				cornerRadius = 8;
				fillColor = { r: 0.08, g: 0.08, b: 0.12, a: 0.75 };
				break;
		}

		// Replicate text keyframes onto shape clip so shape animates in sync
		const shapeProps: Record<PropertyId, any> = {
			position: { value: shapePos },
			rotation: { value: shapeRotation }
		};

		if (textClip.properties) {
			for (const propId of ['position', 'scale', 'opacity'] as const) {
				const p = textClip.properties[propId];
				if (p && 'keyframes' in p && Array.isArray((p as any).keyframes)) {
					if (propId === 'position') {
						const dx = shapePos[0] - basePos[0];
						const dy = shapePos[1] - basePos[1];
						shapeProps.position = {
							keyframes: (p as any).keyframes.map((kf: any) => ({
								...kf,
								value: [kf.value[0] + dx, kf.value[1] + dy]
							}))
						};
					} else {
						shapeProps[propId] = JSON.parse(JSON.stringify(p));
					}
				}
			}
		}

		shapeClip = {
			id: shapeId,
			start: 0,
			duration,
			sourceIn: 0,
			sourceOut: duration,
			speed: 1,
			volume: 0,
			source: {
				type: 'shape',
				shapeType,
				width,
				height,
				cornerRadius,
				fillColor,
				strokeColor,
				strokeWidth
			},
			properties: shapeProps,
			effects: []
		};
	}

	// 3. Define Published Editable Parameters
	const publishedParams: PublishedTemplateParam[] = [
		{
			id: 'param_title_text',
			name: 'Title Text',
			type: 'text',
			targetClipId: textClip.id,
			targetProperty: 'text.content',
			defaultValue: template.defaultText
		},
		{
			id: 'param_font_family',
			name: 'Font Family',
			type: 'font',
			targetClipId: textClip.id,
			targetProperty: 'text.fontFamily',
			defaultValue: template.style.fontFamily || 'Montserrat'
		},
		{
			id: 'param_text_color',
			name: 'Text Color',
			type: 'color',
			targetClipId: textClip.id,
			targetProperty: 'text.fill',
			defaultValue: primaryColor
		}
	];

	if (shapeClip && shapeClip.source?.type === 'shape') {
		publishedParams.push({
			id: 'param_shape_fill',
			name: 'Accent / Background Color',
			type: 'color',
			targetClipId: shapeClip.id,
			targetProperty: 'shape.fill',
			defaultValue: shapeClip.source.fillColor || template.accentColor
		});

		if (shapeClip.source.strokeWidth && shapeClip.source.strokeWidth > 0 && shapeClip.source.strokeColor) {
			publishedParams.push({
				id: 'param_shape_stroke',
				name: 'Border Color',
				type: 'color',
				targetClipId: shapeClip.id,
				targetProperty: 'shape.stroke',
				defaultValue: shapeClip.source.strokeColor
			});
		}
	}

	// 4. Organize into tracks (Shape background at bottom track, Text on top)
	const tracks: Track[] = [];
	const clipsToPackage: Clip[] = [];

	if (shapeClip) {
		clipsToPackage.push(shapeClip);
		tracks.push({
			id: 'track_bg' as TrackId,
			kind: 'video',
			name: 'Background Frame',
			muted: false,
			locked: false,
			hidden: false,
			clips: [shapeClip]
		});
	}

	clipsToPackage.push(textClip);
	tracks.push({
		id: 'track_text' as TrackId,
		kind: 'video',
		name: 'Title Text',
		muted: false,
		locked: false,
		hidden: false,
		clips: [textClip]
	});

	// 5. Package via createTemplateFromClips for automatic bounding box & coordinate centering
	const motionTemplate = createTemplateFromClips({
		name: template.name,
		category: mapCategory(template.category),
		description: template.description,
		author: 'TheFreeVideoEditor',
		clips: clipsToPackage,
		tracks,
		publishedParams,
		responsiveTiming: {
			introDuration: template.inDurationUs || 500_000,
			outroDuration: template.outDurationUs || 400_000
		}
	});

	// Preserve exact original template ID
	motionTemplate.id = template.id;

	return motionTemplate;
}

/**
 * Converts all 34 built-in GraphicTemplates into full MotionGraphicTemplates (.tfvetemplate).
 */
export function convertAllGraphicTemplates(): MotionGraphicTemplate[] {
	return GRAPHIC_TEMPLATES.map((tpl) => convertGraphicTemplateToMotionTemplate(tpl));
}

