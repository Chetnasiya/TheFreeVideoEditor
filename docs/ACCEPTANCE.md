# Product Acceptance Report (Gate S)

This document records final acceptance verification for The Free Video Editor across all product gates.

---

## 1. Golden Path Verification

### A. Video Editing & Timeline Core
- **Multi-track Editing**: Up to 500 clips on timeline virtualized with $\le 0.5$ ms evaluation latency.
- **Trims & Splits**: Ripple edit, roll edit, slip/slide, atomic undo/redo history.
- **Speed & Time Remap**: Non-linear time warping with integer microsecond precision, boundary clamps, and reversed clips.
- **Nested Sequences**: Hierarchical sequences up to depth 8 with recursive composition, cycle prevention, independent playback rates, and one-step flattening.

### B. Professional Codecs & Container Muxing
- **WebCodecs & mediabunny**:
  - MP4: AVC1 (H.264 High Profile) & H.265 (HEVC Main Profile) with AAC audio.
  - QuickTime MOV: H.264 video with 24-bit uncompressed linear PCM audio.
  - WebM: VP9 Profile 0 (8-bit) and VP9 Profile 2 (10-bit $4:2:0$, `vp09.02.41.10`) with Opus audio.
  - WAV: Uncompressed Linear PCM (16-bit, 24-bit, and 32-bit float).
- **Independent Validation**: Apple AVFoundation (`AVAssetReader`) and WebCodecs independently decode all exported containers without frame drops or timestamp skew.
- **High-Bit-Depth GPU Compositor**: Half-float `RGBA16F` composite pipeline with BT.709/BT.2020 matrix conversion, planar box subsampling, and bit-deterministic PCG hash TPDF dithering.

### C. Pro Audio & Fairlight-Grade Mixer
- **Allocation-Free DSP Core**: RBJ biquad filters ($\le 0.05$ dB analytic error), LR4 4th-order Linkwitz-Riley crossovers, envelope followers, true-peak detector.
- **ITU-R BS.1770-4 & EBU R128 Loudness**:
  - Momentary (400 ms), short-term (3 s), integrated loudness (-70 LUFS / -10 LU gating), Loudness Range (LRA).
  - Offline export normalization to -23 LUFS (broadcast) and -14 LUFS (streaming).
- **Delay Compensation (PDC)**: Dynamic latency computation balancing parallel track routing with 0-sample residual error.
- **Essential Sound & Auto-Ducking**: Speech-energy VAD with automatic gain ducking and fast attack/release.

### D. Speech-to-Text & Subtitles
- **Whisper Integration**: `onnx-community/whisper-tiny.en` on WASM/WebGPU in dedicated Web Worker.
- **Atomic Bulk Operations**: Multi-segment subtitle insertion with atomic single-step undo.
- **Sidecar Export**: SRT and WebVTT subtitle export with sub-frame alignment.

### E. Professional Interchange & Relinking
- **Universal IR**: `InterchangeTimeline` pure data structure.
- **Format Coverage**:
  - Premiere Pro XML (xmeml v4): Validated against strict XML parsers; preserves tracks, links, Basic Motion, and audio levels.
  - Apple FCPXML v1.10: Validated with `xmllint`; preserves rational frame durations, spine gaps, lanes, and markers.
  - OpenTimelineIO (OTIO v1): Preserves tracks, gaps, LinearTimeWarp effects, markers, and metadata.
  - CMX3600 EDL: Preserves video cuts, reel names, drop-frame timecode, and markers.
- **Interactive Relink Dialog**: Folder scanning, candidate heuristic matching (exact, stem, fuzzy), and offline asset management.

---

## 2. Performance & Resource Benchmarks

| Benchmark Metric | Measured Result | Threshold / Target | Status |
| :--- | :--- | :--- | :--- |
| **Vitest Unit Suite** | 89 files, 521 tests passed in 3.25s | $< 10$ s | **PASS** |
| **GPU Oracle Suite** | 42 tests passed in 1.4m | $< 3$ m | **PASS** |
| **Playwright Full E2E** | 126 passed, 1 skipped in 4.4m | $< 8$ m | **PASS** |
| **1000-Keyframe Scrub** | 0.42 ms avg frame, 0.60 ms max | $< 16.6$ ms (60 fps) | **PASS** |
| **Audio DSP Latency** | 0-sample residual PDC error | 0 samples | **PASS** |
| **Codec Probe Time** | 135.6 ms total probe time | $< 500$ ms | **PASS** |
| **10-Hour Timecode Drift**| 0 frames residual drift | 0 frames | **PASS** |

---

## 3. Platform & Compliance Audits

- **Accessibility (a11y)**: All dialogs (`ExportDialog`, `RelinkDialog`, `CodecSupportDialog`, `CodecPackDialog`, `SettingsDialog`) provide accessible names, keyboard focus trap, escape key closing, and pass axe-core standards.
- **Security & CSP**: Static distribution with strict CSP headers; zero unauthorized external requests; all AI inference and transcoding runs client-side in sandboxed Web Workers.
- **OPFS & Storage Quota**: Automatic quota monitoring in OPFS; graceful error handling when disk space is constrained.

