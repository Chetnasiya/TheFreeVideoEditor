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
		<div className="flex flex-col gap-3 p-2 text-xs">
			<div className="flex items-center justify-between">
				<span className="font-medium text-[var(--color-text-secondary)]">
					Trackers ({trackers.length})
				</span>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => handleAddTracker('point')}
						className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
					>
						+ Add Point Tracker
					</button>
				</div>
			</div>

			{trackers.length > 0 && (
				<div className="flex flex-col gap-2 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-2">
					<div className="flex items-center justify-between">
						<select
							value={selectedTracker?.id ?? ''}
							onChange={(e) => store.getState().selectTracker(e.target.value as TrackerId)}
							className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-2 py-1 text-xs"
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
								className="text-[11px] text-[var(--color-text-muted)] hover:text-red-400"
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
									className="flex-1 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] py-1 font-medium hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
								>
									⯇ Track Backward
								</button>
								<button
									type="button"
									disabled={isTrackingActive}
									onClick={handleTrackForward}
									className="flex-1 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] py-1 font-medium hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
								>
									Track Forward ⯈
								</button>
							</div>

							{/* Progress Bar & Cancel */}
							{isTrackingActive && trackingProgress && (
								<div className="flex flex-col gap-1 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] p-2">
									<div className="flex items-center justify-between text-[11px]">
										<span>
											Tracking frame {trackingProgress.processedFrames} /{' '}
											{trackingProgress.totalFrames}
										</span>
										<button
											type="button"
											onClick={handleCancel}
											className="font-medium text-red-400 hover:underline"
										>
											Cancel
										</button>
									</div>
									<div className="h-1.5 w-full overflow-hidden rounded bg-[var(--color-surface-sunken)]">
										<div
											className="h-full bg-blue-500 transition-all duration-75"
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
									<span className="text-[10px] text-[var(--color-text-muted)]">
										Confidence History
									</span>
									<div className="h-8 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] p-0.5">
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
												stroke="var(--color-accent, #3b82f6)"
												strokeWidth="1.5"
											/>
										</svg>
									</div>
								</div>
							)}

							{/* Apply / Follow / Bake Section (Slice 2) */}
							<div className="flex flex-col gap-1.5 border-t border-[var(--color-border-subtle)] pt-2">
								<span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
									Apply / Follow
								</span>
								{selectedTracker.binding ? (
									<div className="flex flex-col gap-2 rounded bg-[var(--color-surface-base)] p-2">
										<div className="flex items-center justify-between text-[11px]">
											<span className="text-[var(--color-text-secondary)]">
												Bound to:{' '}
												<span className="font-medium text-[var(--color-text-primary)]">
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
											<span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
												Live Follow
											</span>
										</div>
										<div className="flex items-center gap-1.5">
											<button
												type="button"
												onClick={() =>
													store.getState().bakeTracker(clip.id, selectedTracker.id, 0.5)
												}
												className="flex-1 rounded border border-blue-500/50 bg-blue-600/20 py-1 text-[11px] font-medium text-blue-300 hover:bg-blue-600/30"
											>
												Bake to Keyframes
											</button>
											<button
												type="button"
												onClick={() => store.getState().unbindTracker(clip.id, selectedTracker.id)}
												className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-2 py-1 text-[11px] hover:bg-[var(--color-surface-hover)]"
											>
												Unbind
											</button>
										</div>
									</div>
								) : (
									<div className="flex flex-col gap-2 rounded bg-[var(--color-surface-base)] p-2">
										<div className="flex items-center gap-2">
											<label
												htmlFor="target-clip-select"
												className="text-[11px] text-[var(--color-text-muted)]"
											>
												Target:
											</label>
											<select
												id="target-clip-select"
												className="flex-1 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-2 py-1 text-[11px]"
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
													.flatMap((t) => t.clips)
													.filter((c) => c.id !== clip.id)
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
							<div className="mt-2 flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-2">
								<div className="flex items-center justify-between">
									<span className="font-medium text-[var(--color-text-secondary)]">
										Stabilization
									</span>
									<button
										type="button"
										disabled={isTrackingActive || selectedTracker.samples.length < 2}
										onClick={() => store.getState().stabilizeClip(clip.id, selectedTracker.id)}
										className="rounded bg-[var(--color-accent)] px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
									>
										Stabilize Clip
									</button>
								</div>
								<span className="text-[10px] text-[var(--color-text-muted)]">
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
