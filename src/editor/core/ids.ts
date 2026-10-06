import type { AssetId } from './types';

function randomId(): string {
	const cryptoApi = typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto;
	if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();

	const bytes = new Uint8Array(16);
	if (cryptoApi) {
		cryptoApi.getRandomValues(bytes);
	} else {
		for (let index = 0; index < bytes.length; index += 1) {
			bytes[index] = Math.floor(Math.random() * 256);
		}
	}
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createAssetId(existing: Iterable<string> = []): AssetId {
	const ids = new Set(existing);
	for (let attempts = 0; attempts < 10; attempts += 1) {
		const id = randomId() as AssetId;
		if (!ids.has(id)) return id;
	}
	throw new Error('Could not generate a unique media asset id.');
}

export function mediaFilename(assetId: AssetId, filename: string): string {
	const extension =
		filename
			.split('.')
			.at(-1)
			?.toLowerCase()
			.replace(/[^a-z0-9]/g, '') ?? '';
	return `${assetId}${extension ? `.${extension}` : ''}`;
}

export function projectMediaPath(projectId: string, assetId: AssetId, filename: string): string {
	return `projects/${projectId}/media/${mediaFilename(assetId, filename)}`;
}

export function rebaseMediaPath(projectId: string, assetId: AssetId, originalPath: string): string {
	const extension =
		originalPath
			.split('/')
			.at(-1)
			?.split('.')
			.at(-1)
			?.toLowerCase()
			.replace(/[^a-z0-9]/g, '') ?? '';
	return `projects/${projectId}/media/${assetId}${extension ? `.${extension}` : ''}`;
}
