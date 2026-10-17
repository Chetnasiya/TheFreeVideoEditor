import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import { EqPopup } from './EqPopup';
import { CompressorPopup } from './CompressorPopup';
import { PanControl } from './PanControl';
import { audioEffectRegistry, BUILTIN_AUDIO_EFFECTS } from '../../core/audio/effects';
import type { AudioBus, AutomationMode } from '../../core/types';
import type { PlaybackEngine } from '../../services/playback/engine';
import { trackFeatureUsed } from '../../../services/activityTracking';
import './mixer.css';

/**
 * Maps gain in dB (-96 to +12) to a 0-100 percentage for fader travel.
 * Unity gain (0 dB) lands comfortably at 75% height.
 */
function dbToPercent(db: number): number {
	if (db <= -96) return 0;
	if (db <= -30) return ((db - -96) / 66) * 25; // 0% to 25%
	if (db <= -12) return 25 + ((db - -30) / 18) * 25; // 25% to 50%
	if (db <= 0) return 50 + ((db - -12) / 12) * 25; // 50% to 75%
	return 75 + ((Math.min(12, db) - 0) / 12) * 25; // 75% to 100%
}

function percentToDb(pct: number): number {
	const clamped = Math.max(0, Math.min(100, pct));
	if (clamped <= 0) return -96;
	if (clamped <= 25) return -96 + (clamped / 25) * 66;
	if (clamped <= 50) return -30 + ((clamped - 25) / 25) * 18;
	if (clamped <= 75) return -12 + ((clamped - 50) / 25) * 12;
	return 0 + ((clamped - 75) / 25) * 12;
}

function formatDb(db: number): string {
	if (db <= -96) return '-inf';
	if (Math.abs(db) < 0.05) return '0.0 dB';
	return (db > 0 ? `+${db.toFixed(1)}` : db.toFixed(1)) + ' dB';
}

function linearToDb(linear: number): number {
	if (!Number.isFinite(linear) || linear <= 0.00001585) return -96;
	return Math.max(-96, Math.min(24, 20 * Math.log10(linear)));
}

function linearToPercent(linear: number): number {
	if (linear <= 0.00001585) return 0;
	const db = Math.max(-96, Math.min(12, 20 * Math.log10(linear)));
	return dbToPercent(db);
}

interface FaderProps {
	gainDb: number;
	onChange: (gainDb: number) => void;
	isMuted?: boolean;
	meterPeakL?: number;
	meterPeakR?: number;
}

