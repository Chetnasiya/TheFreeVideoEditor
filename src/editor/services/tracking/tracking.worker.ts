/// <reference lib="webworker" />

import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';
import {
	buildPyramid,
	extractNormalizedPatch,
	matchTemplateNcc,
	toGrayscale,
	trackLkPyramid,
	type GrayImage
} from '../../core/tracking';
import type { TrackerSample } from '../../core/types';
import type { TrackingWorkerInMessage, TrackingWorkerOutMessage } from './trackingProtocol';

const scope = globalThis as unknown as DedicatedWorkerGlobalScope;

let currentJobId: string | null = null;
let cancelled = false;

function post(msg: TrackingWorkerOutMessage) {
	scope.postMessage(msg);
}

scope.addEventListener('message', async (e: MessageEvent<TrackingWorkerInMessage>) => {
	const msg = e.data;

	if (msg.type === 'cancel') {
		if (currentJobId === msg.jobId) {
			cancelled = true;
		}
		return;
	}

	if (msg.type === 'start') {
		const { job, file } = msg;
		currentJobId = job.jobId;
		cancelled = false;

		let input: Input | null = null;
		let sink: VideoSampleSink | null = null;
		let offscreen: OffscreenCanvas | null = null;
		let ctx: OffscreenCanvasRenderingContext2D | null = null;
		const samples: TrackerSample[] = [];

		try {
			input = new Input({
				source: new BlobSource(file),
				formats: ALL_FORMATS
			});

			const videoTrack = await input.getPrimaryVideoTrack();
			if (!videoTrack) {
				throw new Error('No decodable video track found in media file.');
			}

			sink = new VideoSampleSink(videoTrack);

			const stepUs = Math.max(10_000, Math.round(1_000_000 / (job.fps || 30)));
			const isForward = job.direction === 'forward';

			// Build sequence of timestamps
			const timestampsUs: number[] = [];
			if (isForward) {
				for (let t = job.seedTimeUs; t <= job.endTimeUs; t += stepUs) {
					timestampsUs.push(t);
				}
			} else {
				for (let t = job.seedTimeUs; t >= job.startTimeUs; t -= stepUs) {
					timestampsUs.push(t);
				}
			}

			if (timestampsUs.length === 0) {
				timestampsUs.push(job.seedTimeUs);
			}

			const totalFrames = timestampsUs.length;

			// Helper to decode frame to GrayImage
			const decodeFrameAtTime = async (timeUs: number): Promise<GrayImage | null> => {
				const timeSec = Math.max(0, timeUs / 1_000_000);
				let sample = await sink!.getSample(timeSec);
				if (!sample && timeUs === 0) {
					// Fallback to slightly shifted offset if exact 0.0s misses in container
					sample = await sink!.getSample(0.01);
				}
				if (!sample) return null;

				try {
					if (
						!offscreen ||
						offscreen.width !== sample.displayWidth ||
						offscreen.height !== sample.displayHeight
					) {
						offscreen = new OffscreenCanvas(sample.displayWidth, sample.displayHeight);
						ctx = offscreen.getContext('2d', { willReadFrequently: true });
					}
					if (!ctx) throw new Error('Could not acquire 2D context in tracking worker.');

					sample.draw(ctx, 0, 0, offscreen.width, offscreen.height);
					const imgData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
					return toGrayscale(imgData.data, offscreen.width, offscreen.height);
				} finally {
					sample.close();
				}
			};

			// 1. Decode seed frame
			const seedGray = await decodeFrameAtTime(timestampsUs[0]!);
			if (!seedGray) {
				throw new Error('Failed to decode initial seed frame.');
			}

			const seedPyramid = buildPyramid(seedGray, job.params.pyramidLevels);
			const normRegion = job.initialRegion;

			const seedSample: TrackerSample = {
				sourceTime: timestampsUs[0]!,
				x: normRegion.x,
				y: normRegion.y,
				rotation: 0,
				scale: 1,
				confidence: 1.0,
				lost: false
			};
			samples.push(seedSample);

			post({
				type: 'progress',
				jobId: job.jobId,
				processedFrames: 1,
				totalFrames,
				currentSample: seedSample
			});

			let currentNormX = normRegion.x;
			let currentNormY = normRegion.y;
			let currentRot = 0;
			let currentScale = 1.0;

			// Velocity history for motion extrapolation (fast motion handling)
			let prevNormX = normRegion.x;
			let prevNormY = normRegion.y;
			let prevPrevNormX = normRegion.x;
			let prevPrevNormY = normRegion.y;

			const halfW = Math.max(4, Math.round((normRegion.width * seedGray.width) / 2));
			const halfH = Math.max(4, Math.round((normRegion.height * seedGray.height) / 2));
			const activePatch = extractNormalizedPatch(
				seedGray,
				normRegion.x * seedGray.width,
				normRegion.y * seedGray.height,
				halfW,
				halfH
			);

			if (!activePatch) {
				throw new Error('Initial tracker region is out of bounds or invalid.');
			}

			// 2. Track subsequent frames
			for (let i = 1; i < timestampsUs.length; i++) {
				if (cancelled) {
					post({
						type: 'error',
						jobId: job.jobId,
						error: 'Tracking cancelled by user.',
						reason: 'user_cancel',
						samples
					});
					return;
				}

				const tUs = timestampsUs[i]!;
				const targetGray = await decodeFrameAtTime(tUs);
				if (!targetGray) {
					// End of stream or decode fault
					break;
				}

				const targetPyramid = buildPyramid(targetGray, job.params.pyramidLevels);

				// 1. Motion prediction / velocity extrapolation:
				// If object was moving fast in previous frames, extrapolate velocity to predict candidate location
				let vx = 0;
				let vy = 0;
				if (i >= 2) {
					vx = prevNormX - prevPrevNormX;
					vy = prevNormY - prevPrevNormY;
				}
				const predNormX = Math.max(0, Math.min(1, currentNormX + vx));
				const predNormY = Math.max(0, Math.min(1, currentNormY + vy));

				const predPxX = predNormX * targetGray.width;
				const predPxY = predNormY * targetGray.height;

				// 2. Adaptive search radius for recovery:
				const baseRadius = job.params.searchRadiusPx || 32;
				const userSearchRadius =
					(normRegion.width * targetGray.width * (job.initialRegion.searchMultiplier ?? 2.5)) / 2;
				const velocitySpeedPx = Math.hypot(vx * targetGray.width, vy * targetGray.height);
				const effectiveSearchRadius = Math.round(
					Math.max(baseRadius, userSearchRadius, velocitySpeedPx * 1.5, 48)
				);

				// 3. Fast Path: Direct Pyramidal Lucas-Kanade optical flow from velocity-predicted location (2-4ms)
				let lkResult = trackLkPyramid(
					seedPyramid,
					targetPyramid,
					normRegion,
					{
						x: predPxX,
						y: predPxY,
						rotation: currentRot,
						scale: currentScale
					},
					{
						trackRotation: job.params.trackRotation,
						trackScale: job.params.trackScale ?? true,
						maxIterations: Math.max(25, job.params.maxIterations),
						tolerance: job.params.tolerance,
						huberThreshold: job.params.huberThreshold
					}
				);

				// 4. Recovery Path: If LK confidence dropped below threshold (e.g. sudden fast jerk or occlusion),
				// run NCC template search to relocate or confirm occlusion
				let isOccluded = false;
				if (lkResult.confidence < job.params.confidenceThreshold) {
					let bestMatch = matchTemplateNcc(
						targetGray,
						activePatch.patch,
						activePatch.norm,
						halfW,
						halfH,
						predPxX,
						predPxY,
						effectiveSearchRadius
					);

					if (bestMatch.score < job.params.nccThreshold && (vx !== 0 || vy !== 0)) {
						const fallbackMatch = matchTemplateNcc(
							targetGray,
							activePatch.patch,
							activePatch.norm,
							halfW,
							halfH,
							currentNormX * targetGray.width,
							currentNormY * targetGray.height,
							effectiveSearchRadius
						);
						if (fallbackMatch.score > bestMatch.score) {
							bestMatch = fallbackMatch;
						}
					}

					if (bestMatch.score >= job.params.nccThreshold) {
						// Re-refine with LK starting from the relocated NCC position
						const recoveredLk = trackLkPyramid(
							seedPyramid,
							targetPyramid,
							normRegion,
							{
								x: bestMatch.x,
								y: bestMatch.y,
								rotation: currentRot,
								scale: currentScale
							},
							{
								trackRotation: job.params.trackRotation,
								trackScale: job.params.trackScale ?? true,
								maxIterations: Math.max(25, job.params.maxIterations),
								tolerance: job.params.tolerance,
								huberThreshold: job.params.huberThreshold
							}
						);
						if (recoveredLk.confidence > lkResult.confidence) {
							lkResult = recoveredLk;
						}
					} else {
						isOccluded = true;
					}
				}

				if (isOccluded || lkResult.confidence < job.params.confidenceThreshold) {
					const lostSample: TrackerSample = {
						sourceTime: tUs,
						x: currentNormX,
						y: currentNormY,
						rotation: currentRot,
						scale: currentScale,
						confidence: lkResult.confidence,
						lost: true,
						reason: 'occlusion'
					};
					samples.push(lostSample);
					post({
						type: 'progress',
						jobId: job.jobId,
						processedFrames: i + 1,
						totalFrames,
						currentSample: lostSample
					});
					// Continue seeking to see if target re-emerges
					continue;
				}

				const normX = lkResult.state.x / targetGray.width;
				const normY = lkResult.state.y / targetGray.height;
				const isOutOfBounds = normX < 0 || normX > 1 || normY < 0 || normY > 1;

				const sample: TrackerSample = {
					sourceTime: tUs,
					x: normX,
					y: normY,
					rotation: lkResult.state.rotation,
					scale: Math.max(0.05, Math.min(20.0, lkResult.state.scale)),
					confidence: lkResult.confidence,
					lost: isOutOfBounds || lkResult.confidence < job.params.confidenceThreshold,
					reason: isOutOfBounds
						? 'out_of_bounds'
						: lkResult.confidence < job.params.confidenceThreshold
							? 'loss'
							: undefined
				};

				samples.push(sample);

				if (!sample.lost) {
					prevPrevNormX = prevNormX;
					prevPrevNormY = prevNormY;
					prevNormX = currentNormX;
					prevNormY = currentNormY;

					currentNormX = normX;
					currentNormY = normY;
					currentRot = sample.rotation;
					currentScale = sample.scale;

					// Adaptive template update: if confidence is high, update active patch slowly
					// to track subtle perspective/illumination/scale changes without drifting
					if (sample.confidence >= 0.85) {
						const newPatch = extractNormalizedPatch(
							targetGray,
							normX * targetGray.width,
							normY * targetGray.height,
							halfW,
							halfH
						);
						if (newPatch) {
							const alpha = 0.05;
							for (let p = 0; p < activePatch.patch.length; p++) {
								activePatch.patch[p] =
									(1 - alpha) * activePatch.patch[p]! + alpha * newPatch.patch[p]!;
							}
							let sumSq = 0;
							for (let p = 0; p < activePatch.patch.length; p++) {
								sumSq += activePatch.patch[p]! * activePatch.patch[p]!;
							}
							activePatch.norm = Math.sqrt(sumSq);
						}
					}
				}

				post({
					type: 'progress',
					jobId: job.jobId,
					processedFrames: i + 1,
					totalFrames,
					currentSample: sample
				});
			}

			// Sort samples by strictly increasing sourceTime
			samples.sort((a, b) => a.sourceTime - b.sourceTime);

			post({
				type: 'complete',
				jobId: job.jobId,
				samples,
				assetFingerprint: job.assetFingerprint
			});
		} catch (err) {
			post({
				type: 'error',
				jobId: job.jobId,
				error: err instanceof Error ? err.message : String(err),
				reason: 'decode_error',
				samples
			});
		} finally {
			input?.dispose();
			currentJobId = null;
		}
	}
});
