import type { ComponentType } from 'react';
import type { PanelDefinition, PanelId } from './types';
import MediaLibrary from '../media-library/MediaLibrary';
import EffectsLibrary from '../effects/EffectsLibrary';
import { CaptionsPanel } from '../captions/CaptionsPanel';
import GraphicsPanel from '../graphics/GraphicsPanel';
import ShapesPanel from '../shapes/ShapesPanel';
import SourceMonitor from '../preview/SourceMonitor';
import PreviewWorkspace from '../preview/PreviewWorkspace';
import Inspector from '../inspector/Inspector';
import ColorPanel from '../color/ColorPanel';
import { MixerPanel } from '../audio/MixerPanel';
import { LoudnessPanel } from '../audio/LoudnessPanel';
import { EssentialSoundPanel } from '../audio/EssentialSoundPanel';
import { EffectControlsAudio } from '../audio/EffectControlsAudio';
import Timeline from '../timeline/Timeline';
import GraphEditor from '../graph/GraphEditor';
import AIAssistantPanel from '../ai/AIAssistantPanel';
import { AutoCaptionAiView } from '../ai/AutoCaptionAiView';

export const PANEL_REGISTRY: Record<PanelId, PanelDefinition> = {
	media: {
		id: 'media',
		title: 'Project',
		component: MediaLibrary as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: false,
		minSize: { width: 200, height: 180 }
	},
	effects: {
		id: 'effects',
		title: 'Effects',
		component: EffectsLibrary as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: false,
		minSize: { width: 200, height: 180 }
	},
	captions: {
		id: 'captions',
		title: 'Captions',
		component: CaptionsPanel as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: false,
		minSize: { width: 220, height: 180 }
	},
	graphics: {
		id: 'graphics',
		title: 'Titles',
		component: GraphicsPanel as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: false,
		minSize: { width: 220, height: 180 }
	},
	shapes: {
		id: 'shapes',
		title: 'Shapes',
		component: ShapesPanel as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: false,
		minSize: { width: 220, height: 180 }
	},
	source: {
		id: 'source',
		title: 'Source',
		component: SourceMonitor as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: false,
		minSize: { width: 200, height: 150 }
	},
	program: {
		id: 'program',
		title: 'Program',
		component: PreviewWorkspace as unknown as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: true, // GL context, engine, and playback stay alive
		minSize: { width: 200, height: 150 }
	},
	inspector: {
		id: 'inspector',
		title: 'Properties',
		component: Inspector as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: false,
		minSize: { width: 210, height: 180 }
	},
	color: {
		id: 'color',
		title: 'Color',
		component: ColorPanel as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: false,
		minSize: { width: 220, height: 180 }
	},
	mixer: {
		id: 'mixer',
		title: 'Audio Mixer',
		component: MixerPanel as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: false,
		minSize: { width: 240, height: 180 }
	},
	loudness: {
		id: 'loudness',
		title: 'Loudness Meter',
		component: LoudnessPanel as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: false,
		minSize: { width: 220, height: 180 }
	},
	'essential-sound': {
		id: 'essential-sound',
		title: 'Essential Sound',
		component: EssentialSoundPanel as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: false,
		minSize: { width: 220, height: 180 }
	},
	'effect-controls-audio': {
		id: 'effect-controls-audio',
		title: 'Effect Controls',
		component: EffectControlsAudio as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: false,
		minSize: { width: 220, height: 180 }
	},
	timeline: {
		id: 'timeline',
		title: 'Timeline',
		component: Timeline as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: true, // Virtualization, scroll position, and zoom stay alive
		minSize: { width: 320, height: 170 }
	},
	graph: {
		id: 'graph',
		title: 'Graph Editor',
		component: GraphEditor as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: false,
		minSize: { width: 300, height: 180 }
	},
	'ai-assistant': {
		id: 'ai-assistant',
		title: 'Smart Cut',
		component: AIAssistantPanel as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: false,
		minSize: { width: 220, height: 180 }
	},
	'auto-caption': {
		id: 'auto-caption',
		title: 'Auto Caption',
		component: AutoCaptionAiView as ComponentType<{ [key: string]: unknown }>,
		singleInstance: true,
		keepAlive: false,
		minSize: { width: 220, height: 180 }
	}
};
