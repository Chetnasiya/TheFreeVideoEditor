/**
 * Typed message protocol for tracking web worker.
 */

import type { TrackerParams, TrackerRegion, TrackerSample, TrackerType } from '../../core/types';

export interface TrackingJobConfig {
	jobId: string;
	assetId: string;
	clipId: string;
	trackerId: string;
	type: TrackerType;
	direction: 'forward' | 'backward';
	seedTimeUs: number;
	startTimeUs: number;
	endTimeUs: number;
	fps: number;
	initialRegion: TrackerRegion;
	params: TrackerParams;
	assetFingerprint?: string;
}

export type TrackingWorkerInMessage =
	| {
			type: 'start';
			job: TrackingJobConfig;
			file: File | Blob;
	  }
	| {
			type: 'cancel';
			jobId: string;
	  };

export type TrackingWorkerOutMessage =
	| {
			type: 'progress';
			jobId: string;
			processedFrames: number;
			totalFrames: number;
			currentSample?: TrackerSample;
	  }
	| {
			type: 'complete';
			jobId: string;
			samples: TrackerSample[];
			assetFingerprint?: string;
	  }
	| {
			type: 'error';
			jobId: string;
			error: string;
			reason?: 'loss' | 'decode_error' | 'user_cancel';
			samples?: TrackerSample[];
	  };
