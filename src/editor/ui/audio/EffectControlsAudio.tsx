import React, { useState } from 'react';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import type { AnimatedValue, AudioEffectInstance, Clip } from '../../core/types';
import { audioEffectRegistry, BUILTIN_AUDIO_EFFECTS } from '../../core/audio/effects';
import { PanControl } from './PanControl';
import { EqPopup } from './EqPopup';
import { CompressorPopup } from './CompressorPopup';
import { gainToDb } from '../../core/audioMath';

export const EffectControlsAudio: React.FC = () => {
	const store = useEditorStoreApi();
	const project = useEditorStore((s) => s.project);
	const selection = useEditorStore((s) => s.timeline.selection);
	const selectedClipId = selection.clipIds[0];

	const [expandedEffects, setExpandedEffects] = useState<Record<string, boolean>>({});
	const [activeEqFx, setActiveEqFx] = useState<AudioEffectInstance | null>(null);
	const [activeCompFx, setActiveCompFx] = useState<AudioEffectInstance | null>(null);
	const [showAddMenu, setShowAddMenu] = useState(false);

	let selectedClip: Clip | null = null;
	let trackName = '';

	if (project && selectedClipId) {
		for (const track of project.tracks) {
			const found = track.clips.find((c: Clip) => c.id === selectedClipId);
			if (found) {
				selectedClip = found;
				trackName = track.name;
				break;
			}
		}
	}

	if (!selectedClip) {
		return (
			<div
				className="flex h-full flex-col items-center justify-center p-6 text-center select-none"
				style={{
					backgroundColor: 'var(--color-surface)',
					color: 'var(--color-text-secondary)'
				}}
				data-testid="effect-controls-audio-empty"
			>
				<div className="mb-2 text-2xl opacity-40">🎚️</div>
				<p className="text-xs font-medium">No audio clip selected</p>
				<p className="mt-1 max-w-xs text-[11px] text-[var(--color-text-tertiary)]">
					Select an audio or video clip in the timeline to view and adjust its volume, pan, and
					audio effects stack.
				</p>
			</div>
		);
	}

	const clip = selectedClip;
	const clipName =
		(clip.assetId && project ? project.assets[clip.assetId]?.name : undefined) || 'Audio Clip';
	const audioEffects: AudioEffectInstance[] = clip.audioEffects ? [...clip.audioEffects] : [];

	// Volume dB (-96 to +12 dB)
	const volProp = clip.properties?.['audio.volume'];
	const volDb =
		volProp && 'value' in volProp
			? Number(volProp.value) || 0
			: typeof clip.volume === 'number'
				? gainToDb(clip.volume)
				: 0;

	// Pan (-1.0 to +1.0)
	const panProp = clip.properties?.['audio.pan'];
	const panVal = panProp && 'value' in panProp ? Number(panProp.value) || 0 : 0;

	const handleVolumeChange = (db: number) => {
		const clampedDb = Math.max(-96, Math.min(24, db));
		store.getState().setProperty(clip.id, 'audio.volume', clampedDb);
	};

	const handlePanChange = (pan: number) => {
		store.getState().setProperty(clip.id, 'audio.pan', pan);
	};

	const handleAddEffect = (typeId: string) => {
		const newFx = audioEffectRegistry.createDefaultInstance(typeId);
		newFx.managedBy = 'user';
		const next = [...audioEffects, newFx];
		store.getState().setClipAudioEffects(clip.id, next);
		setExpandedEffects((prev) => ({ ...prev, [newFx.id]: true }));
		setShowAddMenu(false);
	};

	const handleToggleBypass = (fxId: string) => {
		const next = audioEffects.map((fx) => (fx.id === fxId ? { ...fx, bypass: !fx.bypass } : fx));
		store.getState().setClipAudioEffects(clip.id, next);
	};

	const handleRemoveEffect = (fxId: string) => {
		const next = audioEffects.filter((fx) => fx.id !== fxId);
		store.getState().setClipAudioEffects(clip.id, next);
	};

	const handleMoveEffect = (index: number, direction: 'up' | 'down') => {
		const targetIndex = direction === 'up' ? index - 1 : index + 1;
		if (targetIndex < 0 || targetIndex >= audioEffects.length) return;
		const next = [...audioEffects];
		const temp = next[index]!;
		next[index] = next[targetIndex]!;
		next[targetIndex] = temp;
		store.getState().setClipAudioEffects(clip.id, next);
	};

	const handleResetEffectParams = (fx: AudioEffectInstance) => {
		const def = audioEffectRegistry.get(fx.type);
		if (!def) return;
		const defaultParams: AudioEffectInstance['params'] = {};
		for (const p of def.paramSchemas) {
			defaultParams[p.id] = p.default;
		}
		const next: AudioEffectInstance[] = audioEffects.map((item) =>
			item.id === fx.id ? { ...item, params: defaultParams } : item
		);
		store.getState().setClipAudioEffects(clip.id, next);
	};

	const handleParamChange = (
		fxId: string,
		paramId: string,
		val: number | string | boolean | AnimatedValue<unknown>
	) => {
		const next: AudioEffectInstance[] = audioEffects.map((fx) => {
			if (fx.id !== fxId) return fx;
			return {
				...fx,
				params: {
					...fx.params,
					[paramId]: val
				}
			};
		});
		store.getState().setClipAudioEffects(clip.id, next);
	};

	const toggleExpanded = (fxId: string) => {
		setExpandedEffects((prev) => ({
			...prev,
			[fxId]: prev[fxId] === false ? true : false
		}));
	};

	return (
		<div
			className="flex h-full flex-col overflow-y-auto p-3 text-xs select-none"
			style={{
				backgroundColor: 'var(--color-surface)',
				color: 'var(--color-text-primary)'
			}}
			data-testid="effect-controls-audio-panel"
		>
			{/* Clip Header */}
			<div className="mb-3 flex items-center justify-between border-b border-[var(--color-border)] pb-2">
				<div>
					<span className="block max-w-[200px] truncate font-semibold text-[var(--color-text-primary)]">
						{clipName}
					</span>
					<span className="text-[10px] text-[var(--color-text-tertiary)]">Track: {trackName}</span>
				</div>
				<div className="relative">
					<button
						type="button"
						onClick={() => setShowAddMenu(!showAddMenu)}
						className="flex cursor-pointer items-center gap-1 rounded bg-[#0284c7] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#0369a1]"
						title="Add an audio effect to this clip"
					>
						<span>+ Add Effect</span>
					</button>

					{showAddMenu && (
						<div
							className="absolute top-full right-0 z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded border border-[#334155] bg-[#0f172a] py-1 shadow-xl"
							onMouseLeave={() => setShowAddMenu(false)}
						>
							<div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-[#64748b] uppercase">
								Audio DSP Catalog
							</div>
							{BUILTIN_AUDIO_EFFECTS.map((def) => (
								<button
									key={def.id}
									type="button"
									onClick={() => handleAddEffect(def.id)}
									className="flex w-full cursor-pointer items-center justify-between px-3 py-1.5 text-left text-[11px] text-[#e2e8f0] hover:bg-[#1e293b]"
								>
									<span>{def.name}</span>
									<span className="text-[9px] text-[#64748b] uppercase">{def.category}</span>
								</button>
							))}
						</div>
					)}
				</div>
			</div>

			{/* FIXED CONTROLS (Premiere Model): Volume, Channel Volume, Panner */}
			<div className="mb-4 space-y-3">
				{/* Volume (dB) */}
				<div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2.5">
					<div className="mb-1.5 flex items-center justify-between">
						<span className="text-[11px] font-semibold tracking-wider text-[#38bdf8] uppercase">
							Volume
						</span>
						<button
							type="button"
							onClick={() => handleVolumeChange(0)}
							className="cursor-pointer text-[10px] text-[#64748b] hover:text-[#94a3b8]"
							title="Reset volume to 0.0 dB"
						>
							Reset 0 dB
						</button>
					</div>
					<div className="flex items-center gap-2">
						<input
							type="range"
							min="-96"
							max="12"
							step="0.5"
							value={volDb}
							onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
							className="w-full cursor-pointer accent-[#38bdf8]"
						/>
						<span className="w-14 text-right font-mono text-[11px]">
							{volDb <= -96 ? '-inf' : `${volDb > 0 ? '+' : ''}${volDb.toFixed(1)} dB`}
						</span>
					</div>
				</div>

				{/* Panner */}
				<div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2.5">
					<div className="mb-1 flex items-center justify-between">
						<span className="text-[11px] font-semibold tracking-wider text-[#38bdf8] uppercase">
							Panner
						</span>
					</div>
					<PanControl value={panVal} onChange={handlePanChange} label="Clip Pan" />
				</div>
			</div>

			{/* APPLIED AUDIO EFFECTS STACK */}
			<div className="mt-2">
				<div className="mb-2 flex items-center justify-between">
					<span className="text-[11px] font-semibold tracking-wider text-[var(--color-text-secondary)] uppercase">
						Applied Audio Effects ({audioEffects.length})
					</span>
				</div>

				{audioEffects.length === 0 ? (
					<div className="rounded border border-dashed border-[var(--color-border)] py-4 text-center text-[11px] text-[var(--color-text-tertiary)] italic">
						No audio effects applied yet. Click &quot;+ Add Effect&quot; to insert DSP filters.
					</div>
				) : (
					<div className="space-y-2">
						{audioEffects.map((fx, idx) => {
							const def = audioEffectRegistry.get(fx.type);
							const isExpanded = expandedEffects[fx.id] !== false;
							const hasCustomEditor = fx.type === 'parametric-eq' || fx.type === 'compressor';

							return (
								<div
									key={fx.id}
									className={`rounded border transition-colors ${
										fx.bypass
											? 'border-[#334155] bg-[#0f172a]/40 opacity-75'
											: 'border-[#38bdf8]/40 bg-[var(--color-surface-elevated)]'
									}`}
								>
									{/* Effect Header */}
									<div className="flex items-center justify-between border-b border-[var(--color-border)] px-2.5 py-1.5">
										<div className="flex items-center gap-1.5">
											{/* Bypass toggle */}
											<button
												type="button"
												onClick={() => handleToggleBypass(fx.id)}
												className={`h-5 w-5 cursor-pointer rounded text-[10px] font-bold transition-colors ${
													fx.bypass
														? 'bg-[#334155] text-[#94a3b8]'
														: 'bg-[#0284c7] text-white shadow-sm'
												}`}
												title={
													fx.bypass ? 'Bypassed (Click to enable)' : 'Active (Click to bypass)'
												}
											>
												fx
											</button>

											<span
												className="cursor-pointer text-[11px] font-semibold hover:underline"
												onClick={() => toggleExpanded(fx.id)}
											>
												{def?.name ?? fx.type}
											</span>
											<span className="font-mono text-[9px] text-[var(--color-text-tertiary)] uppercase">
												[{def?.category ?? 'audio'}]
											</span>
										</div>

										<div className="flex items-center gap-1">
											{/* Reorder up/down */}
											<button
												type="button"
												onClick={() => handleMoveEffect(idx, 'up')}
												disabled={idx === 0}
												className="cursor-pointer px-1 py-0.5 text-[10px] text-[#64748b] hover:text-[#e2e8f0] disabled:opacity-30"
												title="Move up"
											>
												▲
											</button>
											<button
												type="button"
												onClick={() => handleMoveEffect(idx, 'down')}
												disabled={idx === audioEffects.length - 1}
												className="cursor-pointer px-1 py-0.5 text-[10px] text-[#64748b] hover:text-[#e2e8f0] disabled:opacity-30"
												title="Move down"
											>
												▼
											</button>

											{/* Reset params */}
											<button
												type="button"
												onClick={() => handleResetEffectParams(fx)}
												className="cursor-pointer px-1 py-0.5 text-[10px] text-[#64748b] hover:text-[#38bdf8]"
												title="Reset parameters to defaults"
											>
												↺
											</button>

											{/* Remove */}
											<button
												type="button"
												onClick={() => handleRemoveEffect(fx.id)}
												className="cursor-pointer px-1 py-0.5 text-[11px] text-[#ef4444] hover:text-[#dc2626]"
												title="Delete effect"
											>
												✕
											</button>
										</div>
									</div>

									{/* Custom Setup Button (for visual curve editors) */}
									{hasCustomEditor && (
										<div className="border-b border-[var(--color-border)]/50 px-2.5 pt-2 pb-1">
											<button
												type="button"
												onClick={() => {
													if (fx.type === 'parametric-eq') setActiveEqFx(fx);
													if (fx.type === 'compressor') setActiveCompFx(fx);
												}}
												className="w-full cursor-pointer rounded border border-[#38bdf8]/30 bg-[#1e293b] py-1 text-[11px] font-medium text-[#38bdf8] transition-colors hover:bg-[#334155]"
											>
												Custom Setup → Edit Visual Curve...
											</button>
										</div>
									)}

									{/* Individual Parameters Disclosure */}
									{isExpanded && def?.paramSchemas && def.paramSchemas.length > 0 && (
										<div className="space-y-2 p-2.5">
											{def.paramSchemas.map((schema) => {
												const curVal = fx.params[schema.id] ?? schema.default;

												if (schema.type === 'boolean') {
													return (
														<label
															key={schema.id}
															className="flex cursor-pointer items-center justify-between text-[11px]"
														>
															<span className="text-[#94a3b8]">{schema.name}</span>
															<input
																type="checkbox"
																checked={Boolean(curVal)}
																onChange={(e) =>
																	handleParamChange(fx.id, schema.id, e.target.checked)
																}
																className="cursor-pointer accent-[#38bdf8]"
															/>
														</label>
													);
												}

												if (schema.type === 'enum' && schema.options) {
													return (
														<div
															key={schema.id}
															className="flex items-center justify-between text-[11px]"
														>
															<span className="text-[#94a3b8]">{schema.name}</span>
															<select
																value={String(curVal)}
																onChange={(e) =>
																	handleParamChange(fx.id, schema.id, e.target.value)
																}
																className="rounded border border-[#334155] bg-[#0f172a] px-1 py-0.5 text-[10px] text-[#e2e8f0]"
															>
																{schema.options.map((opt) => (
																	<option key={opt.value} value={opt.value}>
																		{opt.label}
																	</option>
																))}
															</select>
														</div>
													);
												}

												// Number parameter with slider
												const min = schema.min ?? 0;
												const max = schema.max ?? 100;
												const step = schema.step ?? 1;
												const numVal = typeof curVal === 'number' ? curVal : Number(curVal) || 0;

												return (
													<div key={schema.id} className="space-y-0.5">
														<div className="flex items-center justify-between text-[10px]">
															<span className="text-[#94a3b8]">{schema.name}</span>
															<span className="font-mono text-[#38bdf8]">
																{numVal} {schema.unit ?? ''}
															</span>
														</div>
														<div className="flex items-center gap-2">
															<input
																type="range"
																min={min}
																max={max}
																step={step}
																value={numVal}
																onChange={(e) =>
																	handleParamChange(fx.id, schema.id, parseFloat(e.target.value))
																}
																className="w-full cursor-pointer accent-[#38bdf8]"
															/>
														</div>
													</div>
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

			{/* Custom Visual Editor Popups */}
			{activeEqFx && (
				<EqPopup
					trackName={`${clipName} (Parametric EQ)`}
					onClose={() => setActiveEqFx(null)}
					onChange={(nextEq) => {
						const nextParams = { ...activeEqFx.params };
						nextEq.bands.forEach((b, idx) => {
							const bandNum = idx + 1;
							nextParams[`band${bandNum}_type`] = b.type;
							nextParams[`band${bandNum}_freq`] = b.frequencyHz;
							nextParams[`band${bandNum}_gain`] = b.gainDb;
							nextParams[`band${bandNum}_q`] = b.q;
						});
						const next = audioEffects.map((fx) =>
							fx.id === activeEqFx.id ? { ...fx, params: nextParams } : fx
						);
						store.getState().setClipAudioEffects(clip.id, next);
					}}
				/>
			)}

			{activeCompFx && (
				<CompressorPopup
					trackName={`${clipName} (Dynamics)`}
					onClose={() => setActiveCompFx(null)}
					onChange={(nextComp) => {
						handleParamChange(activeCompFx.id, 'thresholdDb', nextComp.thresholdDb);
						handleParamChange(activeCompFx.id, 'ratio', nextComp.ratio);
						handleParamChange(activeCompFx.id, 'attackMs', nextComp.attackMs);
						handleParamChange(activeCompFx.id, 'releaseMs', nextComp.releaseMs);
						handleParamChange(activeCompFx.id, 'kneeDb', nextComp.kneeDb);
					}}
				/>
			)}
		</div>
	);
};