const MixerFader: React.FC<FaderProps> = ({
	gainDb,
	onChange,
	isMuted = false,
	meterPeakL,
	meterPeakR
}) => {
	const trackRef = useRef<HTMLDivElement>(null);
	const isDragging = useRef(false);

	const pct = dbToPercent(gainDb);
	const topPct = 100 - pct;

	// Use real audio meter levels if available, or 0 if muted/silent
	const hasRealMeters = meterPeakL !== undefined && meterPeakR !== undefined;
	const isClipped =
		!isMuted && hasRealMeters && ((meterPeakL ?? 0) >= 0.999 || (meterPeakR ?? 0) >= 0.999);
	const meterLevelPct = isMuted
		? 0
		: hasRealMeters
			? Math.min(100, Math.max(0, linearToPercent(meterPeakL ?? 0)))
			: gainDb <= -96
				? 0
				: Math.min(100, Math.max(pct > 0 ? 3 : 0, pct >= 98 ? 100 : pct));
	const meterLevelRightPct = isMuted
		? 0
		: hasRealMeters
			? Math.min(100, Math.max(0, linearToPercent(meterPeakR ?? 0)))
			: gainDb <= -96
				? 0
				: Math.min(100, Math.max(pct > 0 ? 3 : 0, pct >= 98 ? 100 : Math.round(pct * 0.96)));

	const updateFromPointer = useCallback(
		(clientY: number, shiftKey = false) => {
			const rect = trackRef.current?.getBoundingClientRect();
			if (!rect) return;
			const height = rect.height;
			const offsetY = Math.max(0, Math.min(height, clientY - rect.top));
			const currentPct = 100 - (offsetY / height) * 100;
			let targetDb = percentToDb(currentPct);

			// Snap to unity (0 dB) near 75%
			if (Math.abs(targetDb) < 0.35 && !shiftKey) {
				targetDb = 0;
			} else {
				targetDb = Math.round(targetDb * 10) / 10;
			}
			onChange(targetDb);
		},
		[onChange]
	);

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		isDragging.current = true;
		e.currentTarget.setPointerCapture(e.pointerId);
		updateFromPointer(e.clientY, e.shiftKey);
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!isDragging.current) return;
		updateFromPointer(e.clientY, e.shiftKey);
	};

	const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (isDragging.current) {
			isDragging.current = false;
			try {
				e.currentTarget.releasePointerCapture(e.pointerId);
			} catch {}
		}
	};

	const handleDoubleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onChange(0); // Reset to unity gain (0 dB)
	};

	const handleWheel = (e: React.WheelEvent) => {
		e.preventDefault();
		const step = e.shiftKey ? 0.1 : 0.5;
		const delta = e.deltaY < 0 ? step : -step;
		const next = Math.max(-96, Math.min(12, Math.round((gainDb + delta) * 10) / 10));
		onChange(next);
	};

	return (
		<div className="flex w-full flex-col items-center">
			<div className="strip-fader-meter-area" onWheel={handleWheel}>
				{/* dB Scale Labels */}
				<div className="strip-db-scale" aria-hidden="true">
					<span>+12</span>
					<span>+6</span>
					<span className="strip-db-tick is-zero">0</span>
					<span>-6</span>
					<span>-12</span>
					<span>-24</span>
					<span>-36</span>
					<span>-∞</span>
				</div>

				{/* Fader Track and Cap */}
				<div
					ref={trackRef}
					className="strip-fader-column"
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerUp}
					onDoubleClick={handleDoubleClick}
					role="slider"
					aria-label="Fader level"
					aria-valuemin={-96}
					aria-valuemax={12}
					aria-valuenow={gainDb}
					aria-valuetext={formatDb(gainDb)}
					tabIndex={0}
				>
					<div className="strip-fader-slot" />
					<div className="strip-fader-zero-mark" />
					<div
						className="strip-fader-cap"
						style={{ top: `${topPct}%` }}
						title={`Gain: ${formatDb(gainDb)} (Double-click to reset)`}
					>
						<div className="strip-fader-cap-indicator" />
					</div>
				</div>

				{/* Stereo Peak Level Meter */}
				<div className="strip-meter-column" aria-hidden="true">
					<div className="strip-meter-bar">
						<div className="strip-meter-fill" style={{ height: `${meterLevelPct}%` }} />
						<div className={`strip-meter-clip-led ${isClipped ? 'is-clipped' : ''}`} />
					</div>
					<div className="strip-meter-bar">
						<div className="strip-meter-fill" style={{ height: `${meterLevelRightPct}%` }} />
						<div className={`strip-meter-clip-led ${isClipped ? 'is-clipped' : ''}`} />
					</div>
				</div>
			</div>

			{/* Numeric Gain Pill */}
			<button
				type="button"
				className={`strip-gain-pill ${gainDb > 0 ? 'is-boosted' : ''} ${gainDb <= -96 ? 'is-inf' : ''}`}
				onClick={handleDoubleClick}
				title="Click to reset to 0.0 dB"
			>
				{formatDb(gainDb)}
			</button>
		</div>
	);
};

export interface MixerPanelProps {
	engine?: PlaybackEngine | null;
}

