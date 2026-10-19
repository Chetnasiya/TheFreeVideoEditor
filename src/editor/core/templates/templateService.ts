import type {
	Clip,
	ClipId,
	Project,
	Sequence,
	SequenceId,
	Time,
	Track
} from '../types';
import type {
	ClipsBoundingBox,
	MotionGraphicTemplate,
	PublishedTemplateParam,
	TemplateCategory
} from './templateTypes';
import { getSequence, viewProject } from '../sequences/access';
import { addTrack } from '../operations/tracks';
import { expandSequenceInstance } from '../sequences/operations';
import { layerCorners } from '../gizmo';
import { getTextDimensions } from '../../services/render/text/rasterizer';
import { readProperty } from '../properties';

function generateId(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
		const random = Math.floor(Math.random() * 16);
		const value = character === 'x' ? random : (random & 0x3) | 0x8;
		return value.toString(16);
	});
}

const TEMPLATES_STORAGE_KEY = 'tfve_custom_motion_templates_v1';

/**
 * Automatically inspects selected clips and returns candidate publishable parameters.
 */
export function detectPublishableProperties(clips: Clip[]): PublishedTemplateParam[] {
	const params: PublishedTemplateParam[] = [];
	let textIndex = 1;
	let shapeIndex = 1;

	for (const clip of clips) {
		if (clip.source?.type === 'text') {
			const labelPrefix = clips.filter((c) => c.source?.type === 'text').length > 1
				? `Text ${textIndex++}`
				: 'Text';

			params.push({
				id: `param_${clip.id}_text`,
				name: `${labelPrefix} Content`,
				type: 'text',
				targetClipId: clip.id,
				targetProperty: 'text.content',
				defaultValue: clip.source.text || clip.text || 'Sample Text'
			});

			params.push({
				id: `param_${clip.id}_font`,
				name: `${labelPrefix} Font`,
				type: 'font',
				targetClipId: clip.id,
				targetProperty: 'text.fontFamily',
				defaultValue: clip.source.style?.fontFamily || 'Montserrat'
			});

			// Resolve default fill color: check properties['text.fillColor'] first, then colorRuns, fallback to pure white
			let defaultColor = { r: 1, g: 1, b: 1, a: 1 };
			try {
				const col = readProperty(clip, 'text.fillColor', 0);
				if (Array.isArray(col) && col.length >= 3) {
					defaultColor = { r: col[0], g: col[1], b: col[2], a: col[3] ?? 1 };
				} else if (col && typeof col === 'object' && 'r' in (col as any)) {
					defaultColor = col as any;
				} else if (clip.source.colorRuns && clip.source.colorRuns[0]?.fillColor) {
					defaultColor = clip.source.colorRuns[0].fillColor;
				}
			} catch {
				if (clip.source.colorRuns && clip.source.colorRuns[0]?.fillColor) {
					defaultColor = clip.source.colorRuns[0].fillColor;
				}
			}

			params.push({
				id: `param_${clip.id}_fill`,
				name: `${labelPrefix} Color`,
				type: 'color',
				targetClipId: clip.id,
				targetProperty: 'text.fill',
				defaultValue: defaultColor
			});

			if (clip.source?.box?.frameStyle === 'accent-bar') {
				let barColor = { r: 0.0, g: 0.82, b: 0.95, a: 1 };
				try {
					const abc = readProperty(clip, 'text.accentBarColor', 0);
					if (Array.isArray(abc) && abc.length >= 3) {
						barColor = { r: abc[0], g: abc[1], b: abc[2], a: abc[3] ?? 1 };
					} else if (clip.source.box.accentBarColor) {
						barColor = clip.source.box.accentBarColor;
					}
				} catch {}

				params.push({
					id: `param_${clip.id}_accent_bar_color`,
					name: `${labelPrefix} Accent Bar`,
					type: 'color',
					targetClipId: clip.id,
					targetProperty: 'text.accentBarColor',
					defaultValue: barColor
				});
			}
		} else if (clip.source?.type === 'shape') {
			const shapeName = clip.source.shapeType
				? clip.source.shapeType.charAt(0).toUpperCase() + clip.source.shapeType.slice(1)
				: `Shape ${shapeIndex++}`;

			params.push({
				id: `param_${clip.id}_shape_fill`,
				name: `${shapeName} Fill`,
				type: 'color',
				targetClipId: clip.id,
				targetProperty: 'shape.fill',
				defaultValue: clip.source.fillColor || { r: 1, g: 0.8, b: 0.2, a: 1 }
			});

			if (clip.source.strokeWidth && clip.source.strokeWidth > 0 && clip.source.strokeColor) {
				params.push({
					id: `param_${clip.id}_shape_stroke`,
					name: `${shapeName} Border`,
					type: 'color',
					targetClipId: clip.id,
					targetProperty: 'shape.stroke',
					defaultValue: clip.source.strokeColor
				});
			}
		} else if (clip.source?.type === 'solid') {
			params.push({
				id: `param_${clip.id}_solid_color`,
				name: 'Solid Color',
				type: 'color',
				targetClipId: clip.id,
				targetProperty: 'solid.color',
				defaultValue: clip.source.color || { r: 0.1, g: 0.1, b: 0.1, a: 1 }
			});
		}
	}

	return params;
}

