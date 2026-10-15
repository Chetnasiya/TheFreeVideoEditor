# AI Assistant: Silence Trimming & Script-Based Take Selection

This document records the architectural design, engine choices, algorithms, and integration details for the AI Workspace tab and its two core features: **Automatic Silence Trimming** and **Script-Based Take Selection**.

---

## 1. Architectural Overview & Privacy Invariant

The Free Video Editor is privacy-first and runs 100% on the user's local device:

- **Zero Cloud Services & Zero External LLMs**: No audio, video, script text, or user telemetry ever leaves the machine.
- **Explainable Heuristics Over Opaque Models**: Take ranking and silence trimming decisions are deterministic, rule-based, and transparently explained in the user interface.
- **Non-Destructive by Default**: Silence trimming and rough-cut assembly default to creating duplicate sequences (`<name> – trimmed`, `<name> – Rough Cut`), with single-undo-step in-place modifications supported.

---

## 2. Engine Choices & Justification

### 2.1 Voice Activity Detection (VAD)

| Engine                                          | Size                          | Licence        | Offline / Hosting             | Decision                           |
| ----------------------------------------------- | ----------------------------- | -------------- | ----------------------------- | ---------------------------------- |
| **In-House Energy + Spectral VAD**              | 0 KB (Native TypeScript)      | MIT (Codebase) | 100% Offline, Instant         | **Selected (Default Engine)**      |
| **Silero VAD (ONNX Runtime Web)**               | ~2 MB model + ~1.5 MB runtime | MIT            | Lazy-loaded with user consent | **Evaluated (Optional ML Engine)** |
| **Cloud VAD APIs (AssemblyAI, Deepgram, etc.)** | 0 KB                          | Commercial     | Cloud-only (Violates Privacy) | **Rejected**                       |

#### In-House VAD Architecture (`src/editor/core/ai/silence/`)

- **Audio Preparation**: Audio tracks are decoded and downsampled to 16 kHz mono.
- **Feature Extraction (10 ms hop / 160 samples)**:
  - **RMS Energy (dBFS)**: Signal power relative to full scale.
  - **Speech Band Ratio (300–3400 Hz)**: Energy ratio within the standard human vocal formant range using discrete Fourier transform filtering.
  - **Spectral Flatness & Zero-Crossing Rate (ZCR)**: Distinguishes tonal vowels and fricatives from broadband background noise.
- **Adaptive Noise Floor**: Sliding window percentile estimation tracks ambient floor changes without hardcoded noise assumptions.
- **Hysteresis State Machine**: Dual-threshold onset (`speechThreshold`) and hangover time prevent chopping of soft word endings.

#### Silero VAD Evaluation Note

Silero VAD v4/v5 is an industry-standard deep learning VAD with a compact footprint (~2 MB ONNX weight file). In benchmark tests against noisy cocktail-party speech, it provides superior speech-vs-music discrimination. For The Free Video Editor, it is designed as an optional pluggable backend (`SilenceEngineType = 'energy_spectral' | 'silero_vad'`) behind user consent, lazy-loading ONNX Runtime Web via the existing model manager pattern (`services/captions/modelManager.ts`).

### 2.2 Automatic Speech Recognition (ASR)

- **Local Whisper Pipeline**: Reuses the Gate P local speech-to-text worker (`@huggingface/transformers` Whisper tiny/base/small with WebGPU acceleration and WASM fallback).
- **Word-Level Timestamps**: Whisper's cross-attention alignment produces token/word boundaries with start/end timestamps and model confidence values (`WordTiming` interface), which drive sequence alignment.

### 2.3 Deterministic Scoring Weights

Candidate take selection uses an explainable multi-factor scoring formula (0–100):
$$\text{Score} = 0.35 \times \text{Accuracy} + 0.25 \times \text{Completeness} + 0.15 \times \text{Fluency} + 0.15 \times \text{AudioQuality} + 0.10 \times \text{Recency}$$

- **Accuracy (35%)**: Word match ratio against the canonical script line via Levenshtein edit distance.
- **Completeness (25%)**: Ratio of matched words to total words in the script line.
- **Fluency / Pacing (15%)**: Penalties for stumbles (repeated syllables/words), false starts, awkward pauses (>800 ms), and filler words ("um", "uh", "er", "ah", "like").
- **Audio Quality (15%)**: Signal-to-noise ratio, clipping headroom, and level stability.
- **Recency (10%)**: Favors later takes in a multi-take continuous roll.

---

## 3. Feature A: Automatic Silence Trimming

### 3.1 Parameters & State (`SilenceTrimSettings`)

Persisted per project in UI state:

