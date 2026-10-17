// src/editor/ui/dialogs/CodecSupportDialog.tsx
// Displays hardware acceleration and codec support matrix on the user's device with diagnostic export.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
	VIDEO_CODEC_REGISTRY,
	AUDIO_CODEC_REGISTRY,
	AUDIO_ONLY_PRESETS
} from '../../core/codecs/registry';
import type { CodecCapabilityReport } from '../../core/codecs/types';
import {
	probeCodecCapabilities,
	generateDiagnosticReport,
	getCachedReport
} from '../../services/codecs/probe';
import './codec-dialogs.css';

interface CodecSupportDialogProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function CodecSupportDialog({ isOpen, onClose }: CodecSupportDialogProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const [report, setReport] = useState<CodecCapabilityReport | null>(getCachedReport());
	const [copied, setCopied] = useState(false);
	const [loading, setLoading] = useState(!report);

	useEffect(() => {
		if (!isOpen) return;
		let mounted = true;
		probeCodecCapabilities().then((rep) => {
			if (mounted) {
				setReport(rep);
				setLoading(false);
			}
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

	const handleCopyReport = async () => {
		const text = generateDiagnosticReport();
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
			} else {
				throw new Error('Clipboard API unavailable');
			}
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Fallback: prompt user to copy manually
			window.prompt('Copy diagnostic report to clipboard:', text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const getPlatformLabel = () => {
		if (typeof navigator === 'undefined') return 'Standard Engine';
		const ua = navigator.userAgent;
		if (/Mac/i.test(ua)) return 'Apple Silicon / Metal GPU';
		if (/Win/i.test(ua)) return 'Direct3D / Windows GPU';
		if (/Linux|Android/i.test(ua)) return 'Vulkan / Linux GPU';
		return 'WebGL2 / Platform GPU';
	};

	const modalContent = (
		<dialog
			ref={dialogRef}
			className="editor-dialog codec-support-dialog"
			role="dialog"
			aria-labelledby="codec-support-title"
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
						<p className="dialog-eyebrow">DIAGNOSTICS</p>
						<h2 id="codec-support-title" className="codec-dialog-title text-sm font-semibold">
							Codec & Hardware Acceleration Support
						</h2>
						<p className="dialog-description mt-1 text-xs">
							Live audit of video and audio encoders supported on this device.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="icon-button dialog-close"
						aria-label="Close dialog"
					>
						✕
					</button>
				</div>

				{/* Body Content */}
				<div className="codec-dialog-body">
					{/* Status Summary Cards */}
					<div className="grid grid-cols-3 gap-3">
						<div className="codec-card">
							<span className="codec-card-label">WebCodecs API</span>
							<span
								className={`codec-card-value ${report?.hasWebCodecs ? 'text-emerald-400' : 'text-amber-400'}`}
							>
								<span
									className={`h-2 w-2 rounded-full ${report?.hasWebCodecs ? 'bg-emerald-400' : 'bg-amber-400'}`}
								/>
								{report?.hasWebCodecs ? 'Available' : 'Restricted'}
							</span>
						</div>
						<div className="codec-card">
							<span className="codec-card-label">Context Security</span>
							<span
								className={`codec-card-value ${report?.isSecureContext ? 'text-emerald-400' : 'text-rose-400'}`}
							>
								<span
									className={`h-2 w-2 rounded-full ${report?.isSecureContext ? 'bg-emerald-400' : 'bg-rose-400'}`}
								/>
								{report?.isSecureContext ? 'Secure Origin' : 'Insecure (No HW)'}
							</span>
						</div>
						<div className="codec-card">
							<span className="codec-card-label">Platform Engine</span>
							<span className="codec-card-value codec-name-text truncate">
								{getPlatformLabel()}
							</span>
						</div>
					</div>

					{/* Video Codecs Table */}
					<div>
						<div className="codec-table-container">
							<div className="codec-table-header">Video Codecs (Export & Encode)</div>
							<div>
								{VIDEO_CODEC_REGISTRY.map((codec) => {
									const status = report?.codecs[codec.id];
									const isSupported = status?.supported ?? false;
									const isHw = status?.hardwareAccelerated;
									const isPack = codec.tier === 2;

									return (
										<div key={codec.id} className="codec-table-row">
											<div className="min-w-0 pr-4">
												<span className="codec-name-text font-medium">{codec.label}</span>
												<div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#94a3b8]">
													<span>{codec.container.toUpperCase()}</span>
													<span>•</span>
													<span>{codec.bitDepth}-bit</span>
													<span>•</span>
													<span className="font-mono text-[10px]">{codec.videoCodecString}</span>
												</div>
											</div>
											<div className="shrink-0 text-right">
												{loading ? (
													<span className="text-xs text-[#94a3b8]">Checking…</span>
												) : isPack ? (
													<span className="codec-badge-deferred">Advanced Pack (Deferred)</span>
												) : isSupported ? (
													<span className={isHw ? 'codec-badge-hw' : 'codec-badge-supported'}>
														<span
															className={`h-1.5 w-1.5 rounded-full ${isHw ? 'bg-[#38bdf8]' : 'bg-[#34d399]'}`}
														/>
														{isHw ? 'Hardware Accelerated' : 'Supported'}
													</span>
												) : (
													<span className="codec-badge-unsupported" title={status?.reason}>
														<span className="h-1.5 w-1.5 rounded-full bg-[#f87171]" />
														Unsupported
													</span>
												)}
											</div>
										</div>
									);
								})}
							</div>
						</div>
					</div>

					{/* Audio Codecs & Formats */}
					<div>
						<div className="codec-table-container">
							<div className="codec-table-header">Audio Codecs & Master Containers</div>
							<div>
								{AUDIO_CODEC_REGISTRY.map((audio) => {
									const status = report?.audioCodecs[audio.id];
									const isSupported = status?.supported ?? false;

									return (
										<div key={audio.id} className="codec-table-row">
											<div className="min-w-0 pr-4">
												<span className="codec-name-text font-medium">{audio.label}</span>
												<div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#94a3b8]">
													<span>
														{audio.isLossless ? 'Uncompressed / Lossless' : 'Compressed AAC/Opus'}
													</span>
													<span>•</span>
													<span className="font-mono text-[10px]">{audio.codecString}</span>
												</div>
											</div>
											<div className="shrink-0 text-right">
												{loading ? (
													<span className="text-xs text-[#94a3b8]">Checking…</span>
												) : isSupported ? (
													<span className="codec-badge-supported">
														<span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" />
														Supported
													</span>
												) : (
													<span className="codec-badge-unsupported" title={status?.reason}>
														<span className="h-1.5 w-1.5 rounded-full bg-[#f87171]" />
														Unsupported
													</span>
												)}
											</div>
										</div>
									);
								})}
								{AUDIO_ONLY_PRESETS.map((preset) => (
									<div key={preset.id} className="codec-table-row">
										<div className="min-w-0 pr-4">
											<span className="font-medium text-[#f1f5f9]">{preset.label}</span>
											<div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#94a3b8]">
												<span>WAV Audio Master</span>
												<span>•</span>
												<span>{preset.bitDepth}-bit Lossless</span>
											</div>
										</div>
										<div className="shrink-0 text-right">
											<span className="codec-badge-supported">
												<span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" />
												Supported (Lossless)
											</span>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>

				{/* Footer */}
				<div className="codec-dialog-footer">
					<button
						type="button"
						onClick={handleCopyReport}
						className="secondary-button"
						style={{ gap: '6px' }}
					>
						<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
							<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
							<path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
						</svg>
						{copied ? 'Copied to Clipboard!' : 'Copy Diagnostic Report'}
					</button>
					<button type="button" onClick={onClose} className="primary-button">
						Close
					</button>
				</div>
			</div>
		</dialog>
	);

	if (typeof document === 'undefined') return null;
	return createPortal(modalContent, document.body);
}
