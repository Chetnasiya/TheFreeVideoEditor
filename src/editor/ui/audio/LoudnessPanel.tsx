import React, { useState } from 'react';
import { useEditorStore } from '../../state/EditorProvider';
import { analyzeAudioLoudness, type LoudnessMeasurements } from '../../core/audio/loudness';
import { renderOfflineAudio } from '../../services/audio/offlineRender';

export const LoudnessPanel: React.FC = () => {
	const project = useEditorStore((state) => state.project);
	const [measuring, setMeasuring] = useState(false);
	const [measurements, setMeasurements] = useState<LoudnessMeasurements>({
		momentaryLufs: -24.0,
		shortTermLufs: -24.0,
		integratedLufs: -23.0,
		loudnessRangeLu: 4.5,
		truePeakDbTP: -1.2
	});

	const handleAnalyze = async () => {
		if (!project) return;
		setMeasuring(true);
		try {
			const renderedBuffer = await renderOfflineAudio({
				project,
				startUs: 0,
				durationUs: 30_000_000, // analyze first 30 seconds
				sampleRate: 48000
			});
			const channels: Float32Array[] = [];
			for (let c = 0; c < renderedBuffer.numberOfChannels; c++) {
				channels.push(renderedBuffer.getChannelData(c));
			}
			const result = analyzeAudioLoudness(channels, renderedBuffer.sampleRate);
			setMeasurements(result);
		} catch {
			// fallback/cancelled
		} finally {
			setMeasuring(false);
		}
	};

	const handleReset = () => {
		setMeasurements({
			momentaryLufs: -96,
			shortTermLufs: -96,
			integratedLufs: -96,
			loudnessRangeLu: 0,
			truePeakDbTP: -96
		});
	};

	return (
		<div
			className="loudness-panel flex h-full flex-col bg-[var(--color-surface-base)] p-3 text-[var(--color-text-primary)]"
			aria-label="Loudness Meter"
		>
			<div className="mb-3 flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2">
				<h3 className="text-xs font-semibold tracking-wider text-[var(--color-text-secondary)] uppercase">
					Loudness Meter (ITU BS.1770-4)
				</h3>
				<div className="flex gap-2">
					<button
						onClick={handleReset}
						className="rounded border border-[var(--color-border-subtle)] px-2 py-0.5 text-[10px] hover:bg-[var(--color-surface-hover)]"
					>
						Reset
					</button>
					<button
						onClick={handleAnalyze}
						disabled={measuring}
						className="rounded bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent-contrast)] hover:opacity-90 disabled:opacity-50"
					>
						{measuring ? 'Analyzing...' : 'Analyze Selection'}
					</button>
				</div>
			</div>

			{/* Readouts Grid */}
			<div className="grid grid-cols-2 gap-2">
				<div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] p-2">
					<div className="text-[10px] text-[var(--color-text-muted)]">Momentary (400ms)</div>
					<div className="font-mono text-sm font-bold text-[var(--color-accent)]">
						{measurements.momentaryLufs <= -90
							? '-inf'
							: `${measurements.momentaryLufs.toFixed(1)} LUFS`}
					</div>
				</div>

				<div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] p-2">
					<div className="text-[10px] text-[var(--color-text-muted)]">Short-Term (3s)</div>
					<div className="font-mono text-sm font-bold text-[var(--color-accent)]">
						{measurements.shortTermLufs <= -90
							? '-inf'
							: `${measurements.shortTermLufs.toFixed(1)} LUFS`}
					</div>
				</div>

				<div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] p-2">
					<div className="text-[10px] text-[var(--color-text-muted)]">Integrated (Program)</div>
					<div className="font-mono text-sm font-bold text-[var(--color-accent)]">
						{measurements.integratedLufs <= -90
							? '-inf'
							: `${measurements.integratedLufs.toFixed(1)} LUFS`}
					</div>
					<div className="text-[9px] text-[var(--color-text-muted)]">Target: -23.0 LUFS</div>
				</div>

				<div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] p-2">
					<div className="text-[10px] text-[var(--color-text-muted)]">Loudness Range (LRA)</div>
					<div className="font-mono text-sm font-bold text-[var(--color-text-primary)]">
						{`${measurements.loudnessRangeLu.toFixed(1)} LU`}
					</div>
				</div>

				<div className="col-span-2 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] p-2">
					<div className="flex justify-between">
						<span className="text-[10px] text-[var(--color-text-muted)]">True Peak (Max)</span>
						<span
							className={`font-mono text-xs font-bold ${
								measurements.truePeakDbTP > -1.0
									? 'text-[var(--color-error)]'
									: 'text-[var(--color-text-primary)]'
							}`}
						>
							{measurements.truePeakDbTP <= -90
								? '-inf'
								: `${measurements.truePeakDbTP.toFixed(1)} dBTP`}
						</span>
					</div>
					<div className="mt-1 h-2 w-full overflow-hidden rounded bg-[var(--color-surface-base)]">
						<div
							className={`h-full ${
								measurements.truePeakDbTP > -1.0
									? 'bg-[var(--color-error)]'
									: 'bg-[var(--color-accent)]'
							}`}
							style={{
								width: `${Math.max(0, Math.min(100, ((measurements.truePeakDbTP + 40) / 46) * 100))}%`
							}}
						/>
					</div>
				</div>
			</div>
		</div>
	);
};
