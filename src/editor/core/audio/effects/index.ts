// Audio Effects Registry & Built-ins
export * from './registry';

import { audioEffectRegistry, type AudioEffectDefinition } from './registry';
import { gainTrimDefinition } from './gainTrim';
import { parametricEqDefinition } from './parametricEq';
import { compressorDefinition } from './compressor';
import { limiterDefinition } from './limiter';
import { multibandCompressorDefinition } from './multibandCompressor';
import { deEsserDefinition } from './deEsser';
import { deHummerDefinition } from './deHummer';
import { lowCutDefinition } from './lowCut';
import { reverbDefinition } from './reverb';
import { delayDefinition } from './delay';
import { pitchShifterDefinition } from './pitchShifter';
import { noiseReductionDefinition } from './noiseReduction';
import { gateDefinition } from './gate';
import { chorusFlangerDefinition } from './chorusFlanger';
import { stereoWidenerDefinition } from './stereoWidener';

export {
	gainTrimDefinition,
	parametricEqDefinition,
	compressorDefinition,
	limiterDefinition,
	multibandCompressorDefinition,
	deEsserDefinition,
	deHummerDefinition,
	lowCutDefinition,
	reverbDefinition,
	delayDefinition,
	pitchShifterDefinition,
	noiseReductionDefinition,
	gateDefinition,
	chorusFlangerDefinition,
	stereoWidenerDefinition
};

export const BUILTIN_AUDIO_EFFECTS: AudioEffectDefinition[] = [
	gainTrimDefinition,
	parametricEqDefinition,
	compressorDefinition,
	limiterDefinition,
	multibandCompressorDefinition,
	deEsserDefinition,
	deHummerDefinition,
	lowCutDefinition,
	reverbDefinition,
	delayDefinition,
	pitchShifterDefinition,
	noiseReductionDefinition,
	gateDefinition,
	chorusFlangerDefinition,
	stereoWidenerDefinition
];

// Ensure all built-in definitions are registered in the singleton audioEffectRegistry
for (const fx of BUILTIN_AUDIO_EFFECTS) {
	if (!audioEffectRegistry.get(fx.id)) {
		audioEffectRegistry.register(fx);
	}
}