/**
 * Offsets a clip's transform and keyframed position properties by (dx, dy).
 * When dx, dy are positive, shifts the clip toward center by subtracting dx, dy.
 * Keeps transform.x/y and properties.position synchronized without double-shifting.
 */
export function offsetClipPosition(clip: Clip, dx: number, dy: number): Clip {
	const cloned: Clip = JSON.parse(JSON.stringify(clip));

	let hasPositionProp = false;

	// 1. Offset properties['position'] if present
	if (cloned.properties?.position) {
		hasPositionProp = true;
		const posProp = cloned.properties.position as any;
		if ('value' in posProp && Array.isArray(posProp.value)) {
			posProp.value = [
				Math.round(posProp.value[0] - dx),
				Math.round(posProp.value[1] - dy)
			];
			if (cloned.transform) {
				cloned.transform.x = posProp.value[0];
				cloned.transform.y = posProp.value[1];
			}
		} else if ('keyframes' in posProp && Array.isArray(posProp.keyframes)) {
			posProp.keyframes = posProp.keyframes.map((kf: any) => ({
				...kf,
				value: [
					Math.round(kf.value[0] - dx),
					Math.round(kf.value[1] - dy)
				]
			}));
			if (cloned.transform && posProp.keyframes.length > 0) {
				cloned.transform.x = posProp.keyframes[0].value[0];
				cloned.transform.y = posProp.keyframes[0].value[1];
			}
		}
	}

	// 2. Fallback to separate position.x / position.y properties if position vec2 is not present
	if (!hasPositionProp && (cloned.properties?.['position.x'] || cloned.properties?.['position.y'])) {
		hasPositionProp = true;
		if (cloned.properties['position.x']) {
			const prop = cloned.properties['position.x'] as any;
			if ('value' in prop && typeof prop.value === 'number') {
				prop.value = Math.round(prop.value - dx);
				if (cloned.transform) cloned.transform.x = prop.value;
			} else if ('keyframes' in prop && Array.isArray(prop.keyframes)) {
				prop.keyframes = prop.keyframes.map((kf: any) => ({
					...kf,
					value: Math.round(kf.value - dx)
				}));
				if (cloned.transform && prop.keyframes.length > 0) {
					cloned.transform.x = prop.keyframes[0].value;
				}
			}
		}
		if (cloned.properties['position.y']) {
			const prop = cloned.properties['position.y'] as any;
			if ('value' in prop && typeof prop.value === 'number') {
				prop.value = Math.round(prop.value - dy);
				if (cloned.transform) cloned.transform.y = prop.value;
			} else if ('keyframes' in prop && Array.isArray(prop.keyframes)) {
				prop.keyframes = prop.keyframes.map((kf: any) => ({
					...kf,
					value: Math.round(kf.value - dy)
				}));
				if (cloned.transform && prop.keyframes.length > 0) {
					cloned.transform.y = prop.keyframes[0].value;
				}
			}
		}
	}

	// 3. If no position property, offset transform directly
	if (!hasPositionProp) {
		if (cloned.transform) {
			cloned.transform.x = Math.round((cloned.transform.x ?? 0) - dx);
			cloned.transform.y = Math.round((cloned.transform.y ?? 0) - dy);
		} else {
			cloned.transform = {
				x: -Math.round(dx),
				y: -Math.round(dy),
				scaleX: 1,
				scaleY: 1,
				rotation: 0,
				opacity: 1
			};
		}
	}

	return cloned;
}

/**
 * Calculates the tight composition-space bounding box that actually contains the graphic elements.
 * Returns the dimensions and the center offset relative to the composition center.
 */
