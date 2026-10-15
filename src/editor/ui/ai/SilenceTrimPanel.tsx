import React, { useMemo } from 'react';
import { useEditorStore } from '../../state/EditorProvider';
import { ticksToTimecode } from '../../core/time';
import type { SilenceTrimMode, SilenceApplyTarget } from '../../core/ai/types';

export const SilenceTrimPanel: React.FC = () => {
	const project = useEditorStore((state) => state.project);
	const fps = project?.settings.fps ?? 30;
	const activeSequenceId = useEditorStore((state) => state.activeSequenceId);
	const aiState = useEditorStore((state) => state.ai);
	const setSilenceOptions = useEditorStore((state) => state.setSilenceOptions);
	const toggleSilenceIncluded = useEditorStore((state) => state.toggleSilenceIncluded);
	const includeAllSilences = useEditorStore((state) => state.includeAllSilences);
	const setSilenceVirtualPreview = useEditorStore((state) => state.setSilenceVirtualPreview);
	const analyzeSilence = useEditorStore((state) => state.analyzeSilence);
	const applySilenceTrimAction = useEditorStore((state) => state.applySilenceTrimAction);
	const setPlayhead = useEditorStore((state) => state.setPlayhead);

	const options = aiState.silenceOptions;
	const silences = aiState.detectedSilences;
	const isAnalyzing = aiState.isAnalyzingSilence;
	const virtualPreview = aiState.virtualPreview;

	// Audio tracks in current sequence
	const audioTracks = useMemo(() => {
		if (!project) return [];
		const seq =
			activeSequenceId === 'root' ? project : (project.sequences?.[activeSequenceId] ?? project);
		return seq.tracks.filter((t) => t.kind === 'audio');
	}, [project, activeSequenceId]);

	const includedSilences = useMemo(() => silences.filter((s) => s.included), [silences]);

	const totalRemovedUs = useMemo(
		() => includedSilences.reduce((sum, s) => sum + s.cutDurationUs, 0),
		[includedSilences]
	);

	const handleTrackToggle = (trackId: string) => {
		const current = options.trackIds;
		const next = current.includes(trackId)
			? current.filter((id) => id !== trackId)
			: [...current, trackId];
		setSilenceOptions({ trackIds: next });
	};

	const handleSelectDialogueOnly = () => {
		// Pick tracks that have "dialogue", "vocal", "mic", or "voice" in their name, or first audio track
		const dialogueTracks = audioTracks.filter(
			(t) =>
				/dialogue|voice|vocal|mic|speech|host|guest/i.test(t.name) || audioTracks.indexOf(t) === 0
		);
		setSilenceOptions({ trackIds: dialogueTracks.map((t) => t.id) });
	};

	return (
		<div className="silence-trim-panel" data-testid="silence-trim-panel">
			{/* Tracks Selection */}
			<div className="ai-section">
				<div className="ai-section-title">
					<span>Tracks to Consider</span>
					<button
						type="button"
						className="ai-btn-secondary"
						style={{ padding: '2px 6px', fontSize: '10px' }}
						onClick={handleSelectDialogueOnly}
					>
						Dialogue Only
					</button>
				</div>
				<div className="ai-checkbox-group">
					{audioTracks.length === 0 ? (
						<span style={{ fontSize: '11px', color: '#64748b' }}>No audio tracks found.</span>
					) : (
						audioTracks.map((track) => {
							const isChecked =
								options.trackIds.length === 0 || options.trackIds.includes(track.id);
							return (
								<label key={track.id} className="ai-checkbox-label">
									<input
										type="checkbox"
										className="ai-checkbox"
										checked={isChecked}
										onChange={() => handleTrackToggle(track.id)}
									/>
									<span>{track.name}</span>
								</label>
							);
						})
					)}
				</div>
			</div>

			{/* Silence Detection Parameters */}
			<div className="ai-section">
				<div className="ai-section-title">Silence Parameters</div>

				{/* Max silence to keep */}
				<div className="ai-field">
					<div className="ai-field-row">
						<label className="ai-field-label" htmlFor="max-silence-input">
							Max silence between voices
						</label>
						<span className="ai-field-val">{options.maxSilenceSec.toFixed(2)} s</span>
					</div>
					<input
						id="max-silence-input"
						type="range"
						className="ai-slider"
						min="0.0"
						max="2.0"
						step="0.05"
						value={options.maxSilenceSec}
						onChange={(e) => setSilenceOptions({ maxSilenceSec: parseFloat(e.target.value) })}
					/>
				</div>

				{/* Min silence to cut */}
				<div className="ai-field">
					<div className="ai-field-row">
						<label className="ai-field-label" htmlFor="min-silence-input">
							Min silence to cut
						</label>
						<span className="ai-field-val">{options.minSilenceSec.toFixed(2)} s</span>
					</div>
					<input
						id="min-silence-input"
						type="range"
						className="ai-slider"
						min="0.1"
						max="1.5"
						step="0.05"
						value={options.minSilenceSec}
						onChange={(e) => setSilenceOptions({ minSilenceSec: parseFloat(e.target.value) })}
					/>
				</div>

				{/* Threshold mode & Sensitivity */}
				<div className="ai-field">
					<div className="ai-field-row">
						<span className="ai-field-label">Silence Threshold</span>
						<div style={{ display: 'flex', gap: '4px' }}>
							<button
								type="button"
								className={`ai-btn-secondary ${options.thresholdMode === 'auto' ? 'is-active' : ''}`}
								style={{ padding: '2px 8px', fontSize: '10px' }}
								onClick={() => setSilenceOptions({ thresholdMode: 'auto' })}
							>
								Auto
							</button>
							<button
								type="button"
								className={`ai-btn-secondary ${options.thresholdMode === 'manual' ? 'is-active' : ''}`}
								style={{ padding: '2px 8px', fontSize: '10px' }}
								onClick={() => setSilenceOptions({ thresholdMode: 'manual' })}
							>
								Manual
							</button>
						</div>
					</div>

					{options.thresholdMode === 'auto' ? (
						<div style={{ marginTop: '4px' }}>
							<div className="ai-field-row">
								<span className="ai-field-label" style={{ fontSize: '11px', color: '#94a3b8' }}>
									Sensitivity
								</span>
								<span className="ai-field-val">{(options.sensitivity * 100).toFixed(0)}%</span>
							</div>
							<input
								type="range"
								className="ai-slider"
								min="0.0"
								max="1.0"
								step="0.05"
								value={options.sensitivity}
								onChange={(e) => setSilenceOptions({ sensitivity: parseFloat(e.target.value) })}
							/>
						</div>
					) : (
						<div style={{ marginTop: '4px' }}>
							<div className="ai-field-row">
								<span className="ai-field-label" style={{ fontSize: '11px', color: '#94a3b8' }}>
									Threshold (dB)
								</span>
								<span className="ai-field-val">{options.manualThresholdDb} dB</span>
							</div>
							<input
								type="range"
								className="ai-slider"
								min="-60"
								max="-15"
								step="1"
								value={options.manualThresholdDb}
								onChange={(e) =>
									setSilenceOptions({ manualThresholdDb: parseInt(e.target.value, 10) })
								}
							/>
						</div>
					)}
				</div>

				{/* Padding before/after */}
				<div className="ai-field-row">
					<div className="ai-field" style={{ flex: 1 }}>
						<label className="ai-field-label" style={{ fontSize: '11px' }}>
							Pad Before: {options.paddingBeforeMs}ms
						</label>
						<input
							type="range"
							className="ai-slider"
							min="0"
							max="300"
							step="10"
							value={options.paddingBeforeMs}
							onChange={(e) => setSilenceOptions({ paddingBeforeMs: parseInt(e.target.value, 10) })}
						/>
					</div>
					<div className="ai-field" style={{ flex: 1 }}>
						<label className="ai-field-label" style={{ fontSize: '11px' }}>
							Pad After: {options.paddingAfterMs}ms
						</label>
						<input
							type="range"
							className="ai-slider"
							min="0"
							max="300"
							step="10"
							value={options.paddingAfterMs}
							onChange={(e) => setSilenceOptions({ paddingAfterMs: parseInt(e.target.value, 10) })}
						/>
					</div>
				</div>

				{/* Toggles */}
				<div className="ai-field" style={{ marginTop: '4px', gap: '8px' }}>
					<label className="ai-checkbox-label">
						<input
							type="checkbox"
							className="ai-checkbox"
							checked={options.voiceOnly}
							onChange={(e) => setSilenceOptions({ voiceOnly: e.target.checked })}
						/>
						<span>Voice only (ignore noise / music via VAD)</span>
					</label>

					<label className="ai-checkbox-label">
						<input
							type="checkbox"
							className="ai-checkbox"
							checked={options.keepBreaths}
							onChange={(e) => setSilenceOptions({ keepBreaths: e.target.checked })}
						/>
						<span>Keep natural breaths before speech</span>
					</label>

					<label className="ai-checkbox-label">
						<input
							type="checkbox"
							className="ai-checkbox"
							checked={options.trimLeadingTrailing}
							onChange={(e) => setSilenceOptions({ trimLeadingTrailing: e.target.checked })}
						/>
						<span>Also trim leading/trailing silence</span>
					</label>
				</div>
			</div>

			{/* Trim Mode & Output Target */}
			<div className="ai-section">
				<div className="ai-section-title">Output Options</div>

				<div className="ai-field-row">
					<span className="ai-field-label">Action Mode</span>
					<select
						className="ai-select"
						value={options.mode}
						onChange={(e) => setSilenceOptions({ mode: e.target.value as SilenceTrimMode })}
					>
						<option value="shorten">Shorten to max silence</option>
						<option value="ripple">Remove & ripple cut</option>
						<option value="markers">Mark only with markers</option>
					</select>
				</div>

				<div className="ai-field-row">
					<span className="ai-field-label">Apply To</span>
					<select
						className="ai-select"
						value={options.applyTarget}
						onChange={(e) =>
							setSilenceOptions({ applyTarget: e.target.value as SilenceApplyTarget })
						}
					>
						<option value="all-tracks">All tracks (keeps A/V sync)</option>
						<option value="linked-only">Linked tracks only</option>
					</select>
				</div>

				{options.applyTarget === 'linked-only' && (
					<span style={{ fontSize: '10px', color: '#f59e0b', marginTop: '2px' }}>
						⚠️ Warning: Applying to linked tracks only may desynchronize background music or
						unlinked b-roll.
					</span>
				)}

				<div className="ai-field-row">
					<span className="ai-field-label">Crossfade (Audio)</span>
					<span className="ai-field-val">{options.crossfadeMs} ms</span>
				</div>
				<input
					type="range"
					className="ai-slider"
					min="0"
					max="50"
					step="1"
					value={options.crossfadeMs}
					onChange={(e) => setSilenceOptions({ crossfadeMs: parseInt(e.target.value, 10) })}
				/>
			</div>

			{/* Detection Button */}
			<div className="ai-actions-row">
				<button
					type="button"
					className="ai-btn-primary"
					disabled={isAnalyzing}
					onClick={() => void analyzeSilence()}
				>
					{isAnalyzing ? (
						<span>Analyzing Audio ({aiState.analysisProgress}%)...</span>
					) : (
						<span>Detect Silences</span>
					)}
				</button>
			</div>

			{/* Review Results */}
			{silences.length > 0 && (
				<div className="ai-section">
					<div className="ai-summary-banner">
						<div>
							<span className="ai-summary-badge">{includedSilences.length} Silences</span>
							<span style={{ marginLeft: '8px' }}>
								Removed: {(totalRemovedUs / 1_000_000).toFixed(2)}s
							</span>
						</div>
						<button
							type="button"
							className={`ai-btn-secondary ${virtualPreview ? 'is-active' : ''}`}
							style={{ padding: '3px 8px', fontSize: '11px' }}
							onClick={() => setSilenceVirtualPreview(!virtualPreview)}
						>
							{virtualPreview ? '⏸ Virtual Preview ON' : '▶ Virtual Preview'}
						</button>
					</div>

					<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
						<span style={{ fontSize: '11px', color: '#94a3b8' }}>Detected Silence Regions:</span>
						<div style={{ display: 'flex', gap: '4px' }}>
							<button
								type="button"
								className="ai-btn-secondary"
								style={{ padding: '1px 5px', fontSize: '10px' }}
								onClick={() => includeAllSilences(true)}
							>
								Select All
							</button>
							<button
								type="button"
								className="ai-btn-secondary"
								style={{ padding: '1px 5px', fontSize: '10px' }}
								onClick={() => includeAllSilences(false)}
							>
								Deselect All
							</button>
						</div>
					</div>

					<div className="ai-silence-list" role="list">
						{silences.map((silence, idx) => (
							<div
								key={silence.id}
								className={`ai-silence-item ${!silence.included ? 'is-excluded' : ''}`}
								onClick={() => setPlayhead(silence.startUs)}
								role="listitem"
							>
								<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
									<input
										type="checkbox"
										className="ai-checkbox"
										checked={silence.included}
										onChange={(e) => {
											e.stopPropagation();
											toggleSilenceIncluded(silence.id);
										}}
									/>
									<span style={{ color: '#94a3b8' }}>#{idx + 1}</span>
									<span className="ai-silence-time">{ticksToTimecode(silence.startUs, fps)}</span>
								</div>
								<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
									<span style={{ color: '#64748b' }}>
										{(silence.durationUs / 1_000_000).toFixed(2)}s
									</span>
									<span className="ai-silence-cut-badge">
										-{(silence.cutDurationUs / 1_000_000).toFixed(2)}s
									</span>
								</div>
							</div>
						))}
					</div>

					{/* Apply Output Buttons */}
					<div className="ai-actions-row" style={{ marginTop: '8px' }}>
						<button
							type="button"
							className="ai-btn-primary"
							onClick={() => applySilenceTrimAction('new-sequence')}
						>
							Apply to New Sequence
						</button>
						<button
							type="button"
							className="ai-btn-secondary"
							onClick={() => applySilenceTrimAction('in-place')}
						>
							Apply in Place
						</button>
					</div>
				</div>
			)}
		</div>
	);
};
