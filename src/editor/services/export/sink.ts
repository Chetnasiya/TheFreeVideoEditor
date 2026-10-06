import { BufferTarget, StreamTarget, type Target } from 'mediabunny';
import type { SaveFileType, StreamingSaveTarget } from '../storage/fileAccess';
import { createStreamingSaveTarget } from '../storage/fileAccess';

export interface ExportSink {
	target: Target;
	finish(): Promise<Blob | null>;
	abort(error: unknown): Promise<void>;
}

export function createExportSinkForTarget(
	format: 'mp4' | 'webm',
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
			if (!target.buffer) throw new Error('Video encoder did not produce an output file.');
			return new Blob([target.buffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
		},
		async abort() {}
	};
}

export async function createExportSink(
	filename: string,
	format: 'mp4' | 'webm'
): Promise<ExportSink | null> {
	const types: SaveFileType[] = [
		{
			description: format === 'mp4' ? 'MP4 video' : 'WebM video',
			accept: { [format === 'mp4' ? 'video/mp4' : 'video/webm']: [`.${format}`] }
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
