import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../core';
import { cancelProjectExport, isProjectExportActive, registerProjectExport } from './session';

describe('project export sessions', () => {
	it('aborts and waits for the active export cleanup before resolving', async () => {
		const project = createEmptyProject({ name: 'Export session' });
		const controller = new AbortController();
		const unregister = registerProjectExport(project.id, controller);
		expect(isProjectExportActive(project.id)).toBe(true);

		let cancelled = false;
		const cancellation = cancelProjectExport(project.id).then(() => {
			cancelled = true;
		});
		expect(controller.signal.aborted).toBe(true);
		await Promise.resolve();
		expect(cancelled).toBe(false);

		unregister();
		await cancellation;
		expect(cancelled).toBe(true);
		expect(isProjectExportActive(project.id)).toBe(false);
	});

	it('rejects concurrent export sessions for the same project', () => {
		const project = createEmptyProject({ name: 'Single export' });
		const unregister = registerProjectExport(project.id, new AbortController());
		expect(() => registerProjectExport(project.id, new AbortController())).toThrow(
			'already running'
		);
		unregister();
	});
});
