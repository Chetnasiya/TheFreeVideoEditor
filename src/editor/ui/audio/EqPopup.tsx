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

	return (
		<div
			className="eq-popup fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			role="dialog"
			aria-labelledby={titleId}
			aria-modal="true"
		>
			<div className="relative w-full max-w-lg rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] p-6 text-[var(--color-text-primary)] shadow-2xl">
				<div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-3">
					<h3 id={titleId} className="text-base font-semibold">
						Track EQ — {trackName}
					</h3>
					<div className="flex items-center gap-3">
						<label className="flex cursor-pointer items-center gap-2 text-xs select-none">
							<input
								type="checkbox"
								checked={currentEq.enabled}
								onChange={toggleEnabled}
								className="rounded border-[var(--color-border-default)] accent-[var(--color-accent)]"
							/>
							<span>Enabled</span>
						</label>
						<button
							onClick={onClose}
							className="rounded-lg p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
							aria-label="Close EQ popup"
						>
							✕
						</button>
					</div>
				</div>

				{/* Visual Curve */}
				<div className="my-4 overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-2">
					<svg
						viewBox={`0 0 ${svgWidth} ${svgHeight}`}
						className="h-36 w-full"
						preserveAspectRatio="none"
					>
						{/* Grid lines */}
						<line
							x1="0"
							y1={dbToY(0)}
							x2={svgWidth}
							y2={dbToY(0)}
							stroke="var(--color-border-default)"
							strokeDasharray="4 4"
						/>
						<line
							x1={freqToX(100)}
							y1="0"
							x2={freqToX(100)}
							y2={svgHeight}
							stroke="var(--color-border-subtle)"
						/>
						<line
							x1={freqToX(1000)}
							y1="0"
							x2={freqToX(1000)}
							y2={svgHeight}
							stroke="var(--color-border-subtle)"
						/>
						<line
							x1={freqToX(10000)}
							y1="0"
							x2={freqToX(10000)}
							y2={svgHeight}
							stroke="var(--color-border-subtle)"
						/>

						{/* Magnitude Response Curve */}
						<path
							d={pathD}
							fill="none"
							stroke={currentEq.enabled ? 'var(--color-accent)' : 'var(--color-text-muted)'}
							strokeWidth="2.5"
						/>
					</svg>
				</div>

				{/* 4 Bands Control Sliders */}
				<div className="grid grid-cols-4 gap-3 text-xs">
					{currentEq.bands.map((band, idx) => (
						<div
							key={idx}
							className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] p-2.5"
						>
							<div className="font-medium text-[var(--color-text-secondary)]">
								Band {idx + 1} (
								{band.type === 'peaking' ? 'Peak' : band.type === 'lowshelf' ? 'Low' : 'High'})
							</div>
							<div>
								<div className="text-[10px] text-[var(--color-text-muted)]">Gain</div>
								<div className="flex items-center justify-between">
									<input
										type="range"
										min="-24"
										max="24"
										step="0.5"
										value={band.gainDb}
										onChange={(e) => updateBand(idx, { gainDb: parseFloat(e.target.value) })}
										className="w-full accent-[var(--color-accent)]"
									/>
									<span className="ml-1 w-8 text-right font-mono text-[10px]">
										{band.gainDb > 0 ? `+${band.gainDb}` : band.gainDb}
									</span>
								</div>
							</div>
							<div>
								<div className="text-[10px] text-[var(--color-text-muted)]">Freq (Hz)</div>
								<div className="flex items-center justify-between">
									<input
										type="range"
										min="20"
										max="20000"
										step="10"
										value={band.frequencyHz}
										onChange={(e) => updateBand(idx, { frequencyHz: parseFloat(e.target.value) })}
										className="w-full accent-[var(--color-accent)]"
									/>
									<span className="ml-1 w-8 text-right font-mono text-[10px]">
										{band.frequencyHz >= 1000
											? `${(band.frequencyHz / 1000).toFixed(1)}k`
											: Math.round(band.frequencyHz)}
									</span>
								</div>
							</div>
							<div>
								<div className="text-[10px] text-[var(--color-text-muted)]">Q</div>
								<div className="flex items-center justify-between">
									<input
										type="range"
										min="0.1"
										max="18"
										step="0.1"
										value={band.q}
										onChange={(e) => updateBand(idx, { q: parseFloat(e.target.value) })}
										className="w-full accent-[var(--color-accent)]"
									/>
									<span className="ml-1 w-8 text-right font-mono text-[10px]">
										{band.q.toFixed(1)}
									</span>
								</div>
							</div>
						</div>
					))}
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