export function calculateClipsBoundingBox(
	clips: Clip[],
	projectSettings: { width: number; height: number } = { width: 1920, height: 1080 }
): ClipsBoundingBox {
	if (!clips || clips.length === 0) {
		return {
			width: projectSettings.width,
			height: projectSettings.height,
			originX: 0,
			originY: 0
		};
	}

	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;

	for (const clip of clips) {
		let sourceWidth = 300;
		let sourceHeight = 200;
		let kind: any = clip.source?.type || 'shape';
		let textData: any = undefined;

		if (clip.source?.type === 'text') {
			let fontSize = 48;
			try {
				const val = readProperty(clip, 'text.fontSize', 0);
				if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
					fontSize = val;
				} else if (clip.source.style?.lineHeight && clip.source.style.lineHeight > 10) {
					fontSize = clip.source.style.lineHeight;
				}
			} catch {
				if (clip.source.style?.lineHeight && clip.source.style.lineHeight > 10) {
					fontSize = clip.source.style.lineHeight;
				}
			}

			let letterSpacing = 0;
			try {
				const ls = readProperty(clip, 'text.letterSpacing', 0);
				if (typeof ls === 'number' && Number.isFinite(ls)) letterSpacing = ls;
				else if (typeof clip.source.style?.letterSpacing === 'number') letterSpacing = clip.source.style.letterSpacing;
			} catch {
				if (typeof clip.source.style?.letterSpacing === 'number') letterSpacing = clip.source.style.letterSpacing;
			}

			const text = clip.source.text || clip.text || 'Sample Text';
			const style = {
				fontFamily: 'Montserrat',
				...(clip.source.style || {}),
				letterSpacing
			};
			let dims = { width: 300, height: 100 };
			try {
				dims = getTextDimensions(text, style, clip.source.box, fontSize);
				if (letterSpacing > 0) {
					const longestLine = Math.max(...text.split('\n').map((l) => l.length));
					dims.width += longestLine * letterSpacing;
				}
				if (clip.source.box?.frameStyle === 'accent-bar') {
					const barW = (readProperty(clip, 'text.accentBarWidth', 0) as number) || clip.source.box.accentBarWidth || 16;
					dims.width += barW + 28;
				}
			} catch {
				dims = {
					width: Math.max(100, text.length * (fontSize * 0.6 + letterSpacing)),
					height: Math.max(50, fontSize * 1.3)
				};
			}

			sourceWidth = dims.width;
			sourceHeight = dims.height;
			kind = 'text';
			textData = {
				text,
				style,
				box: clip.source.box,
				fontSize,
				fillColor: { r: 1, g: 1, b: 1, a: 1 },
				strokeColor: { r: 0, g: 0, b: 0, a: 1 },
				strokeWidth: 0,
				letterSpacing,
				lineHeight: 1.2,
				reveal: 1
			};
		} else if (clip.source?.type === 'shape') {
			try {
				sourceWidth = (readProperty(clip, 'shape.width', 0) as number) ?? clip.source.width ?? 300;
				sourceHeight = (readProperty(clip, 'shape.height', 0) as number) ?? clip.source.height ?? 200;
			} catch {
				sourceWidth = clip.source.width ?? 300;
				sourceHeight = clip.source.height ?? 200;
			}
			kind = 'shape';
		} else if (clip.source?.type === 'solid') {
			sourceWidth = projectSettings.width;
			sourceHeight = projectSettings.height;
			kind = 'solid';
		}

		// Sample keyframe times to guarantee animated motion remains inside bounding box
		const sampleTimes: Time[] = [0];
		if (clip.duration > 0) {
			sampleTimes.push(clip.duration);
		}
		if (clip.properties) {
			for (const propKey of ['position', 'scale', 'rotation']) {
				const prop = clip.properties[propKey];
				if (prop && 'keyframes' in prop && Array.isArray(prop.keyframes)) {
					for (const kf of prop.keyframes) {
						if (typeof kf.time === 'number') {
							sampleTimes.push(kf.time);
						}
					}
				}
			}
		}

		for (const t of sampleTimes) {
			let posX = clip.transform?.x ?? 0;
			let posY = clip.transform?.y ?? 0;
			let scaleX = clip.transform?.scaleX ?? 1;
			let scaleY = clip.transform?.scaleY ?? 1;
			let rotation = clip.transform?.rotation ?? 0;
			let anchorX = 0;
			let anchorY = 0;

			try {
				const pos = readProperty(clip, 'position', t) as [number, number];
				if (Array.isArray(pos)) {
					posX = pos[0];
					posY = pos[1];
				}
			} catch {}

			try {
				const sc = readProperty(clip, 'scale', t) as [number, number];
				if (Array.isArray(sc)) {
					scaleX = sc[0];
					scaleY = sc[1];
				}
			} catch {}

			try {
				const rot = readProperty(clip, 'rotation', t) as number;
				if (typeof rot === 'number' && Number.isFinite(rot)) {
					rotation = rot;
				}
			} catch {}

			try {
				const anc = readProperty(clip, 'anchor', t) as [number, number];
				if (Array.isArray(anc)) {
					anchorX = anc[0];
					anchorY = anc[1];
				}
			} catch {}

			const layer = {
				transform: { x: posX, y: posY, scaleX, scaleY, rotation, opacity: 1 },
				anchor: { x: anchorX, y: anchorY },
				fit: 'none' as const,
				kind,
				textData
			};

			const corners = layerCorners(
				layer,
				sourceWidth,
				sourceHeight,
				projectSettings.width,
				projectSettings.height
			);

			for (const pt of corners) {
				if (Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
					minX = Math.min(minX, pt.x);
					maxX = Math.max(maxX, pt.x);
					minY = Math.min(minY, pt.y);
					maxY = Math.max(maxY, pt.y);
				}
			}
		}
	}

	if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX <= minX || maxY <= minY) {
		return {
			width: projectSettings.width,
			height: projectSettings.height,
			originX: 0,
			originY: 0
		};
	}

	const rawWidth = maxX - minX;
	const rawHeight = maxY - minY;

	// If the graphic elements already cover >=95% of the canvas, preserve full canvas
	if (rawWidth >= projectSettings.width * 0.95 && rawHeight >= projectSettings.height * 0.95) {
		return {
			width: projectSettings.width,
			height: projectSettings.height,
			originX: 0,
			originY: 0
		};
	}

	// 48px padding on each side so strokes, shadows, and transform handles don't clip
	const PADDING = 48;
	let w = Math.ceil(rawWidth + PADDING * 2);
	let h = Math.ceil(rawHeight + PADDING * 2);
	// Multiples of 2 for clean GPU texture alignment
	if (w % 2 !== 0) w += 1;
	if (h % 2 !== 0) h += 1;
	w = Math.max(64, Math.min(w, projectSettings.width));
	h = Math.max(64, Math.min(h, projectSettings.height));

	const centerCompX = (minX + maxX) / 2;
	const centerCompY = (minY + maxY) / 2;
	const originX = Math.round(centerCompX - projectSettings.width / 2);
	const originY = Math.round(centerCompY - projectSettings.height / 2);

	return {
		width: w,
		height: h,
		originX,
		originY
	};
}

