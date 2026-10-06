import type { AssetId, Project } from '../../core';
import type { ExportSettings } from './plan';

export interface ExportWorkerProbe {
	type: 'probe';
	settings: ExportSettings;
}

export interface ExportWorkerStart {
	type: 'start';
	jobId: string;
	project: Project;
	settings: ExportSettings;
	files: Array<{ assetId: AssetId; file: File }>;
	videoCodec?: string;
	audioCodec?: string;
	renderer?: 'webgl2' | 'canvas2d';
}

export interface ExportWorkerCancel {
	type: 'cancel';
	jobId: string;
}

export interface ExportWorkerProgress {
	type: 'progress';
	phase: string;
	framesDone: number;
	totalFrames: number;
	fps: number;
	etaMs: number;
}

export interface ExportWorkerWarning {
	type: 'warning';
	message: string;
}

export interface ExportWorkerChunk {
	type: 'chunk';
	jobId: string;
	chunkId: number;
	position: number;
	buffer: ArrayBuffer;
}

export type ExportWorkerRequest =
	| ExportWorkerProbe
	| ExportWorkerStart
	| ExportWorkerCancel
	| { type: 'ack'; jobId: string; chunkId: number; error?: string };

export type ExportWorkerResponse =
	| { type: 'ready'; supported: boolean; reason?: string }
	| ExportWorkerProgress
	| ExportWorkerWarning
	| ExportWorkerChunk
	| {
			type: 'done';
			jobId: string;
			bytes: number;
			durationUs: number;
			renderer?: 'webgl2' | 'canvas2d';
	  }
	| { type: 'error'; jobId?: string; code: string; message: string };
