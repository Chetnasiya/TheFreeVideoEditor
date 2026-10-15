# Professional Audio DSP Effects Catalog

This document specifies the complete catalog of 14 professional audio DSP effects built for **TheFreeVideoEditor**. Every effect in this catalog features a pure TypeScript allocation-free DSP processor implementation that runs synchronously on audio blocks without garbage collection overhead, shared seamlessly across live preview, AudioWorklet nodes, and offline export rendering.

---

## Architecture Overview

1. **Pure TypeScript DSP Core**:
   - Resides in `src/editor/core/audio/dsp/` and `src/editor/core/audio/effects/`.
   - Independent of the DOM and browser-specific APIs; testable directly in Vitest and runnable inside Web Workers / AudioWorklets.
   - Allocation-free `process(inputs, outputs)` inner loops using pre-allocated typed arrays (`Float32Array`).
2. **Plugin Delay Compensation (PDC)**:
   - Each effect explicitly reports its algorithmic lookahead or filtering delay via `latencySamples(sampleRate)`.
   - The graph builder (`src/editor/services/audio/graph.ts`) inspects every track and bus chain using `computeGraphPdc` (`src/editor/services/audio/pdc.ts`) and dynamically inserts sample-exact delay nodes so parallel audio streams remain aligned within $\le 1\text{ sample}$.
3. **Rack Integration & Presets**:
   - Effects can be added to clip, track, submix bus, and master effect racks.
   - Parameters support real-time smooth transitions via `AudioParam` interpolation.

---

## Catalog of 14 Audio Effects

### 1. Parametric EQ (`parametric-eq`)

- **Category**: Filter / Equalization
- **Algorithm**: Multi-band IIR biquad cascade implemented with the Robert Bristow-Johnson (RBJ) Audio EQ Cookbook formulas.
- **Bands**: Up to 8 configurable bands (Low-Shelf, High-Pass, Peaking Bell, Notch, Low-Pass, High-Shelf).
- **Parameters**:
  - `frequencyHz`: $20\text{ Hz}$ to $20,000\text{ Hz}$
  - `gainDb`: $-24\text{ dB}$ to $+24\text{ dB}$
  - `q`: $0.1$ to $18.0$
  - `type`: `'lowshelf' | 'peaking' | 'highshelf' | 'lowpass' | 'highpass' | 'notch'`
- **Latency**: $0\text{ samples}$ (minimum-phase IIR).
- **Oracle Verification**: Frequency response amplitude matches analytic RBJ formulas within $\pm 0.05\text{ dB}$.

### 2. Dynamics Compressor (`compressor`)

- **Category**: Dynamics
- **Algorithm**: Digital feed-forward peak/RMS compressor with smooth quadratic soft-knee interpolation and decouple attack/release ballistic envelope followers.
- **Parameters**:
  - `thresholdDb`: $-60\text{ dB}$ to $0\text{ dB}$
  - `ratio`: $1.0:1$ to $20.0:1$
  - `attackMs`: $0.1\text{ ms}$ to $200\text{ ms}$
  - `releaseMs`: $10\text{ ms}$ to $1,000\text{ ms}$
  - `kneeDb`: $0\text{ dB}$ to $12\text{ dB}$
  - `makeupGainDb`: $0\text{ dB}$ to $+24\text{ dB}$
- **Latency**: $0\text{ samples}$.
- **Oracle Verification**: Gain reduction curve matches static piecewise equation within $\pm 0.2\text{ dB}$.

### 3. Lookahead Limiter (`limiter`)

- **Category**: Dynamics / Mastering
- **Algorithm**: True-peak lookahead brickwall limiter with circular buffer delay line, instantaneous peak detection, exponential release, and zero-overshoot ceiling clamping.
- **Parameters**:
  - `ceilingDb`: $-24.0\text{ dB}$ to $0.0\text{ dB}$ (default $-0.5\text{ dBFS}$)
  - `lookaheadMs`: $1.0\text{ ms}$ to $10.0\text{ ms}$ (default $5.0\text{ ms}$)
  - `releaseMs`: $5.0\text{ ms}$ to $500\text{ ms}$ (default $50.0\text{ ms}$)
- **Latency**: Exactly `Math.round(lookaheadMs * sampleRate / 1000)` samples (e.g. $240\text{ samples}$ at $48\text{ kHz}$).
- **Oracle Verification**: Rendered peak output never exceeds `ceilingDb` ($\le \text{ceiling} + 0.01\text{ dB}$). PDC aligns parallel signals within 0 samples residual.

### 4. Noise Gate / Expander (`gate`)