/**
 * Bundles clips and tracks into a self-contained Motion Graphic Template.
 */
export function createTemplateFromClips(options: {
	name: string;
	category?: TemplateCategory;
	description?: string;
	author?: string;
	clips: Clip[];
	tracks: Track[];
	publishedParams: PublishedTemplateParam[];
	projectSettings?: { width: number; height: number; fps?: number; sampleRate?: number };
	responsiveTiming?: {
		introDuration: Time;
		outroDuration: Time;
	};
}): MotionGraphicTemplate {
	const {
		name,
		category = 'Titles',
		description = '',
		author = 'Creator',
		clips,
		tracks,
		publishedParams,
		projectSettings = { width: 1920, height: 1080 },
		responsiveTiming
	} = options;

	if (clips.length === 0) {
		throw new Error('Cannot create a template from zero clips.');
	}

	const bounds = calculateClipsBoundingBox(clips, projectSettings);
	const originX = bounds.originX;
	const originY = bounds.originY;

	const selectedSet = new Set(clips.map((c) => c.id));
	let earliestStart = Infinity;
	let latestEnd = 0;

	for (const clip of clips) {
		if (clip.start < earliestStart) earliestStart = clip.start;
		const end = clip.start + clip.duration;
		if (end > latestEnd) latestEnd = end;
	}

	const duration = Math.max(1_000_000, latestEnd - earliestStart);

	// Map old clip IDs to normalized template clip IDs
	const clipIdMap = new Map<ClipId, ClipId>();
	clips.forEach((clip, index) => {
		clipIdMap.set(clip.id, `tpl_clip_${index + 1}` as ClipId);
	});

	// Build packaged tracks with time offset so earliest starts at 0,
	// and spatial offset so elements are centered within the tight template sequence canvas
	const packagedTracks: Track[] = tracks
		.map((track, trackIndex) => {
			const trackClips = track.clips.filter((c) => selectedSet.has(c.id));
			if (trackClips.length === 0) return null;

			return {
				id: `tpl_trk_${trackIndex + 1}` as Track['id'],
				kind: track.kind,
				name: track.name || `Layer ${trackIndex + 1}`,
				muted: Boolean(track.muted),
				locked: Boolean(track.locked),
				hidden: Boolean(track.hidden),
				clips: trackClips.map((c) => {
					const newClipId = clipIdMap.get(c.id) || (generateId() as ClipId);
					const shiftedClip = offsetClipPosition(c, originX, originY);
					return {
						...shiftedClip,
						id: newClipId,
						start: c.start - earliestStart
					};
				})
			};
		})
		.filter((t): t is Track => t !== null);

	// Remap published params targetClipIds to match packaged clips
	const remappedParams: PublishedTemplateParam[] = publishedParams.map((param) => {
		const newTargetId = clipIdMap.get(param.targetClipId) || param.targetClipId;
		return {
			...param,
			targetClipId: newTargetId
		};
	});

	return {
		version: 1,
		id: `mogrt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
		name: name.trim() || 'Untitled Motion Template',
		category,
		description,
		author,
		createdAt: Date.now(),
		duration,
		responsiveTiming: responsiveTiming || {
			introDuration: Math.min(800_000, Math.floor(duration * 0.25)),
			outroDuration: Math.min(600_000, Math.floor(duration * 0.2))
		},
		bounds,
		tracks: packagedTracks,
		publishedParams: remappedParams
	};
}

/**
 * Serializes a template to a formatted JSON string with signature.
 */
export function serializeTemplate(template: MotionGraphicTemplate): string {
	return JSON.stringify(
		{
			$schema: 'https://thefreevideoeditor.com/schemas/motion-template-v1.json',
			tfve_type: 'motion_template',
			...template
		},
		null,
		2
	);
}

/**
 * Deserializes and validates a template JSON string.
 */
export function deserializeTemplate(jsonString: string): MotionGraphicTemplate {
	const parsed = JSON.parse(jsonString);
	if (!parsed || typeof parsed !== 'object') {
		throw new Error('Invalid template data: expected JSON object.');
	}

	if (!parsed.name || !Array.isArray(parsed.tracks) || typeof parsed.duration !== 'number') {
		throw new Error('Invalid template format: missing required fields (name, tracks, duration).');
	}

	return {
		version: 1,
		id: parsed.id || `mogrt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
		name: String(parsed.name).trim() || 'Imported Template',
		category: parsed.category || 'Custom',
		description: parsed.description || '',
		author: parsed.author || 'Imported',
		createdAt: parsed.createdAt || Date.now(),
		duration: parsed.duration,
		responsiveTiming: parsed.responsiveTiming,
		bounds: parsed.bounds,
		tracks: parsed.tracks,
		publishedParams: Array.isArray(parsed.publishedParams) ? parsed.publishedParams : [],
		previewThumbnail: parsed.previewThumbnail
	};
}

