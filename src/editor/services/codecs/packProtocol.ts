/**
 * Protocol messages between Main Thread and Codec Pack Worker.
 */

export interface CodecPackProgress {
	phase: 'idle' | 'checking' | 'downloading' | 'verifying' | 'ready' | 'error';
	percent: number;
	bytesLoaded?: number;
	bytesTotal?: number;
	message: string;
}

export interface CodecPackHardwareSupport {
	hasWasm: boolean;
	hasSimd: boolean;
	hasOpfsSync: boolean;
	hasSharedArrayBuffer: boolean;
}

export interface CodecPackMetadata {
	id: string;
	name: string;
	version: string;
	sizeLabel: string;
	license: 'LGPL-2.1-or-later';
	formats: string[];
	decoders: string[];
	encoders: string[];
}

export type CodecPackWorkerInMessage =
	| { type: 'check_support' }
	| { type: 'get_status' }
	| { type: 'download_pack'; url?: string }
	| { type: 'delete_pack' }
	| { type: 'probe_file'; fileHandle: FileSystemFileHandle }
	| { type: 'decode_frame'; timestampUs: number }
	| { type: 'abort' };

export type CodecPackWorkerOutMessage =
	| { type: 'support_result'; support: CodecPackHardwareSupport }
	| { type: 'status_result'; isInstalled: boolean; isAvailable: boolean; sizeBytes?: number }
	| { type: 'progress'; progress: CodecPackProgress }
	| { type: 'download_success' }
	| { type: 'delete_success' }
	| { type: 'error'; message: string };
