import {
	STT_MODELS,
	type SttWorkerInMessage,
	type SttWorkerOutMessage,
	type SttWordOutput
} from './sttProtocol';

const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
let cancelled = false;
let currentPipeline: unknown = null;
let currentModelId: string | null = null;

function post(message: SttWorkerOutMessage) {
	scope.postMessage(message);
}

// -------------------------------------------------------------
// Fake Transcriber (DEV / Test mode)
// -------------------------------------------------------------
function extractVoiceSegments(
	samples: Float32Array,
	sampleRate: number
): Array<{ startUs: number; endUs: number }> {
	const windowSize = Math.round(sampleRate * 0.02); // 20ms window
	const numWindows = Math.floor(samples.length / windowSize);
	const energies = new Float32Array(numWindows);

	let maxEnergy = 1e-6;
	for (let w = 0; w < numWindows; w++) {
		let sumSq = 0;
		const offset = w * windowSize;
		for (let i = 0; i < windowSize; i++) {
			const s = samples[offset + i] ?? 0;
			sumSq += s * s;
		}
		const rms = Math.sqrt(sumSq / windowSize);
		energies[w] = rms;
		if (rms > maxEnergy) maxEnergy = rms;
	}

	const threshold = Math.max(0.015, maxEnergy * 0.12);
	const segments: Array<{ startUs: number; endUs: number }> = [];

	let inSpeech = false;
	let speechStartW = 0;

	for (let w = 0; w < numWindows; w++) {
		const isSpeech = (energies[w] ?? 0) >= threshold;
		if (!inSpeech && isSpeech) {
			inSpeech = true;
			speechStartW = w;
		} else if (inSpeech && !isSpeech) {
			const silenceLength = Math.round(0.3 / 0.02);
			let silenceCont = true;
			for (let k = 1; k < silenceLength && w + k < numWindows; k++) {
				if ((energies[w + k] ?? 0) >= threshold) {
					silenceCont = false;
					break;
				}
			}

			if (silenceCont) {
				inSpeech = false;
				const startUs = Math.round(((speechStartW * windowSize) / sampleRate) * 1_000_000);
				const endUs = Math.round(((w * windowSize) / sampleRate) * 1_000_000);
				if (endUs - startUs >= 300_000) {
					segments.push({ startUs, endUs });
				}
			}
		}
	}

	if (inSpeech) {
		const startUs = Math.round(((speechStartW * windowSize) / sampleRate) * 1_000_000);
		const endUs = Math.round(((numWindows * windowSize) / sampleRate) * 1_000_000);
		segments.push({ startUs, endUs });
	}

	return segments;
}

async function runFakeTranscribe(
	samples: Float32Array,
	sampleRate: number
): Promise<SttWordOutput[]> {
	post({
		type: 'progress',
		event: {
			phase: 'transcribing',
			progress: 0.1,
			message: 'Analyzing speech activity (DEV Fake Transcriber)…'
		}
	});

	const regions = extractVoiceSegments(samples, sampleRate);
	const words: SttWordOutput[] = [];

	if (regions.length === 0) {
		const totalUs = Math.round((samples.length / sampleRate) * 1_000_000);
		if (totalUs > 500_000) {
			regions.push({ startUs: 200_000, endUs: Math.max(800_000, totalUs - 200_000) });
		}
	}

	const totalRegions = regions.length;
	for (let i = 0; i < totalRegions; i++) {
		if (cancelled) return [];
		const region = regions[i]!;
		const durationUs = region.endUs - region.startUs;
		const numWords = Math.max(1, Math.round(durationUs / 500_000));
		const wordDuration = Math.round(durationUs / numWords);

		for (let w = 0; w < numWords; w++) {
			const wStart = region.startUs + w * wordDuration;
			const wEnd = Math.min(region.endUs, wStart + wordDuration);
			words.push({
				text: `[Speech ${i + 1}.${w + 1}]`,
				start: wStart,
				end: wEnd,
				confidence: 0.95
			});
		}

		post({
			type: 'progress',
			event: {
				phase: 'transcribing',
				progress: 0.2 + 0.8 * ((i + 1) / totalRegions),
				message: `Recognized segment ${i + 1} of ${totalRegions}…`
			}
		});
	}

	return words;
}

