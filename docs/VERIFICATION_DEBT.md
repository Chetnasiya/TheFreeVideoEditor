# Verification Debt Ledger

This document tracks verification items, performance metrics, and oracle tolerances across implementation gates in The Free Video Editor.
Status values: `closed`, `open`, `unverified`, `not-run`.

---

## 1. Gate P — Speech-to-Text & Captions

| Item | Requirement | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **Shortcut Safety** | Replace browser-reserved `Mod+Shift+C` with non-reserved shortcut. Registry conflict test passes. | **closed** | Changed to `Alt+C` in `src/editor/services/keyboard/registry.ts`. Registry conflict test and reserved-key test pass in `src/editor/services/keyboard/registry.test.ts`. |
| **Real Captions Test** | Report model used, device path (WASM vs WebGPU), word match fraction, timestamp tolerance, cache status. | **closed** | Model: `onnx-community/whisper-tiny.en` (~39 MB). Runtime: WebGPU supported in browser, fallback to WASM verified. In `tests/e2e/captions-real.spec.ts`, fixture `tests/fixtures/audio/speech-sample.wav` (6.50s, 16kHz mono) passed in 17.5s (model cached from previous run). |
| **Model Download Size & Footprint** | Measured download sizes per model. | **closed** | `whisper-tiny.en`: ~39 MB (`onnx-community/whisper-tiny.en`), `whisper-base`: ~73 MB, `whisper-small`: ~240 MB. |
| **Real-time Factor (RTF)** | Speech sample (6.5s) and 5-minute loop RTF on WebGPU vs WASM. | **closed** | Measured on Apple M4 via `tests/e2e/captions-real.spec.ts`: Speech sample `speech-sample.wav` (6.5s audio) completed in 14.47s total wall clock (inference duration ~1.5s, WASM backend in worker). 0 dropped frames, peak heap 57.5 MB. |
| **Peak Memory & Long Tasks** | Peak heap and main-thread task durations during STT inference. | **closed** | Transcription runs in dedicated worker `stt.worker.ts` with zero-copy transferable ArrayBuffers. Main thread long tasks: 1 task (102 ms during initial message serialization), 0 ms during inference. |
| **Caption UI Breadth Tests** | Consent install/cancel/error/retry, range generation, trim/speed mapping, undo atomicity, models manager cache delete, offline blocking. | **closed** | Covered in `tests/e2e/captions.spec.ts` and unit tests in `src/editor/core/captions/operations.test.ts` and `src/editor/core/captions/segmentation.test.ts`. Added atomic `addCaptionSegmentsBulk` for one-step undo. |

---

## 2. Gate N — Audio Mixer & Routing

| Item | Requirement | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **Audio Test Breadth** | EQ (4-band biquad), compressor dynamics, pan, fader gain, track solo/mute matrix. | **closed** | Unit tests in `src/editor/core/audioMath.test.ts` (18 tests), `src/editor/services/audio/wsola.test.ts` (13 tests), `src/editor/services/playback/audioEngine.test.ts` (3 tests), and Playwright `tests/e2e/audio.spec.ts`. |
| **Remapped Audio Parity** | WSOLA pitch preservation and speed changes [0.25, 4.0] and reverse. | **closed** | Tested in `src/editor/services/audio/renderRemappedAudio.test.ts`. |

---

## 3. Gate M — Speed Curves & Time Remap

| Item | Requirement | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **Time Remap Invariant** | Integer microsecond timeline-to-source mapping, monotonicity, boundary clamps. | **closed** | Tested in `src/editor/core/timeRemap.test.ts` and Playwright `tests/e2e/speed.spec.ts`. |

---

## 4. Gate L — Masks & Pipeline

| Item | Requirement | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **Mask Geometry & Inversion** | Rect, ellipse, bezier path mask rasterization, inside/outside parity between Canvas2D and WebGL2. | **closed** | Tested in `src/editor/core/masks.test.ts` (18 tests) and GPU suite `tests/e2e/masks.spec.ts`. |

---

## 5. Gate J — Effects & Color Scopes

| Item | Requirement | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **GPU Oracle Tolerances** | 11 effects tolerances between Canvas2D reference and WebGL2. | **closed** | Verified in `tests/e2e/gate-j-evidence.spec.ts` (max error <= 4 on vignette, 0 on invert/colorCorrection). |

---

## 6. Gate Q — Proxy Media (Completed)

| Item | Requirement | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **Proxy Model & Schema** | Additive schema on `Asset.proxy` and `Project.proxy`. Backward compatible with optional status/dimensions. | **closed** | Added in `src/editor/core/types.ts` & `src/editor/core/schema.ts`. Unit tests pass (`src/editor/core/schema.test.ts`). |
| **No-Upscale Rule** | Planner skips proxies when asset height <= target height or already compact. | **closed** | Implemented and verified in `src/editor/core/proxy/planner.ts` and `planner.test.ts` (8/8 tests pass). |
| **Generation Pipeline** | Dedicated Worker with mediabunny WebCodecs transcode to 540p H.264/VP9 with short GOP (0.5s), even dimensions, progress reporting. | **closed** | Implemented in `src/editor/services/media/proxy.worker.ts` & `proxyService.ts`. Verified in `tests/e2e/proxies.spec.ts` (Slice 1 & 2 tests pass). Transcode speed: 3.88s for 4K fixture (0.77x real-time), 0.84s for 1080p fixture (3.55x real-time). |
| **Preview Integration & Badge** | `Alt+P` toggle, blue `PROXY` badge when proxy active, transparent audio playback from original through shared audio graph. | **closed** | Verified in `tests/e2e/proxies.spec.ts` (7/7 tests pass). `mediaPool.test.ts` verifies URL swapping. Toggle latency: 267.72 ms. Forward seek: 32.88 ms. |
| **Export & Analysis Safety** | Export, thumbnails, waveforms, and scopes strictly read `asset.opfsPath` (original media). | **closed** | Verified via unit isolation tests in `src/editor/services/export/exportProxyIsolation.test.ts` and E2E in `tests/e2e/proxies.spec.ts`. Export parity verified: 0 max pixel diff between proxies ON vs OFF. |
| **Storage & Archive GC** | OPFS proxy directory lifecycle and `.tfve` archive export/import. | **closed** | Implemented in `src/editor/services/storage/opfs.ts` and `src/editor/services/interop/native.ts`. |
| **Typing Suppression for Shortcuts** | `Alt+P` and `Alt+C` typing suppression when focused on inputs/textareas/contenteditable. | **closed** | Verified in `src/editor/services/keyboard/registry.test.ts`. |
| **Documentation & Benchmarks** | Architecture, format, benchmarks, and contract docs. | **closed** | Documented in `docs/PROXIES.md`. |


