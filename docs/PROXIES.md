# Proxy Media Architecture & Implementation

## 1. Overview and Purpose

Proxies in The Free Video Editor provide smooth preview playback, responsive scrubbing, and rapid timeline navigation for heavy high-resolution video media (e.g. 4K/UHD, high-bitrate footage, 60fps+ sources) while preserving original media fidelity for all export and analytical workflows.

### Core Contracts & Invariants

1. **Strictly Non-Destructive & Regenerable Cache**:
   - A proxy is a transient performance cache. Deleting all proxies never affects the project contents, sequence arrangement, cuts, effects, or export output.
   - Deleting an asset removes its proxy from OPFS.
   - Media GC cleans up unreferenced proxy files in `projects/<projectId>/proxies/`.

2. **Original Media Exclusivity**:
   - **Export** (`ExportFrameProvider`, `CompatibilityFrameProvider`, `audioMix`, `fallbackRecorder`): always reads original media via `getMediaFile(projectId, asset)` and never accesses proxy files.
   - **Thumbnails of Record & Poster Frames**: generated from original media.
   - **Waveform Peaks & Audio Analysis**: computed from original media audio streams.
   - **Scopes & Color Reference**: evaluate frames rendered from the canonical source.

3. **Video-Only Proxies & Shared Audio Graph**:
   - Proxies contain video streams only (audio track discarded during transcoding).
   - Preview audio is routed through the central shared Web Audio graph (`services/audio/graph.ts` and `AudioDecodeCache`) from the original file, completely independent of whether the video monitor element is rendering the original or the proxy video stream.

4. **Frame-Accurate 1:1 Mapping**:
   - Proxies maintain the exact aspect ratio and frame rate of the original source.
   - Dimensions are strictly even (e.g. 960×540 for 16:9, 540×540 for 1:1).
   - GOP is short (~0.5 seconds keyframe interval) to ensure instantaneous seek and scrub response.

---

## 2. Data Model & Schema

### Asset Proxy State (`Asset.proxy`)
Extended in `src/editor/core/types.ts` and validated via `src/editor/core/schema.ts`:

```ts
export type ProxyStatus = 'none' | 'queued' | 'working' | 'ready' | 'failed' | 'stale' | 'pending';

export interface ProxyInfo {
  opfsPath?: string;
  width?: number;
  height?: number;
  status: ProxyStatus;
  progress?: number;
  error?: string;
  codec?: string;
  container?: string;
  bytes?: number;
  fps?: number;
  durationUs?: Time;
  fingerprint?: string;
  createdAt?: string;
}
```

### Project Proxy Settings (`Project.proxy`)
Configured at the project level:

```ts
export type ProxyTargetHeight = 360 | 540 | 720;
export type ProxyAutoMode = 'off' | 'large' | 'all';

export interface ProjectProxySettings {
  enabled: boolean;        // Toggle preview proxy playback
  targetHeight: ProxyTargetHeight; // 360 | 540 | 720 (default 540)
  auto: ProxyAutoMode;     // 'off' | 'large' (>1080p or >60fps) | 'all'
}
```

### Fingerprinting & Stale Detection
A fingerprint is computed from the asset metadata:
```ts
fingerprint = `${asset.id}:${asset.size}:${asset.duration}:${asset.width ?? 0}x${asset.height ?? 0}`
```
If an asset's source file changes or is relinked with differing properties, `isProxyStale(asset)` evaluates to `true`, and the UI marks the proxy as "Proxy stale" with an "Update" action.

---

## 3. Transcoding Architecture & Worker Pipeline

Proxy transcoding runs entirely off the main thread in a dedicated Web Worker (`src/editor/services/media/proxy.worker.ts`) using `mediabunny`:

