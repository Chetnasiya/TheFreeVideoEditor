import { useState, useMemo, useRef, useEffect, type ChangeEvent } from 'react';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import { ticksToTimecode } from '../../core/time';
import { CAPTION_PRESETS, DEFAULT_CAPTION_STYLE } from '../../core/captions/presets';
import type {
	CaptionStyle,
	CaptionSegment,
	CaptionPositionPreset,
	CaptionHighlightMode,
	Track,
	TrackId
} from '../../core/types';
import { ColorPickerField } from '../inspector/ColorPickerField';
import { saveFile } from '../../services/storage/fileAccess';
import { AutoCaptionModal } from './AutoCaptionModal';
import './captions.css';

export interface CaptionsPanelProps {
	onAutoCaption?: () => void;
}

export function CaptionsPanel({ onAutoCaption }: CaptionsPanelProps) {
	const store = useEditorStoreApi();
	const project = useEditorStore((state) => state.project);
	const playhead = useEditorStore((state) => state.timeline.playhead);
	const selection = useEditorStore((state) => state.timeline.selection);

	const [activeTab, setActiveTab] = useState<'cues' | 'style'>('cues');
	const [autoCaptionModalOpen, setAutoCaptionModalOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [replaceQuery, setReplaceQuery] = useState('');
	const fileInputRef = useRef<HTMLInputElement>(null);
	const cueListRef = useRef<HTMLDivElement>(null);

	// Caption tracks
	const captionTracks = useMemo(() => {
		if (!project) return [];
		return project.tracks.filter((t): t is Track & { kind: 'caption' } => t.kind === 'caption');
	}, [project]);

	// Currently active or selected caption track
	const activeTrackId = useMemo(() => {
		if (selection.trackId && captionTracks.some((t) => t.id === selection.trackId)) {
			return selection.trackId;
		}
		return captionTracks[0]?.id;
	}, [captionTracks, selection.trackId]);

	const activeTrack = useMemo(() => {
		return captionTracks.find((t) => t.id === activeTrackId);
	}, [captionTracks, activeTrackId]);

	const captions: CaptionSegment[] = useMemo(() => {
		return activeTrack?.captions ?? [];
	}, [activeTrack]);

	const filteredCaptions: CaptionSegment[] = useMemo(() => {
		if (!searchQuery.trim()) return captions;
		const query = searchQuery.toLowerCase();
		return captions.filter(
			(c) =>
				c.text.toLowerCase().includes(query) ||
				(c.speaker && c.speaker.toLowerCase().includes(query))
		);
	}, [captions, searchQuery]);

	const currentStyle: CaptionStyle = useMemo(() => {
		return activeTrack?.captionStyle ?? DEFAULT_CAPTION_STYLE;
	}, [activeTrack]);

	const selectedCaptionId = selection.captionId;

	// Scroll selected cue into view when selection changes
	useEffect(() => {
		if (!selectedCaptionId || !cueListRef.current) return;
		const el = cueListRef.current.querySelector<HTMLElement>(
			`[data-caption-id="${selectedCaptionId}"]`
		);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	}, [selectedCaptionId]);

	const handleCreateTrack = () => {
		const newTrackId = store.getState().addCaptionTrack();
		if (newTrackId) {
			store.getState().selectCaption(newTrackId, null);
		}
	};

	const handleAddCue = () => {
		store.getState().addCaptionAtPlayhead('New Caption');
	};

	const handleUpdateText = (captionId: string, newText: string) => {
		if (!activeTrackId) return;
		store.getState().updateCaptionSegment(activeTrackId, captionId, { text: newText });
	};

	const handleDeleteCue = (captionId: string) => {
		if (!activeTrackId) return;
		store.getState().deleteCaptionSegment(activeTrackId, captionId);
	};

	const handleSplitCue = (captionId: string) => {
		if (!activeTrackId) return;
		store.getState().splitCaptionSegmentAt(activeTrackId, captionId, playhead);
	};

	const handleMergeWithNext = (captionId: string) => {
		if (!activeTrackId) return;
		const idx = captions.findIndex((c) => c.id === captionId);
		if (idx !== -1 && idx < captions.length - 1) {
			const next = captions[idx + 1];
			if (next) {
				store.getState().mergeCaptionSegmentsWith(activeTrackId, captionId, next.id);
			}
		}
	};

	const handleSeek = (time: number) => {
		store.getState().setPlayhead(time);
	};

	const handleUpdateStyle = (stylePatch: Partial<CaptionStyle>) => {
		if (!activeTrackId) return;
		store.getState().setCaptionTrackStyle(activeTrackId, stylePatch);
	};

	const handleApplyPreset = (presetKey: string) => {
		const preset = CAPTION_PRESETS[presetKey];
		if (!preset || !activeTrackId) return;
		store.getState().setCaptionTrackStyle(activeTrackId, preset.style);
	};

	const handleImportClick = () => {
		fileInputRef.current?.click();
	};

	const handleFileImport = async (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file || !activeTrackId) return;
		try {
			const text = await file.text();
			const format = file.name.endsWith('.vtt') ? 'vtt' : 'srt';
			store.getState().importCaptionsToTrack(activeTrackId, text, format);
		} catch {
			// handled in store
		} finally {
			if (fileInputRef.current) fileInputRef.current.value = '';
		}
	};

	const handleExport = async (format: 'srt' | 'vtt') => {
		if (!activeTrackId || !project) return;
		const content = store.getState().exportCaptionsFromTrack(activeTrackId, format);
		if (!content) return;

		const blob = new Blob([content], {
			type: format === 'vtt' ? 'text/vtt;charset=utf-8' : 'text/plain;charset=utf-8'
		});
		const safeName = (project.name || 'captions').replace(/[^a-z0-9_-]/gi, '_');
		await saveFile(blob, `${safeName}.${format}`, [
			{
				description: format === 'vtt' ? 'WebVTT Subtitles (*.vtt)' : 'SubRip Subtitles (*.srt)',
				accept: { [format === 'vtt' ? 'text/vtt' : 'text/plain']: [`.${format}`] }
			}
		]);
	};

	if (!project) {
		return (
			<div className="captions-panel">
				<div className="captions-empty">
					<span className="captions-empty-icon">💬</span>
					<p className="captions-empty-hint">Open or create a project to edit captions.</p>
				</div>
			</div>
		);
	}

	return (
		<div className="captions-panel">
			{/* Top Bar */}
			<div className="captions-panel-header">
				<div className="captions-view-tabs" role="tablist">
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === 'cues'}
						className={`captions-view-tab ${activeTab === 'cues' ? 'is-active' : ''}`}
						onClick={() => setActiveTab('cues')}
						title="Transcript & Cues"
					>
						Transcript
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === 'style'}
						className={`captions-view-tab ${activeTab === 'style' ? 'is-active' : ''}`}
						onClick={() => setActiveTab('style')}
						title="Track Style"
					>
						Track Style
					</button>
				</div>

				<div className="captions-header-actions">
					<button
						type="button"
						className="captions-btn-icon captions-btn-primary"
						onClick={() => {
							if (onAutoCaption) onAutoCaption();
							else setAutoCaptionModalOpen(true);
						}}
						title="Auto-generate subtitles locally with AI"
					>
						✨ Auto-Caption
					</button>
					<button
						type="button"
						className="captions-btn-icon"
						onClick={handleAddCue}
						title="Add caption cue at playhead"
					>
						+ Add Cue
					</button>
				</div>
			</div>

			{/* Track Selector Bar */}
			<div className="captions-track-bar">
				<div className="captions-track-bar-left">
					<span className="captions-track-label">Track:</span>
					{captionTracks.length > 0 ? (
						<select
							className="captions-track-select"
							value={activeTrackId ?? ''}
							onChange={(e) => {
								store.getState().selectCaption(e.target.value as TrackId, null);
							}}
						>
							{captionTracks.map((t, i) => (
								<option key={t.id} value={t.id}>
									{t.name || `Caption Track ${i + 1}`} ({t.captions?.length ?? 0})
								</option>
							))}
						</select>
					) : (
						<span style={{ color: 'var(--color-mute)' }}>None</span>
					)}
					<button
						type="button"
						className="captions-btn-pill"
						onClick={handleCreateTrack}
						title="Create new caption track"
					>
						+ New Track
					</button>
				</div>

				<div className="captions-track-bar-right">
					<button
						type="button"
						className="captions-btn-pill"
						onClick={handleImportClick}
						disabled={!activeTrackId}
						title="Import SRT or VTT file"
					>
						Import
					</button>
					<button
						type="button"
						className="captions-btn-pill"
						onClick={() => void handleExport('srt')}
						disabled={!activeTrackId || captions.length === 0}
						title="Export SRT subtitle file"
					>
						SRT
					</button>
					<button
						type="button"
						className="captions-btn-pill"
						onClick={() => void handleExport('vtt')}
						disabled={!activeTrackId || captions.length === 0}
						title="Export WebVTT subtitle file"
					>
						VTT
					</button>
					<input
						type="file"
						ref={fileInputRef}
						style={{ display: 'none' }}
						accept=".srt,.vtt,text/vtt,text/plain"
						onChange={(e) => void handleFileImport(e)}
					/>
				</div>
			</div>

			{/* Search & Replace Bar */}
			{activeTab === 'cues' && captions.length > 0 && (
				<div className="captions-search-bar">
					<div className="captions-search-input-wrap">
						<input
							type="text"
							className="captions-search-field"
							placeholder="Search cues…"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
						{searchQuery && (
							<button
								type="button"
								className="captions-clear-btn"
								onClick={() => setSearchQuery('')}
								title="Clear search"
							>
								✕
							</button>
						)}
					</div>
					<div className="captions-replace-input-wrap">
						<input
							type="text"
							className="captions-search-field"
							placeholder="Replace…"
							value={replaceQuery}
							onChange={(e) => setReplaceQuery(e.target.value)}
						/>
						<button
							type="button"
							className="captions-btn-pill"
							disabled={!searchQuery}
							onClick={() => {
								if (!activeTrackId || !searchQuery) return;
								for (const cue of captions) {
									if (cue.text.includes(searchQuery)) {
										const newText = cue.text.replaceAll(searchQuery, replaceQuery);
										store.getState().updateCaptionSegment(activeTrackId, cue.id, { text: newText });
									}
								}
								setSearchQuery('');
							}}
							title="Replace all matches across cues"
						>
							Replace All
						</button>
					</div>
				</div>
			)}

			{/* Tab Content */}
			{activeTab === 'cues' ? (
				<div className="captions-cue-list-container">
					{filteredCaptions.length === 0 ? (
						<div className="captions-empty">
							<span className="captions-empty-icon">💬</span>
							<p className="captions-empty-hint">
								{captionTracks.length === 0
									? 'Click "+ New Track" or "+ Add Cue" to start subtitle authoring.'
									: captions.length === 0
										? 'No captions on this track. Add a cue at playhead or import an SRT/VTT file.'
										: 'No cues matched your search query.'}
							</p>
						</div>
					) : (
						<div className="captions-cue-list" ref={cueListRef}>
							{filteredCaptions.map((cue, idx) => {
								const isSelected = selectedCaptionId === cue.id;
								const isPlaying = playhead >= cue.start && playhead < cue.end;
								const startTc = ticksToTimecode(cue.start, project.settings.fps);
								const endTc = ticksToTimecode(cue.end, project.settings.fps);

								return (
									<div
										key={cue.id}
										data-caption-id={cue.id}
										className={`caption-cue-item ${isSelected ? 'is-selected' : ''} ${isPlaying ? 'is-playing' : ''}`}
										onClick={() => {
											if (activeTrackId) {
												store.getState().selectCaption(activeTrackId, cue.id);
											}
										}}
									>
										<div className="caption-cue-header">
											<div
												className="caption-cue-timestamps"
												onClick={(e) => {
													e.stopPropagation();
													handleSeek(cue.start);
												}}
												title="Click to seek playhead to start of cue"
											>
												<span>{startTc}</span>
												<span className="timestamp-arrow">→</span>
												<span>{endTc}</span>
											</div>

											<div className="caption-cue-tools">
												<button
													type="button"
													className="caption-cue-tool-btn"
													onClick={(e) => {
														e.stopPropagation();
														handleSplitCue(cue.id);
													}}
													title="Split cue at playhead (S)"
												>
													Split
												</button>
												{idx < captions.length - 1 && (
													<button
														type="button"
														className="caption-cue-tool-btn"
														onClick={(e) => {
															e.stopPropagation();
															handleMergeWithNext(cue.id);
														}}
														title="Merge with next cue"
													>
														Merge
													</button>
												)}
												<button
													type="button"
													className="caption-cue-tool-btn btn-delete"
													onClick={(e) => {
														e.stopPropagation();
														handleDeleteCue(cue.id);
													}}
													title="Delete cue"
												>
													✕
												</button>
											</div>
										</div>

										<textarea
											className="caption-cue-textarea"
											value={cue.text}
											onChange={(e) => handleUpdateText(cue.id, e.target.value)}
											onClick={(e) => e.stopPropagation()}
											placeholder="Enter caption text…"
										/>

										{cue.words && cue.words.length > 0 && (
											<div className="caption-cue-words">
												{cue.words.map((w, wIdx) => {
													const isWordActive = playhead >= w.start && playhead < w.end;
													return (
														<span
															key={wIdx}
															className={`caption-cue-word ${isWordActive ? 'is-active-word' : ''}`}
															onClick={(e) => {
																e.stopPropagation();
																handleSeek(w.start);
															}}
															title={`${ticksToTimecode(w.start, project.settings.fps)}`}
														>
															{w.text}
														</span>
													);
												})}
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>
			) : (
				/* Style Editor Tab */
				<div className="captions-style-editor">
					<div className="captions-style-group">
						<span className="captions-group-title">Style Presets</span>
						<div className="captions-presets-grid">
							{Object.values(CAPTION_PRESETS).map((preset) => (
								<button
									key={preset.id}
									type="button"
									className="caption-preset-card"
									onClick={() => handleApplyPreset(preset.id)}
								>
									<span className="caption-preset-name">{preset.name}</span>
									<span className="caption-preset-desc">{preset.description}</span>
								</button>
							))}
						</div>
					</div>

					<div className="captions-style-group">
						<span className="captions-group-title">Typography</span>
						<div className="captions-field-row">
							<label>Font Size</label>
							<div className="captions-range-wrapper">
								<input
									type="range"
									min={18}
									max={96}
									value={currentStyle.fontSize}
									onChange={(e) => handleUpdateStyle({ fontSize: Number(e.target.value) })}
								/>
								<span style={{ fontSize: '12px', minWidth: '32px' }}>
									{currentStyle.fontSize}px
								</span>
							</div>
						</div>

						<div className="captions-field-row">
							<label>Alignment</label>
							<select
								className="captions-select"
								value={currentStyle.alignment}
								onChange={(e) =>
									handleUpdateStyle({
										alignment: e.target.value as 'left' | 'center' | 'right'
									})
								}
							>
								<option value="center">Center</option>
								<option value="left">Left</option>
								<option value="right">Right</option>
							</select>
						</div>

						<div className="captions-field-row">
							<label>Position</label>
							<select
								className="captions-select"
								value={currentStyle.positionPreset}
								onChange={(e) =>
									handleUpdateStyle({
										positionPreset: e.target.value as CaptionPositionPreset
									})
								}
							>
								<option value="bottom">Bottom</option>
								<option value="center">Center</option>
								<option value="top">Top</option>
							</select>
						</div>

						<div className="captions-field-row">
							<label>Margin</label>
							<div className="captions-range-wrapper">
								<input
									type="range"
									min={2}
									max={30}
									value={currentStyle.marginPercent ?? 7}
									onChange={(e) => handleUpdateStyle({ marginPercent: Number(e.target.value) })}
								/>
								<span style={{ fontSize: '12px', minWidth: '32px' }}>
									{currentStyle.marginPercent ?? 7}%
								</span>
							</div>
						</div>
					</div>

					<div className="captions-style-group">
						<span className="captions-group-title">Colors & Stroke</span>
						<ColorPickerField
							label="Text Color"
							value={currentStyle.color}
							onChange={(rgba) =>
								handleUpdateStyle({
									color: { r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3] }
								})
							}
						/>

						<ColorPickerField
							label="Outline Color"
							value={currentStyle.strokeColor ?? { r: 0, g: 0, b: 0, a: 1 }}
							onChange={(rgba) =>
								handleUpdateStyle({
									strokeColor: { r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3] }
								})
							}
						/>

						<div className="captions-field-row">
							<label>Outline Width</label>
							<div className="captions-range-wrapper">
								<input
									type="range"
									min={0}
									max={16}
									value={currentStyle.strokeWidth ?? 0}
									onChange={(e) => handleUpdateStyle({ strokeWidth: Number(e.target.value) })}
								/>
								<span style={{ fontSize: '12px', minWidth: '32px' }}>
									{currentStyle.strokeWidth ?? 0}px
								</span>
							</div>
						</div>

						<ColorPickerField
							label="Background Box"
							hasAlpha={true}
							value={currentStyle.backgroundColor ?? { r: 0, g: 0, b: 0, a: 0 }}
							onChange={(rgba) =>
								handleUpdateStyle({
									backgroundColor: { r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3] }
								})
							}
						/>
					</div>

					<div className="captions-style-group">
						<span className="captions-group-title">Karaoke Highlighting</span>
						<div className="captions-field-row">
							<label>Highlight Mode</label>
							<select
								className="captions-select"
								value={currentStyle.highlightMode ?? 'none'}
								onChange={(e) =>
									handleUpdateStyle({
										highlightMode: e.target.value as CaptionHighlightMode
									})
								}
							>
								<option value="none">None (Static)</option>
								<option value="word">Active Word</option>
								<option value="progressive">Progressive (Karaoke)</option>
							</select>
						</div>

						{currentStyle.highlightMode && currentStyle.highlightMode !== 'none' && (
							<ColorPickerField
								label="Highlight Color"
								value={currentStyle.highlightColor ?? { r: 1, g: 0.95, b: 0.2, a: 1 }}
								onChange={(rgba) =>
									handleUpdateStyle({
										highlightColor: { r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3] }
									})
								}
							/>
						)}
					</div>
				</div>
			)}

			<AutoCaptionModal
				open={autoCaptionModalOpen}
				onClose={() => setAutoCaptionModalOpen(false)}
			/>
		</div>
	);
}
