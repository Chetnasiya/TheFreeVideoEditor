import React, { useState } from 'react';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import { EqPopup } from './EqPopup';
import { CompressorPopup } from './CompressorPopup';
import type { Track, TrackEq, TrackCompressor } from '../../core/types';

export const MixerPanel: React.FC = () => {
	const store = useEditorStoreApi();
	const project = useEditorStore((state) => state.project);
	const isMixerOpen = useEditorStore((state) => state.isMixerOpen);
	const [activeEqTrack, setActiveEqTrack] = useState<Track | null>(null);
	const [activeCompTrack, setActiveCompTrack] = useState<Track | null>(null);

	if (!isMixerOpen || !project) return null;

	const audioTracks = project.tracks.filter((t) => t.kind === 'audio');
	const masterAudio = project.masterAudio ?? { gainDb: 0, limiter: false };

	return (
		<aside
			className="mixer-panel flex flex-col border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] text-[var(--color-text-primary)]"
			style={{ height: 260 }}
			aria-label="Audio Mixer"
		>
			{/* Header */}
			<div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] px-4 py-2">
				<div className="flex items-center gap-2">
					<span className="text-xs font-semibold tracking-wider text-[var(--color-text-secondary)] uppercase">
						Audio Mixer
					</span>
					<span className="text-[10px] text-[var(--color-text-muted)]">
						({audioTracks.length} tracks + Master)
					</span>
				</div>
				<button
					onClick={() => store.getState().toggleMixer()}
					className="rounded p-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
					aria-label="Close Mixer"
				>
					✕
				</button>
			</div>

			{/* Channel Strips Container */}
			<div className="flex flex-1 gap-3 overflow-x-auto p-3">
				{audioTracks.map((track) => {
					const tAudio = track.audio ?? { gainDb: 0, pan: 0, solo: false };
					const isMuted = track.muted;
					const isSolo = tAudio.solo;

					return (
						<div
							key={track.id}
							className="channel-strip flex w-28 shrink-0 flex-col justify-between rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] p-2"
							data-track-id={track.id}
						>
							{/* Track Name */}
							<div className="truncate text-center text-xs font-medium" title={track.name}>
								{track.name}
							</div>

							{/* EQ / Comp Quick Access Buttons */}
							<div className="my-1 flex justify-center gap-1">
								<button
									onClick={() => setActiveEqTrack(track)}
									className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${
										tAudio.eq?.enabled
											? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
											: 'border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
									}`}
								>
									EQ
								</button>
								<button
									onClick={() => setActiveCompTrack(track)}
									className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${
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

							{/* Fader & Meter Area */}
							<div className="my-2 flex h-24 items-center justify-center gap-2">
								{/* dB Fader (Vertical Slider) */}
								<input
									type="range"
									min="-96"
									max="24"
									step="0.5"
									value={tAudio.gainDb}
									onChange={(e) =>
										store.getState().setTrackAudioGain(track.id, parseFloat(e.target.value), true)
									}
									className="h-20 w-20 -rotate-90 cursor-pointer accent-[var(--color-accent)]"
									style={{ transformOrigin: 'center' }}
									title="Fader Gain (dB)"
								/>

								{/* Level Readout */}
								<div className="w-9 text-right font-mono text-[10px]">
									{tAudio.gainDb <= -96
										? '-inf'
										: tAudio.gainDb > 0
											? `+${tAudio.gainDb.toFixed(1)}`
											: tAudio.gainDb.toFixed(1)}
								</div>
							</div>

							{/* Mute & Solo Buttons */}
							<div className="mt-1 flex justify-center gap-1">
								<button
									onClick={() =>
										store.getState().setTimelineTrackFlags(track.id, { muted: !isMuted })
									}
									className={`rounded px-2 py-1 text-[10px] font-bold ${
										isMuted
											? 'bg-[var(--color-error)] text-white'
											: 'bg-[var(--color-surface-base)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
									}`}
								>
									M
								</button>
								<button
									onClick={() => store.getState().setTrackAudioSolo(track.id)}
									className={`rounded px-2 py-1 text-[10px] font-bold ${
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

				{/* Master Channel Strip */}
				<div className="channel-strip master-strip flex w-28 shrink-0 flex-col justify-between rounded-lg border-2 border-[var(--color-accent)] bg-[var(--color-surface-elevated)] p-2">
					<div className="truncate text-center text-xs font-bold text-[var(--color-accent)]">
						MASTER
					</div>

					{/* Master Limiter Toggle */}
					<div className="my-1 flex justify-center">
						<button
							onClick={() => store.getState().setMasterAudioLimiter(!masterAudio.limiter)}
							className={`rounded border px-2 py-0.5 font-mono text-[10px] font-medium ${
								masterAudio.limiter
									? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
									: 'border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
							}`}
						>
							LIMITER
						</button>
					</div>

					<div className="h-4" />

					{/* Master Fader */}
					<div className="my-2 flex h-24 items-center justify-center gap-2">
						<input
							type="range"
							min="-96"
							max="24"
							step="0.5"
							value={masterAudio.gainDb}
							onChange={(e) =>
								store.getState().setMasterAudioGain(parseFloat(e.target.value), true)
							}
							className="h-20 w-20 -rotate-90 cursor-pointer accent-[var(--color-accent)]"
							style={{ transformOrigin: 'center' }}
							title="Master Gain (dB)"
						/>
						<div className="w-9 text-right font-mono text-[10px] font-bold">
							{masterAudio.gainDb <= -96
								? '-inf'
								: masterAudio.gainDb > 0
									? `+${masterAudio.gainDb.toFixed(1)}`
									: masterAudio.gainDb.toFixed(1)}
						</div>
					</div>

					<div className="flex h-6 items-center justify-center text-[10px] text-[var(--color-text-muted)]">
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