// -------------------------------------------------------------
// Real Transformers.js Whisper Engine with WebGPU / WASM
// -------------------------------------------------------------
async function getOrLoadRealPipeline(modelKey = 'whisper-tiny.en', useWebGpu = true) {
	if (currentPipeline && currentModelId === modelKey) {
		return currentPipeline;
	}

	post({
		type: 'progress',
		event: {
			phase: 'loading',
			progress: 0.05,
			message: 'Loading HuggingFace Transformers.js engine…'
		}
	});

	// Lazy dynamic import of @huggingface/transformers inside the worker
	const { pipeline, env } = await import('@huggingface/transformers');

	// Disallow telemetry or third-party connections other than the model host
	env.allowLocalModels = false;

	const device =
		useWebGpu && typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm';

	let lastLoaded = 0;
	let lastTime = performance.now();

	const makeProgressCallback = () => {
		return (info: {
			status: string;
			file?: string;
			progress?: number;
			loaded?: number;
			total?: number;
		}) => {
			if (cancelled) return;
			if (info.status === 'download' || info.status === 'progress') {
				const now = performance.now();
				const dt = (now - lastTime) / 1000;
				let speedBytesPerSec = 0;
				if (dt > 0.3 && info.loaded) {
					speedBytesPerSec = (info.loaded - lastLoaded) / dt;
					lastLoaded = info.loaded;
					lastTime = now;
				}

				const progress = typeof info.progress === 'number' ? info.progress / 100 : 0.5;
				post({
					type: 'progress',
					event: {
						phase: 'downloading',
						progress,
						message: info.file ? `Downloading ${info.file}…` : 'Downloading model weights…',
						loadedBytes: info.loaded,
						totalBytes: info.total,
						speedBytesPerSec
					}
				});
			} else if (info.status === 'done') {
				post({
					type: 'progress',
					event: {
						phase: 'loading',
						progress: 0.9,
						message: `Loaded ${info.file ?? 'component'}. Initializing runtime…`
					}
				});
			}
		};
	};

	const repoId = STT_MODELS[modelKey]?.hfModelId ?? modelKey;
	let asrPipeline;
	try {
		asrPipeline = await pipeline('automatic-speech-recognition', repoId, {
			device: device as 'webgpu' | 'wasm',
			dtype: device === 'webgpu' ? 'fp32' : 'q8',
			progress_callback: makeProgressCallback()
		});
	} catch (err) {
		if (device === 'webgpu') {
			post({
				type: 'progress',
				event: {
					phase: 'loading',
					progress: 0.1,
					message: 'WebGPU unavailable, falling back to WASM engine…'
				}
			});
			asrPipeline = await pipeline('automatic-speech-recognition', repoId, {
				device: 'wasm',
				dtype: 'q8',
				progress_callback: makeProgressCallback()
			});
		} else {
			throw err;
		}
	}

	currentPipeline = asrPipeline;
	currentModelId = modelKey;
	return asrPipeline;
}

// -------------------------------------------------------------
// Model Storage Cache Management
// -------------------------------------------------------------
async function listInstalledModels(): Promise<string[]> {
	if (typeof caches === 'undefined') return [];
	const installed: string[] = [];
	try {
		const keys = await caches.keys();
		// transformers.js caches in 'transformers-cache' or Cache API keys
		for (const k of keys) {
			if (k.includes('transformers') || k.includes('onnx')) {
				installed.push(k);
			}
		}
	} catch {
		// Ignore Cache API errors in sandboxed environments
	}
	return installed;
}

async function deleteModelCache(modelId: string): Promise<boolean> {
	if (typeof caches === 'undefined') return false;
	try {
		const keys = await caches.keys();
		for (const k of keys) {
			if (k.includes(modelId) || k.includes('transformers')) {
				await caches.delete(k);
			}
		}
		if (currentModelId === modelId) {
			currentPipeline = null;
			currentModelId = null;
		}
		return true;
	} catch {
		return false;
	}
}

