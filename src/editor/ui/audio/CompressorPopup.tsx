import React, { useId } from 'react';
import type { TrackCompressor } from '../../core/types';
import { compressorStaticTransfer, defaultTrackCompressor } from '../../core/audioMath';

interface CompressorPopupProps {
	compressor?: TrackCompressor;
	trackName: string;
	onClose: () => void;
	onChange: (comp: TrackCompressor) => void;
}

export const CompressorPopup: React.FC<CompressorPopupProps> = ({
	compressor,
	trackName,
	onClose,
	onChange
}) => {
	const currentComp = compressor ?? defaultTrackCompressor();
	const titleId = useId();

	const svgWidth = 320;
	const svgHeight = 200;
	const minDb = -60;
	const maxDb = 0;

	const dbToCoord = (db: number) => {
		const clamped = Math.max(minDb, Math.min(maxDb, db));
		return (clamped - minDb) / (maxDb - minDb);
	};

	let curveD = '';
	const numPoints = 80;
	for (let i = 0; i <= numPoints; i++) {
		const inDb = minDb + (i / numPoints) * (maxDb - minDb);
		const outDb = compressorStaticTransfer(inDb, currentComp);
		const x = dbToCoord(inDb) * svgWidth;
		const y = svgHeight - dbToCoord(outDb) * svgHeight;
		if (i === 0) curveD += `M ${x.toFixed(1)} ${y.toFixed(1)}`;
		else curveD += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
	}

	const toggleEnabled = () => {
		onChange({ ...currentComp, enabled: !currentComp.enabled });
	};

	const update = (patch: Partial<TrackCompressor>) => {
		onChange({ ...currentComp, ...patch });
	};

	return (
		<div
			className="compressor-popup fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			role="dialog"
			aria-labelledby={titleId}
			aria-modal="true"
		>
			<div className="relative w-full max-w-md rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] p-6 text-[var(--color-text-primary)] shadow-2xl">
				<div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-3">
					<h3 id={titleId} className="text-base font-semibold">
						Compressor — {trackName}
					</h3>
					<div className="flex items-center gap-3">
						<label className="flex cursor-pointer items-center gap-2 text-xs select-none">
							<input
								type="checkbox"
								checked={currentComp.enabled}
								onChange={toggleEnabled}
								className="rounded border-[var(--color-border-default)] accent-[var(--color-accent)]"
							/>
							<span>Enabled</span>
						</label>
						<button
							onClick={onClose}
							className="rounded-lg p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
							aria-label="Close compressor popup"
						>
							✕
						</button>
					</div>
				</div>

				{/* Visual Transfer Curve */}
				<div className="my-4 overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-2">
					<svg
						viewBox={`0 0 ${svgWidth} ${svgHeight}`}
						className="h-40 w-full"
						preserveAspectRatio="none"
					>
						{/* 1:1 Reference Line */}
						<line
							x1="0"
							y1={svgHeight}
							x2={svgWidth}
							y2="0"
							stroke="var(--color-border-default)"
							strokeDasharray="4 4"
						/>

						{/* Transfer Curve */}
						<path
							d={curveD}
							fill="none"
							stroke={currentComp.enabled ? 'var(--color-accent)' : 'var(--color-text-muted)'}
							strokeWidth="2.5"
						/>
					</svg>
				</div>

				{/* Controls */}
				<div className="grid grid-cols-2 gap-3 text-xs">
					<div className="flex flex-col gap-1 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] p-2">
						<div className="text-[10px] text-[var(--color-text-muted)]">Threshold</div>
						<div className="flex items-center justify-between">
							<input
								type="range"
								min="-60"
								max="0"
								step="1"
								value={currentComp.thresholdDb}
								onChange={(e) => update({ thresholdDb: parseFloat(e.target.value) })}
								className="w-full accent-[var(--color-accent)]"
							/>
							<span className="ml-1 w-10 text-right font-mono text-[10px]">
								{currentComp.thresholdDb} dB
							</span>
						</div>
					</div>

					<div className="flex flex-col gap-1 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] p-2">
						<div className="text-[10px] text-[var(--color-text-muted)]">Ratio</div>
						<div className="flex items-center justify-between">
							<input
								type="range"
								min="1"
								max="20"
								step="0.5"
								value={currentComp.ratio}
								onChange={(e) => update({ ratio: parseFloat(e.target.value) })}
								className="w-full accent-[var(--color-accent)]"
							/>
							<span className="ml-1 w-10 text-right font-mono text-[10px]">
								{currentComp.ratio}:1
							</span>
						</div>
					</div>

					<div className="flex flex-col gap-1 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] p-2">
						<div className="text-[10px] text-[var(--color-text-muted)]">Attack (ms)</div>
						<div className="flex items-center justify-between">
							<input
								type="range"
								min="0.1"
								max="500"
								step="1"
								value={currentComp.attackMs}
								onChange={(e) => update({ attackMs: parseFloat(e.target.value) })}
								className="w-full accent-[var(--color-accent)]"
							/>
							<span className="ml-1 w-10 text-right font-mono text-[10px]">
								{Math.round(currentComp.attackMs)}
							</span>
						</div>
					</div>

					<div className="flex flex-col gap-1 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] p-2">
						<div className="text-[10px] text-[var(--color-text-muted)]">Release (ms)</div>
						<div className="flex items-center justify-between">
							<input
								type="range"
								min="5"
								max="2000"
								step="10"
								value={currentComp.releaseMs}
								onChange={(e) => update({ releaseMs: parseFloat(e.target.value) })}
								className="w-full accent-[var(--color-accent)]"
							/>
							<span className="ml-1 w-10 text-right font-mono text-[10px]">
								{Math.round(currentComp.releaseMs)}
							</span>
						</div>
					</div>

					<div className="flex flex-col gap-1 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] p-2">
						<div className="text-[10px] text-[var(--color-text-muted)]">Knee (dB)</div>
						<div className="flex items-center justify-between">
							<input
								type="range"
								min="0"
								max="12"
								step="0.5"
								value={currentComp.kneeDb}
								onChange={(e) => update({ kneeDb: parseFloat(e.target.value) })}
								className="w-full accent-[var(--color-accent)]"
							/>
							<span className="ml-1 w-10 text-right font-mono text-[10px]">
								{currentComp.kneeDb} dB
							</span>
						</div>
					</div>

					<div className="flex flex-col gap-1 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] p-2">
						<div className="text-[10px] text-[var(--color-text-muted)]">Makeup Gain</div>
						<div className="flex items-center justify-between">
							<input
								type="range"
								min="0"
								max="24"
								step="0.5"
								value={currentComp.makeupDb}
								onChange={(e) => update({ makeupDb: parseFloat(e.target.value) })}
								className="w-full accent-[var(--color-accent)]"
							/>
							<span className="ml-1 w-10 text-right font-mono text-[10px]">
								+{currentComp.makeupDb} dB
							</span>
						</div>
					</div>
				</div>

				<div className="mt-5 flex justify-end">
					<button
						onClick={onClose}
						className="rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-xs font-medium text-[var(--color-accent-contrast)] hover:opacity-90"
					>
						Done
					</button>
				</div>
			</div>
		</div>
	);
};
