import { BufferTarget, StreamTarget, type Target } from 'mediabunny';
import type { SaveFileType, StreamingSaveTarget } from '../storage/fileAccess';
import { createStreamingSaveTarget } from '../storage/fileAccess';

import type { ExportContainerFormat } from './plan';

export interface ExportSink {
	target: Target;
	finish(): Promise<Blob | null>;
	abort(error: unknown): Promise<void>;
}

function getMimeType(format: ExportContainerFormat): string {
	switch (format) {
		case 'mp4':
			return 'video/mp4';
		case 'mov':
			return 'video/quicktime';
		case 'wav':
			return 'audio/wav';
		case 'webm':
			return 'video/webm';
	}
}

function getDescription(format: ExportContainerFormat): string {
	switch (format) {
		case 'mp4':
			return 'MP4 video';
		case 'mov':
			return 'QuickTime MOV';
		case 'wav':
			return 'WAV audio';
		case 'webm':
			return 'WebM video';
	}
}

export function createExportSinkForTarget(
	format: ExportContainerFormat,
	streaming: StreamingSaveTarget | null
): ExportSink {
	if (streaming) {
		const writable = new WritableStream<{
			type: 'write';
			data: Uint8Array<ArrayBuffer>;
			position: number;
		}>({
			write: (chunk) => streaming.write(chunk.data, chunk.position),
			close: () => streaming.close(),
			abort: (error) => streaming.abort(error)
		});
		let closed = false;
		return {
			target: new StreamTarget(writable, { chunked: true }),
			async finish() {
				closed = true;
				return null;
			},
			async abort(error) {
				if (closed) return;
				closed = true;
				await streaming.abort(error);
			}
		};
	}

	const target = new BufferTarget();
	return {
		target,
		async finish() {
			if (!target.buffer) throw new Error('Encoder did not produce an output file.');
			return new Blob([target.buffer], { type: getMimeType(format) });
		},
		async abort() {}
	};
}

export async function createExportSink(
	filename: string,
	format: ExportContainerFormat
): Promise<ExportSink | null> {
	const types: SaveFileType[] = [
		{
			description: getDescription(format),
			accept: { [getMimeType(format)]: [`.${format}`] }
		}
	];
	let streaming: StreamingSaveTarget | null;
	try {
		streaming = await createStreamingSaveTarget(filename, types);
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') return null;
		throw error;
	}
	if (streaming) {
		return createExportSinkForTarget(format, streaming);
	}
	return createExportSinkForTarget(format, null);
}
