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

export type AssetKind = 'video' | 'audio' | 'image' | 'lut';

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
	proxy?: ProxyInfo;
}

export type Interpolation = 'linear' | 'hold' | 'bezier';

/** Cubic-bezier control point in normalized segment space; x must stay within [0, 1]. */
export interface BezierHandle {
	x: number;
	y: number;
}

export interface Keyframe<T> {
	/** Clip-local time in microseconds, measured from the clip's timeline start. */
	time: Time;
	value: T;
	interpolation: Interpolation;
	easeOut?: BezierHandle;
	easeIn?: BezierHandle;
}

export type AngleMode = 'unwrapped' | 'shortest';

export type AnimatedValue<T> = { value: T } | { keyframes: Keyframe<T>[]; angleMode?: AngleMode };

export type PropertyId = string;
export type SequenceId = Brand<string, 'SequenceId'>;

export type JsonValue =
	string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface EffectInstance {
	id: string;
	type: string;
	version?: number;
	enabled?: boolean;
	params: Record<string, JsonValue | AnimatedValue<unknown>>;
}

/** Phase 1 name, kept so existing imports continue to compile. */
export type Effect = EffectInstance;

export type BlendMode = 'normal' | 'add' | 'multiply' | 'screen';

export type ClipSource =
	| { type: 'asset' }
	| { type: 'text'; text: string }
	| { type: 'sequence'; sequenceId: SequenceId }
	| { type: 'solid'; color: { r: number; g: number; b: number; a: number } }
	| { type: 'adjustment' };

export interface MaskPoint {
	x: number;
	y: number;
	inHandle?: { x: number; y: number };
	outHandle?: { x: number; y: number };
}

export interface Mask {
	id: string;
	name?: string;
	type: 'rect' | 'ellipse' | 'path';
	mode: 'add' | 'subtract' | 'intersect';
	inverted: boolean;
	feather: number;
	expansion: number;
	opacity: number;
	enabled?: boolean;
	closed?: boolean;
	shape?: number[];
	points?: MaskPoint[];
	effectId?: string;
	properties?: Record<PropertyId, AnimatedValue<unknown>>;
}

export type TransitionEdge =
	| { kind: 'cut'; fromClipId: ClipId; toClipId: ClipId }
	| { kind: 'head'; clipId: ClipId }
	| { kind: 'tail'; clipId: ClipId };

export interface Transition {
	id: string;
	type: string;
	duration: Time;
	alignment: 'center' | 'start' | 'end';
	easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
	audioCrossfade?: boolean;
	edge: TransitionEdge;
	params: Record<string, JsonValue>;
}

export interface Sequence {
	id: SequenceId;
	name: string;
	settings?: ProjectSettings;
	tracks: Track[];
}

export interface ProxyInfo {
	opfsPath: string;
	width: number;
	height: number;
	status: 'pending' | 'ready' | 'failed';
}

export interface ClipTransform {
	x: number;
	y: number;
	scaleX: number;
	scaleY: number;
	rotation: number;
	opacity: number;
}

export interface EqBand {
	type: 'lowshelf' | 'peaking' | 'highshelf';
	frequencyHz: number;
	gainDb: number;
	q: number;
}

export interface TrackEq {
	enabled: boolean;
	bands: [EqBand, EqBand, EqBand, EqBand];
}

export interface TrackCompressor {
	enabled: boolean;
	thresholdDb: number;
	ratio: number;
	attackMs: number;
	releaseMs: number;
	kneeDb: number;
	makeupDb: number;
}

export interface TrackAudio {
	gainDb: number;
	pan: number;
	solo: boolean;
	eq?: TrackEq;
	compressor?: TrackCompressor;
}

export interface ProjectMaster {
	gainDb: number;
	limiter: boolean;
	loudnessTargetLufs?: number;
}

export interface Clip {
	id: ClipId;
	assetId?: AssetId;
	start: Time;
	duration: Time;
	sourceIn: Time;
	sourceOut: Time;
	speed: number;
	volume: number;
	linkId?: string;
	effects?: EffectInstance[];
	transform?: ClipTransform;
	text?: string;
	source?: ClipSource;
	properties?: Record<PropertyId, AnimatedValue<unknown>>;
	masks?: Mask[];
	blendMode?: BlendMode;
	/** Speed curve over clip-local time; 1 is normal, negative reverses, 0 freezes. */
	timeRemap?: AnimatedValue<number>;
	/** Pitch preservation for speed changes (defaults to true). */
	maintainPitch?: boolean;
	fadeInUs?: Time;
	fadeOutUs?: Time;
	fadeCurve?: 'equalPower' | 'linear';
}

export interface Track {
	id: TrackId;
	kind: 'video' | 'audio';
	name: string;
	muted: boolean;
	locked: boolean;
	hidden: boolean;
	clips: Clip[];
	transitions?: Transition[];
	audio?: TrackAudio;
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
	sequences?: Record<SequenceId, Sequence>;
	masterAudio?: ProjectMaster;
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
