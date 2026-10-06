import { strFromU8, unzipSync } from 'fflate';

export async function verifyInterchangePackage(
	archive: File,
	original: File,
	format: 'xmeml' | 'edl' | 'fcpxml' | 'otio'
) {
	const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
	const mediaEntries = Object.entries(entries).filter(([path]) => path.startsWith('media/'));
	const originalBytes = new Uint8Array(await original.arrayBuffer());
	const interchangeEntries = Object.entries(entries).filter(([path]) => !path.startsWith('media/'));
	const text = interchangeEntries.map(([, data]) => strFromU8(data)).join('\n');
	const referencedPaths = [...text.matchAll(/(?:file:\/\/localhost\/)?media\/[^"'\s<>]+/g)].map(
		(match) => (match[0] ?? '').replace(/^file:\/\/localhost\//, '')
	);
	const wellFormed =
		format !== 'xmeml' && format !== 'fcpxml'
			? true
			: new DOMParser().parseFromString(text, 'application/xml').querySelector('parsererror') ===
				null;
	let validOtio = true;
	if (format === 'otio') {
		try {
			JSON.parse(text);
		} catch {
			validOtio = false;
		}
	}
	const mediaMatch = mediaEntries.some(([, data]) => {
		if (data.byteLength !== originalBytes.byteLength) return false;
		return data.every((value, index) => value === originalBytes[index]);
	});
	return {
		mediaCount: mediaEntries.length,
		mediaMatch,
		relativePaths: referencedPaths.length > 0,
		referencesResolve: referencedPaths.every((path) => Object.hasOwn(entries, path)),
		wellFormed,
		validOtio,
		paths: referencedPaths
	};
}
