import React, { useState } from 'react';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import { EqPopup } from './EqPopup';
import { CompressorPopup } from './CompressorPopup';
import type { Track, TrackEq, TrackCompressor, AudioBus, AutomationMode } from '../../core/types';

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
		<aside
			className="mixer-panel flex h-full w-full flex-col bg-[var(--color-canvas)] text-[var(--color-ink)]"
			aria-label="Audio Mixer"
		>
			{/* Mixer Action Sub-header */}
			<div className="flex items-center justify-between border-b border-[var(--color-hairline)] bg-[var(--color-canvas-elevated)] px-3 py-1.5">
				<div className="flex items-center gap-2">
					<span className="text-[11px] font-semibold tracking-wider text-[var(--color-ink)] uppercase">
						Mixer
					</span>
					<span className="text-[10px] text-[var(--color-mute)]">
						{audioTracks.length} tracks · {audioBuses.length} buses
					</span>
				</div>
				<button type="button" onClick={handleAddBus} className="tracking-btn text-[10px]">
					+ Add Submix
				</button>
			</div>

			{/* Channel Strips Container */}
			<div className="flex flex-1 gap-2.5 overflow-x-auto overflow-y-hidden p-2.5">
				{/* Audio Tracks */}
				{audioTracks.map((track) => {
					const tAudio = track.audio ?? { gainDb: 0, pan: 0, solo: false };
					const isMuted = track.muted;
					const isSolo = tAudio.solo;
					const autoMode = tAudio.automationMode ?? 'read';

					return (
						<div
							key={track.id}
							className="channel-strip flex w-28 shrink-0 flex-col justify-between rounded border border-[var(--color-hairline)] bg-[var(--color-canvas-elevated)] p-2 shadow-xs"
							data-track-id={track.id}
						>
							{/* Track Header & Automation */}
							<div className="flex flex-col gap-1">
								<div
									className="truncate text-center text-xs font-medium text-[var(--color-ink)]"
									title={track.name}
								>
									{track.name}
								</div>
								<div className="flex items-center justify-between px-0.5 text-[9px] text-[var(--color-mute)]">
									<span>AUTO</span>
									<select
										value={autoMode}
										onChange={(e) =>
											store
												.getState()
												.setAutomationMode('track', track.id, e.target.value as AutomationMode)
										}
										className="rounded border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-1 py-0.5 text-[9px] text-[var(--color-ink)] uppercase"
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
							<div className="my-1 flex justify-center gap-1">
								<button
									type="button"
									onClick={() => setActiveEqTrack(track)}
									className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-medium transition-colors ${
										tAudio.eq?.enabled
											? 'border-[var(--color-link)] bg-[var(--color-link)] text-white'
											: 'border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-mute)] hover:text-[var(--color-ink)]'
									}`}
								>
									EQ
								</button>
								<button
									type="button"
									onClick={() => setActiveCompTrack(track)}
									className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-medium transition-colors ${
										tAudio.compressor?.enabled
											? 'border-[var(--color-link)] bg-[var(--color-link)] text-white'
											: 'border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-mute)] hover:text-[var(--color-ink)]'
									}`}
								>
									DYN
								</button>
							</div>

							{/* Pan Slider */}
							<div className="flex flex-col items-center gap-0.5">
								<div className="flex w-full justify-between font-mono text-[9px] text-[var(--color-mute)]">
									<span>L</span>
									<span>
										{tAudio.pan === 0
											? 'C'
											: tAudio.pan > 0
												? `R${Math.round(tAudio.pan * 100)}`
												: `L${Math.round(-tAudio.pan * 100)}`}
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
									className="h-1 w-full cursor-pointer accent-[var(--color-link)]"
									title="Pan"
								/>
							</div>

							{/* Vertical Fader Track */}
							<div className="my-1.5 flex min-h-[90px] flex-1 flex-col items-center justify-center gap-1.5">
								<input
									type="range"
									min="-96"
									max="24"
									step="0.5"
									value={tAudio.gainDb}
									onChange={(e) =>
										store.getState().setTrackAudioGain(track.id, parseFloat(e.target.value), true)
									}
									className="cursor-pointer accent-[var(--color-link)]"
									style={{
										writingMode: 'vertical-lr',
										direction: 'rtl',
										width: 24,
										height: 90
									}}
									title="Fader Gain (dB)"
								/>
								<div className="w-full text-center font-mono text-[10px] text-[var(--color-ink)]">
									{tAudio.gainDb <= -96
										? '-inf'
										: tAudio.gainDb > 0
											? `+${tAudio.gainDb.toFixed(1)}`
											: tAudio.gainDb.toFixed(1)}
								</div>
							</div>

							{/* Mute & Solo Buttons */}
							<div className="mt-1 flex justify-center gap-1.5">
								<button
									type="button"
									onClick={() =>
										store.getState().setTimelineTrackFlags(track.id, { muted: !isMuted })
									}
									className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
										isMuted
											? 'bg-[var(--color-error)] text-white'
											: 'border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-mute)] hover:text-[var(--color-ink)]'
									}`}
								>
									M
								</button>
								<button
									type="button"
									onClick={() => store.getState().setTrackAudioSolo(track.id)}
									className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
										isSolo
											? 'bg-[var(--color-warning)] text-black'
											: 'border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-mute)] hover:text-[var(--color-ink)]'
									}`}
								>
									S
								</button>
							</div>
						</div>
					);
				})}

				{/* Audio Buses */}
				{audioBuses.map((bus) => (
					<div
						key={bus.id}
						className="channel-strip bus-strip flex w-28 shrink-0 flex-col justify-between rounded border border-[var(--color-hairline)] bg-[var(--color-canvas-elevated)] p-2 shadow-xs"
						data-bus-id={bus.id}
					>
						<div className="flex flex-col gap-1">
							<div className="flex items-center justify-between gap-1">
								<div
									className="flex-1 truncate text-left text-xs font-semibold text-[var(--color-link)]"
									title={bus.name}
								>
									{bus.name}
								</div>
								<button
									type="button"
									onClick={() => store.getState().removeAudioBus(bus.id)}
									className="rounded p-0.5 text-[10px] leading-none text-[var(--color-mute)] hover:bg-[var(--color-hairline-soft)] hover:text-[var(--color-error)]"
									title={`Delete ${bus.name}`}
									aria-label={`Delete ${bus.name}`}
								>
									✕
								</button>
							</div>
							<div className="flex items-center justify-between px-0.5 text-[9px] text-[var(--color-mute)]">
								<span>AUTO</span>
								<select
									value={bus.automationMode ?? 'read'}
									onChange={(e) =>
										store
											.getState()
											.setAutomationMode('bus', bus.id, e.target.value as AutomationMode)
									}
									className="rounded border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-1 py-0.5 text-[9px] text-[var(--color-ink)] uppercase"
								>
									{automationModes.map((m) => (
										<option key={m} value={m}>
											{m}
										</option>
									))}
								</select>
							</div>
						</div>

						<div className="my-1 flex justify-center text-[9px] text-[var(--color-mute)] italic">
							Submix
						</div>

						{/* Bus Pan Slider */}
						<div className="flex flex-col items-center gap-0.5">
							<div className="flex w-full justify-between font-mono text-[9px] text-[var(--color-mute)]">
								<span>L</span>
								<span>
									{bus.pan === 0
										? 'C'
										: bus.pan > 0
											? `R${Math.round(bus.pan * 100)}`
											: `L${Math.round(-bus.pan * 100)}`}
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
								className="h-1 w-full cursor-pointer accent-[var(--color-link)]"
								title="Bus Pan"
							/>
						</div>

						{/* Bus Fader */}
						<div className="my-1.5 flex min-h-[90px] flex-1 flex-col items-center justify-center gap-1.5">
							<input
								type="range"
								min="-96"
								max="24"
								step="0.5"
								value={bus.gainDb}
								onChange={(e) =>
									store.getState().setBusAudioGain(bus.id, parseFloat(e.target.value), true)
								}
								className="cursor-pointer accent-[var(--color-link)]"
								style={{
									writingMode: 'vertical-lr',
									direction: 'rtl',
									width: 24,
									height: 90
								}}
								title="Bus Gain (dB)"
							/>
							<div className="w-full text-center font-mono text-[10px] text-[var(--color-ink)]">
								{bus.gainDb <= -96 ? '-inf' : bus.gainDb.toFixed(1)}
							</div>
						</div>

						{/* Bus Mute / Solo */}
						<div className="mt-1 flex justify-center gap-1.5">
							<button
								type="button"
								onClick={() => store.getState().setBusAudioMute(bus.id, !bus.muted)}
								className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
									bus.muted
										? 'bg-[var(--color-error)] text-white'
										: 'border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-mute)] hover:text-[var(--color-ink)]'
								}`}
							>
								M
							</button>
							<button
								type="button"
								onClick={() => store.getState().setBusAudioSolo(bus.id, !bus.solo)}
								className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
									bus.solo
										? 'bg-[var(--color-warning)] text-black'
										: 'border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-mute)] hover:text-[var(--color-ink)]'
								}`}
							>
								S
							</button>
						</div>

						<div className="mt-1 text-center font-mono text-[9px] text-[var(--color-mute)]">
							→ {bus.output}
						</div>
					</div>
				))}

				{/* Master Channel Strip */}
				<div className="channel-strip master-strip flex w-28 shrink-0 flex-col justify-between rounded border-2 border-[var(--color-link)] bg-[var(--color-canvas-elevated)] p-2 shadow-xs">
					<div className="truncate text-center text-xs font-bold text-[var(--color-link)]">
						MASTER
					</div>

					{/* Master Limiter Toggle */}
					<div className="my-1 flex justify-center">
						<button
							type="button"
							onClick={() => store.getState().setMasterAudioLimiter(!masterAudio.limiter)}
							className={`rounded border px-2 py-0.5 font-mono text-[9px] font-medium transition-colors ${
								masterAudio.limiter
									? 'border-[var(--color-link)] bg-[var(--color-link)] text-white'
									: 'border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-mute)] hover:text-[var(--color-ink)]'
							}`}
						>
							LIMITER
						</button>
					</div>

					{/* Master Fader */}
					<div className="my-1.5 flex min-h-[90px] flex-1 flex-col items-center justify-center gap-1.5">
						<input
							type="range"
							min="-96"
							max="24"
							step="0.5"
							value={masterAudio.gainDb}
							onChange={(e) =>
								store.getState().setMasterAudioGain(parseFloat(e.target.value), true)
							}
							className="cursor-pointer accent-[var(--color-link)]"
							style={{
								writingMode: 'vertical-lr',
								direction: 'rtl',
								width: 24,
								height: 90
							}}
							title="Master Gain (dB)"
						/>
						<div className="w-full text-center font-mono text-[10px] font-bold text-[var(--color-ink)]">
							{masterAudio.gainDb <= -96
								? '-inf'
								: masterAudio.gainDb > 0
									? `+${masterAudio.gainDb.toFixed(1)}`
									: masterAudio.gainDb.toFixed(1)}
						</div>
					</div>

					<div className="mt-1 text-center font-mono text-[9px] text-[var(--color-mute)]">
						0.0 dBFS Peak
					</div>
				</div>
			</div>

			{/* Popups */}
			{activeEqTrack && (
				<EqPopup
					trackName={activeEqTrack.name}
					eq={activeEqTrack.audio?.eq}
					onClose={() => setActiveEqTrack(null)}
					onChange={(eq: TrackEq) => store.getState().setTrackAudioEq(activeEqTrack.id, eq)}
				/>
			)}

			{activeCompTrack && (
				<CompressorPopup
					trackName={activeCompTrack.name}
					compressor={activeCompTrack.audio?.compressor}
					onClose={() => setActiveCompTrack(null)}
					onChange={(comp: TrackCompressor) =>
						store.getState().setTrackAudioCompressor(activeCompTrack.id, comp)
					}
				/>
			)}
		</aside>
	);
};
