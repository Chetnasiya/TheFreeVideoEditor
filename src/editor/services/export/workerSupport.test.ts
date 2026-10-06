import { afterEach, describe, expect, it, vi } from 'vitest';
import { workerExportFallbackReason, yieldToEventLoop } from './workerSupport';

describe('Worker export fallback', () => {
	afterEach(() => vi.useRealTimers());

	it.each([
		[{ moduleWorker: false, offscreenCanvas: true, workerWebCodecs: true }, 'Module Workers'],
		[{ moduleWorker: true, offscreenCanvas: false, workerWebCodecs: true }, 'OffscreenCanvas'],
		[{ moduleWorker: true, offscreenCanvas: true, workerWebCodecs: false }, 'Worker WebCodecs']
	] as const)('selects the yielding main-thread path without %s', (environment, reason) => {
		expect(workerExportFallbackReason(environment)).toContain(reason);
	});

	it('selects Worker rendering when all required APIs are available', () => {
		expect(
			workerExportFallbackReason({
				moduleWorker: true,
				offscreenCanvas: true,
				workerWebCodecs: true
			})
		).toBeNull();
	});

	it('yields to the event loop before continuing fallback work', async () => {
		vi.useFakeTimers();
		let resumed = false;
		const continuation = yieldToEventLoop().then(() => {
			resumed = true;
		});
		expect(resumed).toBe(false);
		await vi.runOnlyPendingTimersAsync();
		await continuation;
		expect(resumed).toBe(true);
	});
});