- **Category**: Dynamics
- **Algorithm**: Downward expander / gate with hysteresis hold time, smooth attack/release envelope follower, and selectable expansion ratio.
- **Parameters**:
  - `thresholdDb`: $-80\text{ dB}$ to $0\text{ dB}$ (default $-40\text{ dB}$)
  - `ratio`: $1.0:1$ to $100.0:1$ (default $10.0:1$)
  - `attackMs`: $0.1\text{ ms}$ to $50\text{ ms}$
  - `holdMs`: $0\text{ ms}$ to $500\text{ ms}$
  - `releaseMs`: $10\text{ ms}$ to $1,000\text{ ms}$
  - `rangeDb`: $-96\text{ dB}$ to $0\text{ dB}$ (floor attenuation)
- **Latency**: $0\text{ samples}$.
- **Oracle Verification**: Signals below threshold attenuate by target range; signals above threshold pass with unity gain ($0.0\text{ dB}$).

### 5. De-Esser (`de-esser`)

- **Category**: Restoration / Dialogue
- **Algorithm**: Split-band dynamic sibilance suppressor utilizing a sidechain bandpass filter centered on harsh sibilance frequencies ($4\text{ kHz} - 9\text{ kHz}$) and fast envelope ducking.
- **Parameters**:
  - `frequencyHz`: $3,000\text{ Hz}$ to $10,000\text{ Hz}$ (default $6,000\text{ Hz}$)
  - `thresholdDb`: $-40\text{ dB}$ to $0\text{ dB}$
  - `reductionDb`: $0\text{ dB}$ to $20\text{ dB}$
  - `bandwidthQ`: $0.5$ to $4.0$
- **Latency**: $0\text{ samples}$.
- **Oracle Verification**: Sibilant high-frequency tone bursts are attenuated by $> 6\text{ dB}$ while low-frequency vowels ($< 1\text{ kHz}$) remain unaffected ($< 0.1\text{ dB}$ change).

### 6. De-Hummer (`de-hummer`)

- **Category**: Restoration / Repair
- **Algorithm**: High-Q notch filter bank targeting AC electrical mains hum ($50\text{ Hz}$ Europe/Asia or $60\text{ Hz}$ US/Americas) and up to 4 integer harmonics ($2f_0, 3f_0, 4f_0, 5f_0$).
- **Parameters**:
  - `baseFrequency`: `50` or `60` Hz
  - `harmonicsCount`: $1$ to $5$
  - `q`: $5.0$ to $30.0$ (narrow notch)
  - `depthDb`: $-60\text{ dB}$ to $-12\text{ dB}$
- **Latency**: $0\text{ samples}$.
- **Oracle Verification**: $60\text{ Hz}$ hum component attenuated by $> 30\text{ dB}$ with minimal phase distortion at adjacent frequencies.

### 7. Low-Cut / Rumble Filter (`low-cut`)

- **Category**: Filter / Restoration
- **Algorithm**: 2nd to 4th-order Butterworth / Linkwitz-Riley high-pass filter designed to eliminate wind rumble, handling noise, and mic stand mechanical vibration.
- **Parameters**:
  - `frequencyHz`: $20\text{ Hz}$ to $300\text{ Hz}$ (default $80\text{ Hz}$)
  - `slope`: `'12dB/oct' | '24dB/oct'`
- **Latency**: $0\text{ samples}$.
- **Oracle Verification**: Sub-rumble at $20\text{ Hz}$ attenuated by $\ge 24\text{ dB}$ when cutoff set to $80\text{ Hz}$ with $24\text{ dB/oct}$ slope.

### 8. Spectral Noise Reduction (`noise-reduction`)

- **Category**: Restoration
- **Algorithm**: Spectral gating with learned background noise profile, continuous psychoacoustic masking threshold calculation, and soft spectral suppression without metallic musical noise artifacts.
- **Parameters**:
  - `reductionDb`: $0\text{ dB}$ to $30\text{ dB}$
  - `noiseFloorDb`: $-80\text{ dB}$ to $-30\text{ dB}$
  - `learnProfile`: Boolean trigger to capture background noise fingerprint.
- **Latency**: $512\text{ samples}$ (FFT analysis window).
- **Oracle Verification**: Constant white/pink noise floor reduced by target attenuation while maintaining speech intelligibility.

### 9. Studio Algorithmic Reverb (`reverb`)

