import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import { EqPopup } from './EqPopup';
import { CompressorPopup } from './CompressorPopup';
import type { Track, AudioBus, AutomationMode } from '../../core/types';
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

function formatPan(pan: number): string {
	if (Math.abs(pan) < 0.02) return 'C';
	if (pan < 0) return `L${Math.round(-pan * 100)}`;
	return `R${Math.round(pan * 100)}`;
}

interface FaderProps {
	gainDb: number;
	onChange: (gainDb: number) => void;
	isMuted?: boolean;
}

const MixerFader: React.FC<FaderProps> = ({ gainDb, onChange, isMuted = false }) => {
	const trackRef = useRef<HTMLDivElement>(null);
	const isDragging = useRef(false);

	const pct = dbToPercent(gainDb);
	const topPct = 100 - pct;

	// Calculate meter levels based on gain
	const isClipped = !isMuted && gainDb > 0;
	const meterLevelPct = isMuted || gainDb <= -96 ? 0 : Math.min(100, Math.max(4, pct * 0.92));
	const meterLevelRightPct = isMuted || gainDb <= -96 ? 0 : Math.min(100, Math.max(4, pct * 0.88));

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
		<div className="flex flex-col items-center w-full">
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

export const MixerPanel: React.FC = () => {
	const store = useEditorStoreApi();
	const project = useEditorStore((state) => state.project);
	const [activeEqTrack, setActiveEqTrack] = useState<Track | null>(null);
	const [activeCompTrack, setActiveCompTrack] = useState<Track | null>(null);

	if (!project) return null;

	const audioTracks = project.tracks.filter((t) => t.kind === 'audio');
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
						<div className="mixer-badge" style={{ borderColor: 'rgba(168, 85, 247, 0.3)', color: '#c084fc' }}>
							{audioBuses.length} submix{audioBuses.length > 1 ? 'es' : ''}
						</div>
					)}
				</div>
				<button type="button" onClick={handleAddBus} className="mixer-btn" title="Add a submix audio bus">
					<span className="text-[#38bdf8] font-bold">+</span>
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
						<div key={track.id} className="mixer-strip" data-track-id={track.id}>
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

							{/* EQ / Comp Buttons */}
							<div className="strip-fx-row">
								<button
									type="button"
									onClick={() => setActiveEqTrack(track)}
									className={`strip-fx-btn ${tAudio.eq?.enabled ? 'is-active' : ''}`}
									title={tAudio.eq?.enabled ? 'Equalizer (Enabled)' : 'Equalizer'}
								>
									EQ
								</button>
								<button
									type="button"
									onClick={() => setActiveCompTrack(track)}
									className={`strip-fx-btn ${tAudio.compressor?.enabled ? 'is-active' : ''}`}
									title={tAudio.compressor?.enabled ? 'Compressor / Dynamics (Enabled)' : 'Compressor / Dynamics'}
								>
									DYN
								</button>
							</div>

							{/* Pan Control */}
							<div className="strip-pan-section">
								<div className="strip-pan-header">
									<span>L</span>
									<span
										className="strip-pan-value"
										onDoubleClick={() => store.getState().setTrackAudioPan(track.id, 0, true)}
										title="Double-click to center pan"
									>
										{formatPan(tAudio.pan)}
									</span>
									<span>R</span>
								</div>
								<input
									type="range"
									min="-1"
									max="1"
									step="0.05"
									value={tAudio.pan}
									onChange={(e) =>
										store.getState().setTrackAudioPan(track.id, parseFloat(e.target.value), true)
									}
									className="strip-pan-slider"
									title="Pan (Drag to adjust, double-click value to center)"
								/>
							</div>

							{/* Vertical Console Fader & Meter */}
							<MixerFader
								gainDb={tAudio.gainDb}
								isMuted={isMuted}
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
									onClick={() => store.getState().setTrackAudioSolo(track.id)}
									className={`strip-solo-btn ${isSolo ? 'is-active' : ''}`}
									title={isSolo ? 'Unsolo Track (S)' : 'Solo Track (S)'}
									aria-pressed={isSolo}
								>
									S
								</button>
							</div>

							{/* Routing indicator */}
							<div className="strip-routing-label" title={`Routed to ${tAudio.output && tAudio.output !== 'master' ? 'Submix' : 'Master'}`}>
								{tAudio.output && tAudio.output !== 'master' ? '→ Submix' : '→ Master'}
							</div>
						</div>
					);
				})}

				{/* Audio Buses (Submixes) */}
				{audioBuses.map((bus) => (
					<div key={bus.id} className="mixer-strip is-bus" data-bus-id={bus.id}>
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
									<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
							<div className="flex-1 text-center font-mono text-[9px] text-[#a855f7] py-0.5">
								SUBMIX
							</div>
						</div>

						{/* Bus Pan Control */}
						<div className="strip-pan-section">
							<div className="strip-pan-header">
								<span>L</span>
								<span
									className="strip-pan-value"
									onDoubleClick={() => store.getState().setBusAudioPan(bus.id, 0, true)}
									title="Double-click to center pan"
								>
									{formatPan(bus.pan)}
								</span>
								<span>R</span>
							</div>
							<input
								type="range"
								min="-1"
								max="1"
								step="0.05"
								value={bus.pan}
								onChange={(e) =>
									store.getState().setBusAudioPan(bus.id, parseFloat(e.target.value), true)
								}
								className="strip-pan-slider"
								title="Bus Pan"
							/>
						</div>

						{/* Bus Fader & Meter */}
						<MixerFader
							gainDb={bus.gainDb}
							isMuted={bus.muted}
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

						<div className="strip-routing-label">
							→ {bus.output}
						</div>
					</div>
				))}

				{/* Master Channel Strip */}
				<div className="mixer-strip is-master">
					<div className="strip-header">
						<div className="strip-title-row">
							<span className="strip-kind-tag is-master">OUT</span>
							<span className="strip-name text-[#fbbf24] font-bold">
								MASTER
							</span>
						</div>
					</div>

					{/* Master Limiter Toggle */}
					<div className="strip-fx-row">
						<button
							type="button"
							onClick={() => store.getState().setMasterAudioLimiter(!masterAudio.limiter)}
							className={`strip-fx-btn w-full ${masterAudio.limiter ? 'is-active' : ''}`}
							title="Toggle Master Limiter"
						>
							<span className={masterAudio.limiter ? 'text-[#38bdf8] font-bold mr-1' : 'text-[#64748b] mr-1'}>●</span>
							LIMITER
						</button>
					</div>

					{/* Master Balance / Pan */}
					<div className="strip-pan-section opacity-50 pointer-events-none">
						<div className="strip-pan-header">
							<span>L</span>
							<span className="strip-pan-value">C</span>
							<span>R</span>
						</div>
						<div className="h-[3px] bg-[#242432] rounded-full my-1" />
					</div>

					{/* Master Fader & Meter */}
					<MixerFader
						gainDb={masterAudio.gainDb}
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
					onClose={() => setActiveEqTrack(null)}
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
					onClose={() => setActiveCompTrack(null)}
					onChange={(nextComp) => {
						store.getState().setTrackAudioCompressor(activeCompTrack.id, nextComp);
					}}
				/>
			)}
		</aside>
	);
};
