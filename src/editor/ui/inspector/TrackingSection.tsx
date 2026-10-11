import type { Clip, Project, TrackerId, TrackerType } from '../../core/types';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';

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
	if (targetClip.assetId && project?.assets[targetClip.assetId]) {
		const asset = project.assets[targetClip.assetId]!;
		return `${asset.kind === 'image' ? '🖼️ ' : '🎬 '}${asset.name}`;
	}
	return targetClip.id;
}

export function TrackingSection({ clip }: TrackingSectionProps) {
	const store = useEditorStoreApi();
	const selectedTrackerId = useEditorStore((state) => state.selectedTrackerId);
	const isTrackingActive = useEditorStore((state) => state.isTrackingActive);
	const trackingProgress = useEditorStore((state) => state.trackingProgress);

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
		await store.getState().startTracking(clip.id, selectedTracker.id, 'forward');
	};

	const handleTrackBackward = async () => {
		if (!selectedTracker) return;
		await store.getState().startTracking(clip.id, selectedTracker.id, 'backward');
	};

	const handleCancel = async () => {
		await store.getState().cancelTracking();
	};

	return (
		<div className="tracking-container">
			<div className="tracking-header-row">
				<span className="font-medium text-[var(--color-mute)]">Trackers ({trackers.length})</span>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => handleAddTracker('point')}
						className="tracking-btn tracking-btn-accent"
					>
						+ Add Point Tracker
					</button>
				</div>
			</div>

			{trackers.length > 0 && (
				<div className="tracking-card">
					<div className="tracking-card-header">
						<select
							value={selectedTracker?.id ?? ''}
							onChange={(e) => store.getState().selectTracker(e.target.value as TrackerId)}
							className="tracking-select flex-1"
						>
							{trackers.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name} ({t.samples.length} pts)
								</option>
							))}
						</select>
						{selectedTracker && (
							<button
								type="button"
								onClick={() => handleRemoveTracker(selectedTracker.id)}
								className="tracking-btn tracking-btn-danger"
								title="Delete tracker"
							>
								Delete
							</button>
						)}
					</div>

					{selectedTracker && (
						<div className="flex flex-col gap-2 pt-1">
							{/* Controls: Track forward / backward */}
							<div className="flex items-center gap-2">
								<button
									type="button"
									disabled={isTrackingActive}
									onClick={handleTrackBackward}
									className="tracking-btn flex-1 gap-1.5"
									title="Track backward from playhead"
									aria-label="Track Backward"
								>
									<svg
										width="12"
										height="12"
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
									className="tracking-btn flex-1 gap-1.5"
									title="Track forward from playhead"
									aria-label="Track Forward"
								>
									<span>Track Forward</span>
									<svg
										width="12"
										height="12"
										viewBox="0 0 16 16"
										fill="currentColor"
										aria-hidden="true"
										className="shrink-0"
									>
										<path d="M3.5 3.24a1 1 0 0 1 1.52-.86l7.18 4.76a1 1 0 0 1 0 1.72l-7.18 4.76a1 1 0 0 1-1.52-.86V3.24z" />
									</svg>
								</button>
							</div>

							{/* Progress Bar & Cancel */}
							{isTrackingActive && trackingProgress && (
								<div className="flex flex-col gap-1.5 rounded border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-2">
									<div className="flex items-center justify-between text-[11px]">
										<span className="text-[var(--color-mute)]">
											Tracking frame {trackingProgress.processedFrames} /{' '}
											{trackingProgress.totalFrames}
										</span>
										<button
											type="button"
											onClick={handleCancel}
											className="font-medium text-[var(--color-error)] hover:underline"
										>
											Cancel
										</button>
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
								<div className="flex flex-col gap-1 pt-1">
									<span className="text-[10px] text-[var(--color-mute)]">Confidence History</span>
									<div className="h-8 w-full rounded border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-0.5">
										<svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 24">
											<path
												d={selectedTracker.samples
													.map((s, idx) => {
														const x = (idx / Math.max(1, selectedTracker.samples.length - 1)) * 100;
														const y = 24 - Math.max(0, Math.min(1, s.confidence)) * 22;
														return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
													})
													.join(' ')}
												fill="none"
												stroke="var(--color-link)"
												strokeWidth="1.5"
											/>
										</svg>
									</div>
								</div>
							)}

							{/* Apply / Follow / Bake Section (Slice 2) */}
							<div className="flex flex-col gap-1.5 border-t border-[var(--color-hairline)] pt-2">
								<span className="text-[11px] font-medium text-[var(--color-body)]">
									Apply / Follow
								</span>
								{selectedTracker.binding ? (
									<div className="flex flex-col gap-2 rounded border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-2">
										<div className="flex items-center justify-between text-[11px]">
											<span className="text-[var(--color-mute)]">
												Bound to:{' '}
												<span className="font-medium text-[var(--color-ink)]">
													{(() => {
														const boundClip = (store.getState().project?.tracks ?? [])
															.flatMap((t) => t.clips)
															.find((c) => c.id === selectedTracker.binding?.targetClipId);
														return boundClip
															? getClipLabel(boundClip, store.getState().project)
															: selectedTracker.binding.targetClipId;
													})()}
												</span>
											</span>
											<span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
												Live Follow
											</span>
										</div>
										<div className="flex items-center gap-1.5">
											<button
												type="button"
												onClick={() =>
													store.getState().bakeTracker(clip.id, selectedTracker.id, 0.5)
												}
												className="tracking-btn tracking-btn-primary flex-1"
											>
												Bake to Keyframes
											</button>
											<button
												type="button"
												onClick={() => store.getState().unbindTracker(clip.id, selectedTracker.id)}
												className="tracking-btn"
											>
												Unbind
											</button>
										</div>
									</div>
								) : (
									<div className="flex flex-col gap-2 rounded border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-2">
										<div className="flex items-center gap-2">
											<label
												htmlFor="target-clip-select"
												className="text-[11px] text-[var(--color-mute)]"
											>
												Target:
											</label>
											<select
												id="target-clip-select"
												className="tracking-select flex-1"
												defaultValue=""
												onChange={(e) => {
													const targetId = e.target.value as import('../../core/types').ClipId;
													if (targetId) {
														store.getState().bindToTracker(clip.id, selectedTracker.id, {
															targetClipId: targetId,
															applyPosition: true,
															applyRotation: false,
															applyScale: false
														});
													}
												}}
											>
												<option value="" disabled>
													Select clip, text, or image to attach...
												</option>
												{(store.getState().project?.tracks ?? [])
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
														if (c.assetId && store.getState().project?.assets[c.assetId]) {
															const a = store.getState().project!.assets[c.assetId]!;
															return a.kind === 'video' || a.kind === 'image';
														}
														return true;
													})
													.map((c) => (
														<option key={c.id} value={c.id}>
															{getClipLabel(c, store.getState().project)}
														</option>
													))}
											</select>
										</div>
									</div>
								)}
							</div>

							{/* Stabilization panel */}
							<div className="mt-2 flex flex-col gap-2 border-t border-[var(--color-hairline)] pt-2">
								<div className="flex items-center justify-between">
									<span className="font-medium text-[var(--color-body)]">Stabilization</span>
									<button
										type="button"
										disabled={isTrackingActive || selectedTracker.samples.length < 2}
										onClick={() => store.getState().stabilizeClip(clip.id, selectedTracker.id)}
										className="tracking-btn tracking-btn-accent"
									>
										Stabilize Clip
									</button>
								</div>
								<span className="text-[10px] text-[var(--color-mute)]">
									Applies counter-motion smoothing and auto-zoom to eliminate camera shake.
								</span>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