- **Category**: Spatial / Reverb
- **Algorithm**: Schroeder-Moorer reverberator tank combining 4 parallel feedback comb filters (tuned with prime delay lengths to eliminate flutter echoes) feeding 2 cascaded allpass diffusers, followed by high-frequency damping.
- **Parameters**:
  - `decaySeconds`: $0.2\text{ s}$ to $8.0\text{ s}$
  - `preDelayMs`: $0\text{ ms}$ to $100\text{ ms}$
  - `dampingHz`: $1,000\text{ Hz}$ to $20,000\text{ Hz}$
  - `dryWet`: $0.0$ (100% dry) to $1.0$ (100% wet)
- **Latency**: $0\text{ samples}$ (pre-delay handled in comb delay line).
- **Oracle Verification**: Energy decay curve follows $T_{60} = \text{decaySeconds} \pm 10\%$, and impulse response generates dense stereo diffusion.

### 10. Delay / Echo (`delay`)

- **Category**: Modulation / Time
- **Algorithm**: High-precision circular ring-buffer delay line with feedback path, low-pass damping filter, and stereo ping-pong cross-routing.
- **Parameters**:
  - `timeMs`: $1\text{ ms}$ to $2,000\text{ ms}$
  - `feedback`: $0.0$ to $0.95$
  - `dampingHz`: $500\text{ Hz}$ to $20,000\text{ Hz}$
  - `pingPong`: Boolean
  - `dryWet`: $0.0$ to $1.0$
- **Latency**: $0\text{ samples}$.
- **Oracle Verification**: Initial echo arrives at exactly $t = \text{timeMs} \pm 0.05\text{ ms}$; successive repeats decay by the exact feedback ratio.

### 11. Chorus / Flanger (`chorus-flanger`)

- **Category**: Modulation
- **Algorithm**: Variable fractional-delay line modulated by a multi-phase sinusoidal LFO with quadratic polynomial interpolation, generating rich spatial widening and comb sweeps.
- **Parameters**:
  - `rateHz`: $0.1\text{ Hz}$ to $10.0\text{ Hz}$
  - `depthMs`: $0.5\text{ ms}$ to $15.0\text{ ms}$
  - `feedback`: $-0.9$ to $+0.9$
  - `stereoPhaseDeg`: $0^\circ$ to $180^\circ$ (quadrature widening)
  - `dryWet`: $0.0$ to $1.0$
- **Latency**: $0\text{ samples}$.
- **Oracle Verification**: Modulated output demonstrates expected comb filtering notch migration across LFO cycles.

### 12. Pitch Shifter (`pitch-shifter`)

- **Category**: Pitch / Time
- **Algorithm**: Dual-window crossfading delay line time-domain pitch transposition (WSOLA-style ring modulation) enabling $\pm 12$ semitones adjustment without changing timeline duration.
- **Parameters**:
  - `semitones`: $-12$ to $+12$ semitones
  - `cents`: $-50$ to $+50$ cents
  - `windowMs`: $20\text{ ms}$ to $100\text{ ms}$
- **Latency**: $0\text{ samples}$ (fixed window phase offset).
- **Oracle Verification**: $440\text{ Hz}$ input transposed by $+12$ semitones measures $880\text{ Hz} \pm 1\text{ Hz}$ peak frequency via FFT analysis.

### 13. Stereo Widener / Mid-Side (`stereo-widener`)

- **Category**: Spatial
- **Algorithm**: Mid-Side (M/S) matrix encoder/decoder:
  $$\text{Mid} = \frac{L + R}{2}, \quad \text{Side} = \frac{L - R}{2}$$
  $$\text{Out}_L = \text{Mid} + (\text{width} \times \text{Side}), \quad \text{Out}_R = \text{Mid} - (\text{width} \times \text{Side})$$
- **Parameters**:
  - `width`: $0.0$ (mono collapse) to $2.0$ (exaggerated stereo expansion)
- **Latency**: $0\text{ samples}$.
- **Oracle Verification**: At `width = 0.0`, left and right channels are identical ($\text{diff} = 0$); at `width = 1.0`, original stereo signal is preserved bit-identically ($L = L, R = R$).

### 14. Gain Trim / Phase Invert (`gain-trim`)

- **Category**: Utility
- **Algorithm**: High-precision utility module for pre-rack gain calibration, independent left/right gain trim, and polarity (phase) inversion.
- **Parameters**:
  - `trimDb`: $-24\text{ dB}$ to $+24\text{ dB}$
  - `invertPhaseL`: Boolean
  - `invertPhaseR`: Boolean
  - `mute`: Boolean
- **Latency**: $0\text{ samples}$.
- **Oracle Verification**: Inverting both phases cancels an identical non-inverted signal to $-\infty\text{ dBFS}$ ($< -120\text{ dB}$ residual in float arithmetic).