/**
 * Triggers a client-side download of the .tfvetemplate file.
 */
export function downloadTemplateFile(template: MotionGraphicTemplate): void {
	if (typeof window === 'undefined') return;
	const jsonStr = serializeTemplate(template);
	const blob = new Blob([jsonStr], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	const safeName = template.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
	link.href = url;
	link.download = `${safeName || 'motion-template'}.tfvetemplate`;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

/**
 * LocalStorage management for saved / imported templates.
 */
export function getCustomTemplates(): MotionGraphicTemplate[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
		if (!raw) return [];
		const list = JSON.parse(raw);
		return Array.isArray(list) ? list : [];
	} catch {
		return [];
	}
}

export function saveCustomTemplate(template: MotionGraphicTemplate): void {
	if (typeof window === 'undefined') return;
	try {
		const existing = getCustomTemplates().filter((t) => t.id !== template.id);
		existing.unshift(template);
		localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(existing));
	} catch (e) {
		console.error('Failed to save template to localStorage:', e);
	}
}

export function deleteCustomTemplate(templateId: string): void {
	if (typeof window === 'undefined') return;
	try {
		const existing = getCustomTemplates().filter((t) => t.id !== templateId);
		localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(existing));
	} catch (e) {
		console.error('Failed to delete template from localStorage:', e);
	}
}

/**
 * Applies user parameter overrides to a sequence clone in real time.
 */
