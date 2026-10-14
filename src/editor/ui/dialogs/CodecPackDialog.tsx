import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { codecPackService, CODEC_PACK_METADATA } from '../../services/codecs/packService';
import type {
	CodecPackHardwareSupport,
	CodecPackProgress
} from '../../services/codecs/packProtocol';

interface CodecPackDialogProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function CodecPackDialog({ isOpen, onClose }: CodecPackDialogProps) {
	const [status, setStatus] = useState<{
		isInstalled: boolean;
		isAvailable: boolean;
		sizeBytes?: number;
	} | null>(null);
	const [hardware, setHardware] = useState<CodecPackHardwareSupport | null>(null);
	const [progress, setProgress] = useState<CodecPackProgress | null>(null);
	const [errorMessage, setErrorMessage] = useState('');
	const [isDownloading, setIsDownloading] = useState(false);
	const [activeTab, setActiveTab] = useState<'overview' | 'codecs' | 'compliance' | 'build'>(
		'overview'
	);

	useEffect(() => {
		if (!isOpen) return;
		let mounted = true;
		void codecPackService.getStatus().then((res) => {
			if (mounted) setStatus(res);
		});
		void codecPackService.checkHardwareSupport().then((hw) => {
			if (mounted) setHardware(hw);
		});
		return () => {
			mounted = false;
		};
	}, [isOpen]);

	if (!isOpen) return null;

