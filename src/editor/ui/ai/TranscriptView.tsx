import React, { useState, useMemo } from 'react';
import { useEditorStore } from '../../state/EditorProvider';
import { ticksToTimecode } from '../../core/time';
import type { TranscribedAudioWord } from '../../core/ai/types';
import './ai.css';

export const TranscriptView: React.FC = () => {
	const project = useEditorStore((state) => state.project);
	const fps = project?.settings.fps ?? 30;
	const transcriptWords = useEditorStore((state) => state.ai.transcriptWords);
	const isTranscribing = useEditorStore((state) => state.ai.isTranscribingScript);
	const playhead = useEditorStore((state) => state.timeline.playhead);
	const setPlayhead = useEditorStore((state) => state.setPlayhead);
	const script = useEditorStore((state) => state.ai.script);
	const alignTakesWithScript = useEditorStore((state) => state.alignTakesWithScript);

	const [searchQuery, setSearchQuery] = useState('');
	const [copyNotice, setCopyNotice] = useState(false);

	// Group words into lines/sentences based on inter-word pauses (>700ms) or punctuation
	const groupedLines = useMemo(() => {
		if (transcriptWords.length === 0) return [];
		const lines: Array<{ startUs: number; words: TranscribedAudioWord[] }> = [];
		let currentLine: TranscribedAudioWord[] = [];

		for (let i = 0; i < transcriptWords.length; i++) {
			const w = transcriptWords[i]!;
			const prev = currentLine[currentLine.length - 1];

			let shouldBreak = false;
			if (prev) {
				if (w.startUs - prev.endUs > 700_000) {
					shouldBreak = true;
				} else if (prev.word.endsWith('.') || prev.word.endsWith('?') || prev.word.endsWith('!')) {
					shouldBreak = true;
				} else if (currentLine.length >= 14) {
					shouldBreak = true;
				}
			}

			if (shouldBreak && currentLine.length > 0) {
				lines.push({ startUs: currentLine[0]!.startUs, words: currentLine });
				currentLine = [];
			}
			currentLine.push(w);
		}

		if (currentLine.length > 0) {
			lines.push({ startUs: currentLine[0]!.startUs, words: currentLine });
		}

		return lines;
	}, [transcriptWords]);

	const handleCopyTranscript = async () => {
		const fullText = transcriptWords.map((w) => w.word).join(' ');
		try {
			await navigator.clipboard.writeText(fullText);
			setCopyNotice(true);
			setTimeout(() => setCopyNotice(false), 2000);
		} catch {
			// Clipboard API error ignore
		}
	};

	const query = searchQuery.trim().toLowerCase();

	return (
		<div className="transcript-panel" data-testid="transcript-panel">
			<div className="ai-assistant-header">
				<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
					<span style={{ fontWeight: 600, fontSize: '12px' }}>Interactive Transcript</span>
					{transcriptWords.length > 0 && (
						<span style={{ fontSize: '11px', color: '#64748b' }}>
							({transcriptWords.length} words)
						</span>
					)}
				</div>
				{transcriptWords.length > 0 && (
					<div style={{ display: 'flex', gap: '6px' }}>
						<button
							type="button"
							className="ai-btn-secondary"
							style={{ padding: '2px 8px', fontSize: '11px' }}
							onClick={handleCopyTranscript}
						>
							{copyNotice ? '✓ Copied' : 'Copy All'}
						</button>
					</div>
				)}
			</div>

			{transcriptWords.length > 0 && (
				<div style={{ padding: '6px 12px', borderBottom: '1px solid #1c1c24' }}>
					<input
						type="search"
						className="ai-input"
						placeholder="Search words in transcript…"
						style={{ width: '100%', fontSize: '11px', padding: '3px 8px' }}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
				</div>
			)}

			<div className="ai-panel-content">
				{transcriptWords.length > 0 ? (
					<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
						{groupedLines.map((line, lIdx) => {
							const hasMatch =
								!query ||
								line.words.some(
									(w) => w.cleanWord.includes(query) || w.word.toLowerCase().includes(query)
								);

							if (!hasMatch) return null;

							return (
								<div key={lIdx} className="transcript-line">
									<span
										className="transcript-timecode"
										onClick={() => setPlayhead(line.startUs)}
										title="Seek playhead to line"
										style={{ cursor: 'pointer' }}
									>
										{ticksToTimecode(line.startUs, fps)}
									</span>
									<div style={{ flex: 1, lineHeight: '1.6' }}>
										{line.words.map((w, wIdx) => {
											const isActive = playhead >= w.startUs && playhead < w.endUs;
											const isSearchHit =
												query &&
												(w.cleanWord.includes(query) || w.word.toLowerCase().includes(query));

											return (
												<span
													key={wIdx}
													className={`transcript-word ${isActive ? 'is-active' : ''}`}
													style={{
														borderBottom: isSearchHit ? '2px solid #38bdf8' : undefined,
														backgroundColor:
															isSearchHit && !isActive ? 'rgba(56, 189, 248, 0.15)' : undefined
													}}
													onClick={() => setPlayhead(w.startUs)}
													title={`Seek to ${(w.startUs / 1_000_000).toFixed(2)}s (Confidence: ${Math.round(
														w.confidence * 100
													)}%)`}
												>
													{w.word}{' '}
												</span>
											);
										})}
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b' }}>
						<p style={{ margin: '0 0 10px', fontSize: '13px', color: '#cbd5e1' }}>
							No word transcript available yet.
						</p>
						<p style={{ fontSize: '11px', margin: '0 0 16px', lineHeight: '1.5' }}>
							Align your footage with a script in the Script & Takes tab, or import media to
							automatically generate an interactive, clickable word-level transcript.
						</p>
						{script ? (
							<button
								type="button"
								className="ai-btn-primary"
								style={{ padding: '5px 14px', fontSize: '11px', margin: '0 auto' }}
								disabled={isTranscribing}
								onClick={() => void alignTakesWithScript()}
							>
								{isTranscribing ? 'Aligning Footage…' : 'Align Footage with Script'}
							</button>
						) : null}
					</div>
				)}
			</div>
		</div>
	);
};

export default TranscriptView;