export function applyParamOverridesToSequence(
	sequence: Sequence,
	publishedParams: PublishedTemplateParam[],
	overrides: Record<string, any>
): Sequence {
	if (!overrides || Object.keys(overrides).length === 0) {
		return sequence;
	}

	const cloned: Sequence = JSON.parse(JSON.stringify(sequence));
	const paramMap = new Map<string, PublishedTemplateParam>();
	publishedParams.forEach((p) => paramMap.set(p.id, p));

	for (const [paramId, value] of Object.entries(overrides)) {
		const param = paramMap.get(paramId);
		if (!param || value === undefined) continue;

		for (const track of cloned.tracks) {
			for (const clip of track.clips) {
				if (clip.id === param.targetClipId) {
					switch (param.targetProperty) {
						case 'text.content':
							clip.text = String(value);
							if (clip.source?.type === 'text') {
								clip.source.text = String(value);
							}
							break;

						case 'text.fontFamily':
							if (clip.source?.type === 'text') {
								clip.source.style = {
									...clip.source.style,
									fontFamily: String(value)
								};
							}
							break;

						case 'text.fontSize':
							// Handled via transform or style lineHeight
							if (clip.source?.type === 'text' && clip.source.style) {
								clip.source.style.lineHeight = Number(value);
							}
							break;

						case 'text.fill':
							if (clip.source?.type === 'text') {
								clip.source.colorRuns = [
									{
										startIndex: 0,
										endIndex: (clip.source.text || '').length || 1000,
										fillColor: value
									}
								];
								if (!clip.properties) clip.properties = {};
								const rgbaArray = Array.isArray(value)
									? value
									: typeof value === 'object' && 'r' in value
									? [value.r, value.g, value.b, value.a ?? 1]
									: [1, 1, 1, 1];
								clip.properties['text.fillColor'] = {
									value: rgbaArray
								};
							}
							break;

						case 'text.accentBarColor':
							if (clip.source?.type === 'text') {
								if (!clip.source.box) {
									clip.source.box = { autoSize: true, verticalAnchor: 'bottom', frameStyle: 'accent-bar' };
								}
								clip.source.box.accentBarColor = value;
								if (!clip.properties) clip.properties = {};
								const rgbaArray = Array.isArray(value)
									? value
									: typeof value === 'object' && 'r' in value
									? [value.r, value.g, value.b, value.a ?? 1]
									: [0, 0.82, 0.95, 1];
								clip.properties['text.accentBarColor'] = {
									value: rgbaArray
								};
							}
							break;

						case 'shape.fill':
							if (clip.source?.type === 'shape') {
								clip.source.fillColor = value;
							}
							break;

						case 'shape.stroke':
							if (clip.source?.type === 'shape') {
								clip.source.strokeColor = value;
							}
							break;

						case 'shape.gradient':
							if (clip.source?.type === 'shape' && typeof value === 'object') {
								clip.source.gradientType = value.type;
								clip.source.gradientColorEnd = value.colorEnd;
								clip.source.gradientAngle = value.angle;
							}
							break;

						case 'solid.color':
							if (clip.source?.type === 'solid') {
								clip.source.color = value;
							}
							break;

						case 'transform.scale':
							clip.transform = {
								...(clip.transform || {
									x: 0,
									y: 0,
									scaleX: 1,
									scaleY: 1,
									rotation: 0,
									opacity: 1
								}),
								scaleX: Number(value),
								scaleY: Number(value)
							};
							break;

						case 'transform.opacity':
							clip.transform = {
								...(clip.transform || {
									x: 0,
									y: 0,
									scaleX: 1,
									scaleY: 1,
									rotation: 0,
									opacity: 1
								}),
								opacity: Number(value)
							};
							break;
					}
				}
			}
		}
	}

	return cloned;
}

/**
 * Computes responsive time remapping for motion graphics.
 * Intro duration and Outro duration remain fixed at 1x speed, while the center holds smoothly.
 */
export function computeResponsiveTemplateTime(
	rawSource: Time,
	instanceDuration: Time,
	templateDuration: Time,
	responsiveTiming: { introDuration: Time; outroDuration: Time }
): Time {
	if (instanceDuration <= 0 || templateDuration <= 0) return rawSource;

	const intro = Math.min(responsiveTiming.introDuration, instanceDuration * 0.45, templateDuration * 0.45);
	const outro = Math.min(responsiveTiming.outroDuration, instanceDuration * 0.45, templateDuration * 0.45);

	// 1. In intro phase: play at normal speed
	if (rawSource <= intro) {
		return rawSource;
	}

	// 2. In outro phase: map back from the tail of the template
	const fromEnd = instanceDuration - rawSource;
	if (fromEnd <= outro) {
		return templateDuration - fromEnd;
	}

	// 3. Middle holding/extended phase: interpolate between intro and outro
	const middleInstanceDur = instanceDuration - intro - outro;
	const middleTemplateDur = templateDuration - intro - outro;

	if (middleInstanceDur <= 0 || middleTemplateDur <= 0) {
		return intro;
	}

	const middleProgress = (rawSource - intro) / middleInstanceDur;
	return Math.round(intro + middleProgress * middleTemplateDur);
}

