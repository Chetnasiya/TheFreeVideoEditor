import type { Project, Track, AudioEffectInstance, Sequence, SequenceId } from '../types';

/**
 * Migrates legacy fixed track EQ and compressor to rack effects on tracks.
 * Preserves exact parameter values and bypass state.
 */
export function migrateLegacyAudioRack(project: Project): Project {
	let modified = false;

	const migrateTrack = (track: Track): Track => {
		if (track.kind !== 'audio' || !track.audio) return track;
		const tAudio = track.audio;
		const effects: AudioEffectInstance[] = [...(tAudio.effects ?? [])];
		let trackModified = false;

		// 1. Migrate legacy EQ if present and not already migrated
		if (tAudio.eq && !effects.some((fx) => fx.id === `migrated-eq-${track.id}`)) {
			const eq = tAudio.eq;
			const eqInstance: AudioEffectInstance = {
				id: `migrated-eq-${track.id}`,
				type: 'parametric-eq',
				name: 'Parametric EQ',
				enabled: eq.enabled,
				mix: 1.0,
				params: {
					band1_type: eq.bands[0].type,
					band1_freq: eq.bands[0].frequencyHz,
					band1_gain: eq.bands[0].gainDb,
					band1_q: eq.bands[0].q,
					band1_enabled: true,

					band2_type: eq.bands[1].type,
					band2_freq: eq.bands[1].frequencyHz,
					band2_gain: eq.bands[1].gainDb,
					band2_q: eq.bands[1].q,
					band2_enabled: true,

					band3_type: eq.bands[2].type,
					band3_freq: eq.bands[2].frequencyHz,
					band3_gain: eq.bands[2].gainDb,
					band3_q: eq.bands[2].q,
					band3_enabled: true,

					band4_type: eq.bands[3].type,
					band4_freq: eq.bands[3].frequencyHz,
					band4_gain: eq.bands[3].gainDb,
					band4_q: eq.bands[3].q,
					band4_enabled: true
				}
			};
			effects.push(eqInstance);
			trackModified = true;
		}

		// 2. Migrate legacy Compressor if present and not already migrated
		if (tAudio.compressor && !effects.some((fx) => fx.id === `migrated-comp-${track.id}`)) {
			const comp = tAudio.compressor;
			const compInstance: AudioEffectInstance = {
				id: `migrated-comp-${track.id}`,
				type: 'compressor',
				name: 'Compressor',
				enabled: comp.enabled,
				mix: 1.0,
				params: {
					thresholdDb: comp.thresholdDb,
					ratio: comp.ratio,
					attackMs: comp.attackMs,
					releaseMs: comp.releaseMs,
					kneeDb: comp.kneeDb,
					makeupDb: comp.makeupDb
				}
			};
			effects.push(compInstance);
			trackModified = true;
		}

		if (!trackModified) return track;
		modified = true;
		return {
			...track,
			audio: {
				...tAudio,
				effects
			}
		};
	};

	const migratedTracks = project.tracks.map(migrateTrack);
	let migratedSequences = project.sequences;
	if (project.sequences) {
		const newSeqs: Record<SequenceId, Sequence> = { ...project.sequences };
		for (const [seqId, seq] of Object.entries(project.sequences) as Array<[SequenceId, Sequence]>) {
			newSeqs[seqId] = {
				...seq,
				tracks: seq.tracks.map(migrateTrack)
			};
		}
		migratedSequences = newSeqs;
	}

	if (!modified) return project;
	return {
		...project,
		tracks: migratedTracks,
		sequences: migratedSequences
	};
}
