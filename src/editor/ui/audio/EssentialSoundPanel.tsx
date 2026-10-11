import React from 'react';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import type { Clip, AudioEffectInstance } from '../../core/types';
import { audioEffectRegistry } from '../../core/audio/effects';

export const EssentialSoundPanel: React.FC = () => {
	const store = useEditorStoreApi();
	const project = useEditorStore((s) => s.project);
	const selection = useEditorStore((s) => s.timeline.selection);
	const selectedClipId = selection.clipIds[0];

	// Find the selected clip
	let targetClip: Clip | null = null;

	if (project && selectedClipId) {
		for (const track of project.tracks) {
			const found = track.clips.find((c: Clip) => c.id === selectedClipId);
			if (found) {
				targetClip = found;
				break;
			}
		}
	}

	const handleSetTag = (tag: 'dialogue' | 'music' | 'sfx' | 'ambience' | undefined) => {
		if (!targetClip) return;
		store.getState().setClipAudioTag(targetClip.id, tag);
	};

	const handleAutoMatchLoudness = (targetLufs: number) => {
		if (!targetClip) return;
		const effects: AudioEffectInstance[] = targetClip.audioEffects
			? [...targetClip.audioEffects]
			: [];
		let gainTrim = effects.find(
			(fx: AudioEffectInstance) => fx.type === 'gain-trim' && fx.managedBy === 'essential'
		);
		if (!gainTrim) {
			gainTrim = audioEffectRegistry.createDefaultInstance('gain-trim');
			gainTrim.managedBy = 'essential';
			effects.push(gainTrim);
		}
		gainTrim.params.gainDb = targetLufs === -23 ? -2 : 0;
		store.getState().setClipAudioEffects(targetClip.id, effects);
	};

	const handleApplyAutoDucking = () => {
		if (!targetClip) return;
		store.getState().applyAutoDucking(targetClip.id);
	};

	const handleAddRepairEffect = (type: 'de-hummer' | 'de-esser' | 'noise-reduction') => {
		if (!targetClip) return;
		const effects: AudioEffectInstance[] = targetClip.audioEffects
			? [...targetClip.audioEffects]
			: [];
		const existing = effects.find(
			(fx: AudioEffectInstance) => fx.type === type && fx.managedBy === 'essential'
		);
		if (!existing) {
			const newFx = audioEffectRegistry.createDefaultInstance(type);
			newFx.managedBy = 'essential';
			effects.push(newFx);
			store.getState().setClipAudioEffects(targetClip.id, effects);
		}
	};

	return (
		<div
			className="flex h-full flex-col overflow-y-auto p-4 select-none"
			style={{
				backgroundColor: 'var(--color-surface)',
				color: 'var(--color-text-primary)'
			}}
			data-testid="essential-sound-panel"
		>
			<div className="mb-4 flex items-center justify-between border-b border-[var(--color-border)] pb-2">
				<span className="text-xs font-semibold tracking-wider text-[var(--color-text-secondary)] uppercase">
					Essential Sound
				</span>
			</div>

			{!targetClip ? (
				<div className="py-8 text-center text-xs text-[var(--color-text-tertiary)] italic">
					Select an audio or video clip in the timeline to configure audio tagging and parameters.
				</div>
			) : (
				<div className="space-y-6">
					{/* Role Tagging */}
					<section>
						<label className="mb-2 block text-xs font-medium text-[var(--color-text-secondary)]">
							Assign Audio Tag
						</label>
						<div className="grid grid-cols-2 gap-2">
							{(['dialogue', 'music', 'sfx', 'ambience'] as const).map((tag) => (
								<button
									key={tag}
									type="button"
									onClick={() => handleSetTag(targetClip!.audioTag === tag ? undefined : tag)}
									className={`rounded border px-3 py-2 text-xs font-medium capitalize transition-colors ${
										targetClip!.audioTag === tag
											? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
											: 'border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]'
									}`}
								>
									{tag}
								</button>
							))}
						</div>
					</section>

					{/* Loudness Auto-Match */}
					<section className="border-t border-[var(--color-border)] pt-3">
						<span className="mb-2 block text-xs font-semibold tracking-wider text-[var(--color-text-secondary)] uppercase">
							Loudness
						</span>
						<p className="mb-3 text-xs text-[var(--color-text-tertiary)]">
							Auto-match integrated loudness to broadcast or streaming standards.
						</p>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => handleAutoMatchLoudness(-23)}
								className="flex-1 rounded border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-hover)]"
							>
								Broadcast (-23 LUFS)
							</button>
							<button
								type="button"
								onClick={() => handleAutoMatchLoudness(-14)}
								className="flex-1 rounded border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-hover)]"
							>
								Streaming (-14 LUFS)
							</button>
						</div>
					</section>

					{/* Repair (Dialogue / Vocal) */}
					{targetClip.audioTag === 'dialogue' && (
						<section className="border-t border-[var(--color-border)] pt-3">
							<span className="mb-2 block text-xs font-semibold tracking-wider text-[var(--color-text-secondary)] uppercase">
								Repair & Clarity
							</span>
							<div className="space-y-2">
								<button
									type="button"
									onClick={() => handleAddRepairEffect('noise-reduction')}
									className="flex w-full items-center justify-between rounded border border-[var(--color-border)] px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-hover)]"
								>
									<span>Reduce Noise (Spectral Gate)</span>
									<span className="text-[10px] text-[var(--color-accent)]">+ Add</span>
								</button>
								<button
									type="button"
									onClick={() => handleAddRepairEffect('de-hummer')}
									className="flex w-full items-center justify-between rounded border border-[var(--color-border)] px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-hover)]"
								>
									<span>Remove Hum (50/60 Hz)</span>
									<span className="text-[10px] text-[var(--color-accent)]">+ Add</span>
								</button>
								<button
									type="button"
									onClick={() => handleAddRepairEffect('de-esser')}
									className="flex w-full items-center justify-between rounded border border-[var(--color-border)] px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-hover)]"
								>
									<span>De-Ess (Sibilance Control)</span>
									<span className="text-[10px] text-[var(--color-accent)]">+ Add</span>
								</button>
							</div>
						</section>
					)}

					{/* Auto-Ducking (Music / Ambience) */}
					{(targetClip.audioTag === 'music' || targetClip.audioTag === 'ambience') && (
						<section className="border-t border-[var(--color-border)] pt-3">
							<span className="mb-2 block text-xs font-semibold tracking-wider text-[var(--color-text-secondary)] uppercase">
								Ducking
							</span>
							<p className="mb-3 text-xs text-[var(--color-text-tertiary)]">
								Duck this {targetClip.audioTag} against dialogue clips automatically.
							</p>
							<button
								type="button"
								onClick={handleApplyAutoDucking}
								className="w-full rounded border border-[var(--color-accent)] px-3 py-2 text-xs font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-subtle)]"
							>
								Generate Ducking Keyframes
							</button>
						</section>
					)}

					{/* Active Clip Audio Effects */}
					<section className="border-t border-[var(--color-border)] pt-3">
						<span className="mb-2 block text-xs font-semibold tracking-wider text-[var(--color-text-secondary)] uppercase">
							Clip Effects Rack
						</span>
						{!targetClip.audioEffects || targetClip.audioEffects.length === 0 ? (
							<div className="text-xs text-[var(--color-text-tertiary)] italic">
								No effects applied to this clip.
							</div>
						) : (
							<div className="space-y-1">
								{targetClip.audioEffects.map((fx: AudioEffectInstance, idx: number) => (
									<div
										key={fx.id || idx}
										className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2.5 py-1.5 text-xs"
									>
										<span className="font-mono">{fx.name || fx.type}</span>
										{fx.managedBy && (
											<span className="text-[10px] text-[var(--color-text-tertiary)] uppercase">
												{fx.managedBy}
											</span>
										)}
									</div>
								))}
							</div>
						)}
					</section>
				</div>
			)}
		</div>
	);
};
