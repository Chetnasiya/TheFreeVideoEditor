export type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type ProjectId = Brand<string, 'ProjectId'>;
export type AssetId = Brand<string, 'AssetId'>;
export type TrackId = Brand<string, 'TrackId'>;
export type ClipId = Brand<string, 'ClipId'>;
export type MarkerId = Brand<string, 'MarkerId'>;

export type Time = number;

export interface ProjectSettings {
	width: number;
	height: number;
	fps: number;
	sampleRate: number;
}

export type AssetKind = 'video' | 'audio' | 'image';

export interface Asset {
	id: AssetId;
	kind: AssetKind;
	name: string;
	mimeType: string;
	size: number;
	duration: Time;
	width?: number;
	height?: number;
	fps?: number;
	fpsEstimated?: boolean;
	hasAudio: boolean;
	audioChecked?: boolean;
	audioDecodable?: boolean;
	audioCodec?: string;
	videoDecodable?: boolean;
	videoCodec?: string;
	opfsPath: string;
	offline?: boolean;
}

export interface Effect {
	id: string;
	type: string;
	params: Record<string, string | number | boolean>;
}

export interface ClipTransform {
	x: number;
	y: number;
	scaleX: number;
	scaleY: number;
	rotation: number;
	opacity: number;
}

export interface Clip {
	id: ClipId;
	assetId: AssetId;
	start: Time;
	duration: Time;
	sourceIn: Time;
	sourceOut: Time;
	speed: number;
	volume: number;
	linkId?: string;
	effects?: Effect[];
	transform?: ClipTransform;
	text?: string;
}

export interface Track {
	id: TrackId;
	kind: 'video' | 'audio';
	name: string;
	muted: boolean;
	locked: boolean;
	hidden: boolean;
	clips: Clip[];
}

export interface Marker {
	id: MarkerId;
	time: Time;
	label: string;
	color?: string;
}

export interface Project {
	id: ProjectId;
	schemaVersion: number;
	name: string;
	createdAt: string;
	updatedAt: string;
	settings: ProjectSettings;
	assets: Record<AssetId, Asset>;
	tracks: Track[];
	markers: Marker[];
}

export interface ProjectSummary {
	id: ProjectId;
	name: string;
	updatedAt: string;
	duration: Time;
	assetCount: number;
}

export type TimelineDragKind = 'move' | 'trim-start' | 'trim-end' | 'asset';

export interface DragPosition {
	clipId: ClipId;
	trackId: TrackId;
	start: Time;
	duration: Time;
	sourceIn: Time;
	sourceOut: Time;
}

export interface DragSession {
	kind: TimelineDragKind;
	clipIds: ClipId[];
	original: DragPosition[];
	preview: DragPosition[];
	pointerStartTime: Time;
	pointerTime: Time;
	targetTrackId?: TrackId;
	assetId?: AssetId;
	snappedTo?: Time;
	allowed: boolean;
	unlink: boolean;
}
