export interface MeterLevels {
	peakDbL: number;
	peakDbR: number;
	rmsDbL: number;
	rmsDbR: number;
	clippedL: boolean;
	clippedR: boolean;
}

export class AudioMeterFollower {
	private peakL = 0;
	private peakR = 0;
	private rmsL = 0;
	private rmsR = 0;
	private clippedL = false;
	private clippedR = false;

	// Ballistics decay (approx 20 dB / sec at 60 fps)
	private readonly decayFactor = 0.95;

	update(raw: { peakL: number; peakR: number; rmsL: number; rmsR: number }): MeterLevels {
		// Instant attack, decaying release
		this.peakL = Math.max(raw.peakL, this.peakL * this.decayFactor);
		this.peakR = Math.max(raw.peakR, this.peakR * this.decayFactor);
		this.rmsL = Math.max(raw.rmsL, this.rmsL * this.decayFactor);
		this.rmsR = Math.max(raw.rmsR, this.rmsR * this.decayFactor);

		// Latching clip indicator (>= 0 dBFS / raw >= 1.0)
		if (raw.peakL >= 0.999) this.clippedL = true;
		if (raw.peakR >= 0.999) this.clippedR = true;

		const toDb = (val: number) => (val > 0.0000158489 ? 20 * Math.log10(val) : -96);

		return {
			peakDbL: Math.max(-96, Math.min(6, toDb(this.peakL))),
			peakDbR: Math.max(-96, Math.min(6, toDb(this.peakR))),
			rmsDbL: Math.max(-96, Math.min(6, toDb(this.rmsL))),
			rmsDbR: Math.max(-96, Math.min(6, toDb(this.rmsR))),
			clippedL: this.clippedL,
			clippedR: this.clippedR
		};
	}

	resetClip(): void {
		this.clippedL = false;
		this.clippedR = false;
	}
}
