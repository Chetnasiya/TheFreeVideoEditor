import { timelineToSource } from '../../core/timeRemap';
import type { Clip, Time } from '../../core/types';
import { wsola } from './wsola';

export interface RenderRemappedAudioOptions {
	clip: Pick<
		Clip,
		'start' | 'duration' | 'sourceIn' | 'sourceOut' | 'speed' | 'timeRemap' | 'maintainPitch'
	>;
	sourceChannels: readonly Float32Array[];
	sourceSampleRate: number;
	timelineStartTicks?: Time;
	timelineDurationTicks?: Time;
}

export interface RenderRemappedAudioResult {
	channels: Float32Array[];
	sampleRate: number;
}

/**
 * Pure shared audio rendering function for speed changes, time remapping, reverse, and freeze frames.
 * Shared between preview (pre-rendered buffer) and export mixdown.
 */
export function renderRemappedAudio(
	options: RenderRemappedAudioOptions
): RenderRemappedAudioResult {
	const { clip, sourceChannels, sourceSampleRate } = options;
	const numChannels = sourceChannels.length;
	const sourceLen = sourceChannels[0]?.length ?? 0;

	const startTicks = options.timelineStartTicks ?? 0;
	const durationTicks = options.timelineDurationTicks ?? clip.duration;
	const targetSamples = Math.max(0, Math.round((durationTicks / 1_000_000) * sourceSampleRate));

	if (numChannels === 0 || targetSamples === 0 || sourceLen === 0) {
		return {
			channels: Array.from(
				{ length: Math.max(1, numChannels) },
				() => new Float32Array(targetSamples)
			),
			sampleRate: sourceSampleRate
		};
	}

	// 1. Freeze frame detection: if speed is 0 throughout, return silence
	const isConstantFreeze =
		(clip.timeRemap && !('keyframes' in clip.timeRemap) && clip.timeRemap.value === 0) ||
		(!clip.timeRemap && clip.speed === 0);

	if (isConstantFreeze) {
		return {
			channels: sourceChannels.map(() => new Float32Array(targetSamples)),
			sampleRate: sourceSampleRate
		};
	}

	const maintainPitch = clip.maintainPitch !== false;

	// 2. Constant speed in [0.25, 4.0] with pitch preservation (forward only)
	const isConstant = !clip.timeRemap;
	if (isConstant && clip.speed >= 0.25 && clip.speed <= 4.0 && maintainPitch) {
		// Slice source range [sourceIn, sourceOut]
		const inSample = Math.max(
			0,
			Math.min(sourceLen - 1, Math.round((clip.sourceIn / 1_000_000) * sourceSampleRate))
		);
		const outSample = Math.max(
			inSample + 1,
			Math.min(sourceLen, Math.round((clip.sourceOut / 1_000_000) * sourceSampleRate))
		);

		const slicedChannels = sourceChannels.map((ch) => ch.slice(inSample, outSample));
		const stretched = wsola(slicedChannels, clip.speed, { targetLength: targetSamples });
		return {
			channels: stretched,
			sampleRate: sourceSampleRate
		};
	}

	// 3. Resample / reverse / variable ramp / pitch follows speed
	// For each output sample, map timeline tick to source tick via timelineToSource and interpolate
	const outputChannels = sourceChannels.map(() => new Float32Array(targetSamples));
	const ticksPerSample = 1_000_000 / sourceSampleRate;

	for (let i = 0; i < targetSamples; i++) {
		const localTicks = startTicks + Math.round(i * ticksPerSample);
		const sourceTicks = timelineToSource(clip, clip.start + localTicks);
		const sourceSamplePos = (sourceTicks / 1_000_000) * sourceSampleRate;

		const clampedPos = Math.max(0, Math.min(sourceLen - 1, sourceSamplePos));
		const idx0 = Math.floor(clampedPos);
		const idx1 = Math.min(sourceLen - 1, idx0 + 1);
		const frac = clampedPos - idx0;

		for (let c = 0; c < numChannels; c++) {
			const inCh = sourceChannels[c]!;
			outputChannels[c]![i] = inCh[idx0]! * (1 - frac) + inCh[idx1]! * frac;
		}
	}

	return {
		channels: outputChannels,
		sampleRate: sourceSampleRate
	};
}
