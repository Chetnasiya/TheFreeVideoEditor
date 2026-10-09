# Captions & Subtitles Architecture (Gate P)

The Free Video Editor features a high-performance, non-destructive, and 100% privacy-first Subtitles & Captions system. Captions are authored in dedicated timeline caption tracks, styled with custom typography or presets, synchronized down to word-level timings, rendered seamlessly across Canvas2D and WebGL2, and transcribed entirely on-device using local AI.

---

## 1. Core Data Model & Non-Overlapping Invariant

Caption tracks are first-class tracks on the timeline represented in `Track`:

```ts
export type TrackKind = 'video' | 'audio' | 'caption';

export interface Track {
  id: TrackId;
  name: string;
  kind: TrackKind;
  muted?: boolean;
  locked?: boolean;
  hidden?: boolean;
  clips: Clip[];
  captions?: CaptionSegment[];
  captionStyle?: CaptionStyle;
}
```

### Caption Segment Schema
```ts
export interface CaptionSegment {
  id: string;
  start: Time;        // Integer microseconds (timeline-absolute)
  end: Time;          // Integer microseconds (end > start)
  text: string;
  speaker?: string;   // Optional speaker tag (e.g., "Speaker 1")
  words?: CaptionWord[];
}

export interface CaptionWord {
  word: string;
  start: Time;
  end: Time;
  confidence?: number;
}
```

### Non-Overlapping Invariant
Like clips on video/audio tracks, caption segments on any given caption track **cannot overlap**. Retiming or inserting a segment automatically clips or splits existing segments cleanly via `core/captions/operations.ts`.

---

## 2. Track Styling & Presets

Every caption track maintains its own `captionStyle` containing rendering and placement properties:

- **Typography**: `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `letterSpacing`, `lineHeight`.
- **Colors & Effects**: Fill `color` (RGBA), `strokeColor`, `strokeWidth`, `backgroundColor` (semi-transparent box), `shadowColor`, `shadowBlur`, `shadowOffsetY`.
- **Position & Alignment**: `positionPreset` (`'top'` | `'center'` | `'bottom'`), `alignment` (`'left'` | `'center'` | `'right'`), `marginPercent`.
- **Wrapping Constraints**: `maxLines` (1 to 4) and `maxCharsPerLine` with dynamic balanced line-wrapping.
- **Word Highlight Modes**:
  - `'none'`: Default subtitle presentation.
  - `'word'`: Highlights only the current active spoken word (dynamic karaoke / short-form style).
  - `'progressive'`: Progressively colors words from start of cue up to the active spoken word.

### Included Style Presets
- **Classic Box**: Semi-transparent dark background box for classic broadcast readability.
- **Bold Outline**: High-contrast white text with bold black stroke and drop shadow.
- **Social Pop**: Eye-catching center subtitles with word-by-word karaoke highlighting for TikTok / YouTube Shorts / Reels.
- **Minimal Clean**: Borderless, sleek subtitle with subtle shadow.
- **Yellow Punch**: Vibrant yellow text with black stroke for high-energy creators.

---

## 3. Render Pipeline Integration

During playback and export, `resolveFrame(project, time)` identifies the active caption segment on visible caption tracks:

1. Computes the layout bounding box and line distribution according to track margins and alignment.
2. If `highlightMode` is active and `words` are present, `activeCaptionRuns` creates precise character-range `colorRuns` for Canvas2D text rasterization.
3. Produces an `ActiveLayer` of kind `'text'` positioned appropriately on the canvas.
4. Renders on Canvas2D and WebGL2 compositors without needing separate rendering code paths.
5. Burn-in subtitles are rendered automatically when the caption track is not hidden.

---

## 4. Local AI Speech-to-Text Architecture (100% Client-Side Privacy)

Auto-captioning runs entirely within the browser on the user's hardware:

- **Engine & Runtime**: `@huggingface/transformers` with ONNX Runtime Web. Executes on **WebGPU** with automatic fallback to **WASM** on systems where WebGPU is unavailable or disabled.
- **Audio Extraction**: `services/captions/audioPreparation.ts` uses `OfflineAudioContext` to downsample selected audio tracks, clips, or sequence mix to **16kHz mono Float32Array PCM**.
- **Web Worker**: Audio buffers are transferred to `stt.worker.ts` via zero-copy transferable memory buffers.
- **Zero Cloud Leakage**: Audio data and transcribed text **never leave the user's machine**. Works offline without third-party network requests.
- **Segmentation Engine**: Automatically chunks transcript tokens into balanced subtitle cues (1–2 lines, max 42 chars) and computes word-level timestamps.
- **DEV Fake Engine**: Supports `stt=fake` query param or `window.__TFVE_DEV_FAKE_STT` for instantaneous, deterministic testing without downloading weights.

---

## 5. Models & Consent Flow

- **Consent Dialog**: Prior to downloading any model weights, the user is presented with a clear consent dialog disclosing model size, source host (`huggingface.co`), license (MIT/Apache-2.0), and confirming that processing remains 100% on-device.
- **Supported Models**:
  - `whisper-tiny.en`: ~39 MB, English-only, fastest on WebGPU/WASM.
  - `whisper-base`: ~73 MB, multilingual, balanced speed and accuracy.
  - `whisper-small`: ~240 MB, multilingual, high-accuracy for complex audio.
- **Models Manager**: The in-app Models Manager allows users to view cached weights in the browser's Cache API, monitor disk footprint, and delete or re-download models on demand.

---

## 6. Interchange & Export Options

1. **SRT & WebVTT Import/Export**:
   - Full parser and serializer supporting SubRip (`.srt`) and WebVTT (`.vtt`) timecodes, cue indices, and speaker tags.
   - Preserves timestamps in integer microseconds.
2. **Sidecar Subtitle Files**:
   - The Export Dialog allows exporting `.srt` or `.vtt` sidecars alongside the exported video file.
3. **Burn-in Rendering**:
   - Keep the caption track visible to bake subtitles directly into exported MP4/WebM video frames.

