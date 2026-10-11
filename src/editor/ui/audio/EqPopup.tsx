import React, { useId } from 'react';
import type { TrackEq } from '../../core/types';
import { totalEqResponse, defaultTrackEq } from '../../core/audioMath';

interface EqPopupProps {
	eq?: TrackEq;
	trackName: string;
	onClose: () => void;
	onChange: (eq: TrackEq) => void;
}

export const EqPopup: React.FC<EqPopupProps> = ({ eq, trackName, onClose, onChange }) => {
	const currentEq = eq ?? defaultTrackEq();
	const titleId = useId();

	// Frequencies across 20 Hz to 20 kHz (logarithmic)
	const numPoints = 120;
	const minFreq = 20;
	const maxFreq = 20000;
	const minDb = -24;
	const maxDb = 24;

	const svgWidth = 400;
	const svgHeight = 160;

	const freqToX = (f: number) => {
		const logMin = Math.log10(minFreq);
		const logMax = Math.log10(maxFreq);
		return ((Math.log10(f) - logMin) / (logMax - logMin)) * svgWidth;
	};

	const dbToY = (db: number) => {
		const clamped = Math.max(minDb, Math.min(maxDb, db));
		return svgHeight - ((clamped - minDb) / (maxDb - minDb)) * svgHeight;
	};

	let pathD = '';
	for (let i = 0; i <= numPoints; i++) {
		const f = minFreq * Math.pow(maxFreq / minFreq, i / numPoints);
		const db = totalEqResponse(currentEq, f);
		const x = freqToX(f);
		const y = dbToY(db);
		if (i === 0) pathD += `M ${x.toFixed(1)} ${y.toFixed(1)}`;
		else pathD += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
	}

	const toggleEnabled = () => {
		onChange({ ...currentEq, enabled: !currentEq.enabled });
	};

	const updateBand = (index: number, patch: Partial<TrackEq['bands'][number]>) => {
		const bands = [...currentEq.bands] as TrackEq['bands'];
		bands[index] = { ...bands[index], ...patch };
		onChange({ ...currentEq, bands });
	};

	const resetFlat = () => {
		const bands = currentEq.bands.map((b) => ({ ...b, gainDb: 0 })) as TrackEq['bands'];
		onChange({ ...currentEq, bands });
	};

	return (
		<div
			className="eq-popup fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
			role="dialog"
			aria-labelledby={titleId}
			aria-modal="true"
		>
			<div className="relative w-full max-w-xl overflow-hidden rounded-lg border border-[#26262e] bg-[#141418] text-[#ededed] shadow-2xl">
				{/* Premiere Pro Style Title Bar */}
				<div className="flex items-center justify-between border-b border-[#24242c] bg-[#1a1a22] px-5 py-3">
					<div className="flex items-center gap-2.5">
						<span className="h-2.5 w-2.5 rounded-full bg-[#0070f3] shadow-[0_0_8px_rgba(0,112,243,0.6)]" />
						<h3 id={titleId} className="text-sm font-semibold tracking-tight text-[#f1f5f9]">
							Track EQ — {trackName}
						</h3>
					</div>
					<div className="flex items-center gap-3">
						<label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#94a3b8] select-none">
							<input
								type="checkbox"
								checked={currentEq.enabled}
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
								currentEq.enabled
									? 'border border-[#166534] bg-[#143322] text-[#4ade80]'
									: 'border border-[#32323e] bg-[#202028] text-[#94a3b8]'
							}`}
							title="Toggle EQ processing bypass"
						>
							<span
								className={`h-2 w-2 rounded-full ${
									currentEq.enabled ? 'bg-[#22c55e] shadow-[0_0_6px_#22c55e]' : 'bg-[#64748b]'
								}`}
							/>
							<span>{currentEq.enabled ? 'Active' : 'Bypassed'}</span>
						</button>
						<button
							type="button"
							onClick={onClose}
							className="rounded p-1 text-[#94a3b8] transition-colors hover:bg-[#252530] hover:text-[#f1f5f9]"
							aria-label="Close EQ popup"
						>
							✕
						</button>
					</div>
				</div>

				<div className="p-5">
					{/* Visual Frequency Response Display */}
					<div className="relative overflow-hidden rounded border border-[#22222a] bg-[#09090d] p-3 shadow-inner">
						<svg
							viewBox={`0 0 ${svgWidth} ${svgHeight}`}
							className="h-40 w-full"
							preserveAspectRatio="none"
						>
							<defs>
								<linearGradient id="eqAreaGrad" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
									<stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
								</linearGradient>
							</defs>

							{/* dB Reference Grid Lines */}
							<line
								x1="0"
								y1={dbToY(12)}
								x2={svgWidth}
								y2={dbToY(12)}
								stroke="#1c1c24"
								strokeDasharray="2 4"
							/>
							<line
								x1="0"
								y1={dbToY(0)}
								x2={svgWidth}
								y2={dbToY(0)}
								stroke="#333342"
								strokeWidth="1"
							/>
							<line
								x1="0"
								y1={dbToY(-12)}
								x2={svgWidth}
								y2={dbToY(-12)}
								stroke="#1c1c24"
								strokeDasharray="2 4"
							/>

							{/* Frequency Reference Grid Lines */}
							<line
								x1={freqToX(100)}
								y1="0"
								x2={freqToX(100)}
								y2={svgHeight}
								stroke="#1c1c24"
								strokeDasharray="2 4"
							/>
							<line
								x1={freqToX(1000)}
								y1="0"
								x2={freqToX(1000)}
								y2={svgHeight}
								stroke="#282836"
								strokeDasharray="2 4"
							/>
							<line
								x1={freqToX(10000)}
								y1="0"
								x2={freqToX(10000)}
								y2={svgHeight}
								stroke="#1c1c24"
								strokeDasharray="2 4"
							/>

							{/* Fill area under curve */}
							<path
								d={`${pathD} L ${svgWidth} ${dbToY(0)} L 0 ${dbToY(0)} Z`}
								fill="url(#eqAreaGrad)"
								opacity={currentEq.enabled ? '1' : '0.3'}
							/>

							{/* Magnitude Response Curve */}
							<path
								d={pathD}
								fill="none"
								stroke={currentEq.enabled ? '#38bdf8' : '#64748b'}
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>

						{/* Overlay Grid Labels */}
						<div className="pointer-events-none absolute inset-x-3 bottom-1.5 flex justify-between font-mono text-[10px] text-[#64748b]">
							<span>100 Hz</span>
							<span>1 kHz</span>
							<span>10 kHz</span>
						</div>
					</div>

					{/* 4 Bands Control Strips */}
					<div className="mt-4 grid grid-cols-4 gap-2.5 text-xs">
						{currentEq.bands.map((band, idx) => (
							<div
								key={idx}
								className="flex flex-col gap-2 rounded border border-[#22222a] bg-[#16161d] p-3 shadow-sm"
							>
								<div className="flex items-center justify-between text-[11px] font-semibold text-[#cbd5e1]">
									<span>Band {idx + 1}</span>
									<span className="rounded bg-[#101016] px-1 py-0.5 font-mono text-[10px] text-[#94a3b8] uppercase">
										{band.type === 'peaking' ? 'Peak' : band.type === 'lowshelf' ? 'Low' : 'High'}
									</span>
								</div>

								<div>
									<div className="mb-1 flex justify-between font-mono text-[10px] text-[#94a3b8]">
										<span>Gain</span>
										<span className={band.gainDb !== 0 ? 'font-bold text-[#38bdf8]' : ''}>
											{band.gainDb > 0 ? `+${band.gainDb}` : band.gainDb} dB
										</span>
									</div>
									<input
										type="range"
										min="-24"
										max="24"
										step="0.5"
										value={band.gainDb}
										onChange={(e) => updateBand(idx, { gainDb: parseFloat(e.target.value) })}
										className="h-1.5 w-full cursor-pointer rounded-full bg-[#282834] accent-[#0070f3]"
									/>
								</div>

								<div>
									<div className="mb-1 flex justify-between font-mono text-[10px] text-[#94a3b8]">
										<span>Freq</span>
										<span>
											{band.frequencyHz >= 1000
												? `${(band.frequencyHz / 1000).toFixed(1)}k`
												: Math.round(band.frequencyHz)}{' '}
											Hz
										</span>
									</div>
									<input
										type="range"
										min="20"
										max="20000"
										step="10"
										value={band.frequencyHz}
										onChange={(e) => updateBand(idx, { frequencyHz: parseFloat(e.target.value) })}
										className="h-1.5 w-full cursor-pointer rounded-full bg-[#282834] accent-[#0070f3]"
									/>
								</div>

								<div>
									<div className="mb-1 flex justify-between font-mono text-[10px] text-[#94a3b8]">
										<span>Q</span>
										<span>{band.q.toFixed(1)}</span>
									</div>
									<input
										type="range"
										min="0.1"
										max="18"
										step="0.1"
										value={band.q}
										onChange={(e) => updateBand(idx, { q: parseFloat(e.target.value) })}
										className="h-1.5 w-full cursor-pointer rounded-full bg-[#282834] accent-[#0070f3]"
									/>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Premiere Pro Dialog Footer */}
				<div className="flex items-center justify-between border-t border-[#22222c] bg-[#111116] px-5 py-3">
					<button
						type="button"
						onClick={resetFlat}
						className="rounded border border-[#2c2c36] bg-[#1a1a22] px-3 py-1.5 text-xs font-medium text-[#94a3b8] transition-colors hover:bg-[#252530] hover:text-[#f1f5f9]"
					>
						Reset to Flat
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
