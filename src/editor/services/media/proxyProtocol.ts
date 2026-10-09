import type { AssetId, ProjectId } from '../../core/types';

export interface ProxyWorkerJobConfig {
	jobId: string;
	projectId: ProjectId;
	assetId: AssetId;
	targetWidth: number;
	targetHeight: number;
	fps: number;
	bitrate: number;
	codec: 'avc' | 'vp9';
	container: 'mp4' | 'webm';
	faultInjection?: 'encoder_unsupported' | 'quota_error' | 'decode_error';
}

export type ProxyWorkerInMessage =
	| {
			type: 'transcode';
			job: ProxyWorkerJobConfig;
			sourceFile: File;
	  }
	| {
			type: 'cancel';
			jobId: string;
	  };

export interface ProxyProgressEvent {
	jobId: string;
	phase: 'decoding' | 'encoding' | 'writing' | 'completed' | 'error';
	progress: number; // 0 to 1
	bytesWritten?: number;
	totalBytes?: number;
	error?: string;
}

export type ProxyWorkerOutMessage =
	| {
			type: 'progress';
			event: ProxyProgressEvent;
	  }
	| {
			type: 'result';
			jobId: string;
			assetId: AssetId;
			buffer: ArrayBuffer;
			width: number;
			height: number;
			fps: number;
			durationUs: number;
			bytes: number;
			codec: string;
			container: string;
	  }
	| {
			type: 'error';
			jobId: string;
			assetId: AssetId;
			error: string;
	  };
