export interface SttWordOutput {
	text: string;
	start: number; // in microseconds
	end: number; // in microseconds
	confidence?: number;
}

export type SttProgressPhase =
	'idle' | 'downloading' | 'loading' | 'transcribing' | 'completed' | 'error';

export interface SttProgressEvent {
	phase: SttProgressPhase;
	progress: number; // 0 to 1
	message?: string;
	words?: SttWordOutput[];
	error?: string;
	loadedBytes?: number;
	totalBytes?: number;
	speedBytesPerSec?: number;
}

export interface SttModelMetadata {
	id: string;
	name: string;
	sizeBytes: number;
	sizeLabel: string;
	description: string;
	accuracy: 'standard' | 'high';
	multilingual: boolean;
	hfModelId: string;
	license: string;
}

export const STT_MODELS: Record<string, SttModelMetadata> = {
	'whisper-tiny.en': {
		id: 'whisper-tiny.en',
		name: 'Whisper Tiny (English)',
		sizeBytes: 39_000_000,
		sizeLabel: '~39 MB',
		description: 'Fastest on-device recognition, optimal for English voice tracks.',
		accuracy: 'standard',
		multilingual: false,
		hfModelId: 'onnx-community/whisper-tiny.en',
		license: 'MIT / Apache-2.0'
	},
	'whisper-base': {
		id: 'whisper-base',
		name: 'Whisper Base (Multilingual)',
		sizeBytes: 73_000_000,
		sizeLabel: '~73 MB',
		description: 'Balanced speed and accuracy supporting 90+ languages.',
		accuracy: 'standard',
		multilingual: true,
		hfModelId: 'onnx-community/whisper-base',
		license: 'MIT / Apache-2.0'
	},
	'whisper-small': {
		id: 'whisper-small',
		name: 'Whisper Small (Multilingual)',
		sizeBytes: 240_000_000,
		sizeLabel: '~240 MB',
		description: 'High-accuracy multilingual recognition for complex acoustic environments.',
		accuracy: 'high',
		multilingual: true,
		hfModelId: 'onnx-community/whisper-small',
		license: 'MIT / Apache-2.0'
	}
};

export interface SttWorkerInitMessage {
	type: 'init';
	modelId: string;
	useWebGpu?: boolean;
	useFake?: boolean;
}

export interface SttWorkerTranscribeMessage {
	type: 'transcribe';
	samples: Float32Array;
	sampleRate: number;
	language?: string;
	task?: 'transcribe' | 'translate';
	useWebGpu?: boolean;
	useFake?: boolean;
	modelId?: string;
}

export interface SttWorkerCancelMessage {
	type: 'cancel';
}

export interface SttWorkerCheckSupportMessage {
	type: 'check_support';
}

export interface SttWorkerDeleteModelMessage {
	type: 'delete_model';
	modelId: string;
}

export interface SttWorkerListInstalledMessage {
	type: 'list_installed';
}

export type SttWorkerInMessage =
	| SttWorkerInitMessage
	| SttWorkerTranscribeMessage
	| SttWorkerCancelMessage
	| SttWorkerCheckSupportMessage
	| SttWorkerDeleteModelMessage
	| SttWorkerListInstalledMessage;

export interface SttWorkerOutMessage {
	type: 'progress' | 'result' | 'error' | 'support_result' | 'installed_list';
	event?: SttProgressEvent;
	hasWebGpu?: boolean;
	hasWasm?: boolean;
	installedModels?: string[];
}
