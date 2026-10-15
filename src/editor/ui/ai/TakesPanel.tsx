import React from 'react';
import { useEditorStore } from '../../state/EditorProvider';
import { ticksToTimecode } from '../../core/time';
import './ai.css';

export const TakesPanel: React.FC = () => {
	const project = useEditorStore((state) => state.project);
	const fps = project?.settings.fps ?? 30;
	const script = useEditorStore((state) => state.ai.script);
	const takeGroups = useEditorStore((state) => state.ai.takeGroups);
	const selectedTakeGroupId = useEditorStore((state) => state.ai.selectedTakeGroupId);
	const selectTakeGroup = useEditorStore((state) => state.selectTakeGroup);
	const chooseTake = useEditorStore((state) => state.chooseTake);
	const assembleRoughCut = useEditorStore((state) => state.assembleRoughCut);
	const setPlayhead = useEditorStore((state) => state.setPlayhead);

	const activeGroup = takeGroups.find((g) => g.id === selectedTakeGroupId) || takeGroups[0];
	const activeScriptLine = script?.lines.find((l) => l.id === activeGroup?.scriptLineId);

	const handleAuditionTake = (startUs: number) => {
		setPlayhead(startUs);
	};

	return (
		<div className="takes-panel" data-testid="takes-panel">
			<div className="ai-assistant-header">
				<span style={{ fontWeight: 600, fontSize: '12px' }}>Takes & Candidates</span>
				{takeGroups.length > 0 && (
					<button
						type="button"
						className="ai-btn-primary"
						style={{ padding: '3px 10px', fontSize: '11px' }}
						onClick={() => assembleRoughCut()}
					>
						Assemble Rough Cut
					</button>
				)}
			</div>

			<div className="ai-panel-content">
				{takeGroups.length > 0 ? (
					<>
						{/* Script Line Selector Bar */}
						<div className="ai-section">
							<div className="ai-section-title">Script Lines</div>
							<div
								style={{
									display: 'flex',
									gap: '4px',
									overflowX: 'auto',
									paddingBottom: '4px'
								}}
							>
								{takeGroups.map((group) => {
									const isSelected = activeGroup?.id === group.id;
									const chosen =
										group.candidates.find((c) => c.id === group.selectedTakeId) ||
										group.candidates[0];
									return (
										<button
											key={group.id}
											type="button"
											className={`ai-tab-btn ${isSelected ? 'is-active' : ''}`}
											style={{
												padding: '4px 8px',
												display: 'flex',
												alignItems: 'center',
												gap: '6px'
											}}
											onClick={() => selectTakeGroup(group.id)}
										>
											<span>Line {group.lineIndex}</span>
											<span
												className={`take-score-pill ${
													(chosen?.score ?? 0) >= 85 ? 'score-high' : 'score-med'
												}`}
												style={{ fontSize: '9px', padding: '1px 4px' }}
											>
												{group.candidates.length} takes
											</span>
										</button>
									);
								})}
							</div>
						</div>

						{/* Active Line Detail & Takes */}
						{activeGroup && (
							<div className="ai-section">
								<div className="ai-section-title">
									<span>Line #{activeGroup.lineIndex} Takes</span>
									{activeScriptLine?.speaker && (
										<span style={{ color: '#38bdf8', fontWeight: 500 }}>
											{activeScriptLine.speaker}
										</span>
									)}
								</div>

								{activeScriptLine && (
									<div
										style={{
											fontSize: '12px',
											color: '#94a3b8',
											fontStyle: 'italic',
											padding: '6px 8px',
											background: '#12121a',
											borderRadius: '4px'
										}}
									>
										"{activeScriptLine.text}"
									</div>
								)}

								{/* Candidates List */}
								<div
									style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}
								>
									{activeGroup.candidates.map((take, tIdx) => {
										const isChosen = take.id === activeGroup.selectedTakeId;
										return (
											<div key={take.id} className={`take-card ${isChosen ? 'is-chosen' : ''}`}>
												<div
													style={{
														display: 'flex',
														justifyContent: 'space-between',
														alignItems: 'center'
													}}
												>
													<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
														<span style={{ fontWeight: 600, fontSize: '12px' }}>
															Take {tIdx + 1}
														</span>
														<span
															className={`take-score-pill ${
																take.score >= 85
																	? 'score-high'
																	: take.score >= 70
																		? 'score-med'
																		: ''
															}`}
														>
															Score: {take.score}
														</span>
														<span style={{ fontSize: '11px', color: '#64748b' }}>
															{(take.durationUs / 1_000_000).toFixed(2)}s
														</span>
													</div>

													<div style={{ display: 'flex', gap: '4px' }}>
														<button
															type="button"
															className="ai-btn-secondary"
															style={{ padding: '2px 6px', fontSize: '11px' }}
															onClick={() => handleAuditionTake(take.startUs)}
															title="Audition playhead at this take"
														>
															▶ Audition
														</button>
														<button
															type="button"
															className={`ai-btn-secondary ${isChosen ? 'is-active' : ''}`}
															style={{
																padding: '2px 8px',
																fontSize: '11px',
																color: isChosen ? '#34d399' : undefined
															}}
															onClick={() => chooseTake(activeGroup.id, take.id)}
														>
															{isChosen ? '✓ Selected' : 'Choose Take'}
														</button>
													</div>
												</div>

												{/* Timecode badge */}
												<div
													style={{
														fontSize: '10px',
														color: '#64748b',
														fontFamily: 'var(--font-mono)'
													}}
												>
													{ticksToTimecode(take.startUs, fps)} – {ticksToTimecode(take.endUs, fps)}
												</div>

												{/* Transcript with diff */}
												<div style={{ fontSize: '12px', color: '#f1f5f9' }}>{take.transcript}</div>

												{/* Defects tags */}
												<div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
													{take.defects.stumble && <span className="take-defect-tag">Stumble</span>}
													{take.defects.restart && (
														<span className="take-defect-tag">False Start / Restart</span>
													)}
													{take.defects.incomplete && (
														<span className="take-defect-tag">Incomplete</span>
													)}
													{take.defects.longPause && (
														<span className="take-defect-tag">Awkward Pause</span>
													)}
													{take.defects.fillerWords.map((fw, fIdx) => (
														<span key={fIdx} className="take-defect-tag">
															Filler: "{fw}"
														</span>
													))}
												</div>

												{/* Explainable Score Breakdown */}
												<div
													style={{
														display: 'flex',
														justifyContent: 'space-between',
														fontSize: '10px',
														color: '#94a3b8',
														background: 'rgba(0,0,0,0.2)',
														padding: '4px 6px',
														borderRadius: '4px'
													}}
												>
													<span>Acc: {take.scoreBreakdown.accuracy}%</span>
													<span>Comp: {take.scoreBreakdown.completeness}%</span>
													<span>Fluency: {take.scoreBreakdown.fluency}%</span>
													<span>Audio: {take.scoreBreakdown.audioQuality}%</span>
													<span>Recency: {take.scoreBreakdown.recency}%</span>
												</div>
											</div>
										);
									})}
								</div>
							</div>
						)}
					</>
				) : (
					<div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b' }}>
						<p style={{ margin: '0 0 8px' }}>No take candidates generated yet.</p>
						<p style={{ fontSize: '11px', margin: 0 }}>
							Import a script in the Script panel and click "Align Takes with Script" to detect and
							rank your best takes.
						</p>
					</div>
				)}
			</div>
		</div>
	);
};

export default TakesPanel;
