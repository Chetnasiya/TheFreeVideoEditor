import {
	audioEffectRegistry,
	type AudioEffectDefinition,
	type AudioEffectDSP,
	type AudioEffectContext
} from '../effects/registry';
import { BiquadFilter, type BiquadType } from '../dsp/biquad';

export const parametricEqDefinition: AudioEffectDefinition = {
	id: 'parametric-eq',
	name: 'Parametric EQ',
	category: 'eq',
	version: 1,
	paramSchemas: [
		// Up to 8 bands
		...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((bandIndex) => [
			{
				id: `band${bandIndex}_type`,
				name: `Band ${bandIndex} Type`,
				type: 'enum' as const,
				default: bandIndex === 1 ? 'lowshelf' : bandIndex === 8 ? 'highshelf' : 'peaking',
				options: [
					{ label: 'Low Shelf', value: 'lowshelf' },
					{ label: 'Peaking', value: 'peaking' },
					{ label: 'High Shelf', value: 'highshelf' },
					{ label: 'Low Pass', value: 'lowpass' },
					{ label: 'High Pass', value: 'highpass' },
					{ label: 'Notch', value: 'notch' }
				]
			},
			{
				id: `band${bandIndex}_freq`,
				name: `Band ${bandIndex} Freq`,
				type: 'number' as const,
				min: 20,
				max: 20000,
				step: 1,
				default: [80, 200, 500, 1000, 2500, 5000, 8000, 12000][bandIndex - 1] ?? 1000,
				unit: 'Hz',
				animatable: true
			},
			{
				id: `band${bandIndex}_gain`,
				name: `Band ${bandIndex} Gain`,
				type: 'number' as const,
				min: -24,
				max: 24,
				step: 0.5,
				default: 0,
				unit: 'dB',
				animatable: true
			},
			{
				id: `band${bandIndex}_q`,
				name: `Band ${bandIndex} Q`,
				type: 'number' as const,
				min: 0.1,
				max: 18,
				step: 0.1,
				default: 0.7071,
				animatable: true
			},
			{
				id: `band${bandIndex}_enabled`,
				name: `Band ${bandIndex} On`,
				type: 'boolean' as const,
				default: bandIndex <= 4, // 4 bands enabled by default
				animatable: false
			}
		])
	],
	latencySamples: () => 0,
	createDSP: (ctx: AudioEffectContext, params: Record<string, unknown>): AudioEffectDSP => {
		const filtersPerChannel: BiquadFilter[][] = [];
		for (let c = 0; c < ctx.channels; c++) {
			const channelFilters: BiquadFilter[] = [];
			for (let b = 1; b <= 8; b++) {
				channelFilters.push(new BiquadFilter(ctx.sampleRate));
			}
			filtersPerChannel.push(channelFilters);
		}

		const configureFilters = () => {
			for (let b = 1; b <= 8; b++) {
				const type = (params[`band${b}_type`] as BiquadType) || 'peaking';
				const freq = Number(params[`band${b}_freq`] ?? 1000);
				const gain = Number(params[`band${b}_gain`] ?? 0);
				const q = Number(params[`band${b}_q`] ?? 0.7071);
				const enabled = Boolean(params[`band${b}_enabled`] ?? b <= 4);

				for (let c = 0; c < ctx.channels; c++) {
					const filter = filtersPerChannel[c]![b - 1]!;
					if (enabled) {
						filter.configure(type, freq, gain, q);
					} else {
						// Transparent pass-through
						filter.configure('peaking', 1000, 0, 1);
					}
				}
			}
		};

		configureFilters();

		return {
			reset: () => {
				for (const ch of filtersPerChannel) {
					for (const f of ch) f.reset();
				}
			},
			latencySamples: () => 0,
			process: (channels: Float32Array[], frameCount: number) => {
				configureFilters();
				for (let c = 0; c < Math.min(channels.length, filtersPerChannel.length); c++) {
					const chBuffer = channels[c]!;
					const filters = filtersPerChannel[c]!;
					for (const filter of filters) {
						filter.process(chBuffer, frameCount);
					}
				}
			}
		};
	}
};

audioEffectRegistry.register(parametricEqDefinition);
