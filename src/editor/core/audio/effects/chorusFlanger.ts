import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP,
	type AudioEffectContext
} from '../effects/registry';
import { DelayLine } from '../dsp/delayLine';

export const chorusFlangerDefinition: AudioEffectDefinition = {
	id: 'chorus-flanger',
	name: 'Chorus / Flanger',
	category: 'spatial',
	version: 1,
	paramSchemas: [
		{
			id: 'mode',
			name: 'Mode',
			type: 'enum',
			default: 'chorus',
			options: [
				{ label: 'Chorus', value: 'chorus' },
				{ label: 'Flanger', value: 'flanger' }
			]
		},
		{
			id: 'rateHz',
			name: 'Rate',
			type: 'number',
			min: 0.1,
			max: 10,
			step: 0.1,
			default: 1.2,
			unit: 'Hz',
			animatable: true
		},
		{
			id: 'depth',
			name: 'Depth',
			type: 'number',
			min: 0,
			max: 100,
			step: 1,
			default: 60,
			unit: '%',
			animatable: true
		},
		{
			id: 'feedback',
			name: 'Feedback',
			type: 'number',
			min: -90,
			max: 90,
			step: 1,
			default: 20,
			unit: '%',
			animatable: true
		},
		{
			id: 'mix',
			name: 'Mix',
			type: 'number',
			min: 0,
			max: 100,
			step: 1,
			default: 50,
			unit: '%',
			animatable: true
		}
	],
	latencySamples: () => 0,
	createDSP: (ctx: AudioEffectContext, params: Record<string, unknown>): AudioEffectDSP => {
		// Max delay ~ 50ms at current sample rate
		const maxDelaySamples = Math.ceil((50 / 1000) * ctx.sampleRate);
		const delayLines = Array.from(
			{ length: ctx.channels },
			() => new DelayLine(maxDelaySamples + 100)
		);
		let lfoPhase = 0;

		return {
			reset() {
				for (const d of delayLines) d.reset();
				lfoPhase = 0;
			},
			latencySamples() {
				return 0;
			},
			process(channels: Float32Array[], frameCount: number) {
				const isFlanger = params.mode === 'flanger';
				const rate = Math.max(0.01, Number(params.rateHz ?? 1.2));
				const depthPct = Math.max(0, Math.min(100, Number(params.depth ?? 60))) / 100;
				const fb = Math.max(-0.95, Math.min(0.95, Number(params.feedback ?? 0) / 100));
				const dryWet = Math.max(0, Math.min(100, Number(params.mix ?? 50))) / 100;

				// Flanger: 1 to 5 ms base delay; Chorus: 10 to 30 ms base delay
				const baseDelayMs = isFlanger ? 2.5 : 18.0;
				const modDepthMs = isFlanger ? 1.8 * depthPct : 6.0 * depthPct;
				const phaseIncrement = (2 * Math.PI * rate) / ctx.sampleRate;

				for (let i = 0; i < frameCount; i++) {
					lfoPhase += phaseIncrement;
					if (lfoPhase > 2 * Math.PI) lfoPhase -= 2 * Math.PI;

					for (let c = 0; c < channels.length; c++) {
						const dl = delayLines[c]!;
						const chan = channels[c]!;
						const inSample = chan[i]!;

						// 90 degree phase shift between channels for stereo width
						const chPhase = lfoPhase + (c === 1 ? Math.PI / 2 : 0);
						const lfoVal = Math.sin(chPhase);
						const curDelayMs = baseDelayMs + modDepthMs * lfoVal;
						const curDelaySamples = (curDelayMs / 1000) * ctx.sampleRate;

						const delayed = dl.readLinear(curDelaySamples);
						dl.write(inSample + delayed * fb);

						chan[i] = inSample * (1 - dryWet * 0.5) + delayed * dryWet;
					}
				}
			}
		};
	}
};

audioEffectRegistry.register(chorusFlangerDefinition);