- **Tracks to consider**: Checklist of audio tracks with "dialogue only" quick pick.
- **Max silence to keep**: Default 0.4s (shortens pauses longer than max to exactly this value; 0 = complete removal).
- **Min silence to cut**: Default 0.3s (ignores minor mic pauses below threshold).
- **Threshold**: Auto (adaptive noise floor) or Manual dBFS slider.
- **Padding**: Default 80 ms before and after voice boundaries to prevent clipped plosives.
- **Keep Breaths**: Natural breath detection via spectral flatness and low-energy lookback.
- **Voice Only**: Excludes non-speech noise using speech-band energy ratio.
- **Crossfades**: Default 5 ms crossfade at cut boundaries to prevent audio pops.

### 3.2 Cut Snapping & Multi-Track Sync

- Cut points snap to the quietest nearby sample or zero crossing within a ±10 ms search window.
- Cuts are applied simultaneously across all enabled linked tracks in the range, keeping multi-camera video and audio stems in phase.

### 3.3 Virtual Preview & Timeline Overlays

- **Timeline Striped Overlay**: Striped translucent markers highlight detected silence intervals directly on the timeline canvas.
- **Virtual Preview Mode**: The playback engine (`services/playback/engine.ts`) monitors the playback clock and skips forward across included silence regions in real-time, allowing users to audition the trimmed pacing without modifying project history.
- **Review List**: Tabular breakdown of start time, duration, and planned cut length with per-item toggle checkboxes.

---

## 4. Feature B: Script-Based Best-Take Selection

### 4.1 Multi-Format Script Import (`core/ai/script/parser.ts`)

- **Formats Supported**:
  - Plain text (`.txt`)
  - Markdown (`.md`): automatically cleans headings, lists, and formatting markers.
  - Word Document (`.docx`): parsed 100% in-browser by unzipping the XML container with `fflate.unzipSync` and extracting text paragraphs `<w:p>` and `<w:t>`. Requires 0 external binaries or cloud APIs.
  - Subtitle scripts (`.srt`, `.vtt`): extracts cleaned dialog lines.
  - Direct paste via text modal.
- **Speaker Detection**: Detects inline speakers (`HOST: ...`, `[NARRATOR] ...`) and standalone speaker headers.
- **Speaker Track Mapping**: Maps individual characters or speakers to specific audio tracks (e.g. Host → Audio 1, Guest → Audio 2).
- **Line Editing**: Supports split, merge, delete, and marking lines as optional.

### 4.2 Word-Level Alignment & Utterance Segmentation (`core/ai/script/alignment.ts`)

- **Utterance Segmentation**: Audio word streams are split into take candidates using inter-take pauses (>1.0s) and restart cue phrases ("Wait", "Sorry", "Let me restart", "Again").
- **Dynamic Programming Sequence Alignment**: Smith-Waterman local alignment compares spoken words with script lines using normalized Levenshtein token distance.
- **Defect Detection**:
  - Stumbles: immediately repeated words or syllables.
  - False starts / restarts: false starts followed by restart cues.
  - Filler words: detects configurable filler tokens ("um", "uh", "er", "ah", "like").
  - Awkward pauses: internal speech gaps exceeding 800 ms.
  - Incomplete delivery: utterance terminates before script line completion.

### 4.3 Sequence Assembly & Timeline Take Alternates (`core/ai/script/assembly.ts`)

- **Assemble Rough Cut**: Creates a new rough-cut sequence placing the chosen take for each script line consecutively, preserving linked A/V sync.
- **Take Badges**: Assembled clips display a `◆ Take` badge (`clip-take-badge`) on the timeline.
- **Context Menu Take Swapper**: Right-clicking a clip on the timeline displays "Choose Alternate Take:" with all candidate takes, scores, and defect tags. Swapping takes updates `sourceIn`, `sourceOut`, and `duration`, and automatically ripples downstream clips while preserving linked tracks.

---

## 5. Workspace Integration & Keyboard Shortcuts

- **Workspace Order**: `Assembly · AI · Editing · Color · Effects · Audio · Graphics`
- **Shortcuts**: Premiere Pro-style workspace switching:
  - `Alt+Shift+1`: Assembly
  - `Alt+Shift+2`: AI
  - `Alt+Shift+3`: Editing
  - `Alt+Shift+4`: Color
  - `Alt+Shift+5`: Effects
  - `Alt+Shift+6`: Audio
  - `Alt+Shift+7`: Graphics
- **State Migration**: Users with existing saved workspace preferences automatically have the `ai` workspace inserted after `assembly` without losing customized splitters or panel configurations.