/**
 * Chooses the track an instance clip of `duration` placed at `start` should land on. The requested
 * track is used when it is an unlocked video track with room for the whole instance; otherwise a
 * new video track is added so the Track Overlap Invariant holds. Pure: returns the (possibly
 * extended) view and the chosen track id.
 */
export function pickTemplateHostTrack(
	view: Project,
	start: Time,
	duration: Time,
	targetTrackId?: Track['id']
): { view: Project; trackId: Track['id'] } {
	const end = start + duration;
	const hasRoom = (track: Track): boolean =>
		track.kind === 'video' &&
		!track.locked &&
		!track.clips.some((clip) => clip.start < end && clip.start + clip.duration > start);
	const requested = targetTrackId
		? view.tracks.find((track) => track.id === targetTrackId)
		: undefined;
	if (requested && hasRoom(requested)) return { view, trackId: requested.id };
	const free = requested ? undefined : view.tracks.find(hasRoom);
	if (free) return { view, trackId: free.id };
	const existing = new Set(view.tracks.map((track) => track.id));
	const extended = addTrack(view, 'video');
	const created = extended.tracks.find((track) => !existing.has(track.id));
	if (!created) throw new Error('No available track found to place the template.');
	return { view: extended, trackId: created.id };
}

/**
 * Builds the nested-sequence instance clip for a template. Shared by "+ Add", drag-and-drop
 * commit and the drag preview ghost so every entry point produces the same clip.
 */
export function createTemplateInstanceClip(
	template: MotionGraphicTemplate,
	start: Time,
	sequenceId: SequenceId,
	publishedParams: PublishedTemplateParam[] = template.publishedParams
): Clip {
	return {
		id: generateId() as ClipId,
		start,
		duration: template.duration,
		sourceIn: 0,
		sourceOut: template.duration,
		speed: 1,
		volume: 1,
		transform: {
			x: template.bounds?.originX ?? 0,
			y: template.bounds?.originY ?? 0,
			scaleX: 1,
			scaleY: 1,
			rotation: 0,
			opacity: 1
		},
		source: {
			type: 'sequence',
			sequenceId,
			templateId: template.id,
			templateName: template.name,
			templateCategory: template.category,
			publishedParams,
			paramOverrides: {},
			responsiveTiming: template.responsiveTiming
		}
	};
}

/**
 * Instantiates a template into a Project as a new sequence and inserts a single clip on the timeline.
 */
export function instantiateTemplateIntoProject(
	project: Project,
	activeSequenceId: SequenceId,
	template: MotionGraphicTemplate,
	playheadTime: Time,
	targetTrackId?: Track['id']
): { project: Project; instanceClipId: ClipId } {
	const newSubSequenceId = generateId() as SequenceId;
	const clipIdMap = new Map<string, ClipId>();

	// Deep clone template tracks and assign fresh IDs
	const newTracks: Track[] = template.tracks.map((t) => ({
		...JSON.parse(JSON.stringify(t)),
		id: generateId() as Track['id'],
		clips: t.clips.map((c) => {
			const freshId = generateId() as ClipId;
			clipIdMap.set(c.id, freshId);
			return {
				...c,
				id: freshId
			};
		})
	}));

	// Remap published parameter targetClipIds to the new clip IDs
	const remappedPublishedParams: PublishedTemplateParam[] = template.publishedParams.map((param) => ({
		...param,
		targetClipId: clipIdMap.get(param.targetClipId) || param.targetClipId
	}));

	const newSequence: Sequence = {
		id: newSubSequenceId,
		name: template.name,
		settings: template.bounds
			? {
					width: template.bounds.width,
					height: template.bounds.height,
					fps: project.settings?.fps || 30,
					sampleRate: project.settings?.sampleRate || 48000
				}
			: undefined,
		tracks: newTracks
	};

	const { view: hostView, trackId } = pickTemplateHostTrack(
		viewProject(project, activeSequenceId),
		playheadTime,
		template.duration,
		targetTrackId
	);
	const instanceClip = createTemplateInstanceClip(
		template,
		playheadTime,
		newSubSequenceId,
		remappedPublishedParams
	);
	const instanceClipId = instanceClip.id;

	// Insert clip into track
	const updatedHostTracks = hostView.tracks.map((t) => {
		if (t.id !== trackId) return t;
		return {
			...t,
			clips: [...t.clips, instanceClip]
		};
	});

	let updatedProject: Project;
	if (activeSequenceId === 'root') {
		updatedProject = {
			...project,
			tracks: updatedHostTracks,
			sequences: {
				...project.sequences,
				[newSubSequenceId]: newSequence
			}
		};
	} else {
		updatedProject = {
			...project,
			sequences: {
				...project.sequences,
				[newSubSequenceId]: newSequence,
				[activeSequenceId]: {
					...project.sequences![activeSequenceId]!,
					tracks: updatedHostTracks
				}
			}
		};
	}

	return {
		project: updatedProject,
		instanceClipId
	};
}

