/// <reference lib="webworker" />
import type {
	CodecPackHardwareSupport,
	CodecPackWorkerInMessage,
	CodecPackWorkerOutMessage
} from './packProtocol';

const CACHE_NAME = 'tfve-codec-pack-v1';
const PACK_FILES = ['/codecs/tfve-codec-pack.js', '/codecs/tfve-codec-pack.wasm'];

function checkSimd(): boolean {
	try {
		// Valid minimal WASM binary using SIMD i32x4.splat
		const simdBytes = new Uint8Array([
			0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
			0x03, 0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0x0b
		]);
		return WebAssembly.validate(simdBytes);
	} catch {
		return false;
	}
}

function probeSupport(): CodecPackHardwareSupport {
	const hasWasm = typeof WebAssembly !== 'undefined';
	const hasSimd = checkSimd();
	const hasOpfsSync =
		typeof FileSystemFileHandle !== 'undefined' &&
		'createSyncAccessHandle' in FileSystemFileHandle.prototype;
	const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

	return {
		hasWasm,
		hasSimd,
		hasOpfsSync,
		hasSharedArrayBuffer
	};
}

async function checkStatus(
	urlBase = '/codecs'
): Promise<{ isInstalled: boolean; isAvailable: boolean; sizeBytes?: number }> {
	let isInstalled = false;
	let sizeBytes: number | undefined;

	try {
		if (typeof caches !== 'undefined') {
			const cache = await caches.open(CACHE_NAME);
			const responses = await Promise.all(PACK_FILES.map((f) => cache.match(f)));
			const allPresent = responses.every((r) => r !== undefined);
			if (allPresent) {
				let total = 0;
				for (const r of responses) {
					if (r) {
						const blob = await r.blob();
						total += blob.size;
					}
				}
				isInstalled = true;
				sizeBytes = total;
			}
		}
	} catch {
		// cache error ignored
	}

	let isAvailable = false;
	try {
		const resp = await fetch(`${urlBase}/tfve-codec-pack.wasm`, { method: 'HEAD' });
		isAvailable = resp.ok;
	} catch {
		isAvailable = false;
	}

	return { isInstalled, isAvailable, sizeBytes };
}

async function downloadPack(urlBase = '/codecs'): Promise<void> {
	if (typeof caches === 'undefined') {
		throw new Error('CacheStorage is not available in this browser context.');
	}

	self.postMessage({
		type: 'progress',
		progress: {
			phase: 'checking',
			percent: 0.1,
			message: 'Checking codec pack distribution...'
		}
	} as CodecPackWorkerOutMessage);

	const cache = await caches.open(CACHE_NAME);
	const wasmUrl = `${urlBase}/tfve-codec-pack.wasm`;
	const jsUrl = `${urlBase}/tfve-codec-pack.js`;

	self.postMessage({
		type: 'progress',
		progress: {
			phase: 'downloading',
			percent: 0.3,
			message: 'Fetching codec pack binaries...'
		}
	} as CodecPackWorkerOutMessage);

	const [wasmResp, jsResp] = await Promise.all([
		fetch(wasmUrl).catch(() => null),
		fetch(jsUrl).catch(() => null)
	]);

	if (!wasmResp || !wasmResp.ok || !jsResp || !jsResp.ok) {
		throw new Error(
			'Advanced Codec Pack WASM binary is not deployed on this server. ' +
				'Run tools/codec-pack/build.sh with Emscripten to build the LGPL FFmpeg WebAssembly package.'
		);
	}

	await Promise.all([cache.put(wasmUrl, wasmResp), cache.put(jsUrl, jsResp)]);

	self.postMessage({
		type: 'progress',
		progress: {
			phase: 'ready',
			percent: 1.0,
			message: 'Advanced Codec Pack installed and ready.'
		}
	} as CodecPackWorkerOutMessage);
	self.postMessage({ type: 'download_success' } as CodecPackWorkerOutMessage);
}

async function deletePack(): Promise<void> {
	if (typeof caches !== 'undefined') {
		await caches.delete(CACHE_NAME);
	}
	self.postMessage({ type: 'delete_success' } as CodecPackWorkerOutMessage);
}

self.addEventListener('message', (event: MessageEvent<CodecPackWorkerInMessage>) => {
	const msg = event.data;
	switch (msg.type) {
		case 'check_support': {
			const support = probeSupport();
			self.postMessage({ type: 'support_result', support } as CodecPackWorkerOutMessage);
			break;
		}
		case 'get_status': {
			void checkStatus().then((res) => {
				self.postMessage({
					type: 'status_result',
					isInstalled: res.isInstalled,
					isAvailable: res.isAvailable,
					sizeBytes: res.sizeBytes
				} as CodecPackWorkerOutMessage);
			});
			break;
		}
		case 'download_pack': {
			void downloadPack(msg.url).catch((err: unknown) => {
				self.postMessage({
					type: 'error',
					message: err instanceof Error ? err.message : String(err)
				} as CodecPackWorkerOutMessage);
			});
			break;
		}
		case 'delete_pack': {
			void deletePack().catch((err: unknown) => {
				self.postMessage({
					type: 'error',
					message: err instanceof Error ? err.message : String(err)
				} as CodecPackWorkerOutMessage);
			});
			break;
		}
	}
});
