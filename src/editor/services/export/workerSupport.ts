export interface WorkerExportEnvironment {
	moduleWorker: boolean;
	offscreenCanvas: boolean;
	workerWebCodecs: boolean;
}

export function workerExportFallbackReason(environment: WorkerExportEnvironment): string | null {
	if (!environment.moduleWorker) return 'Module Workers are unavailable.';
	if (!environment.offscreenCanvas) return 'OffscreenCanvas is unavailable.';
	if (!environment.workerWebCodecs) return 'Worker WebCodecs is unavailable.';
	return null;
}

export function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
