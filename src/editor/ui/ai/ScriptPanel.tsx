import React, { useRef, useState } from 'react';
import { useEditorStore } from '../../state/EditorProvider';
import {
	assignSpeakerTrack,
	deleteScriptLine,
	mergeScriptLines,
	parseScriptFile,
	parseScriptFromText,
	toggleScriptLineOptional
} from '../../core/ai/script/parser';
import type { TrackId } from '../../core/types';
import './ai.css';

export const ScriptPanel: React.FC = () => {
	const project = useEditorStore((state) => state.project);
	const script = useEditorStore((state) => state.ai.script);
	const isTranscribing = useEditorStore((state) => state.ai.isTranscribingScript);
	const setParsedScript = useEditorStore((state) => state.setParsedScript);
	const alignTakesWithScript = useEditorStore((state) => state.alignTakesWithScript);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isPasteOpen, setIsPasteOpen] = useState(false);
	const [pasteText, setPasteText] = useState('');
	const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);

	const audioTracks = (project?.tracks ?? []).filter((t) => t.kind === 'audio');

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

	const handlePasteSubmit = () => {
		if (!pasteText.trim()) return;
		const parsed = parseScriptFromText(pasteText, 'Pasted Script', 'pasted');
		setParsedScript(parsed);
		setIsPasteOpen(false);
		setPasteText('');
	};

	const handleSpeakerTrackChange = (speaker: string, trackIdStr: string) => {
		if (!script) return;
		const trackId = trackIdStr ? (trackIdStr as TrackId) : undefined;
		const updated = assignSpeakerTrack(script, speaker, trackId);
		setParsedScript(updated);
	};

	const handleToggleSelectLine = (id: string) => {
		setSelectedLineIds((prev) =>
			prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
		);
	};

	const handleMergeSelected = () => {
		if (!script || selectedLineIds.length <= 1) return;
		const updated = mergeScriptLines(script, selectedLineIds);
		setParsedScript(updated);
		setSelectedLineIds([]);
	};

	const handleDeleteLine = (id: string) => {
		if (!script) return;
		const updated = deleteScriptLine(script, id);
		setParsedScript(updated);
		setSelectedLineIds((prev) => prev.filter((item) => item !== id));
	};

	const handleToggleOptional = (id: string) => {
		if (!script) return;
		const updated = toggleScriptLineOptional(script, id);
		setParsedScript(updated);
	};

	return (
		<div className="script-panel" data-testid="script-panel">
			<div className="ai-assistant-header">
				<span style={{ fontWeight: 600, fontSize: '12px' }}>Script</span>
				<div style={{ display: 'flex', gap: '6px' }}>
					<input
						ref={fileInputRef}
						type="file"
						accept=".txt,.md,.docx,.srt,.vtt"
						style={{ display: 'none' }}
						onChange={handleFileUpload}
					/>
					<button
						type="button"
						className="ai-btn-secondary"
						style={{ padding: '3px 8px', fontSize: '11px' }}
						onClick={() => fileInputRef.current?.click()}
					>
						Upload
					</button>
					<button
						type="button"
						className="ai-btn-secondary"
						style={{ padding: '3px 8px', fontSize: '11px' }}
						onClick={() => setIsPasteOpen(true)}
					>
						Paste
					</button>
				</div>
			</div>

			<div className="ai-panel-content">
				{/* Paste Modal */}
				{isPasteOpen && (
					<div
						className="ai-section"
						style={{ background: '#181822', padding: '12px', borderRadius: '6px' }}
					>
						<span className="ai-section-title">Paste Script Text</span>
						<textarea
							className="ai-input"
							rows={6}
							placeholder="Paste dialogue script or fountain format here..."
							value={pasteText}
							onChange={(e) => setPasteText(e.target.value)}
							style={{ width: '100%', resize: 'vertical', marginTop: '6px' }}
						/>
						<div
							style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '8px' }}
						>
							<button
								type="button"
								className="ai-btn-secondary"
								style={{ padding: '3px 8px', fontSize: '11px' }}
								onClick={() => setIsPasteOpen(false)}
							>
								Cancel
							</button>
							<button
								type="button"
								className="ai-btn-primary"
								style={{ padding: '3px 12px', fontSize: '11px' }}
								onClick={handlePasteSubmit}
							>
								Import
							</button>
						</div>
					</div>
				)}

				{script ? (
					<>
						{/* Speaker Track Mapping */}
						{script.speakers.length > 0 && (
							<div className="ai-section">
								<div className="ai-section-title">Speaker Track Mapping</div>
								<div
									style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}
								>
									{script.speakers.map((speaker) => {
										const currentTrack = script.lines.find((l) => l.speaker === speaker)?.trackId;
										return (
											<div key={speaker} className="ai-field-row" style={{ fontSize: '11px' }}>
												<span style={{ fontWeight: 500, color: '#38bdf8' }}>{speaker}</span>
												<select
													className="ai-select"
													style={{ padding: '2px 6px', fontSize: '11px' }}
													value={currentTrack ?? ''}
													onChange={(e) => handleSpeakerTrackChange(speaker, e.target.value)}
												>
													<option value="">Auto / Any Track</option>
													{audioTracks.map((t) => (
														<option key={t.id} value={t.id}>
															{t.name}
														</option>
													))}
												</select>
											</div>
										);
									})}
								</div>
							</div>
						)}

						{/* Action toolbar */}
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
							<span style={{ fontSize: '11px', color: '#94a3b8' }}>
								{script.lines.length} Lines ({script.format?.toUpperCase()})
							</span>
							{selectedLineIds.length > 1 && (
								<button
									type="button"
									className="ai-btn-secondary"
									style={{ padding: '2px 8px', fontSize: '11px' }}
									onClick={handleMergeSelected}
								>
									Merge Selected ({selectedLineIds.length})
								</button>
							)}
						</div>

						{/* Lines List */}
						<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
							{script.lines.map((line) => {
								const isSelected = selectedLineIds.includes(line.id);
								return (
									<div
										key={line.id}
										className={`script-line-card ${isSelected ? 'is-active' : ''} ${
											line.optional ? 'is-optional' : ''
										}`}
										style={{
											opacity: line.optional ? 0.6 : 1,
											borderLeft: line.optional ? '2px dashed #64748b' : undefined
										}}
									>
										<div
											style={{
												display: 'flex',
												justifyContent: 'space-between',
												alignItems: 'center',
												fontSize: '11px',
												color: '#94a3b8'
											}}
										>
											<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
												<input
													type="checkbox"
													checked={isSelected}
													onChange={() => handleToggleSelectLine(line.id)}
													title="Select line for merging"
												/>
												<span style={{ fontWeight: 600 }}>#{line.lineIndex}</span>
												{line.speaker && (
													<span style={{ color: '#38bdf8', fontWeight: 500 }}>{line.speaker}</span>
												)}
											</div>
											<div style={{ display: 'flex', gap: '4px' }}>
												<button
													type="button"
													className="ai-btn-secondary"
													style={{ padding: '1px 5px', fontSize: '10px' }}
													title={line.optional ? 'Mark line required' : 'Mark line optional'}
													onClick={() => handleToggleOptional(line.id)}
												>
													{line.optional ? 'Required' : 'Optional'}
												</button>
												<button
													type="button"
													className="ai-btn-secondary"
													style={{ padding: '1px 5px', fontSize: '10px', color: '#f87171' }}
													title="Delete line"
													onClick={() => handleDeleteLine(line.id)}
												>
													✕
												</button>
											</div>
										</div>
										<div style={{ fontSize: '12px', color: '#f1f5f9', marginTop: '4px' }}>
											{line.text}
										</div>
									</div>
								);
							})}
						</div>

						{/* Align Footage Button */}
						<div className="ai-actions-row" style={{ marginTop: '12px' }}>
							<button
								type="button"
								className="ai-btn-primary"
								disabled={isTranscribing}
								onClick={() => void alignTakesWithScript()}
							>
								{isTranscribing ? 'Aligning Footage with Script...' : 'Align Takes with Script'}
							</button>
						</div>
					</>
				) : (
					<div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b' }}>
						<p style={{ margin: '0 0 12px' }}>
							No script imported. Upload a .txt, .md, .docx, or subtitle file, or paste text to
							begin take selection.
						</p>
						<div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
							<button
								type="button"
								className="ai-btn-primary"
								style={{ padding: '4px 12px', fontSize: '11px' }}
								onClick={() => fileInputRef.current?.click()}
							>
								Upload File
							</button>
							<button
								type="button"
								className="ai-btn-secondary"
								style={{ padding: '4px 12px', fontSize: '11px' }}
								onClick={() => setIsPasteOpen(true)}
							>
								Paste Text
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default ScriptPanel;
