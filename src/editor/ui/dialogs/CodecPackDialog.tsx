import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { codecPackService, CODEC_PACK_METADATA } from '../../services/codecs/packService';
import type {
	CodecPackHardwareSupport,
	CodecPackProgress
} from '../../services/codecs/packProtocol';
import './codec-dialogs.css';

interface CodecPackDialogProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function CodecPackDialog({ isOpen, onClose }: CodecPackDialogProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);
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

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (isOpen && !dialog.open) {
			dialog.showModal();
		} else if (!isOpen && dialog.open) {
			dialog.close();
		}
	}, [isOpen]);

	if (!isOpen) return null;

	const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
		if (e.target === dialogRef.current) {
			onClose();
		}
	};

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

	const modalContent = (
		<dialog
			ref={dialogRef}
			className="editor-dialog codec-pack-dialog"
			role="dialog"
			aria-labelledby="codec-pack-title"
			aria-modal="true"
			onClick={handleBackdropClick}
			onCancel={(e) => {
				e.preventDefault();
				onClose();
			}}
		>
			<div className="codec-dialog-inner">
				{/* Header */}
				<div className="codec-dialog-header">
					<div>
						<p className="dialog-eyebrow">CODEC PACK</p>
						<h2 id="codec-pack-title" className="text-sm font-semibold text-[#f1f5f9]">
							Advanced Codec Pack
						</h2>
						<p className="dialog-description mt-1 text-xs">
							ProRes, DNxHD/HR, MPEG-2 4:2:2, FFV1, MXF Ingest & Uncompressed PCM
						</p>
					</div>
					<button
						type="button"
						className="icon-button dialog-close"
						onClick={onClose}
						aria-label="Close dialog"
					>
						✕
					</button>
				</div>

				{/* Navigation Tabs */}
				<div className="codec-tabs-bar">
					{(['overview', 'codecs', 'compliance', 'build'] as const).map((tab) => (
						<button
							key={tab}
							type="button"
							className={`codec-tab-button ${activeTab === tab ? 'is-active' : ''}`}
							onClick={() => setActiveTab(tab)}
						>
							{tab === 'compliance'
								? 'Compliance & Notices'
								: tab === 'build'
									? 'Build Recipe'
									: tab.charAt(0).toUpperCase() + tab.slice(1)}
						</button>
					))}
				</div>

				{/* Content */}
				<div className="codec-dialog-body">
					{activeTab === 'overview' && (
						<div className="space-y-4">
							{/* Deferred Status Banner */}
							<div className="rounded-md border border-amber-500/25 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-300">
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
							<div className="codec-card flex items-center justify-between">
								<div>
									<div className="flex items-center gap-2 text-xs font-semibold text-[#f1f5f9]">
										<span>{CODEC_PACK_METADATA.name}</span>
										<span
											className={`rounded px-2 py-0.5 font-mono text-[11px] ${
												status?.isInstalled
													? 'border border-emerald-500/25 bg-emerald-500/15 text-emerald-400'
													: 'border border-amber-500/25 bg-amber-500/15 text-amber-400'
											}`}
										>
											{status?.isInstalled
												? 'Installed / Cached'
												: status?.isAvailable
													? 'Not Installed'
													: 'Not available in this build'}
										</span>
									</div>
									<div className="mt-1 text-[11px] text-[#94a3b8]">
										Download Size: {CODEC_PACK_METADATA.sizeLabel} · License:{' '}
										{CODEC_PACK_METADATA.license}
									</div>
								</div>
								{status?.isInstalled ? (
									<button type="button" className="danger-button" onClick={handleDelete}>
										Clear Cache
									</button>
								) : status?.isAvailable ? (
									<button
										type="button"
										disabled={isDownloading}
										className="primary-button"
										onClick={handleDownload}
									>
										{isDownloading ? 'Downloading...' : 'Install Pack'}
									</button>
								) : (
									<button
										type="button"
										disabled={true}
										className="secondary-button"
										style={{ opacity: 0.5, cursor: 'not-allowed' }}
										title="The WASM binary is not bundled in this build. Run tools/codec-pack/build.sh with Emscripten to compile."
									>
										Unavailable
									</button>
								)}
							</div>

							{/* Progress / Error message */}
							{progress && (
								<div className="codec-card space-y-2">
									<div className="flex justify-between text-xs">
										<span className="text-[#cbd5e1]">{progress.message}</span>
										<span className="font-mono text-[#38bdf8]">
											{Math.round(progress.percent * 100)}%
										</span>
									</div>
									<div className="h-1.5 w-full overflow-hidden rounded-full bg-[#111116]">
										<div
											className="h-full bg-[#38bdf8] transition-all duration-200"
											style={{ width: `${Math.round(progress.percent * 100)}%` }}
										/>
									</div>
								</div>
							)}

							{errorMessage && (
								<div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs leading-relaxed text-red-300">
									<strong>Installation Notice:</strong> {errorMessage}
								</div>
							)}

							{/* Hardware Check */}
							<div className="space-y-2">
								<h3 className="text-xs font-semibold tracking-wider text-[#94a3b8] uppercase">
									Host Environment & Hardware Acceleration
								</h3>
								<div className="grid grid-cols-2 gap-2 text-xs">
									<div className="codec-card flex items-center justify-between gap-3 py-2.5">
										<span className="truncate text-[#cbd5e1]">WebAssembly Runtime</span>
										<span
											className={
												hardware?.hasWasm
													? 'shrink-0 font-medium text-emerald-400'
													: 'shrink-0 font-medium text-red-400'
											}
										>
											{hardware?.hasWasm ? 'Supported' : 'Unavailable'}
										</span>
									</div>
									<div className="codec-card flex items-center justify-between gap-3 py-2.5">
										<span className="truncate text-[#cbd5e1]">WASM SIMD-128</span>
										<span
											className={
												hardware?.hasSimd
													? 'shrink-0 font-medium text-emerald-400'
													: 'shrink-0 font-medium text-amber-400'
											}
										>
											{hardware?.hasSimd ? 'Available' : 'Disabled'}
										</span>
									</div>
									<div className="codec-card flex items-center justify-between gap-3 py-2.5">
										<span className="truncate text-[#cbd5e1]">OPFS SyncAccessHandle</span>
										<span
											className={
												hardware?.hasOpfsSync
													? 'shrink-0 font-medium text-emerald-400'
													: 'shrink-0 font-medium text-amber-400'
											}
										>
											{hardware?.hasOpfsSync ? 'Supported (Zero-Copy)' : 'Async OPFS Only'}
										</span>
									</div>
									<div className="codec-card flex items-center justify-between gap-3 py-2.5">
										<span className="truncate text-[#cbd5e1]">SharedArrayBuffer (Threads)</span>
										<span
											className={
												hardware?.hasSharedArrayBuffer
													? 'shrink-0 font-medium text-emerald-400'
													: 'shrink-0 font-medium text-[#94a3b8]'
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
							<div className="codec-table-container">
								<div className="codec-table-header">Supported Decoders (Ingest)</div>
								<div>
									{CODEC_PACK_METADATA.decoders.map((dec) => (
										<div key={dec} className="codec-table-row">
											<span className="font-medium text-[#f1f5f9]">{dec}</span>
											<span className="font-mono text-xs text-emerald-400">LGPL libavcodec</span>
										</div>
									))}
								</div>
							</div>

							<div className="codec-table-container">
								<div className="codec-table-header">Supported Encoders (Export)</div>
								<div>
									{CODEC_PACK_METADATA.encoders.map((enc) => (
										<div key={enc} className="codec-table-row">
											<span className="font-medium text-[#f1f5f9]">{enc}</span>
											<span className="font-mono text-xs text-emerald-400">LGPL libavcodec</span>
										</div>
									))}
								</div>
							</div>
						</div>
					)}

					{activeTab === 'compliance' && (
						<div className="codec-card space-y-3 text-xs leading-relaxed text-[#94a3b8]">
							<h4 className="text-sm font-semibold text-[#f1f5f9]">Legal & Trademark Notices</h4>
							<p>
								<strong className="text-[#f1f5f9]">Apple ProRes:</strong> Apple ProRes is a
								registered trademark of Apple Inc. The ProRes-compatible encoder in this pack is an
								independent, open-source, reverse-engineered implementation (
								<code className="font-mono text-xs text-[#38bdf8]">prores_ks</code>) and is not
								certified, tested, or endorsed by Apple Inc.
							</p>
							<p>
								<strong className="text-[#f1f5f9]">Avid DNxHD / DNxHR:</strong> Avid, DNxHD, and
								DNxHR (SMPTE VC-3) are trademarks or registered trademarks of Avid Technology, Inc.
							</p>
							<p>
								<strong className="text-[#f1f5f9]">Strict LGPL Discipline:</strong> This software
								uses only LGPL v2.1+ open source libraries. No GPL or proprietary non-free libraries
								are bundled. Software H.264 and HEVC encoders are explicitly omitted to prevent
								patent exposure; all H.264/HEVC encoding uses standard hardware WebCodecs APIs.
							</p>
						</div>
					)}

					{activeTab === 'build' && (
						<div className="space-y-3">
							<p className="text-xs text-[#94a3b8]">
								The codec pack uses a reproducible Emscripten build recipe located at{' '}
								<code className="font-mono text-xs text-[#38bdf8]">tools/codec-pack/build.sh</code>.
							</p>
							<pre className="overflow-x-auto rounded-md border border-[#242432] bg-[#0d0d12] p-3.5 font-mono text-xs text-[#34d399]">{`# 1. Install Emscripten SDK
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk && ./emsdk install latest && ./emsdk activate latest
source ~/emsdk/emsdk_env.sh

# 2. Run the reproducible LGPL build script
cd thefreevideoeditor
./tools/codec-pack/build.sh`}</pre>
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="codec-dialog-footer is-right">
					<button type="button" className="primary-button" onClick={onClose}>
						Close
					</button>
				</div>
			</div>
		</dialog>
	);

	if (typeof document === 'undefined') return null;
	return createPortal(modalContent, document.body);
}
