import { useMemo } from 'react';
import type { Clip, ClipId, Project, TrackerId, TrackerType } from '../../core/types';
import { viewProject } from '../../core/sequences/access';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import { trackFeatureUsed } from '../../../services/activityTracking';

interface TrackingSectionProps {
	clip: Clip;
	fps: number;
}

function getClipLabel(targetClip: Clip, project: Project | null): string {
	if (targetClip.source?.type === 'text') {
		const text = targetClip.source.text || targetClip.text || 'Text';
		return `T "${text.length > 20 ? text.slice(0, 18) + '…' : text}"`;
	}
	if (targetClip.source?.type === 'solid') {
		return 'Solid Color';
	}
	if (targetClip.source?.type === 'adjustment') {
		return 'Adjustment Layer';
	}
	if (targetClip.source?.type === 'shape') {
		const shapeType = targetClip.source.shapeType ?? 'Shape';
		return `Shape (${shapeType})`;
	}
	if (targetClip.assetId && project?.assets[targetClip.assetId]) {
		const asset = project.assets[targetClip.assetId]!;
		return `[${asset.kind === 'image' ? 'Image' : 'Video'}] ${asset.name}`;
	}
	return targetClip.id;
}

export function TrackingSection({ clip }: TrackingSectionProps) {
	const store = useEditorStoreApi();
	const selectedTrackerId = useEditorStore((state) => state.selectedTrackerId);
	const isTrackingActive = useEditorStore((state) => state.isTrackingActive);
	const trackingProgress = useEditorStore((state) => state.trackingProgress);
	const project = useEditorStore((state) => state.project);
	const activeSeqId = useEditorStore((state) => state.activeSequenceId);

	const activeProject = useMemo(() => {
		return project ? viewProject(project, activeSeqId) : null;
	}, [project, activeSeqId]);

	const trackers = clip.trackers ?? [];
	const selectedTracker = trackers.find((t) => t.id === selectedTrackerId) ?? trackers[0] ?? null;

	const handleAddTracker = (type: TrackerType = 'point') => {
		const newId = store.getState().addTracker(clip.id, type);
		if (newId) {
			store.getState().selectTracker(newId);
		}
	};

	const handleRemoveTracker = (id: TrackerId) => {
		store.getState().removeTracker(clip.id, id);
	};

	const handleTrackForward = async () => {
		if (!selectedTracker) return;
		trackFeatureUsed('motion_tracking', { type: selectedTracker.type, direction: 'forward' });
		await store.getState().startTracking(clip.id, selectedTracker.id, 'forward');
	};

	const handleTrackBackward = async () => {
		if (!selectedTracker) return;
		trackFeatureUsed('motion_tracking', { type: selectedTracker.type, direction: 'backward' });
		await store.getState().startTracking(clip.id, selectedTracker.id, 'backward');
	};

	const handleCancel = async () => {
		await store.getState().cancelTracking();
	};

	// Target clips eligible for binding (non-audio, excluding current clip)
	const eligibleTargets = useMemo(() => {
		if (!activeProject) return [];
		return (activeProject.tracks ?? [])
			.filter((t) => t.kind !== 'audio')
			.flatMap((t) => t.clips)
			.filter((c) => {
				if (c.id === clip.id) return false;
				if (
					c.source?.type === 'text' ||
					c.source?.type === 'solid' ||
					c.source?.type === 'adjustment'
				) {
					return true;
				}
				if (c.assetId && project?.assets[c.assetId]) {
					const a = project.assets[c.assetId]!;
					return a.kind === 'video' || a.kind === 'image';
				}
				return true;
			});
	}, [activeProject, clip.id, project]);

	// Bound target clip
	const boundClip = useMemo(() => {
		if (!selectedTracker?.binding || !activeProject) return null;
		return (activeProject.tracks ?? [])
			.flatMap((t) => t.clips)
			.find((c) => c.id === selectedTracker.binding?.targetClipId);
	}, [activeProject, selectedTracker?.binding]);

	// Confidence average
	const avgConfidence = useMemo(() => {
		if (!selectedTracker || selectedTracker.samples.length === 0) return 0;
		const sum = selectedTracker.samples.reduce((acc, s) => acc + (s.confidence ?? 1), 0);
		return Math.round((sum / selectedTracker.samples.length) * 100);
	}, [selectedTracker]);

	return (
		<div className="tracking-container">
			{/* Header Row */}
			<div className="tracking-header-row">
				<div className="timeline-counter-badge" style={{ margin: 0 }}>
					<span className="timeline-badge-dot" />
					<span>
						{trackers.length} {trackers.length === 1 ? 'Tracker' : 'Trackers'}
					</span>
				</div>
				<button
					type="button"
					onClick={() => handleAddTracker('point')}
					className="tracking-pill-btn-add"
					title="Add Point Tracker"
				>
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						aria-hidden="true"
					>
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					<span>Add Tracker</span>
				</button>
			</div>

			{/* Empty State when no trackers exist */}
			{trackers.length === 0 ? (
				<div className="tracking-empty-card">
					<div className="tracking-empty-icon-wrap">
						<svg
							width="22"
							height="22"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.75"
							aria-hidden="true"
						>
							<circle cx="12" cy="12" r="9" strokeDasharray="3 3" opacity="0.6" />
							<circle cx="12" cy="12" r="4" />
							<line x1="12" y1="2" x2="12" y2="7" />
							<line x1="12" y1="17" x2="12" y2="22" />
							<line x1="2" y1="12" x2="7" y2="12" />
							<line x1="17" y1="12" x2="22" y2="12" />
							<circle cx="12" cy="12" r="1.5" fill="currentColor" />
						</svg>
					</div>
					<div>
						<div className="tracking-empty-title">No Motion Trackers</div>
						<p className="tracking-empty-desc">
							Track motion points in your clip to lock text, media layers, or stabilize camera
							movement.
						</p>
					</div>
					<button
						type="button"
						onClick={() => handleAddTracker('point')}
						className="tracking-action-btn-primary"
						aria-label="Add Point Tracker"
					>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.5"
							aria-hidden="true"
						>
							<line x1="12" y1="5" x2="12" y2="19" />
							<line x1="5" y1="12" x2="19" y2="12" />
						</svg>
						<span>Add Point Tracker</span>
					</button>
				</div>
			) : (
				<div className="tracking-card">
					{/* Tracker Selector Header */}
					<div className="tracking-card-header">
						<select
							value={selectedTracker?.id ?? ''}
							onChange={(e) => store.getState().selectTracker(e.target.value as TrackerId)}
							className="tracking-select flex-1"
							aria-label="Select motion tracker"
						>
							{trackers.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name} ({t.samples.length} pts)
								</option>
							))}
						</select>

						{selectedTracker && (
							<>
								<span className="tracking-pts-badge" title="Tracked sample points">
									{selectedTracker.samples.length} pts
								</span>
								{selectedTracker.samples.length > 0 && (
									<button
										type="button"
										onClick={() =>
											store.getState().updateTracker(clip.id, selectedTracker.id, { samples: [] })
										}
										className="rounded bg-[#1e293b] px-1.5 py-0.5 text-[10px] text-amber-400/90 transition-colors hover:bg-amber-500/20 hover:text-amber-300"
										title="Clear tracked sample points"
									>
										Clear
									</button>
								)}
								<button
									type="button"
									onClick={() => handleRemoveTracker(selectedTracker.id)}
									className="tracking-icon-btn-danger"
									title="Delete tracker"
									aria-label="Delete tracker"
								>
									<svg
										width="13"
										height="13"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										aria-hidden="true"
									>
										<polyline points="3 6 5 6 21 6" />
										<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
										<line x1="10" y1="11" x2="10" y2="17" />
										<line x1="14" y1="11" x2="14" y2="17" />
									</svg>
								</button>
							</>
						)}
					</div>

					{selectedTracker && (
						<div className="flex flex-col gap-2.5">
							{/* Tracked Properties / Size display */}
							<div className="flex items-center justify-between px-1 text-[11px] text-[#94a3b8]">
								<div className="flex items-center gap-2.5">
									<label className="flex cursor-pointer items-center gap-1">
										<input
											type="checkbox"
											checked={selectedTracker.params.trackTranslation ?? true}
											onChange={(e) => {
												store.getState().updateTracker(clip.id, selectedTracker.id, {
													params: {
														...selectedTracker.params,
														trackTranslation: e.target.checked
													}
												});
											}}
											className="rounded border-[#475569] bg-[#1e293b] text-[#38bdf8] focus:ring-0"
										/>
										<span>Position</span>
									</label>
									<label className="flex cursor-pointer items-center gap-1">
										<input
											type="checkbox"
											checked={selectedTracker.params.trackScale ?? true}
											onChange={(e) => {
												store.getState().updateTracker(clip.id, selectedTracker.id, {
													params: {
														...selectedTracker.params,
														trackScale: e.target.checked
													}
												});
											}}
											className="rounded border-[#475569] bg-[#1e293b] text-[#38bdf8] focus:ring-0"
										/>
										<span>Scale (Size)</span>
									</label>
									<label className="flex cursor-pointer items-center gap-1">
										<input
											type="checkbox"
											checked={selectedTracker.params.trackRotation ?? false}
											onChange={(e) => {
												store.getState().updateTracker(clip.id, selectedTracker.id, {
													params: {
														...selectedTracker.params,
														trackRotation: e.target.checked
													}
												});
											}}
											className="rounded border-[#475569] bg-[#1e293b] text-[#38bdf8] focus:ring-0"
										/>
										<span>Rotation</span>
									</label>
								</div>
								{selectedTracker.samples.length > 0 && (
									<span className="font-mono text-[10px] font-semibold text-[#38bdf8]">
										{Math.round(
											(selectedTracker.samples[selectedTracker.samples.length - 1]?.scale ?? 1.0) *
												100
										)}
										% size
									</span>
								)}
							</div>

							{/* Tracker Box Size & Search Controls */}
							<div className="tracking-settings-box flex flex-col gap-2 rounded-md border border-[#334155]/60 bg-[#0f172a]/60 p-2.5">
								<div className="flex items-center justify-between text-[11px] font-medium text-[#cbd5e1]">
									<span>Tracker Box Size</span>
									<div className="flex items-center gap-1.5 text-[10px]">
										<button
											type="button"
											onClick={() => {
												store.getState().updateTracker(clip.id, selectedTracker.id, {
													initialRegion: {
														...selectedTracker.initialRegion,
														width: 0.05,
														height: 0.05
													}
												});
											}}
											className="rounded bg-[#1e293b] px-1.5 py-0.5 text-[#94a3b8] transition-colors hover:bg-[#334155] hover:text-white"
											title="Small 5% size"
										>
											Small
										</button>
										<button
											type="button"
											onClick={() => {
												store.getState().updateTracker(clip.id, selectedTracker.id, {
													initialRegion: {
														...selectedTracker.initialRegion,
														width: 0.08,
														height: 0.08
													}
												});
											}}
											className="rounded bg-[#1e293b] px-1.5 py-0.5 text-[#94a3b8] transition-colors hover:bg-[#334155] hover:text-white"
											title="Default 8% size"
										>
											Med
										</button>
										<button
											type="button"
											onClick={() => {
												store.getState().updateTracker(clip.id, selectedTracker.id, {
													initialRegion: {
														...selectedTracker.initialRegion,
														width: 0.15,
														height: 0.15
													}
												});
											}}
											className="rounded bg-[#1e293b] px-1.5 py-0.5 text-[#94a3b8] transition-colors hover:bg-[#334155] hover:text-white"
											title="Large 15% size"
										>
											Large
										</button>
										<button
											type="button"
											onClick={() => {
												store.getState().updateTracker(clip.id, selectedTracker.id, {
													initialRegion: {
														...selectedTracker.initialRegion,
														width: 0.25,
														height: 0.25
													}
												});
											}}
											className="rounded bg-[#1e293b] px-1.5 py-0.5 text-[#94a3b8] transition-colors hover:bg-[#334155] hover:text-white"
											title="Extra Large 25% size"
										>
											XL
										</button>
									</div>
								</div>

								{/* Width Slider */}
								<div className="flex items-center gap-2 text-[11px]">
									<span className="w-12 text-[#94a3b8]">Width:</span>
									<input
										type="range"
										min="2"
										max="40"
										step="1"
										value={Math.round(selectedTracker.initialRegion.width * 100)}
										onChange={(e) => {
											const val = parseFloat(e.target.value) / 100;
											store.getState().updateTracker(clip.id, selectedTracker.id, {
												initialRegion: {
													...selectedTracker.initialRegion,
													width: val
												}
											});
										}}
										className="h-1.5 flex-1 cursor-pointer accent-[#38bdf8]"
										aria-label="Tracker feature box width"
									/>
									<span className="w-10 text-right font-mono text-[#38bdf8]">
										{Math.round(selectedTracker.initialRegion.width * 100)}%
									</span>
								</div>

								{/* Height Slider */}
								<div className="flex items-center gap-2 text-[11px]">
									<span className="w-12 text-[#94a3b8]">Height:</span>
									<input
										type="range"
										min="2"
										max="40"
										step="1"
										value={Math.round(selectedTracker.initialRegion.height * 100)}
										onChange={(e) => {
											const val = parseFloat(e.target.value) / 100;
											store.getState().updateTracker(clip.id, selectedTracker.id, {
												initialRegion: {
													...selectedTracker.initialRegion,
													height: val
												}
											});
										}}
										className="h-1.5 flex-1 cursor-pointer accent-[#38bdf8]"
										aria-label="Tracker feature box height"
									/>
									<span className="w-10 text-right font-mono text-[#38bdf8]">
										{Math.round(selectedTracker.initialRegion.height * 100)}%
									</span>
								</div>

								{/* Search Multiplier Slider */}
								<div className="flex items-center gap-2 text-[11px]">
									<span className="w-12 text-[#94a3b8]">Search:</span>
									<input
										type="range"
										min="1.2"
										max="5.0"
										step="0.1"
										value={selectedTracker.initialRegion.searchMultiplier ?? 2.5}
										onChange={(e) => {
											const val = parseFloat(e.target.value);
											store.getState().updateTracker(clip.id, selectedTracker.id, {
												initialRegion: {
													...selectedTracker.initialRegion,
													searchMultiplier: val
												}
											});
										}}
										className="h-1.5 flex-1 cursor-pointer accent-[#fbbf24]"
										aria-label="Tracker search area multiplier"
									/>
									<span className="w-10 text-right font-mono text-[#fbbf24]">
										{(selectedTracker.initialRegion.searchMultiplier ?? 2.5).toFixed(1)}×
									</span>
								</div>
							</div>

							{/* Direction Controls (Segmented Pill Group) */}
							<div className="segmented-pill-group">
								<button
									type="button"
									disabled={isTrackingActive}
									onClick={handleTrackBackward}
									className="segmented-pill-btn"
									title="Track backward from current playhead position"
									aria-label="Track Backward"
								>
									<svg
										width="11"
										height="11"
										viewBox="0 0 16 16"
										fill="currentColor"
										aria-hidden="true"
										className="shrink-0"
									>
										<path d="M12.5 3.24a1 1 0 0 0-1.52-.86L3.8 7.14a1 1 0 0 0 0 1.72l7.18 4.76a1 1 0 0 0 1.52-.86V3.24z" />
									</svg>
									<span>Track Backward</span>
								</button>
								<button
									type="button"
									disabled={isTrackingActive}
									onClick={handleTrackForward}
									className="segmented-pill-btn"
									title="Track forward from current playhead position"
									aria-label="Track Forward"
								>
									<span>Track Forward</span>
									<svg
										width="11"
										height="11"
										viewBox="0 0 16 16"
										fill="currentColor"
										aria-hidden="true"
										className="shrink-0"
									>
										<path d="M3.5 3.24a1 1 0 0 1 1.52-.86l7.18 4.76a1 1 0 0 1 0 1.72l-7.18 4.76a1 1 0 0 1-1.52-.86V3.24z" />
									</svg>
								</button>
							</div>

							{/* Progress Bar & Live State Indicator */}
							{isTrackingActive && trackingProgress && (
								<div className="tracking-progress-card">
									<div className="flex items-center justify-between text-[11px]">
										<div className="flex items-center gap-2">
											<span className="tracking-live-pulse-dot" />
											<span className="font-mono text-[#94a3b8]">
												Tracking frame {trackingProgress.processedFrames} /{' '}
												{trackingProgress.totalFrames}
											</span>
										</div>
										<div className="flex items-center gap-2">
											<span className="font-mono text-[11px] font-semibold text-[#38bdf8]">
												{Math.round(
													(trackingProgress.processedFrames /
														Math.max(1, trackingProgress.totalFrames)) *
														100
												)}
												%
											</span>
											<button
												type="button"
												onClick={handleCancel}
												className="tracking-cancel-btn"
												title="Cancel current tracking operation"
											>
												Cancel
											</button>
										</div>
									</div>
									<div className="tracking-progress-bar">
										<div
											className="tracking-progress-fill"
											style={{
												width: `${Math.round(
													(trackingProgress.processedFrames /
														Math.max(1, trackingProgress.totalFrames)) *
														100
												)}%`
											}}
										/>
									</div>
								</div>
							)}

							{/* Confidence Graph */}
							{selectedTracker.samples.length > 0 && (
								<div className="flex flex-col gap-1.5">
									<div className="text-divider" style={{ marginTop: 2, paddingTop: 6 }}>
										<span className="text-divider-title">Confidence</span>
										<span className="tracking-confidence-badge">{avgConfidence}% avg</span>
									</div>
									<div className="tracking-graph-card">
										<svg className="h-8 w-full" preserveAspectRatio="none" viewBox="0 0 100 24">
											<defs>
												<linearGradient id="trackerConfidenceGrad" x1="0" y1="0" x2="0" y2="1">
													<stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
													<stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
												</linearGradient>
											</defs>
											{/* Area fill */}
											<path
												d={`M 0 24 ${selectedTracker.samples
													.map((s, idx) => {
														const x = (idx / Math.max(1, selectedTracker.samples.length - 1)) * 100;
														const y = 24 - Math.max(0, Math.min(1, s.confidence)) * 20;
														return `L ${x.toFixed(1)} ${y.toFixed(1)}`;
													})
													.join(' ')} L 100 24 Z`}
												fill="url(#trackerConfidenceGrad)"
											/>
											{/* Line stroke */}
											<path
												d={selectedTracker.samples
													.map((s, idx) => {
														const x = (idx / Math.max(1, selectedTracker.samples.length - 1)) * 100;
														const y = 24 - Math.max(0, Math.min(1, s.confidence)) * 20;
														return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
													})
													.join(' ')}
												fill="none"
												stroke="#38bdf8"
												strokeWidth="1.5"
												strokeLinecap="round"
												strokeLinejoin="round"
											/>
										</svg>
									</div>
								</div>
							)}

							{/* Apply / Follow / Bake Section */}
							<div className="flex flex-col gap-1.5">
								<div className="text-divider" style={{ marginTop: 4, paddingTop: 6 }}>
									<span className="text-divider-title">Attach & Follow</span>
									{selectedTracker.binding && (
										<span className="tracking-live-badge">
											<span className="tracking-green-dot" />
											Live Follow
										</span>
									)}
								</div>

								{selectedTracker.binding ? (
									<div className="tracking-bound-card">
										<div className="flex items-center justify-between text-[11px]">
											<span className="text-[#94a3b8]">Attached Layer:</span>
											<span className="max-w-[180px] truncate font-medium text-[#f1f5f9]">
												{boundClip
													? getClipLabel(boundClip, project)
													: selectedTracker.binding.targetClipId}
											</span>
										</div>
										{/* Follow options */}
										<div className="flex items-center gap-3 pt-1 text-[11px] text-[#cbd5e1]">
											<label className="flex cursor-pointer items-center gap-1">
												<input
													type="checkbox"
													checked={selectedTracker.binding.applyPosition ?? true}
													onChange={(e) => {
														store.getState().updateTracker(clip.id, selectedTracker.id, {
															binding: {
																...selectedTracker.binding!,
																applyPosition: e.target.checked
															}
														});
													}}
													className="rounded border-[#475569] bg-[#1e293b] text-[#38bdf8] focus:ring-0"
												/>
												<span>Position</span>
											</label>
											<label className="flex cursor-pointer items-center gap-1">
												<input
													type="checkbox"
													checked={selectedTracker.binding.applyScale ?? true}
													onChange={(e) => {
														store.getState().updateTracker(clip.id, selectedTracker.id, {
															binding: {
																...selectedTracker.binding!,
																applyScale: e.target.checked
															}
														});
													}}
													className="rounded border-[#475569] bg-[#1e293b] text-[#38bdf8] focus:ring-0"
												/>
												<span>Scale (Size)</span>
											</label>
											<label className="flex cursor-pointer items-center gap-1">
												<input
													type="checkbox"
													checked={selectedTracker.binding.applyRotation ?? false}
													onChange={(e) => {
														store.getState().updateTracker(clip.id, selectedTracker.id, {
															binding: {
																...selectedTracker.binding!,
																applyRotation: e.target.checked
															}
														});
													}}
													className="rounded border-[#475569] bg-[#1e293b] text-[#38bdf8] focus:ring-0"
												/>
												<span>Rotation</span>
											</label>
										</div>
										<div className="flex items-center gap-2 pt-1">
											<button
												type="button"
												onClick={() =>
													store.getState().bakeTracker(clip.id, selectedTracker.id, 0.5)
												}
												className="tracking-btn-bake"
												title="Convert live tracked motion into permanent clip keyframes"
												aria-label="Bake to Keyframes"
											>
												<svg
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2"
													aria-hidden="true"
												>
													<polygon points="12 2 22 12 12 22 2 12" />
												</svg>
												<span>Bake to Keyframes</span>
											</button>
											<button
												type="button"
												onClick={() => store.getState().unbindTracker(clip.id, selectedTracker.id)}
												className="tracking-btn-unbind"
												title="Unbind layer from tracking"
											>
												Unbind
											</button>
										</div>
									</div>
								) : (
									<div className="tracking-bound-card">
										<select
											id="target-clip-select"
											className="tracking-select w-full"
											defaultValue=""
											aria-label="Select layer to attach to tracker"
											onChange={(e) => {
												const targetId = e.target.value as ClipId;
												if (targetId) {
													store.getState().bindToTracker(clip.id, selectedTracker.id, {
														targetClipId: targetId,
														applyPosition: true,
														applyRotation: false,
														applyScale: true
													});
												}
											}}
										>
											<option value="" disabled>
												Select layer to attach (text, image, solid)...
											</option>
											{eligibleTargets.map((c) => (
												<option key={c.id} value={c.id}>
													{getClipLabel(c, project)}
												</option>
											))}
										</select>
										<span className="text-[10px] leading-tight text-[#64748b]">
											Binds this layer's position and size to the tracked object in real-time.
										</span>
									</div>
								)}
							</div>

							{/* Stabilization panel */}
							<div className="flex flex-col gap-1.5">
								<div className="text-divider" style={{ marginTop: 4, paddingTop: 6 }}>
									<span className="text-divider-title">Stabilization</span>
									{selectedTracker.samples.length >= 2 && (
										<span className="font-mono text-[10px] text-[#94a3b8]">
											{selectedTracker.samples.length} frames ready
										</span>
									)}
								</div>
								<div className="tracking-stabilize-card">
									<span className="text-[10px] leading-relaxed text-[#64748b]">
										Applies counter-motion smoothing and auto-zoom to eliminate camera shake.
									</span>
									<button
										type="button"
										disabled={isTrackingActive || selectedTracker.samples.length < 2}
										onClick={() => store.getState().stabilizeClip(clip.id, selectedTracker.id)}
										className="tracking-stabilize-btn"
										title={
											selectedTracker.samples.length < 2
												? 'Track points first before stabilizing'
												: 'Apply camera stabilization to this clip'
										}
									>
										<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
											aria-hidden="true"
										>
											<polygon points="23 7 16 12 23 17 23 7" />
											<rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
										</svg>
										<span>Stabilize Clip</span>
									</button>
								</div>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
