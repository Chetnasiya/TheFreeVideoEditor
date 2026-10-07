import { parseCubeLut, type ParsedLut3D } from '../../core/lut';
import type { Asset, ProjectId } from '../../core';
import { getMediaFile } from '../storage/opfs';

const lutCache = new Map<string, ParsedLut3D>();

export function storeParsedLut(id: string, lut: ParsedLut3D): void {
	lutCache.set(id, lut);
}

export function getParsedLut(id: string): ParsedLut3D | null {
	return lutCache.get(id) ?? null;
}

export function clearParsedLuts(): void {
	lutCache.clear();
}

export async function ensureLutLoaded(
	projectId: ProjectId,
	asset: Asset,
	getFile?: (projectId: ProjectId, asset: Asset) => Promise<File>
): Promise<ParsedLut3D | null> {
	if (lutCache.has(asset.id)) {
		return lutCache.get(asset.id)!;
	}
	if (asset.kind !== 'lut' || asset.offline) return null;
	try {
		const file = getFile ? await getFile(projectId, asset) : await getMediaFile(projectId, asset);
		const text = await file.text();
		const parsed = parseCubeLut(text);
		storeParsedLut(asset.id, parsed);
		return parsed;
	} catch (error) {
		console.warn(`Failed to load or parse LUT "${asset.name}":`, error);
		return null;
	}
}