	const handleDownload = async () => {
		setIsDownloading(true);
		setErrorMessage('');
		try {
			await codecPackService.downloadPack((p) => setProgress(p));
			const newStatus = await codecPackService.getStatus();
			setStatus(newStatus);
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : String(err));
		} finally {
			setIsDownloading(false);
		}
	};

	const handleDelete = async () => {
		await codecPackService.deletePack();
		setStatus({ isInstalled: false, isAvailable: status?.isAvailable ?? false });
		setProgress(null);
	};

	return createPortal(
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
			onClick={onClose}
		>
			<div
				className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-ink)] shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between border-b border-[var(--color-hairline)] bg-[var(--color-canvas-elevated)] px-6 py-4">
					<div>
						<h2 className="flex items-center gap-2 text-lg font-semibold">
							<span>Advanced Codec Pack</span>
							<span className="rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-2 py-0.5 font-mono text-xs text-[var(--color-mute)]">
								WASM · Optional
							</span>
						</h2>
						<p className="mt-0.5 text-xs text-[var(--color-mute)]">
							ProRes, DNxHD/HR, MPEG-2 4:2:2, FFV1, MXF Ingest & Uncompressed PCM
						</p>
					</div>
					<button
						type="button"
						className="rounded-md p-1 text-[var(--color-mute)] transition-colors hover:bg-[var(--color-hairline)]/30 hover:text-[var(--color-ink)]"
						onClick={onClose}
						aria-label="Close dialog"
					>
						✕
					</button>
				</div>

				{/* Navigation Tabs */}
				<div className="flex gap-4 border-b border-[var(--color-hairline)] bg-[var(--color-canvas)] px-6 text-xs font-medium">
					{(['overview', 'codecs', 'compliance', 'build'] as const).map((tab) => (
						<button
							key={tab}
							type="button"
							className={`border-b-2 py-2.5 capitalize transition-colors ${
								activeTab === tab
									? 'border-[var(--color-ink)] text-[var(--color-ink)]'
									: 'border-transparent text-[var(--color-mute)] hover:text-[var(--color-ink)]'
							}`}
							onClick={() => setActiveTab(tab)}
						>
							{tab === 'compliance' ? 'Compliance & Notices' : tab}
						</button>
					))}
				</div>

				{/* Content */}
				<div className="flex-1 space-y-5 overflow-y-auto p-6 text-sm">
					{activeTab === 'overview' && (
						<div className="space-y-4">
							{/* Deferred Status Banner */}
							<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-300">
								<div className="mb-1 font-semibold text-amber-200">
									Tier 2 Advanced Codec Pack — Deferred
								</div>
								<div>
									The WebAssembly compilation toolchain (<code>emcc</code> / Docker) is not
									available on this host. No ProRes, DNxHD/HR, or MPEG-2 codecs are currently
									bundled or functional in this build. All current editing and export workflows use
									verified platform WebCodecs. Refer to the <strong>Build Recipe</strong> tab for
									instructions on building the LGPL FFmpeg WASM module.
								</div>
							</div>

							{/* Pack Status Card */}
							<div className="flex items-center justify-between rounded-lg border border-[var(--color-hairline)] bg-[var(--color-canvas-elevated)] p-4">
								<div>
									<div className="flex items-center gap-2 text-sm font-medium">
										<span>{CODEC_PACK_METADATA.name}</span>
										<span
											className={`rounded-full px-2 py-0.5 font-mono text-xs ${
												status?.isInstalled
													? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
													: 'border border-amber-500/20 bg-amber-500/10 text-amber-400'
											}`}
										>
											{status?.isInstalled
												? 'Installed / Cached'
												: status?.isAvailable
													? 'Not Installed'
													: 'Not available in this build'}
										</span>
									</div>
									<div className="mt-1 text-xs text-[var(--color-mute)]">
										Download Size: {CODEC_PACK_METADATA.sizeLabel} · License:{' '}
										{CODEC_PACK_METADATA.license}
									</div>
								</div>
								{status?.isInstalled ? (
									<button
										type="button"
										className="rounded-md border border-[var(--color-hairline)] px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
										onClick={handleDelete}
									>
										Clear Cache
									</button>
								) : status?.isAvailable ? (
									<button
										type="button"
										disabled={isDownloading}
										className="rounded-md bg-[var(--color-ink)] px-4 py-1.5 text-xs font-medium text-[var(--color-canvas)] transition-all hover:opacity-90 disabled:opacity-50"
										onClick={handleDownload}
									>
										{isDownloading ? 'Downloading...' : 'Install Pack'}
									</button>
								) : (
									<button
										type="button"
										disabled={true}
										className="cursor-not-allowed rounded-md border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-3 py-1.5 text-xs font-medium text-[var(--color-mute)] opacity-60"
										title="The WASM binary is not bundled in this build. Run tools/codec-pack/build.sh with Emscripten to compile."
									>
										Not available in this build
									</button>
								)}
							</div>

							{/* Progress / Error message */}
							{progress && (
								<div className="space-y-2 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-canvas-elevated)] p-3">
									<div className="flex justify-between text-xs">
										<span>{progress.message}</span>
										<span className="font-mono">{Math.round(progress.percent * 100)}%</span>
									</div>
									<div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-hairline)]">
										<div
											className="h-full bg-[var(--color-ink)] transition-all duration-200"
											style={{ width: `${Math.round(progress.percent * 100)}%` }}
										/>
									</div>
								</div>
							)}

							{errorMessage && (
								<div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs leading-relaxed text-red-300">
									<strong>Installation Notice:</strong> {errorMessage}
								</div>
							)}

							{/* Hardware Check */}
							<div className="space-y-2">
								<h3 className="text-xs font-semibold tracking-wider text-[var(--color-mute)] uppercase">
									Host Environment & Hardware Acceleration
								</h3>
								<div className="grid grid-cols-2 gap-2 text-xs">
									<div className="flex justify-between rounded border border-[var(--color-hairline)] bg-[var(--color-canvas-elevated)] p-2.5">
										<span>WebAssembly Runtime</span>
										<span className={hardware?.hasWasm ? 'text-emerald-400' : 'text-red-400'}>
											{hardware?.hasWasm ? 'Supported' : 'Unavailable'}
										</span>
									</div>
									<div className="flex justify-between rounded border border-[var(--color-hairline)] bg-[var(--color-canvas-elevated)] p-2.5">
										<span>WASM SIMD-128</span>
										<span className={hardware?.hasSimd ? 'text-emerald-400' : 'text-amber-400'}>
											{hardware?.hasSimd ? 'Available' : 'Disabled'}
										</span>
									</div>
									<div className="flex justify-between rounded border border-[var(--color-hairline)] bg-[var(--color-canvas-elevated)] p-2.5">
										<span>OPFS SyncAccessHandle</span>
										<span className={hardware?.hasOpfsSync ? 'text-emerald-400' : 'text-amber-400'}>
											{hardware?.hasOpfsSync ? 'Supported (Zero-Copy)' : 'Async OPFS Only'}
										</span>
									</div>
									<div className="flex justify-between rounded border border-[var(--color-hairline)] bg-[var(--color-canvas-elevated)] p-2.5">
										<span>SharedArrayBuffer (Threads)</span>
										<span
											className={
												hardware?.hasSharedArrayBuffer
													? 'text-emerald-400'
													: 'text-[var(--color-mute)]'
											}
										>
											{hardware?.hasSharedArrayBuffer ? 'Enabled' : 'Single-thread (No COOP)'}
										</span>
									</div>
								</div>
							</div>
						</div>
					)}

					{activeTab === 'codecs' && (
						<div className="space-y-4">
							<div className="overflow-hidden rounded-lg border border-[var(--color-hairline)]">
								<div className="bg-[var(--color-canvas-elevated)] px-4 py-2 text-xs font-semibold tracking-wider text-[var(--color-mute)] uppercase">
									Supported Decoders (Ingest)
								</div>
								<div className="divide-y divide-[var(--color-hairline)] text-xs">
									{CODEC_PACK_METADATA.decoders.map((dec) => (
										<div key={dec} className="flex items-center justify-between px-4 py-2.5">
											<span>{dec}</span>
											<span className="font-mono text-emerald-400">LGPL libavcodec</span>
										</div>
									))}
								</div>
							</div>

							<div className="overflow-hidden rounded-lg border border-[var(--color-hairline)]">
								<div className="bg-[var(--color-canvas-elevated)] px-4 py-2 text-xs font-semibold tracking-wider text-[var(--color-mute)] uppercase">
									Supported Encoders (Export)
								</div>
								<div className="divide-y divide-[var(--color-hairline)] text-xs">
									{CODEC_PACK_METADATA.encoders.map((enc) => (
										<div key={enc} className="flex items-center justify-between px-4 py-2.5">
											<span>{enc}</span>
											<span className="font-mono text-emerald-400">LGPL libavcodec</span>
										</div>
									))}
								</div>
							</div>
						</div>
					)}

					{activeTab === 'compliance' && (
						<div className="space-y-3 text-xs leading-relaxed text-[var(--color-mute)]">
							<div className="space-y-2 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-canvas-elevated)] p-3.5 text-[var(--color-ink)]">
								<h4 className="text-sm font-semibold">Legal & Trademark Notices</h4>
								<p>
									<strong>Apple ProRes:</strong> Apple ProRes is a registered trademark of Apple
									Inc. The ProRes-compatible encoder in this pack is an independent, open-source,
									reverse-engineered implementation (
									<code className="font-mono text-xs">prores_ks</code>) and is not certified,
									tested, or endorsed by Apple Inc.
								</p>
								<p>
									<strong>Avid DNxHD / DNxHR:</strong> Avid, DNxHD, and DNxHR (SMPTE VC-3) are
									trademarks or registered trademarks of Avid Technology, Inc.
								</p>
								<p>
									<strong>Strict LGPL Discipline:</strong> This software uses only LGPL v2.1+ open
									source libraries. No GPL or proprietary non-free libraries are bundled. Software
									H.264 and HEVC encoders are explicitly omitted to prevent patent exposure; all
									H.264/HEVC encoding uses standard hardware WebCodecs APIs.
								</p>
							</div>
						</div>
					)}

					{activeTab === 'build' && (
						<div className="space-y-3">
							<p className="text-xs text-[var(--color-mute)]">
								The codec pack uses a reproducible Emscripten build recipe located at{' '}
								<code className="font-mono text-xs text-[var(--color-ink)]">
									tools/codec-pack/build.sh
								</code>
								.
							</p>
							<div className="overflow-x-auto rounded-lg border border-[var(--color-hairline)] bg-black p-3 font-mono text-xs text-emerald-400">
								<pre>{`# 1. Install Emscripten SDK
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk && ./emsdk install latest && ./emsdk activate latest
source ~/emsdk/emsdk_env.sh

# 2. Run the reproducible LGPL build script
cd thefreevideoeditor
./tools/codec-pack/build.sh`}</pre>
							</div>
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="flex items-center justify-end border-t border-[var(--color-hairline)] bg-[var(--color-canvas-elevated)] px-6 py-3">
					<button
						type="button"
						className="rounded-md border border-[var(--color-hairline)] px-4 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-hairline)]/30"
						onClick={onClose}
					>
						Close
					</button>
				</div>
			</div>
		</div>,
		document.body
	);
}
