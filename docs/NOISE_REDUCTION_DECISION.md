# Noise Reduction Engine Decision Note

## Context & Requirements
A modern, privacy-first video editor requires robust noise reduction capable of attenuating stationary noise (air conditioner hum, room tone, hiss) and non-stationary noise (traffic, rustle) without degrading dialogue intelligibility. Processing must execute completely client-side in browser environments, comply with strict latency constraints, run allocation-free in realtime processing contexts, and operate under zero external network dependencies.

## Options Evaluated

### Option 1: RNNoise WASM Build
- **Mechanism**: Recurrent Neural Network (RNN / GRU) based on Valin (2018), trained on speech and noise features across 22 Bark-scale bands.
- **Pros**:
  - Superior non-stationary noise suppression (typing, outdoor wind gusts).
  - Low CPU usage for an ML-based approach.
- **Cons & Trade-offs**:
  - **Fixed 48 kHz / 480-sample frame constraint**: Requires real-time resampling and chunking if the AudioContext or project runs at 44.1 kHz or 96 kHz.
  - **Latency**: Fixed 10 ms (480 samples) algorithmic lookahead + internal recurrent delay (totaling ~20 ms), requiring automatic delay compensation (PDC).
  - **Asset Weight**: WASM binary + weights add ~120-180 kB to the bundle. Per project rules, ML/WASM assets must be lazily fetched on demand only when the user adds the effect or enables dialogue repair, never at application startup.
  - **Speech artifacts**: Can produce "robotic" phase artifacts or aggressive gating when SNR is very low.

### Option 2: In-House STFT Spectral Gate with Learned Noise Profile
- **Mechanism**: Frequency-domain Spectral Subtraction / Wiener Filtering using Short-Time Fourier Transform (STFT) with configurable window size (512 or 1024 samples), overlap-add synthesis (75% Hann window), dynamic noise estimation, and a "Learn Noise Profile" snapshot mode.
- **Pros**:
  - **Pure TypeScript / Zero Dependencies**: Operates with zero WASM bytes, zero external downloads, instant initialization in realtime AudioWorklet and main-thread OfflineAudioContext.
  - **Arbitrary Sample Rates**: Directly handles 44.1 kHz, 48 kHz, 96 kHz without resampling overhead or drift.
  - **Preserves Natural Ambience**: Smooth spectral floor, adjustable reduction amount (dB), attack/release smoothing across frequency bins, and musical noise reduction via psychoacoustic threshold smoothing.
  - **Predictable Latency**: Exactly 1 frame window latency (512 or 1024 samples), perfectly reported to the PDC engine.
  - **Offline/Export Determinism**: Bit-identical processing in both preview and offline export rendering.

## Architecture Decision
1. **Primary Default Engine**: Implement the **Spectral Subtraction / STFT Gate** in pure TypeScript (`core/audio/dsp/spectralGate.ts` and effect `noiseReduction.ts`). This provides instantaneous, zero-latency-loading, zero-risk noise removal with a "Learn Noise Profile" toggle and adjustable reduction threshold/amount.
2. **Extensibility**: Design the effect contract so that an optional high-performance RNNoise WASM neural model can be loaded lazily on demand when the user toggles "Neural / AI Model" mode, without introducing startup overhead or blocking the offline render pipeline.

