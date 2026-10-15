import React, { useRef, useState } from 'react';
import { useEditorStore } from '../../state/EditorProvider';
import { parseScriptFile } from '../../core/ai/script/parser';

export const ScriptAssistantView: React.FC = () => {
	const script = useEditorStore((state) => state.ai.script);
	const takeGroups = useEditorStore((state) => state.ai.takeGroups);
	const isTranscribing = useEditorStore((state) => state.ai.isTranscribingScript);
	const alignmentProgress = useEditorStore((state) => state.ai.alignmentProgress);
	const sourceMode = useEditorStore((state) => state.ai.sourceMode);
	const setAiSourceMode = useEditorStore((state) => state.setAiSourceMode);
	const setParsedScript = useEditorStore((state) => state.setParsedScript);
	const alignTakesWithScript = useEditorStore((state) => state.alignTakesWithScript);
	const assembleRoughCut = useEditorStore((state) => state.assembleRoughCut);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const [includeOptional, setIncludeOptional] = useState(false);
	const [useWhisper, setUseWhisper] = useState(false);

	const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;
		try {
			const parsed = await parseScriptFile(file);
			setParsedScript(parsed);
			void alignTakesWithScript({ useWhisper });
		} catch (err) {
			console.error('Failed to parse script file:', err);
		} finally {
			if (fileInputRef.current) fileInputRef.current.value = '';
		}
	};

	const totalCandidates = takeGroups.reduce((acc, g) => acc + g.candidates.length, 0);

	return (
		<div className="script-assistant-view" data-testid="script-assistant-view">
			<div className="ai-section">
				<div className="ai-section-title">Script-Based Take Selection</div>
				<p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 8px' }}>
					Import your script (.txt, .md, .docx, .srt, .vtt). The AI aligns your recorded audio to
					the script, detects restarts and filler words, and selects the best take for each line.
				</p>
			</div>

			<input
				ref={fileInputRef}
				type="file"
				accept=".txt,.md,.docx,.srt,.vtt"
				style={{ display: 'none' }}
				onChange={handleFileUpload}
			/>

			{/* Footage Source & Alignment Engine Controls */}
			<div className="ai-section">
				<div className="ai-section-title">Footage Source</div>
				<div className="ai-field-row" style={{ marginTop: '4px' }}>
					<span className="ai-field-label">Source Footage</span>
					<select
						className="ai-select"
						value={sourceMode}
						disabled={isTranscribing}
						onChange={(e) => setAiSourceMode(e.target.value as 'auto' | 'timeline' | 'bin_media')}
					>
						<option value="auto">Auto-Detect (Timeline or Media Library)</option>
						<option value="timeline">Timeline Sequence Clips</option>
						<option value="bin_media">Media Library Files (Bin Items)</option>
					</select>
				</div>
				<label className="ai-checkbox-label" style={{ marginTop: '6px' }}>
					<input
						type="checkbox"
						className="ai-checkbox"
						checked={useWhisper}
						disabled={isTranscribing}
						onChange={(e) => setUseWhisper(e.target.checked)}
					/>
					<span>Use Local Whisper AI Speech Recognition</span>
				</label>
			</div>

			{script ? (
				<>
					<div className="ai-section">
						<div className="ai-summary-banner">
							<div>
								<span className="ai-summary-badge">{script.lines.length} Lines</span>
								<span style={{ marginLeft: '8px' }}>
									{takeGroups.length} Take Groups
									{totalCandidates > 0 && ` (${totalCandidates} candidates)`}
								</span>
							</div>
							<button
								type="button"
								className="ai-btn-secondary"
								style={{ padding: '2px 8px', fontSize: '10px' }}
								onClick={() => fileInputRef.current?.click()}
							>
								Change Script
							</button>
						</div>
					</div>

					{/* Alignment Progress Feedback */}
					{isTranscribing && (
						<div
							className="ai-section"
							style={{ background: '#12121a', padding: '10px', borderRadius: '6px' }}
						>
							<div
								style={{
									display: 'flex',
									justifyContent: 'space-between',
									fontSize: '11px',
									color: '#38bdf8',
									marginBottom: '4px'
								}}
							>
								<span>{alignmentProgress?.phase || 'Aligning footage with script…'}</span>
								<span>{Math.round((alignmentProgress?.percent ?? 0.5) * 100)}%</span>
							</div>
							<div
								style={{
									width: '100%',
									height: '4px',
									background: '#1e293b',
									borderRadius: '2px',
									overflow: 'hidden'
								}}
							>
								<div
									style={{
										width: `${Math.round((alignmentProgress?.percent ?? 0.5) * 100)}%`,
										height: '100%',
										background: '#38bdf8',
										transition: 'width 0.2s ease'
									}}
								/>
							</div>
						</div>
					)}

					<div className="ai-section">
						<div className="ai-section-title">Assembly Options</div>
						<label className="ai-checkbox-label" style={{ marginTop: '4px' }}>
							<input
								type="checkbox"
								className="ai-checkbox"
								checked={includeOptional}
								onChange={(e) => setIncludeOptional(e.target.checked)}
							/>
							<span>Include optional script lines in rough cut</span>
						</label>
					</div>

					<div className="ai-actions-row" style={{ marginTop: '8px' }}>
						<button
							type="button"
							className="ai-btn-secondary"
							disabled={isTranscribing}
							onClick={() => void alignTakesWithScript({ useWhisper })}
						>
							{isTranscribing ? 'Aligning Footage...' : 'Re-align Footage'}
						</button>
						<button
							type="button"
							className="ai-btn-primary"
							disabled={takeGroups.length === 0 || isTranscribing}
							onClick={() => assembleRoughCut({ includeOptional })}
						>
							Assemble Rough Cut
						</button>
					</div>
				</>
			) : (
				<div style={{ textAlign: 'center', padding: '24px 12px', color: '#64748b' }}>
					<p style={{ margin: '0 0 12px' }}>No script imported yet.</p>
					<button
						type="button"
						className="ai-btn-primary"
						style={{ padding: '4px 14px', fontSize: '11px', margin: '0 auto' }}
						onClick={() => fileInputRef.current?.click()}
					>
						Upload Script File
					</button>
				</div>
			)}
		</div>
	);
};

export default ScriptAssistantView;
