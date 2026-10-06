import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectId } from '../../core';
import { importFiles } from './import';

const mediaMocks = vi.hoisted(() => ({
	deleteMedia: vi.fn(),
	writeMedia: vi.fn(),
	probeMedia: vi.fn()
}));

vi.mock('../storage/opfs', () => ({
	deleteMedia: mediaMocks.deleteMedia,
	isSupported: vi.fn(() => true),
	writeMedia: mediaMocks.writeMedia,
	UnsupportedMediaStorageError: class UnsupportedMediaStorageError extends Error {}
}));

vi.mock('./probe', () => ({ probeMedia: mediaMocks.probeMedia }));
vi.mock('./derived', () => ({ generateDerived: vi.fn() }));

describe('media import cancellation', () => {
	beforeEach(() => {
		mediaMocks.deleteMedia.mockReset().mockResolvedValue(undefined);
		mediaMocks.writeMedia.mockReset();
		mediaMocks.probeMedia.mockReset();
	});

	it('removes a stored file when metadata probing is cancelled', async () => {
		const controller = new AbortController();
		mediaMocks.writeMedia.mockImplementation(async () => {
			controller.abort();
			return 'projects/project/media/asset.wav';
		});
		mediaMocks.probeMedia.mockRejectedValue(
			new DOMException('The operation was aborted.', 'AbortError')
		);
		const onProgress = vi.fn();

		const result = await importFiles([new File(['wave'], 'tone.wav', { type: 'audio/wav' })], {
			projectId: 'project' as ProjectId,
			fps: 30,
			signalForFile: () => controller.signal,
			onProgress,
			mutateProject: vi.fn()
		});

		expect(mediaMocks.deleteMedia).toHaveBeenCalledWith('project', expect.any(String));
		expect(result).toEqual({ imported: [], failed: [] });
		expect(onProgress).toHaveBeenLastCalledWith(
			expect.objectContaining({ phase: 'cancelled', name: 'tone.wav' })
		);
	});

	it('reports when a cancelled import leaves an unremovable media file', async () => {
		const controller = new AbortController();
		mediaMocks.writeMedia.mockImplementation(async () => {
			controller.abort();
			return 'projects/project/media/asset.wav';
		});
		mediaMocks.probeMedia.mockRejectedValue(
			new DOMException('The operation was aborted.', 'AbortError')
		);
		mediaMocks.deleteMedia.mockRejectedValue(new Error('Storage unavailable'));
		const onProgress = vi.fn();

		const result = await importFiles([new File(['wave'], 'tone.wav', { type: 'audio/wav' })], {
			projectId: 'project' as ProjectId,
			fps: 30,
			signalForFile: () => controller.signal,
			onProgress,
			mutateProject: vi.fn()
		});

		expect(result.failed).toHaveLength(1);
		expect(result.failed[0]?.reason).toContain('could not be removed');
		expect(onProgress).toHaveBeenLastCalledWith(
			expect.objectContaining({ phase: 'failed', name: 'tone.wav' })
		);
	});
});