// -------------------------------------------------------------
// Message Handling
// -------------------------------------------------------------
scope.addEventListener('message', async (event: MessageEvent<SttWorkerInMessage>) => {
	const msg = event.data;

	if (msg.type === 'cancel') {
		cancelled = true;
		return;
	}

	if (msg.type === 'check_support') {
		let hasWebGpu = false;
		if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
			try {
				const adapter = await navigator.gpu.requestAdapter();
				hasWebGpu = adapter !== null;
			} catch {
				hasWebGpu = false;
			}
		}
		const hasWasm = typeof WebAssembly !== 'undefined';
		post({
			type: 'support_result',
			hasWebGpu,
			hasWasm
		});
		return;
	}

	if (msg.type === 'list_installed') {
		const installed = await listInstalledModels();
		post({
			type: 'installed_list',
			installedModels: installed
		});
		return;
	}

	if (msg.type === 'delete_model') {
		await deleteModelCache(msg.modelId);
		const installed = await listInstalledModels();
		post({
			type: 'installed_list',
			installedModels: installed
		});
		return;
	}

	if (msg.type === 'init') {
		cancelled = false;
		if (msg.useFake) {
			post({
				type: 'progress',
				event: { phase: 'loading', progress: 1.0, message: 'DEV Fake Transcriber ready.' }
			});
			return;
		}
		try {
			await getOrLoadRealPipeline(msg.modelId, msg.useWebGpu ?? true);
			post({
				type: 'progress',
				event: { phase: 'loading', progress: 1.0, message: 'Engine initialized.' }
			});
		} catch (err) {
			post({
				type: 'error',
				event: {
					phase: 'error',
					progress: 0,
					error: err instanceof Error ? err.message : String(err)
				}
			});
		}
		return;
	}

	if (msg.type === 'transcribe') {
		cancelled = false;
		const { samples, sampleRate, useFake, modelId, useWebGpu, language, task } = msg;

		// 1. DEV / Fake Engine fallback
		if (useFake) {
			const words = await runFakeTranscribe(samples, sampleRate);
			if (cancelled) return;
			post({
				type: 'result',
				event: {
					phase: 'completed',
					progress: 1.0,
					message: `Fake transcription complete (${words.length} tokens).`,
					words
				}
			});
			return;
		}

		// 2. Real Transformers.js Pipeline with 30s Windowing & Stride
		try {
			post({
				type: 'progress',
				event: {
					phase: 'loading',
					progress: 0.1,
					message: 'Preparing speech recognition pipeline…'
				}
			});

			// Type assertion for dynamically imported transformers pipeline
			const transcriber = (await getOrLoadRealPipeline(
				modelId ?? 'whisper-tiny.en',
				useWebGpu ?? true
			)) as (
				audio: Float32Array,
				options?: Record<string, unknown>
			) => Promise<{
				text: string;
				chunks?: Array<{ text: string; timestamp: [number | null, number | null] }>;
			}>;

			if (cancelled) return;

			post({
				type: 'progress',
				event: {
					phase: 'transcribing',
					progress: 0.3,
					message: 'Processing audio through Whisper…'
				}
			});

			// Run inference with 30s chunking, 5s stride, and word-level timestamps
			const isEnglishOnly = modelId?.endsWith('.en') ?? false;
			const inferOptions: Record<string, unknown> = {
				return_timestamps: true,
				chunk_length_s: 30,
				stride_length_s: 5
			};
			if (!isEnglishOnly) {
				if (language && language !== 'auto') {
					inferOptions.language = language;
				}
				if (task) {
					inferOptions.task = task;
				}
			}

			const out = await transcriber(samples, inferOptions);

			if (cancelled) return;

			const words: SttWordOutput[] = [];

			if (out.chunks && Array.isArray(out.chunks)) {
				for (const chunk of out.chunks) {
					const text = chunk.text.trim();
					if (!text) continue;
					const startSec = chunk.timestamp[0] ?? 0;
					const endSec = chunk.timestamp[1] ?? startSec + 1;
					const chunkTokens = text.split(/\s+/).filter(Boolean);
					const tokenDur = chunkTokens.length > 0 ? (endSec - startSec) / chunkTokens.length : 0;
					for (let i = 0; i < chunkTokens.length; i++) {
						const wStart = startSec + i * tokenDur;
						const wEnd = wStart + tokenDur;
						words.push({
							text: chunkTokens[i]!,
							start: Math.round(wStart * 1_000_000),
							end: Math.round(wEnd * 1_000_000),
							confidence: 0.95
						});
					}
				}
			} else if (out.text) {
				// Fallback if chunks are absent: divide text evenly over sample length
				const totalUs = Math.round((samples.length / sampleRate) * 1_000_000);
				const tokens = out.text.trim().split(/\s+/);
				const wordDur = Math.round(totalUs / Math.max(1, tokens.length));
				for (let i = 0; i < tokens.length; i++) {
					words.push({
						text: tokens[i]!,
						start: i * wordDur,
						end: Math.min(totalUs, (i + 1) * wordDur),
						confidence: 0.9
					});
				}
			}

			post({
				type: 'result',
				event: {
					phase: 'completed',
					progress: 1.0,
					message: `Transcription complete (${words.length} words).`,
					words
				}
			});
		} catch (err) {
			post({
				type: 'error',
				event: {
					phase: 'error',
					progress: 0,
					error: err instanceof Error ? err.message : String(err)
				}
			});
		}
	}
});
