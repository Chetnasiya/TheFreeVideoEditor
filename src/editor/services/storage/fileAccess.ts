export interface SaveFileType {
	description: string;
	accept: Record<string, string[]>;
}

interface WritableFile {
	write(data: Blob | BufferSource): Promise<void>;
	seek?(position: number): Promise<void>;
	truncate?(size: number): Promise<void>;
	close(): Promise<void>;
	abort?(): Promise<void>;
}

interface FileHandle {
	createWritable(): Promise<WritableFile>;
}

interface OpenFileHandle {
	getFile(): Promise<File>;
}

interface PickerWindow extends Window {
	showSaveFilePicker?: (options: {
		suggestedName: string;
		types: SaveFileType[];
	}) => Promise<FileHandle>;
	showOpenFilePicker?: (options: {
		multiple: boolean;
		types: SaveFileType[];
	}) => Promise<OpenFileHandle[]>;
}

export interface StreamingSaveTarget {
	write(chunk: Uint8Array, position?: number): Promise<void>;
	close(): Promise<void>;
	abort(error?: unknown): Promise<void>;
}

export type SaveFileResult = 'saved' | 'cancelled';

export function supportsStreamingSave(): boolean {
	return typeof window !== 'undefined' && Boolean((window as PickerWindow).showSaveFilePicker);
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}

export async function saveFile(
	blob: Blob,
	suggestedName: string,
	types: SaveFileType[]
): Promise<SaveFileResult> {
	const picker = window as PickerWindow;
	if (picker.showSaveFilePicker) {
		try {
			const handle = await picker.showSaveFilePicker({ suggestedName, types });
			const writable = await handle.createWritable();
			await writable.write(blob);
			await writable.close();
			return 'saved';
		} catch (error) {
			if (isAbortError(error)) return 'cancelled';
			throw error;
		}
	}

	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = suggestedName;
	anchor.hidden = true;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
	return 'saved';
}

export async function createStreamingSaveTarget(
	suggestedName: string,
	types: SaveFileType[]
): Promise<StreamingSaveTarget | null> {
	const picker = window as PickerWindow;
	if (!picker.showSaveFilePicker) return null;
	const handle = await picker.showSaveFilePicker({ suggestedName, types });
	const writable = await handle.createWritable();
	return {
		write: async (chunk, position) => {
			if (position !== undefined && writable.seek) await writable.seek(position);
			await writable.write(Uint8Array.from(chunk).buffer);
		},
		close: () => writable.close(),
		abort: async (error) => {
			if (writable.abort) await writable.abort();
			else throw error instanceof Error ? error : new Error('Could not abort the save operation.');
		}
	};
}

export async function openFile(accept: string): Promise<File | null> {
	const [file] = await openFiles(accept, false);
	return file ?? null;
}

export async function openFiles(accept: string, multiple = true): Promise<File[]> {
	const picker = window as PickerWindow;
	if (picker.showOpenFilePicker) {
		const tokens = accept
			.split(',')
			.map((token) => token.trim())
			.filter(Boolean);
		const extensions = tokens.filter((token) => token.startsWith('.'));
		const mimeTypes = tokens.filter((token) => token.includes('/') && !token.includes('*'));
		const acceptedTypes = mimeTypes.length
			? Object.fromEntries(mimeTypes.map((mimeType) => [mimeType, extensions]))
			: { 'application/octet-stream': extensions };
		try {
			const handles = await picker.showOpenFilePicker({
				multiple,
				types: [{ description: 'Selected file type', accept: acceptedTypes }]
			});
			return Promise.all(handles.map((item) => item.getFile()));
		} catch (error) {
			if (isAbortError(error)) return [];
			throw error;
		}
	}

	return new Promise<File[]>((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = multiple;
		input.accept = accept;
		input.hidden = true;
		input.addEventListener(
			'change',
			() => {
				resolve(Array.from(input.files ?? []));
				input.remove();
			},
			{ once: true }
		);
		input.addEventListener(
			'cancel',
			() => {
				resolve([]);
				input.remove();
			},
			{ once: true }
		);
		document.body.append(input);
		input.click();
	});
}