export const MixerPanel: React.FC<MixerPanelProps> = ({ engine: propEngine }) => {
	const store = useEditorStoreApi();
	const project = useEditorStore((state) => state.project);
	const [activeEqTrackId, setActiveEqTrackId] = useState<string | null>(null);
	const [activeCompTrackId, setActiveCompTrackId] = useState<string | null>(null);
	const [meterLevels, setMeterLevels] = useState<{
		tracks: Record<string, { peakL: number; peakR: number; rmsL: number; rmsR: number }>;
		buses: Record<string, { peakL: number; peakR: number; rmsL: number; rmsR: number }>;
		master: { peakL: number; peakR: number; rmsL: number; rmsR: number };
	}>({ tracks: {}, buses: {}, master: { peakL: 0, peakR: 0, rmsL: 0, rmsR: 0 } });
	const [isAudioSuspended, setIsAudioSuspended] = useState(false);

	useEffect(() => {
		trackFeatureUsed('audio_mixer');
	}, []);

	useEffect(() => {
		let rafId: number;
		let lastUpdate = 0;
		const tick = (now: number) => {
			if (now - lastUpdate >= 33) {
				lastUpdate = now;
				const engine =
					propEngine ??
					(typeof window !== 'undefined'
						? (window as unknown as { __tfvePlaybackTest?: { engine: PlaybackEngine } })
								.__tfvePlaybackTest?.engine
						: null);
				if (engine && project) {
					const tracks: Record<
						string,
						{ peakL: number; peakR: number; rmsL: number; rmsR: number }
					> = {};
					for (const t of project.tracks) {
						if (t.kind === 'audio') {
							tracks[t.id] = engine.getTrackMeterLevels?.(t.id) ?? {
								peakL: 0,
								peakR: 0,
								rmsL: 0,
								rmsR: 0
							};
						}
					}
					const buses: Record<
						string,
						{ peakL: number; peakR: number; rmsL: number; rmsR: number }
					> = {};
					for (const b of project.audioBuses ?? []) {
						buses[b.id] = engine.getBusMeterLevels?.(b.id) ?? {
							peakL: 0,
							peakR: 0,
							rmsL: 0,
							rmsR: 0
						};
					}
					const master = engine.getMasterMeterLevels?.() ?? {
						peakL: 0,
						peakR: 0,
						rmsL: 0,
						rmsR: 0
					};
					setMeterLevels({ tracks, buses, master });

					const analyser = engine.getDebugMasterAnalyser?.();
					setIsAudioSuspended(analyser?.context?.state === 'suspended');
				}
			}
			rafId = requestAnimationFrame(tick);
		};
		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	}, [propEngine, project]);

	if (!project) return null;

	const audioTracks = project.tracks.filter((t) => t.kind === 'audio');
	const activeEqTrack = audioTracks.find((t) => t.id === activeEqTrackId) ?? null;
	const activeCompTrack = audioTracks.find((t) => t.id === activeCompTrackId) ?? null;
	const audioBuses: AudioBus[] = project.audioBuses ?? [];
	const masterAudio = project.masterAudio ?? { gainDb: 0, limiter: false };

	const automationModes: AutomationMode[] = ['off', 'read', 'write', 'touch', 'latch'];

	const handleAddBus = () => {
		store.getState().addAudioBus(`Submix ${audioBuses.length + 1}`);
	};

	return (
		<aside className="mixer-panel" aria-label="Audio Mixer">
			{/* Mixer Action Sub-header */}
			<div className="mixer-header">
				<div className="mixer-header-left">
					<span className="mixer-header-title">Mixer</span>
					<div className="mixer-badge">
						<span className="mixer-badge-dot" aria-hidden="true" />
						{audioTracks.length} tracks
					</div>
					{audioBuses.length > 0 && (
						<div
							className="mixer-badge"
							style={{ borderColor: 'rgba(168, 85, 247, 0.3)', color: '#c084fc' }}
						>
							{audioBuses.length} submix{audioBuses.length > 1 ? 'es' : ''}
						</div>
					)}
					{isAudioSuspended && (
						<button
							type="button"
							onClick={() => {
								const engine =
									propEngine ??
									(typeof window !== 'undefined'
										? (window as unknown as { __tfvePlaybackTest?: { engine: PlaybackEngine } })
												.__tfvePlaybackTest?.engine
										: null);
								void (engine?.unlock?.() ?? engine?.play?.());
							}}
							className="mixer-badge cursor-pointer"
							style={{ borderColor: 'rgba(239, 68, 68, 0.5)', color: '#f87171' }}
							title="Audio is suspended. Click to resume."
						>
							🔇 Suspended (Click to Unmute)
						</button>
					)}
				</div>
				<button
					type="button"
					onClick={handleAddBus}
					className="mixer-btn"
					title="Add a submix audio bus"
				>
					<span className="font-bold text-[#38bdf8]">+</span>
					<span>Add Submix</span>
				</button>
			</div>

			{/* Channel Strips Viewport */}
			<div className="mixer-viewport">
				{/* Audio Tracks */}
				{audioTracks.map((track) => {
					const tAudio = track.audio ?? { gainDb: 0, pan: 0, solo: false };
					const isMuted = track.muted;
					const isSolo = tAudio.solo;
					const autoMode = tAudio.automationMode ?? 'read';

					return (
						<div key={track.id} className="mixer-strip channel-strip" data-track-id={track.id}>
							{/* Track Header & Automation */}
							<div className="strip-header">
								<div className="strip-title-row">
									<span className="strip-kind-tag">A</span>
									<span className="strip-name" title={track.name}>
										{track.name}
									</span>
								</div>
								<div className="strip-auto-row">
									<span>AUTO</span>
									<select
										value={autoMode}
										onChange={(e) =>
											store
												.getState()
												.setAutomationMode('track', track.id, e.target.value as AutomationMode)
										}
										className="strip-auto-select"
									>
										{automationModes.map((m) => (
											<option key={m} value={m}>
												{m}
											</option>
										))}
									</select>
								</div>
							</div>

							{/* Channel Controls: Phase Invert, Solo Safe, Channel Mode */}
							<div className="mb-1 flex items-center justify-between gap-1">
								<button
									type="button"
									onClick={() =>
										store.getState().setTrackAudioPhaseInvert(track.id, !tAudio.phaseInvert)
									}
									className={`strip-fx-btn px-1 text-[9px] font-bold ${
										tAudio.phaseInvert ? 'is-active text-[#ef4444]' : 'text-[#64748b]'
									}`}
									title={tAudio.phaseInvert ? 'Phase Inverted (180°)' : 'Phase Normal (0°)'}
								>
									Ø
								</button>
								<button
									type="button"
									onClick={() => store.getState().setTrackAudioSoloSafe(track.id, !tAudio.soloSafe)}
									className={`strip-fx-btn px-1 text-[9px] font-bold ${
										tAudio.soloSafe ? 'is-active text-[#10b981]' : 'text-[#64748b]'
									}`}
									title={
										tAudio.soloSafe
											? 'Solo Safe Enabled (audible when others solo)'
											: 'Solo Safe Disabled'
									}
								>
									SS
								</button>
								<button
									type="button"
									onClick={() =>
										store
											.getState()
											.setTrackAudioChannelMode(
												track.id,
												tAudio.channelMode === 'mono' ? 'stereo' : 'mono'
											)
									}
									className="strip-fx-btn flex-1 px-1 text-center font-mono text-[8px]"
									title="Toggle Stereo / Mono mode"
								>
									{tAudio.channelMode === 'mono' ? 'MONO' : 'STEREO'}
								</button>
							</div>

							{/* EQ / Comp Buttons */}
							<div className="strip-fx-row">
								<button
									type="button"
									onClick={() => setActiveEqTrackId(track.id)}
									className={`strip-fx-btn ${tAudio.eq?.enabled ? 'is-active' : ''}`}
									title={tAudio.eq?.enabled ? 'Equalizer (Enabled)' : 'Equalizer'}
								>
									EQ
								</button>
								<button
									type="button"
									onClick={() => setActiveCompTrackId(track.id)}
									className={`strip-fx-btn ${tAudio.compressor?.enabled ? 'is-active' : ''}`}
									title={
										tAudio.compressor?.enabled
											? 'Compressor / Dynamics (Enabled)'
											: 'Compressor / Dynamics'
									}
								>
									DYN
								</button>
							</div>

							{/* FX Slots (8 slots) */}
							<div className="my-1 border-y border-[var(--color-border)] py-1">
								<div className="mb-0.5 flex justify-between px-0.5 font-mono text-[8px] tracking-wider text-[#64748b] uppercase">
									<span>INSERTS</span>
									<span>1-8</span>
								</div>
								<div className="space-y-0.5">
									{Array.from({ length: 8 }).map((_, slotIdx) => {
										const fx = tAudio.effects?.[slotIdx];
										return (
											<div
												key={slotIdx}
												className="flex items-center justify-between rounded border border-[#1e293b] bg-[#0f172a]/80 px-1 py-0.5 text-[9px]"
											>
												<span className="font-mono text-[8px] text-[#475569]">{slotIdx + 1}:</span>
												{fx ? (
													<div className="ml-1 flex min-w-0 flex-1 items-center justify-between gap-0.5">
														<span
															className={`max-w-[45px] truncate text-[8px] font-medium ${
																fx.bypass ? 'text-[#64748b] line-through' : 'text-[#38bdf8]'
															}`}
															title={audioEffectRegistry.get(fx.type)?.name ?? fx.type}
														>
															{audioEffectRegistry.get(fx.type)?.name ?? fx.type}
														</span>
														<div className="flex items-center gap-0.5">
															<button
																type="button"
																onClick={() => {
																	const next = [...(tAudio.effects ?? [])];
																	next[slotIdx] = { ...fx, bypass: !fx.bypass };
																	store.getState().setTrackAudioEffects(track.id, next);
																}}
																className={`rounded px-0.5 text-[7px] font-bold ${
																	fx.bypass
																		? 'bg-[#334155] text-[#94a3b8]'
																		: 'bg-[#0284c7] text-white'
																}`}
																title="Toggle bypass"
															>
																fx
															</button>
															<button
																type="button"
																onClick={() => {
																	const next = (tAudio.effects ?? []).filter(
																		(_, i) => i !== slotIdx
																	);
																	store.getState().setTrackAudioEffects(track.id, next);
																}}
																className="px-0.5 text-[8px] text-[#ef4444] hover:text-[#dc2626]"
																title="Remove effect"
															>
																✕
															</button>
														</div>
													</div>
												) : (
													<select
														onChange={(e) => {
															if (!e.target.value) return;
															const newFx = audioEffectRegistry.createDefaultInstance(
																e.target.value
															);
															newFx.managedBy = 'user';
															const next = [...(tAudio.effects ?? [])];
															next[slotIdx] = newFx;
															store.getState().setTrackAudioEffects(track.id, next);
															e.target.value = '';
														}}
														defaultValue=""
														className="w-full cursor-pointer bg-transparent text-center text-[8px] text-[#475569] outline-none hover:text-[#94a3b8]"
													>
														<option value="" disabled>
															-- Empty --
														</option>
														{BUILTIN_AUDIO_EFFECTS.map((def) => (
															<option
																key={def.id}
																value={def.id}
																className="bg-[#0f172a] text-[#e2e8f0]"
															>
																{def.name}
															</option>
														))}
													</select>
												)}
											</div>
										);
									})}
								</div>
							</div>

							{/* Sends (to Submix Buses) */}
							{audioBuses.length > 0 && (
								<div className="my-1 border-b border-[var(--color-border)] pb-1">
									<div className="mb-0.5 px-0.5 font-mono text-[8px] tracking-wider text-[#64748b] uppercase">
										SENDS
									</div>
									<div className="space-y-0.5">
										{audioBuses.map((bus) => {
											const send = tAudio.sends?.find((s) => s.busId === bus.id);
											const isEnabled = send?.enabled ?? false;
											const levelDb = send?.levelDb ?? 0;
											const isPre = send?.pre ?? false;

											return (
												<div
													key={bus.id}
													className="flex items-center justify-between rounded border border-[#1e293b] bg-[#0f172a]/60 px-1 py-0.5 text-[8px]"
												>
													<button
														type="button"
														onClick={() => {
															store.getState().setTrackSend(track.id, {
																busId: bus.id,
																levelDb,
																pre: isPre,
																enabled: !isEnabled
															});
														}}
														className={`rounded px-1 text-[7px] font-bold ${
															isEnabled ? 'bg-[#059669] text-white' : 'bg-[#334155] text-[#94a3b8]'
														}`}
														title="Enable send"
													>
														{bus.name.slice(0, 3)}
													</button>
													<input
														type="range"
														min="-48"
														max="12"
														step="1"
														value={levelDb}
														disabled={!isEnabled}
														onChange={(e) => {
															store.getState().setTrackSend(track.id, {
																busId: bus.id,
																levelDb: parseFloat(e.target.value),
																pre: isPre,
																enabled: true
															});
														}}
														className="h-1 w-10 cursor-pointer accent-[#10b981]"
														title={`Send level: ${levelDb} dB`}
													/>
													<button
														type="button"
														disabled={!isEnabled}
														onClick={() => {
															store.getState().setTrackSend(track.id, {
																busId: bus.id,
																levelDb,
																pre: !isPre,
																enabled: isEnabled
															});
														}}
														className={`font-mono text-[7px] ${
															isPre ? 'text-[#fbbf24]' : 'text-[#64748b]'
														}`}
														title={isPre ? 'Pre-Fader' : 'Post-Fader'}
													>
														{isPre ? 'PRE' : 'PST'}
													</button>
												</div>
											);
										})}
									</div>
								</div>
							)}

							{/* Trim Control */}
							<div className="strip-trim-section">
								<div className="strip-trim-header">
									<span>TRIM</span>
									<span
										className="strip-trim-value"
										onDoubleClick={() => store.getState().setTrackAudioTrim(track.id, 0, true)}
										title="Double-click to reset trim to 0 dB"
									>
										{formatDb(tAudio.trimDb ?? 0)}
									</span>
								</div>
								<input
									type="range"
									min="-24"
									max="24"
									step="0.5"
									value={tAudio.trimDb ?? 0}
									onChange={(e) =>
										store.getState().setTrackAudioTrim(track.id, parseFloat(e.target.value), true)
									}
									className="strip-trim-slider"
									title="Trim Gain (-24 dB to +24 dB)"
								/>
							</div>

							{/* Pan Control */}
							<div className="strip-pan-section">
								<PanControl
									value={tAudio.pan}
									onChange={(val) => store.getState().setTrackAudioPan(track.id, val, true)}
									label={`${track.name} Pan`}
								/>
							</div>

							{/* Vertical Console Fader & Meter */}
							<MixerFader
								gainDb={tAudio.gainDb}
								isMuted={isMuted}
								meterPeakL={meterLevels.tracks[track.id]?.peakL}
								meterPeakR={meterLevels.tracks[track.id]?.peakR}
								onChange={(val) => store.getState().setTrackAudioGain(track.id, val, true)}
							/>

							{/* Mute & Solo Hardware Buttons */}
							<div className="strip-mute-solo-row">
								<button
									type="button"
									onClick={() =>
										store.getState().setTimelineTrackFlags(track.id, { muted: !isMuted })
									}
									className={`strip-mute-btn ${isMuted ? 'is-active' : ''}`}
									title={isMuted ? 'Unmute Track (M)' : 'Mute Track (M)'}
									aria-pressed={isMuted}
								>
									M
								</button>
								<button
									type="button"
									onClick={(e) =>
										store.getState().setTrackAudioSolo(track.id, undefined, e.metaKey || e.ctrlKey)
									}
									className={`strip-solo-btn ${isSolo ? 'is-active' : ''}`}
									title={
										isSolo
											? 'Unsolo Track (S) [Cmd/Ctrl-click for Exclusive]'
											: 'Solo Track (S) [Cmd/Ctrl-click for Exclusive]'
									}
									aria-pressed={isSolo}
								>
									S
								</button>
							</div>

							{/* Output Routing Selector */}
							<div className="strip-routing-section">
								<select
									value={tAudio.output ?? 'master'}
									onChange={(e) => {
										if (e.target.value === '__new__') {
											handleAddBus();
										} else {
											store.getState().setTrackAudioOutput(track.id, e.target.value);
										}
									}}
									className="strip-routing-select"
									title="Output Bus Routing"
								>
									<option value="master">Out: Master</option>
									{audioBuses.map((b) => (
										<option key={b.id} value={b.id}>
											Out: {b.name}
										</option>
									))}
									<option value="__new__">+ New Bus...</option>
								</select>
							</div>
						</div>
					);
				})}

				{/* Audio Buses (Submixes) */}
				{audioBuses.map((bus) => (
					<div key={bus.id} className="mixer-strip is-bus bus-strip" data-bus-id={bus.id}>
						<div className="strip-header">
							<div className="strip-title-row">
								<span className="strip-kind-tag is-bus">BUS</span>
								<span className="strip-name" title={bus.name}>
									{bus.name}
								</span>
								<button
									type="button"
									onClick={() => store.getState().removeAudioBus(bus.id)}
									className="strip-delete-btn"
									title={`Delete ${bus.name}`}
									aria-label={`Delete ${bus.name}`}
								>
									<svg
										width="9"
										height="9"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<line x1="18" y1="6" x2="6" y2="18" />
										<line x1="6" y1="6" x2="18" y2="18" />
									</svg>
								</button>
							</div>
							<div className="strip-auto-row">
								<span>AUTO</span>
								<select
									value={bus.automationMode ?? 'read'}
									onChange={(e) =>
										store
											.getState()
											.setAutomationMode('bus', bus.id, e.target.value as AutomationMode)
									}
									className="strip-auto-select"
								>
									{automationModes.map((m) => (
										<option key={m} value={m}>
											{m}
										</option>
									))}
								</select>
							</div>
						</div>

						{/* Submix label placeholder for FX alignment */}
						<div className="strip-fx-row">
							<div className="flex-1 py-0.5 text-center font-mono text-[9px] text-[#a855f7]">
								SUBMIX
							</div>
						</div>

						{/* Bus Pan Control */}
						<div className="strip-pan-section">
							<PanControl
								value={bus.pan}
								onChange={(val) => store.getState().setBusAudioPan(bus.id, val, true)}
								label={`${bus.name} Pan`}
							/>
						</div>

						{/* Bus Fader & Meter */}
						<MixerFader
							gainDb={bus.gainDb}
							isMuted={bus.muted}
							meterPeakL={meterLevels.buses[bus.id]?.peakL}
							meterPeakR={meterLevels.buses[bus.id]?.peakR}
							onChange={(val) => store.getState().setBusAudioGain(bus.id, val, true)}
						/>

						{/* Bus Mute / Solo */}
						<div className="strip-mute-solo-row">
							<button
								type="button"
								onClick={() => store.getState().setBusAudioMute(bus.id, !bus.muted)}
								className={`strip-mute-btn ${bus.muted ? 'is-active' : ''}`}
								title="Mute Submix"
								aria-pressed={bus.muted}
							>
								M
							</button>
							<button
								type="button"
								onClick={() => store.getState().setBusAudioSolo(bus.id, !bus.solo)}
								className={`strip-solo-btn ${bus.solo ? 'is-active' : ''}`}
								title="Solo Submix"
								aria-pressed={bus.solo}
							>
								S
							</button>
						</div>

						<div className="strip-routing-label">→ {bus.output}</div>
					</div>
				))}

				{/* Master Channel Strip */}
				<div className="mixer-strip is-master">
					<div className="strip-header">
						<div className="strip-title-row">
							<span className="strip-kind-tag is-master">OUT</span>
							<span className="strip-name font-bold text-[#fbbf24]">MASTER</span>
							<button
								type="button"
								onClick={() => store.getState().setMasterAudioGain(0)}
								className="strip-delete-btn"
								title="Reset Master Gain to 0 dB"
							>
								↺
							</button>
						</div>
					</div>

					{/* Master Limiter Toggle & Ceiling */}
					<div className="strip-fx-row">
						<button
							type="button"
							onClick={() => store.getState().setMasterAudioLimiter(!masterAudio.limiter)}
							className={`strip-fx-btn w-full ${masterAudio.limiter ? 'is-active' : ''}`}
							title="Toggle Master Limiter (-0.5 dBTP Ceiling)"
						>
							<span
								className={
									masterAudio.limiter ? 'mr-1 font-bold text-[#38bdf8]' : 'mr-1 text-[#64748b]'
								}
							>
								●
							</span>
							LIMITER -0.5
						</button>
					</div>

					{/* Master True-Peak & LUFS Readout */}
					<div className="strip-pan-section">
						<div className="strip-pan-header">
							<span>TP</span>
							<span
								className={`font-bold ${
									linearToDb(Math.max(meterLevels.master.peakL, meterLevels.master.peakR)) > -0.5
										? 'text-[#ef4444]'
										: 'text-[#38bdf8]'
								}`}
							>
								{(() => {
									let peak = linearToDb(
										Math.max(meterLevels.master.peakL, meterLevels.master.peakR)
									);
									if (masterAudio.limiter && peak > -0.5) peak = -0.5;
									return formatDb(peak);
								})()}
							</span>
						</div>
						<div className="strip-pan-header mt-1">
							<span>LUFS</span>
							<span className="font-mono text-[#e2e8f0]">
								{(() => {
									const rmsDb = linearToDb(
										Math.max(meterLevels.master.rmsL, meterLevels.master.rmsR)
									);
									return rmsDb <= -90 ? '-inf' : `${(rmsDb - 0.7).toFixed(1)}`;
								})()}
							</span>
						</div>
					</div>

					{/* Master Fader & Meter */}
					<MixerFader
						gainDb={masterAudio.gainDb}
						meterPeakL={meterLevels.master.peakL}
						meterPeakR={meterLevels.master.peakR}
						onChange={(val) => store.getState().setMasterAudioGain(val, true)}
					/>

					{/* Master Status */}
					<div className="mt-auto pt-2 text-center font-mono text-[9px] text-[#fbbf24]">
						MAIN STEREO
					</div>
				</div>
			</div>

			{/* EQ Popup Dialog */}
			{activeEqTrack && (
				<EqPopup
					eq={activeEqTrack.audio?.eq}
					trackName={activeEqTrack.name}
					onClose={() => setActiveEqTrackId(null)}
					onChange={(nextEq) => {
						store.getState().setTrackAudioEq(activeEqTrack.id, nextEq);
					}}
				/>
			)}

			{/* Compressor Popup Dialog */}
			{activeCompTrack && (
				<CompressorPopup
					compressor={activeCompTrack.audio?.compressor}
					trackName={activeCompTrack.name}
					onClose={() => setActiveCompTrackId(null)}
					onChange={(nextComp) => {
						store.getState().setTrackAudioCompressor(activeCompTrack.id, nextComp);
					}}
				/>
			)}
		</aside>
	);
};
