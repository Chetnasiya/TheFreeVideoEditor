import type { ProjectId } from '../../core';

interface ActiveExportSession {
	controller: AbortController;
	settled: Promise<void>;
	resolve: () => void;
}

const activeSessions = new Map<ProjectId, ActiveExportSession>();

export function registerProjectExport(
	projectId: ProjectId,
	controller: AbortController
): () => void {
	if (activeSessions.has(projectId))
		throw new Error('An export is already running for this project.');
	let resolve = () => {};
	const settled = new Promise<void>((done) => {
		resolve = done;
	});
	activeSessions.set(projectId, { controller, settled, resolve });
	return () => {
		const session = activeSessions.get(projectId);
		if (session?.controller !== controller) return;
		activeSessions.delete(projectId);
		session.resolve();
	};
}

export function isProjectExportActive(projectId: ProjectId): boolean {
	return activeSessions.has(projectId);
}

export async function cancelProjectExport(projectId: ProjectId): Promise<void> {
	const session = activeSessions.get(projectId);
	if (!session) return;
	session.controller.abort();
	await session.settled;
}
