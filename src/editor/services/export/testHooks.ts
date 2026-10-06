export type ExportPath = 'worker-webcodecs' | 'main-webcodecs' | 'compatibility';

export interface ExportTestHooks {
	lastExportPath?: ExportPath;
	lastRenderer?: 'webgl2' | 'canvas2d';
	forceRenderer?: 'webgl2' | 'canvas2d';
	workerTerminations?: number;
	capabilities?: { video: boolean; audio: boolean; codec?: string };
	hideFirstVideoTrack?: (hidden: boolean) => boolean;
	addSecondClipAfterGap?: () => boolean;
	addSampleOverlay?: () => boolean;
	hideTopVideoTrack?: (hidden: boolean) => boolean;
	createUiAuditFixture?: () => Promise<{ trackCount: number; clipCount: number } | false>;
	lastProgress?: { framesDone: number; totalFrames: number; fps: number; phase: string };
	lastPlan?: { totalFrames: number; durationUs: number; fps: number };
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

export function recordExportRenderer(renderer: 'webgl2' | 'canvas2d'): void {
	if (typeof window !== 'undefined' && import.meta.env.DEV) {
		window.__TFVE_EXPORT_TEST_HOOKS__ ??= {};
		window.__TFVE_EXPORT_TEST_HOOKS__.lastRenderer = renderer;
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

export function recordExportPlan(plan: {
	totalFrames: number;
	durationUs: number;
	fps: number;
}): void {
	if (typeof window !== 'undefined' && import.meta.env.DEV) {
		window.__TFVE_EXPORT_TEST_HOOKS__ ??= {};
		window.__TFVE_EXPORT_TEST_HOOKS__.lastPlan = plan;
	}
}

/** Dev-only override so tests can drive the export through a specific renderer. */
export function forcedExportRenderer(): 'webgl2' | 'canvas2d' | undefined {
	if (typeof window === 'undefined' || !import.meta.env.DEV) return undefined;
	return window.__TFVE_EXPORT_TEST_HOOKS__?.forceRenderer;
}