/**
 * Unpacks a motion template sequence instance clip back into separate individual tracks on the timeline,
 * while baking in any parameter overrides so the user's edits are fully preserved.
 */
export function unpackTemplateInstanceClip(
	project: Project,
	activeSequenceId: SequenceId,
	instanceClipId: ClipId
): Project {
	const hostView = viewProject(project, activeSequenceId);
	let hostTrack: Track | undefined;
	let hostClip: Clip | undefined;

	for (const t of hostView.tracks) {
		const c = t.clips.find((item) => item.id === instanceClipId);
		if (c) {
			hostTrack = t;
			hostClip = c;
			break;
		}
	}

	if (!hostTrack || !hostClip || hostClip.source?.type !== 'sequence') {
		throw new Error('Clip is not a valid template sequence instance.');
	}

	const nestedSeq = getSequence(project, hostClip.source.sequenceId);
	if (!nestedSeq) {
		throw new Error('Underlying template sequence not found.');
	}

	// 1. If there are paramOverrides, bake them into a duplicated/modified sequence first
	let effectiveSeq = nestedSeq;
	if (
		hostClip.source.publishedParams &&
		hostClip.source.paramOverrides &&
		Object.keys(hostClip.source.paramOverrides).length > 0
	) {
		effectiveSeq = applyParamOverridesToSequence(
			nestedSeq,
			hostClip.source.publishedParams,
			hostClip.source.paramOverrides
		);
	}

	// 2. If hostClip has transform offsets, apply them to effectiveSeq clips before expanding
	const hostOffsetX = hostClip.transform?.x || 0;
	const hostOffsetY = hostClip.transform?.y || 0;
	if (hostOffsetX !== 0 || hostOffsetY !== 0) {
		effectiveSeq = {
			...effectiveSeq,
			tracks: effectiveSeq.tracks.map((t) => ({
				...t,
				clips: t.clips.map((c) => offsetClipPosition(c, -hostOffsetX, -hostOffsetY))
			}))
		};
	}

	// 3. Put the baked sequence into the project temporarily
	const bakedSeqId = generateId() as SequenceId;
	const projectWithBakedSeq: Project = {
		...project,
		sequences: {
			...project.sequences,
			[bakedSeqId]: {
				...effectiveSeq,
				id: bakedSeqId
			}
		}
	};

	// 4. Update the host clip to reference this bakedSeqId
	const updatedHostTracks = hostView.tracks.map((t) => {
		if (t.id !== hostTrack!.id) return t;
		return {
			...t,
			clips: t.clips.map((c) =>
				c.id === instanceClipId
					? { ...c, source: { ...c.source, type: 'sequence' as const, sequenceId: bakedSeqId } }
					: c
			)
		};
	});

	let tempProject: Project;
	if (activeSequenceId === 'root') {
		tempProject = { ...projectWithBakedSeq, tracks: updatedHostTracks };
	} else {
		tempProject = {
			...projectWithBakedSeq,
			sequences: {
				...projectWithBakedSeq.sequences,
				[activeSequenceId]: {
					...projectWithBakedSeq.sequences![activeSequenceId]!,
					tracks: updatedHostTracks
				}
			}
		};
	}

	// 5. Use expandSequenceInstance to expand it onto the timeline!
	const expanded = expandSequenceInstance(tempProject, activeSequenceId, instanceClipId);

	// 6. Clean up the temporary baked sequence
	const finalSequences = { ...expanded.sequences };
	delete finalSequences[bakedSeqId];

	return {
		...expanded,
		sequences: finalSequences
	};
}

