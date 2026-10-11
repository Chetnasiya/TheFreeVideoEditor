import { DelayLine } from './delayLine';

/**
 * Single Feedback Comb Filter for Schroeder/Freeverb reverberator
 */
class CombFilter {
	private readonly delay: DelayLine;
	private readonly delaySamples: number;
	private filterStore = 0;
	private damp = 0.2;
	private feedback = 0.8;

	constructor(delaySamples: number) {
		this.delaySamples = delaySamples;
		this.delay = new DelayLine(delaySamples + 10);
	}

	public setDamp(damp: number): void {
		this.damp = damp;
	}

	public setFeedback(fb: number): void {
		this.feedback = fb;
	}

	public reset(): void {
		this.delay.reset();
		this.filterStore = 0;
	}

	public processSample(input: number): number {
		const output = this.delay.read(this.delaySamples);
		this.filterStore = output * (1 - this.damp) + this.filterStore * this.damp;
		this.delay.write(input + this.filterStore * this.feedback);
		return output;
	}
}

/**
 * All-pass filter for diffuse reflection in reverberator
 */
class AllpassFilter {
	private readonly delay: DelayLine;
	private readonly delaySamples: number;
	private feedback = 0.5;

	constructor(delaySamples: number) {
		this.delaySamples = delaySamples;
		this.delay = new DelayLine(delaySamples + 10);
	}

	public reset(): void {
		this.delay.reset();
	}

	public processSample(input: number): number {
		const buf = this.delay.read(this.delaySamples);
		const output = -input + buf;
		this.delay.write(input + buf * this.feedback);
		return output;
	}
}

/**
 * Feedback Delay Network / Freeverb Algorithmic Reverb Core
 * Uses 8 parallel low-pass comb filters followed by 4 cascaded all-pass filters.
 */
export class ReverbCore {
	private readonly combsL: CombFilter[] = [];
	private readonly combsR: CombFilter[] = [];
	private readonly allpassesL: AllpassFilter[] = [];
	private readonly allpassesR: AllpassFilter[] = [];

	private roomSize = 0.7;
	private damp = 0.2;
	private width = 1.0;

	constructor(sampleRate: number) {
		// Tuned prime delay lengths scaled to 44.1k/48k
		const scale = sampleRate / 44100;
		const combTunings = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
		const allpassTunings = [556, 441, 341, 225];
		const stereoSpread = 23;

		for (let i = 0; i < 8; i++) {
			const lenL = Math.round(combTunings[i]! * scale);
			const lenR = Math.round((combTunings[i]! + stereoSpread) * scale);
			this.combsL.push(new CombFilter(lenL));
			this.combsR.push(new CombFilter(lenR));
		}

		for (let i = 0; i < 4; i++) {
			const lenL = Math.round(allpassTunings[i]! * scale);
			const lenR = Math.round((allpassTunings[i]! + stereoSpread) * scale);
			this.allpassesL.push(new AllpassFilter(lenL));
			this.allpassesR.push(new AllpassFilter(lenR));
		}

		this.updateParameters();
	}

	public setParameters(roomSize: number, damp: number, width: number): void {
		this.roomSize = Math.max(0, Math.min(0.98, roomSize));
		this.damp = Math.max(0, Math.min(1, damp));
		this.width = Math.max(0, Math.min(1, width));
		this.updateParameters();
	}

	private updateParameters(): void {
		const fb = this.roomSize * 0.28 + 0.7;
		for (let i = 0; i < 8; i++) {
			this.combsL[i]!.setFeedback(fb);
			this.combsL[i]!.setDamp(this.damp);
			this.combsR[i]!.setFeedback(fb);
			this.combsR[i]!.setDamp(this.damp);
		}
	}

	public reset(): void {
		for (let i = 0; i < 8; i++) {
			this.combsL[i]!.reset();
			this.combsR[i]!.reset();
		}
		for (let i = 0; i < 4; i++) {
			this.allpassesL[i]!.reset();
			this.allpassesR[i]!.reset();
		}
	}

	public processStereo(inL: number, inR: number): { outL: number; outR: number } {
		const monoIn = (inL + inR) * 0.015;

		let outL = 0;
		let outR = 0;

		for (let i = 0; i < 8; i++) {
			outL += this.combsL[i]!.processSample(monoIn);
			outR += this.combsR[i]!.processSample(monoIn);
		}

		for (let i = 0; i < 4; i++) {
			outL = this.allpassesL[i]!.processSample(outL);
			outR = this.allpassesR[i]!.processSample(outR);
		}

		// Spatial width mix
		const wet1 = this.width * 0.5 + 0.5;
		const wet2 = (1 - this.width) * 0.5;

		return {
			outL: outL * wet1 + outR * wet2,
			outR: outR * wet1 + outL * wet2
		};
	}
}
