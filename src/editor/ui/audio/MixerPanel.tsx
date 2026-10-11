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
			className="mixer-panel flex h-full w-full flex-col bg-[var(--color-surface-base)] text-[var(--color-text-primary)]"
			aria-label="Audio Mixer"
		>
			{/* Mixer Action Sub-header */}
			<div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] px-3 py-1.5">
				<div className="flex items-center gap-2">
					<span className="text-[11px] font-semibold tracking-wider text-[var(--color-text-secondary)] uppercase">
						Mixer
					</span>
					<span className="text-[10px] text-[var(--color-text-muted)]">
						{audioTracks.length} tracks · {audioBuses.length} buses
					</span>
				</div>
				<button
					type="button"
					onClick={handleAddBus}
					className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
				>
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
							className="channel-strip flex w-28 shrink-0 flex-col justify-between rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] p-2 shadow-xs"
							data-track-id={track.id}
						>
							{/* Track Header & Automation */}
							<div className="flex flex-col gap-1">
								<div className="truncate text-center text-xs font-medium" title={track.name}>
									{track.name}
								</div>
								<div className="flex items-center justify-between px-0.5 text-[9px] text-[var(--color-text-muted)]">
									<span>AUTO</span>
									<select
										value={autoMode}
										onChange={(e) =>
											store
												.getState()
												.setAutomationMode('track', track.id, e.target.value as AutomationMode)
										}
										className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] px-1 py-0.5 text-[9px] uppercase"
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
									className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-medium ${
										tAudio.eq?.enabled
											? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
											: 'border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
									}`}
								>
									EQ
								</button>
								<button
									type="button"
									onClick={() => setActiveCompTrack(track)}
									className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-medium ${
										tAudio.compressor?.enabled
											? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
											: 'border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
									}`}
								>
									DYN
								</button>
							</div>

							{/* Pan Slider */}
							<div className="flex flex-col items-center gap-0.5">
								<div className="flex w-full justify-between font-mono text-[9px] text-[var(--color-text-muted)]">
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
									className="h-1 w-full cursor-pointer accent-[var(--color-accent)]"
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
									className="cursor-pointer accent-[var(--color-accent)]"
									style={{
										writingMode: 'vertical-lr',
										direction: 'rtl',
										width: 24,
										height: 90
									}}
									title="Fader Gain (dB)"
								/>
								<div className="w-full text-center font-mono text-[10px]">
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
									className={`rounded px-2 py-0.5 text-[10px] font-bold ${
										isMuted
											? 'bg-[var(--color-error)] text-white'
											: 'bg-[var(--color-surface-base)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
									}`}
								>
									M
								</button>
								<button
									type="button"
									onClick={() => store.getState().setTrackAudioSolo(track.id)}
									className={`rounded px-2 py-0.5 text-[10px] font-bold ${
										isSolo
											? 'bg-[var(--color-warning)] text-black'
											: 'bg-[var(--color-surface-base)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
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
						className="channel-strip bus-strip flex w-28 shrink-0 flex-col justify-between rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-2 shadow-xs"
						data-bus-id={bus.id}
					>
						<div className="flex flex-col gap-1">
							<div className="flex items-center justify-between gap-1">
								<div
									className="flex-1 truncate text-left text-xs font-semibold text-[var(--color-accent)]"
									title={bus.name}
								>
									{bus.name}
								</div>
								<button
									type="button"
									onClick={() => store.getState().removeAudioBus(bus.id)}
									className="rounded p-0.5 text-[10px] leading-none text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-error)]"
									title={`Delete ${bus.name}`}
									aria-label={`Delete ${bus.name}`}
								>
									✕
								</button>
							</div>
							<div className="flex items-center justify-between px-0.5 text-[9px] text-[var(--color-text-muted)]">
								<span>AUTO</span>
								<select
									value={bus.automationMode ?? 'read'}
									onChange={(e) =>
										store
											.getState()
											.setAutomationMode('bus', bus.id, e.target.value as AutomationMode)
									}
									className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] px-1 py-0.5 text-[9px] uppercase"
								>
									{automationModes.map((m) => (
										<option key={m} value={m}>
											{m}
										</option>
									))}
								</select>
							</div>
						</div>

						<div className="my-1 flex justify-center text-[9px] text-[var(--color-text-tertiary)] italic">
							Submix
						</div>

						{/* Bus Pan Slider */}
						<div className="flex flex-col items-center gap-0.5">
							<div className="flex w-full justify-between font-mono text-[9px] text-[var(--color-text-muted)]">
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
								className="h-1 w-full cursor-pointer accent-[var(--color-accent)]"
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
								className="cursor-pointer accent-[var(--color-accent)]"
								style={{
									writingMode: 'vertical-lr',
									direction: 'rtl',
									width: 24,
									height: 90
								}}
								title="Bus Gain (dB)"
							/>
							<div className="w-full text-center font-mono text-[10px]">
								{bus.gainDb <= -96 ? '-inf' : bus.gainDb.toFixed(1)}
							</div>
						</div>

						{/* Bus Mute / Solo */}
						<div className="mt-1 flex justify-center gap-1.5">
							<button
								type="button"
								onClick={() => store.getState().setBusAudioMute(bus.id, !bus.muted)}
								className={`rounded px-2 py-0.5 text-[10px] font-bold ${
									bus.muted
										? 'bg-[var(--color-error)] text-white'
										: 'bg-[var(--color-surface-base)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
								}`}
							>
								M
							</button>
							<button
								type="button"
								onClick={() => store.getState().setBusAudioSolo(bus.id, !bus.solo)}
								className={`rounded px-2 py-0.5 text-[10px] font-bold ${
									bus.solo
										? 'bg-[var(--color-warning)] text-black'
										: 'bg-[var(--color-surface-base)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
								}`}
							>
								S
							</button>
						</div>

						<div className="mt-1 text-center font-mono text-[9px] text-[var(--color-text-muted)]">
							→ {bus.output}
						</div>
					</div>
				))}

				{/* Master Channel Strip */}
				<div className="channel-strip master-strip flex w-28 shrink-0 flex-col justify-between rounded border-2 border-[var(--color-accent)] bg-[var(--color-surface-elevated)] p-2 shadow-xs">
					<div className="truncate text-center text-xs font-bold text-[var(--color-accent)]">
						MASTER
					</div>

					{/* Master Limiter Toggle */}
					<div className="my-1 flex justify-center">
						<button
							type="button"
							onClick={() => store.getState().setMasterAudioLimiter(!masterAudio.limiter)}
							className={`rounded border px-2 py-0.5 font-mono text-[9px] font-medium ${
								masterAudio.limiter
									? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
									: 'border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
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
							className="cursor-pointer accent-[var(--color-accent)]"
							style={{
								writingMode: 'vertical-lr',
								direction: 'rtl',
								width: 24,
								height: 90
							}}
							title="Master Gain (dB)"
						/>
						<div className="w-full text-center font-mono text-[10px] font-bold">
							{masterAudio.gainDb <= -96
								? '-inf'
								: masterAudio.gainDb > 0
									? `+${masterAudio.gainDb.toFixed(1)}`
									: masterAudio.gainDb.toFixed(1)}
						</div>
					</div>

					<div className="mt-1 text-center font-mono text-[9px] text-[var(--color-text-muted)]">
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
