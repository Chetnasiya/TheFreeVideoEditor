import React, { useRef, useState } from 'react';
import { useEditorStore } from '../../state/EditorProvider';
import { parseScriptFile } from '../../core/ai/script/parser';

export const ScriptAssistantView: React.FC = () => {
	const script = useEditorStore((state) => state.ai.script);
	const takeGroups = useEditorStore((state) => state.ai.takeGroups);
	const isTranscribing = useEditorStore((state) => state.ai.isTranscribingScript);
	const setParsedScript = useEditorStore((state) => state.setParsedScript);
	const alignTakesWithScript = useEditorStore((state) => state.alignTakesWithScript);
	const assembleRoughCut = useEditorStore((state) => state.assembleRoughCut);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const [includeOptional, setIncludeOptional] = useState(false);

	const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;
		try {
			const parsed = await parseScriptFile(file);
			setParsedScript(parsed);
		} catch (err) {
			console.error('Failed to parse script file:', err);
		} finally {
			if (fileInputRef.current) fileInputRef.current.value = '';
		}
	};

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

			{script ? (
				<>
					<div className="ai-section">
						<div className="ai-summary-banner">
							<div>
								<span className="ai-summary-badge">{script.lines.length} Lines</span>
								<span style={{ marginLeft: '8px' }}>{takeGroups.length} Take Groups</span>
							</div>
						</div>
					</div>

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
							onClick={() => void alignTakesWithScript()}
						>
							{isTranscribing ? 'Aligning Footage...' : 'Re-align Footage'}
						</button>
						<button
							type="button"
							className="ai-btn-primary"
							disabled={takeGroups.length === 0}
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
						style={{ padding: '4px 14px', fontSize: '11px' }}
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
