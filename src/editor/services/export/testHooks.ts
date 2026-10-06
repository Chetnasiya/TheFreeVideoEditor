export type ExportPath = 'worker-webcodecs' | 'main-webcodecs' | 'compatibility';

export interface ExportTestHooks {
	lastExportPath?: ExportPath;
	workerTerminations?: number;
	capabilities?: { video: boolean; audio: boolean; codec?: string };
	hideFirstVideoTrack?: (hidden: boolean) => boolean;
	addSecondClipAfterGap?: () => boolean;
	addSampleOverlay?: () => boolean;
	hideTopVideoTrack?: (hidden: boolean) => boolean;
	lastProgress?: { framesDone: number; totalFrames: number; fps: number; phase: string };
}

declare global {
	interface Window {
		__TFVE_EXPORT_TEST_HOOKS__?: ExportTestHooks;
	}
}

export function recordExportPath(path: ExportPath): void {
	if (typeof window !== 'undefined' && import.meta.env.DEV) {
		window.__TFVE_EXPORT_TEST_HOOKS__ ??= {};
		window.__TFVE_EXPORT_TEST_HOOKS__.lastExportPath = path;
	}
}

export function recordExportCapabilities(capabilities: {
	video: boolean;
	audio: boolean;
	codec?: string;
}): void {
	if (typeof window !== 'undefined' && import.meta.env.DEV) {
		window.__TFVE_EXPORT_TEST_HOOKS__ ??= {};
		window.__TFVE_EXPORT_TEST_HOOKS__.capabilities = capabilities;
	}
}

export function recordWorkerTermination(): void {
	if (typeof window !== 'undefined' && import.meta.env.DEV) {
		window.__TFVE_EXPORT_TEST_HOOKS__ ??= {};
		window.__TFVE_EXPORT_TEST_HOOKS__.workerTerminations =
			(window.__TFVE_EXPORT_TEST_HOOKS__.workerTerminations ?? 0) + 1;
	}
}

export function recordExportProgress(progress: {
	framesDone: number;
	totalFrames: number;
	fps: number;
	phase: string;
}): void {
	if (typeof window !== 'undefined' && import.meta.env.DEV) {
		window.__TFVE_EXPORT_TEST_HOOKS__ ??= {};
		window.__TFVE_EXPORT_TEST_HOOKS__.lastProgress = progress;
	}
}
