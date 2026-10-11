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

	const resetDefault = () => {
		onChange(defaultTrackCompressor());
	};

	return (
		<div
			className="compressor-popup fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
			role="dialog"
			aria-labelledby={titleId}
			aria-modal="true"
		>
			<div className="relative w-full max-w-lg overflow-hidden rounded-lg border border-[#26262e] bg-[#141418] text-[#ededed] shadow-2xl">
				{/* Premiere Pro Style Title Bar */}
				<div className="flex items-center justify-between border-b border-[#24242c] bg-[#1a1a22] px-5 py-3">
					<div className="flex items-center gap-2.5">
						<span className="h-2.5 w-2.5 rounded-full bg-[#0070f3] shadow-[0_0_8px_rgba(0,112,243,0.6)]" />
						<h3 id={titleId} className="text-sm font-semibold tracking-tight text-[#f1f5f9]">
							Track Dynamics Compressor — {trackName}
						</h3>
					</div>
					<div className="flex items-center gap-3">
						<label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#94a3b8] select-none">
							<input
								type="checkbox"
								checked={currentComp.enabled}
								onChange={toggleEnabled}
								className="rounded border-[#32323e] accent-[#0070f3]"
								aria-label="Enabled"
							/>
							<span className="text-[11px] font-medium text-[#cbd5e1]">Enabled</span>
						</label>
						<button
							type="button"
							onClick={toggleEnabled}
							className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
								currentComp.enabled
									? 'border border-[#166534] bg-[#143322] text-[#4ade80]'
									: 'border border-[#32323e] bg-[#202028] text-[#94a3b8]'
							}`}
							title="Toggle compressor processing bypass"
						>
							<span
								className={`h-2 w-2 rounded-full ${
									currentComp.enabled ? 'bg-[#22c55e] shadow-[0_0_6px_#22c55e]' : 'bg-[#64748b]'
								}`}
							/>
							<span>{currentComp.enabled ? 'Active' : 'Bypassed'}</span>
						</button>
						<button
							type="button"
							onClick={onClose}
							className="rounded p-1 text-[#94a3b8] transition-colors hover:bg-[#252530] hover:text-[#f1f5f9]"
							aria-label="Close compressor popup"
						>
							✕
						</button>
					</div>
				</div>

				<div className="p-5">
					{/* Visual Transfer Curve Display */}
					<div className="relative overflow-hidden rounded border border-[#22222a] bg-[#09090d] p-3 shadow-inner">
						<svg
							viewBox={`0 0 ${svgWidth} ${svgHeight}`}
							className="h-40 w-full"
							preserveAspectRatio="none"
						>
							<defs>
								<linearGradient id="compAreaGrad" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor="#38bdf8" stopOpacity="0.2" />
									<stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
								</linearGradient>
							</defs>

							{/* Grid lines */}
							<line
								x1="0"
								y1={svgHeight / 2}
								x2={svgWidth}
								y2={svgHeight / 2}
								stroke="#1c1c24"
								strokeDasharray="2 4"
							/>
							<line
								x1={svgWidth / 2}
								y1="0"
								x2={svgWidth / 2}
								y2={svgHeight}
								stroke="#1c1c24"
								strokeDasharray="2 4"
							/>

							{/* 1:1 Reference Line */}
							<line
								x1="0"
								y1={svgHeight}
								x2={svgWidth}
								y2="0"
								stroke="#333342"
								strokeDasharray="4 4"
								strokeWidth="1"
							/>

							{/* Transfer Curve Area Fill */}
							<path
								d={`${curveD} L ${svgWidth} ${svgHeight} L 0 ${svgHeight} Z`}
								fill="url(#compAreaGrad)"
								opacity={currentComp.enabled ? '1' : '0.3'}
							/>

							{/* Transfer Curve */}
							<path
								d={curveD}
								fill="none"
								stroke={currentComp.enabled ? '#38bdf8' : '#64748b'}
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>

						{/* Overlay Grid Labels */}
						<div className="pointer-events-none absolute inset-x-3 bottom-1.5 flex justify-between font-mono text-[10px] text-[#64748b]">
							<span>-60 dB In</span>
							<span>-30 dB</span>
							<span>0 dB In</span>
						</div>
					</div>

					{/* 6 Compressor Controls in 2x3 Grid */}
					<div className="mt-4 grid grid-cols-2 gap-2.5 text-xs">
						<div className="flex flex-col gap-1.5 rounded border border-[#22222a] bg-[#16161d] p-3 shadow-sm">
							<div className="flex justify-between font-mono text-[11px] text-[#94a3b8]">
								<span className="font-semibold text-[#cbd5e1]">Threshold</span>
								<span className="font-bold text-[#38bdf8]">{currentComp.thresholdDb} dB</span>
							</div>
							<input
								type="range"
								min="-60"
								max="0"
								step="1"
								value={currentComp.thresholdDb}
								onChange={(e) => update({ thresholdDb: parseFloat(e.target.value) })}
								className="h-1.5 w-full cursor-pointer rounded-full bg-[#282834] accent-[#0070f3]"
							/>
						</div>

						<div className="flex flex-col gap-1.5 rounded border border-[#22222a] bg-[#16161d] p-3 shadow-sm">
							<div className="flex justify-between font-mono text-[11px] text-[#94a3b8]">
								<span className="font-semibold text-[#cbd5e1]">Ratio</span>
								<span className="font-bold text-[#38bdf8]">{currentComp.ratio}:1</span>
							</div>
							<input
								type="range"
								min="1"
								max="20"
								step="0.5"
								value={currentComp.ratio}
								onChange={(e) => update({ ratio: parseFloat(e.target.value) })}
								className="h-1.5 w-full cursor-pointer rounded-full bg-[#282834] accent-[#0070f3]"
							/>
						</div>

						<div className="flex flex-col gap-1.5 rounded border border-[#22222a] bg-[#16161d] p-3 shadow-sm">
							<div className="flex justify-between font-mono text-[11px] text-[#94a3b8]">
								<span className="font-semibold text-[#cbd5e1]">Attack</span>
								<span className="text-[#e2e8f0]">{Math.round(currentComp.attackMs)} ms</span>
							</div>
							<input
								type="range"
								min="0.1"
								max="500"
								step="1"
								value={currentComp.attackMs}
								onChange={(e) => update({ attackMs: parseFloat(e.target.value) })}
								className="h-1.5 w-full cursor-pointer rounded-full bg-[#282834] accent-[#0070f3]"
							/>
						</div>

						<div className="flex flex-col gap-1.5 rounded border border-[#22222a] bg-[#16161d] p-3 shadow-sm">
							<div className="flex justify-between font-mono text-[11px] text-[#94a3b8]">
								<span className="font-semibold text-[#cbd5e1]">Release</span>
								<span className="text-[#e2e8f0]">{Math.round(currentComp.releaseMs)} ms</span>
							</div>
							<input
								type="range"
								min="5"
								max="2000"
								step="10"
								value={currentComp.releaseMs}
								onChange={(e) => update({ releaseMs: parseFloat(e.target.value) })}
								className="h-1.5 w-full cursor-pointer rounded-full bg-[#282834] accent-[#0070f3]"
							/>
						</div>

						<div className="flex flex-col gap-1.5 rounded border border-[#22222a] bg-[#16161d] p-3 shadow-sm">
							<div className="flex justify-between font-mono text-[11px] text-[#94a3b8]">
								<span className="font-semibold text-[#cbd5e1]">Knee</span>
								<span className="text-[#e2e8f0]">{currentComp.kneeDb} dB</span>
							</div>
							<input
								type="range"
								min="0"
								max="12"
								step="0.5"
								value={currentComp.kneeDb}
								onChange={(e) => update({ kneeDb: parseFloat(e.target.value) })}
								className="h-1.5 w-full cursor-pointer rounded-full bg-[#282834] accent-[#0070f3]"
							/>
						</div>

						<div className="flex flex-col gap-1.5 rounded border border-[#22222a] bg-[#16161d] p-3 shadow-sm">
							<div className="flex justify-between font-mono text-[11px] text-[#94a3b8]">
								<span className="font-semibold text-[#cbd5e1]">Makeup Gain</span>
								<span
									className={
										currentComp.makeupDb > 0 ? 'font-bold text-[#38bdf8]' : 'text-[#e2e8f0]'
									}
								>
									+{currentComp.makeupDb} dB
								</span>
							</div>
							<input
								type="range"
								min="0"
								max="24"
								step="0.5"
								value={currentComp.makeupDb}
								onChange={(e) => update({ makeupDb: parseFloat(e.target.value) })}
								className="h-1.5 w-full cursor-pointer rounded-full bg-[#282834] accent-[#0070f3]"
							/>
						</div>
					</div>
				</div>

				{/* Premiere Pro Dialog Footer */}
				<div className="flex items-center justify-between border-t border-[#22222c] bg-[#111116] px-5 py-3">
					<button
						type="button"
						onClick={resetDefault}
						className="rounded border border-[#2c2c36] bg-[#1a1a22] px-3 py-1.5 text-xs font-medium text-[#94a3b8] transition-colors hover:bg-[#252530] hover:text-[#f1f5f9]"
					>
						Reset to Default
					</button>
					<button
						type="button"
						onClick={onClose}
						className="rounded bg-[#0070f3] px-5 py-1.5 text-xs font-semibold text-white shadow transition-colors hover:bg-[#0060df]"
					>
						Done
					</button>
				</div>
			</div>
		</div>
	);
};
