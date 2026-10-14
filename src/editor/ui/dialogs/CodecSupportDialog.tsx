// src/editor/ui/dialogs/CodecSupportDialog.tsx
// Displays hardware acceleration and codec support matrix on the user's device with diagnostic export.

import { useEffect, useState } from 'react';
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

interface CodecSupportDialogProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function CodecSupportDialog({ isOpen, onClose }: CodecSupportDialogProps) {
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

	if (!isOpen) return null;

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

	const modalContent = (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
			role="dialog"
			aria-labelledby="codec-support-title"
			aria-modal="true"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-6 py-4">
					<div>
						<h2
							id="codec-support-title"
							className="text-base font-semibold text-[var(--color-text)]"
						>
							Codec & Hardware Acceleration Support
						</h2>
						<p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
							Live audit of video and audio encoders supported on this device.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
						aria-label="Close dialog"
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
							<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
						</svg>
					</button>
				</div>

				{/* Body Content */}
				<div className="flex-1 space-y-6 overflow-y-auto px-6 py-4 text-sm">
					{/* Status Summary Cards */}
					<div className="grid grid-cols-3 gap-3">
						<div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-inset)] p-3">
							<span className="block text-[11px] font-medium tracking-wider text-[var(--color-text-muted)] uppercase">
								WebCodecs API
							</span>
							<span
								className={`mt-1 inline-flex items-center gap-1.5 text-xs font-semibold ${report?.hasWebCodecs ? 'text-emerald-400' : 'text-amber-400'}`}
							>
								<span
									className={`h-2 w-2 rounded-full ${report?.hasWebCodecs ? 'bg-emerald-400' : 'bg-amber-400'}`}
								/>
								{report?.hasWebCodecs ? 'Available' : 'Restricted'}
							</span>
						</div>
						<div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-inset)] p-3">
							<span className="block text-[11px] font-medium tracking-wider text-[var(--color-text-muted)] uppercase">
								Context Security
							</span>
							<span
								className={`mt-1 inline-flex items-center gap-1.5 text-xs font-semibold ${report?.isSecureContext ? 'text-emerald-400' : 'text-rose-400'}`}
							>
								<span
									className={`h-2 w-2 rounded-full ${report?.isSecureContext ? 'bg-emerald-400' : 'bg-rose-400'}`}
								/>
								{report?.isSecureContext ? 'Secure Origin' : 'Insecure (No HW)'}
							</span>
						</div>
						<div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-inset)] p-3">
							<span className="block text-[11px] font-medium tracking-wider text-[var(--color-text-muted)] uppercase">
								Platform Engine
							</span>
							<span className="mt-1 block truncate text-xs font-semibold text-[var(--color-text)]">
								Apple Silicon GPU
							</span>
						</div>
					</div>

					{/* Video Codecs Table */}
					<div>
						<h3 className="mb-2.5 text-xs font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
							Video Codecs (Export & Encode)
						</h3>
						<div className="overflow-hidden rounded-lg border border-[var(--color-border-subtle)]">
							<div className="divide-y divide-[var(--color-border-subtle)] bg-[var(--color-surface)]">
								{VIDEO_CODEC_REGISTRY.map((codec) => {
									const status = report?.codecs[codec.id];
									const isSupported = status?.supported ?? false;
									const isHw = status?.hardwareAccelerated;
									const isPack = codec.tier === 2;

									return (
										<div
											key={codec.id}
											className="flex items-center justify-between px-3.5 py-2.5 text-xs"
										>
											<div>
												<span className="font-medium text-[var(--color-text)]">{codec.label}</span>
												<div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
													<span>{codec.container.toUpperCase()}</span>
													<span>•</span>
													<span>{codec.bitDepth}-bit</span>
													<span>•</span>
													<span className="font-mono text-[10px]">{codec.videoCodecString}</span>
												</div>
											</div>
											<div className="text-right">
												{loading ? (
													<span className="text-xs text-[var(--color-text-muted)]">Checking…</span>
												) : isPack ? (
													<span className="inline-flex items-center rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-400">
														Advanced Pack (Deferred)
													</span>
												) : isSupported ? (
													<span
														className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${isHw ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400' : 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'}`}
													>
														<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
														{isHw ? 'Hardware Accelerated' : 'Supported'}
													</span>
												) : (
													<span
														className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-400"
														title={status?.reason}
													>
														<span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
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
						<h3 className="mb-2.5 text-xs font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
							Audio Codecs & Master Containers
						</h3>
						<div className="overflow-hidden rounded-lg border border-[var(--color-border-subtle)]">
							<div className="divide-y divide-[var(--color-border-subtle)] bg-[var(--color-surface)]">
								{AUDIO_CODEC_REGISTRY.map((audio) => {
									const status = report?.audioCodecs[audio.id];
									const isSupported = status?.supported ?? false;

									return (
										<div
											key={audio.id}
											className="flex items-center justify-between px-3.5 py-2.5 text-xs"
										>
											<div>
												<span className="font-medium text-[var(--color-text)]">{audio.label}</span>
												<div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
													<span>
														{audio.isLossless ? 'Uncompressed / Lossless' : 'Compressed AAC/Opus'}
													</span>
													<span>•</span>
													<span className="font-mono text-[10px]">{audio.codecString}</span>
												</div>
											</div>
											<div>
												{loading ? (
													<span className="text-xs text-[var(--color-text-muted)]">Checking…</span>
												) : isSupported ? (
													<span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
														<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
														Supported
													</span>
												) : (
													<span
														className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-400"
														title={status?.reason}
													>
														<span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
														Unsupported
													</span>
												)}
											</div>
										</div>
									);
								})}
								{AUDIO_ONLY_PRESETS.map((preset) => (
									<div
										key={preset.id}
										className="flex items-center justify-between px-3.5 py-2.5 text-xs"
									>
										<div>
											<span className="font-medium text-[var(--color-text)]">{preset.label}</span>
											<div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
												<span>WAV Audio Master</span>
												<span>•</span>
												<span>{preset.bitDepth}-bit Lossless</span>
											</div>
										</div>
										<div>
											<span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
												<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
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
				<div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-6 py-3">
					<button
						type="button"
						onClick={handleCopyReport}
						className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-inset)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)]"
					>
						<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
							<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
							<path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
						</svg>
						{copied ? 'Copied to Clipboard!' : 'Copy Diagnostic Report'}
					</button>
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	);

	if (typeof document === 'undefined') return null;
	return createPortal(modalContent, document.body);
}
