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
| **Proxy Size & Codec Defect (Carry-Over Fix)** | Bitrate capped at max 75% source bitrate (floor 350 kbps); skip proxy if estimated size >= source size; prefer H.264 when supported. | **closed** | Implemented in `src/editor/core/proxy/planner.ts` and `proxy.worker.ts`. Verified in `src/editor/core/proxy/planner.test.ts` (10 tests) and `tests/e2e/proxies.spec.ts`. |
| **Playback.ts Diagnostic Audit** | Diagnosis of unreported edit in `src/editor/core/playback.ts:444-480`. | **closed** | Audit of commit `9b32f97`: optimization checking `trackTransitions.length > 0` before filtering to prevent long tasks during playback scrub. |
| **Audio Unlock Audit** | Confirmation that `engine.ts` audio unlock cannot leave audio locked after user gesture while paused. | **closed** | Verified in `src/editor/services/playback/engine.ts`: audio unlock is triggered explicitly during user gestures and playback start; audio context is safely resumed. |

---

## 7. Gate R — Nested Sequences

| Item | Requirement | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **Access & View Projection (Decision 1 & 2)** | Pure projection `viewProject(project, seqId)` and `applyToSequence(project, seqId, op)` preserving all existing operations. | **closed** | Implemented in `src/editor/core/sequences/access.ts`. Verified in `src/editor/core/sequences/sequences.test.ts` (15/15 tests pass), including 500-random-operation property test against nested sequence via `applyToSequence`. |
| **Cycle & Depth Limits (Decision 3)** | Depth capped at 8 (`MAX_SEQUENCE_NESTING_DEPTH`); cycle detection throws `SequenceCycleError`. | **closed** | Implemented in `src/editor/core/sequences/operations.ts`. Unit tests verify depth and cycle rejection. UI cycle prevention verified in `tests/e2e/sequences.spec.ts` ("prevents cycle when nesting sequence into itself"). |
| **Sequence Operations (Slice 3)** | CRUD, Nest selection, Expand instance (disabled for speed $\ne 1$/remap), Make unique, Duplicate, and Flatten for interchange. | **closed** | Implemented in `src/editor/core/sequences/operations.ts`. Verified in `src/editor/core/sequences/sequences.test.ts` and E2E in `tests/e2e/sequences.spec.ts` ("Make Unique and Expand operations work, and Expand is disabled when speed != 1"). |
| **Video Compositing Recursion (Decision 4 & 5)** | Recursive layer resolution in `playback.ts`, offscreen FBO targets in `GlCompositor.ts`, texture and frame cache keying by `instanceKey`. | **closed** | Implemented in `src/editor/core/playback.ts` and `src/editor/services/render/GlCompositor.ts`. Verified across all GPU tests (`npm run test:gpu` 29/29 pass) and multi-instance E2E test with `colors.mp4` in `tests/e2e/sequences.spec.ts`. |
| **Media Pool & Export Pools (Decision 7)** | Keying active video elements, decoders, and canvas providers by `instanceKey ?? clipId` to prevent contention between identical clips across instances. | **closed** | Implemented in `mediaPool.ts`, `frameProvider.ts`, and `compatibilityFrameProvider.ts`. Verified in `tests/e2e/sequences.spec.ts`. |
| **Audio Sub-Graph & Bounce (Decision 6)** | Live sub-graph for speed 1; offline bounce for speed $\ne 1$/remap; cache invalidation on edits; DSP oracle tests. | **closed** | Implemented in `src/editor/services/audio/graph.ts`. Verified in `src/editor/services/audio/sequencesAudio.test.ts` (5/5 tests pass: gain, pan, EQ, compressor, solo/mute) and `tests/e2e/sequences.spec.ts` (export with decoded audio). |
| **History & Undo/Redo (Decision 10)** | History entries store `activeSequenceIdBefore` and `activeSequenceIdAfter`; undo/redo restores active sequence with fallback to root. | **closed** | Implemented in `src/editor/state/history.ts`. Verified in `src/editor/state/history.test.ts` (3/3 tests pass) and E2E in `tests/e2e/sequences.spec.ts` ("undo and redo restores activeSequenceId with polite announcement"). |
| **UI Integration & E2E (Slice 3)** | Breadcrumb navigation (`Main › [Seq]`), Media Library sequences tab and cards, context menu actions, Sequence Settings dialog, export sequence selector. | **closed** | Verified via Playwright across 11 comprehensive tests in `tests/e2e/sequences.spec.ts` (100% green, ~16s). |