- **Transcode Input**: Source video blob read from OPFS.
- **Conversion Options**:
  - Video codec: `avc` (H.264) when supported, with automatic fallback to `vp9`.
  - Container: MP4 (for AVC) or WebM (for VP9).
  - Target height: 540p (default), 360p, or 720p with aspect ratio preserved (`fit: 'fill'` with even dimensions).
  - GOP interval: `keyFrameInterval: 0.5` seconds.
  - Audio: `{ discard: true }`.
- **Progress Reporting**: Granular progress events (`0.05` to `0.98`) posted back to the store using `mutateProject('Update proxy status', recipe, { history: 'skip' })`.
- **Cancellation**: Full cooperative cancellation through `Conversion.cancel()` and worker termination fallback.

---

## 4. UI Controls & User Experience

- **Media Library Status Chips**:
  - `Queued`: "Queued" chip.
  - `Working`: Progress bar and percentage with "Cancel" button.
  - `Ready`: Green chip showing resolution (e.g. "Proxy ready (540p)") with delete button.
  - `Stale`: Yellow chip "Proxy stale" with "Update" button.
  - `Failed`: Red chip "Proxy failed" with tooltip error description and "Retry" button.
- **Import Suggestion**:
  - Toast banner prompts to create proxies upon importing 4K or high-frame-rate media if proxies are not yet enabled.
- **Proxy Settings Dialog**:
  - Accessible via the "Proxies…" button in the media library header.
  - Allows configuring target resolution (360p, 540p, 720p), auto-generation behavior, and batch actions ("Create All Proxies", "Delete All Proxies").
- **Preview Player Badge**:
  - When proxies are toggled on and an active layer is displaying a proxy frame, a blue `PROXY` badge is rendered in the top-right corner of the program monitor.
- **Keyboard Shortcut**:
  - `Alt+P`: Toggle proxy playback on/off (non-conflicting, registered in shortcut registry and cheat sheet).

---

## 5. Measured Performance Benchmarks

Measured on Apple Silicon (Apple M4, macOS 15.3, Playwright Chromium headless/headed):

### A. Transcoding Benchmarks (Dedicated Worker)

| Clip | Source Format | Proxy Target | Transcode Time | Real-Time Factor | Size Ratio | Main-Thread Long Tasks | Peak JS Heap |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **4K Fixture** (`stock-4k.mp4`) | 3840×2160, 30 fps, 3.0 s, AVC (554,041 B) | 960×540, 30 fps, VP9 WebM (296,774 B) | **3,880 ms** | **0.77× real-time** | **53.57%** (296.7 KB / 554.0 KB) | **0 ms** | **51.02 MB** |
| **1080p Fixture** (`stock-1080p25-noaudio.mp4`) | 1920×1080, 25 fps, 3.0 s, AVC (321,415 B) | 960×540, 25 fps, VP9 WebM (2,300,991 B) | **844 ms** | **3.55× real-time** | **715%** (higher VP9 baseline bitrate) | **0 ms** | **51.50 MB** |

### B. Preview Scrub & Seek Latency

| Measurement | 4K Original (`stock-4k.mp4`) | 540p Proxy |
| :--- | :--- | :--- |
| **Forward Seek Latency** (avg) | **36.76 ms** (min: 30.3 ms, max: 49.3 ms) | **32.88 ms** (min: 31.2 ms, max: 33.6 ms) |
| **Proxy Toggle Latency (`Alt+P`)** | — | **267.72 ms** (media pool URL swap + metadata reload) |
| **Dropped Frames during playback** | 0 | 0 |

### C. Real Worker Export Independence & Parity

| Setting | Wall Clock Duration | Export FPS | Output File Size | Decoded Frame Parity ($t = 1.0\text{s}, 2.0\text{s}$) |
| :--- | :--- | :--- | :--- | :--- |
| **Proxies OFF** | 3.66 s | 24.62 fps | 1,012,453 bytes | Reference |
| **Proxies ON** | 3.59 s | 25.09 fps | 1,012,453 bytes | **Max diff = 0, Avg diff = 0.00** (byte-identical pixels) |

