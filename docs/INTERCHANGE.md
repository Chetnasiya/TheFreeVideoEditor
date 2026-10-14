# Interchange & Interop Architecture (Gate S)

The Free Video Editor supports professional non-linear editor (NLE) interchange across four industry-standard formats:
- **Premiere Pro XML (xmeml v4)**
- **Final Cut Pro XML (FCPXML v1.10)**
- **OpenTimelineIO (OTIO v1)**
- **CMX3600 EDL**

All interchange writers and importers operate through a single, pure, loss-less **Interchange Intermediate Representation (`InterchangeTimeline`)** defined in `src/editor/core/interchange/ir.ts`.

---

## 1. Intermediate Representation (`InterchangeTimeline`)

The Interchange IR isolates format-specific syntax from project models, ensuring that time conversion, track flattening, and feature auditing happen consistently:

```typescript
export interface InterchangeTimeline {
  name: string;
  rate: RationalRate; // Exact rational framerate and drop-frame flag
  width: number;
  height: number;
  durationFrames: number;
  tracks: InterchangeTrack[];
  markers: InterchangeMarker[];
  assets: Map<AssetId, InterchangeAsset>;
  omissions: string[];
  featureAudits: InterchangeFeatureAudit[];
}
```

### Pure Projection Pipeline
1. **Sequence Flattening**: `flattenForInterchange` evaluates nested sequences into root track lanes. Any clips with speed changes or non-linear time remap that cannot be flattened without baking are omitted with clear diagnostic logs.
2. **Rational Rate Calculation**: `resolveRate(fps, dropFrame)` resolves nominal FPS into exact integer numerator/denominator pairs (e.g. `24000/1001` for 23.976, `30000/1001` for 29.97, `60000/1001` for 59.94).
3. **Discrete Rational Frame Grid**: Microsecond timestamps are converted using exact rational BigInt arithmetic:
   $$\text{frames} = \left\lfloor \frac{\text{micros} \times \text{numerator} + \frac{\text{denominator} \times 1\,000\,000}{2}}{\text{denominator} \times 1\,000\,000} \right\rfloor$$
   This prevents cumulative IEEE 754 floating-point drift over long projects (verified zero-drift invariant over 10-hour timelines).

---

## 2. Time Correctness & SMPTE 12M Drop-Frame Calculations

Broadcast NTSC frame rates (29.97 and 59.94 fps) run $0.1\%$ slower than integer wall-clock time. To keep timecode synchronized with real time:
- **Drop-Frame Rule (SMPTE 12M)**:
  - For **29.97 DF** (30 fps timebase), frame numbers `;00` and `;01` are skipped at the start of every minute, **except** every tenth minute (00, 10, 20, 30, 40, 50).
  - For **59.94 DF** (60 fps timebase), frame numbers `;00`, `;01`, `;02`, and `;03` are skipped at the start of every minute, **except** every tenth minute.
  - Semicolon (`;`) delimiter is strictly used for drop-frame timecodes (e.g., `01:00:00;00`).

### FCPXML Rational Times
Final Cut Pro XML requires frame-aligned rational numbers without floating-point representation:
- Frame Duration: `1001/30000s` (29.97 fps) or `1/25s` (25 fps).
- Time Offset / Start / Duration: `(frames * 1001) / 30000s` or `frames / 25s`.

---

## 3. Feature Mapping Matrix

| Feature | Premiere Pro XML (xmeml v4) | Apple FCPXML v1.10 | OpenTimelineIO (OTIO) | CMX3600 EDL |
| :--- | :--- | :--- | :--- | :--- |
| **Cuts, Trims, & Lanes** | **Native** (`<track>`, `<clipitem>`) | **Native** (`<spine>`, `<asset-clip>` lanes) | **Native** (`Stack.1`, `Track.1`, `Clip.2`) | **Native** (Video cuts per track; 1 EDL/track) |
| **Audio / Video Linking** | **Native** (`<link>` references) | **Native** (Synchronized asset refs) | **Metadata** (`thefreevideoeditor.linkId`) | **Omitted** (No A/V link syntax in CMX3600) |
| **Speed Changes** | **Native** (`<duration>`, `<in>`, `<out>`) | **Native** (Rational warp in `<asset-clip>`) | **Native** (`LinearTimeWarp.1` effect) | **Omitted** (Assumes 1.0x normal speed) |
| **Transforms & Opacity** | **Native** (`<filter>` Basic Motion & Opacity)| **Native** (`<adjust-transform>`, opacity) | **Metadata** (`thefreevideoeditor.transform`) | **Omitted** (No spatial syntax in CMX3600) |
| **Audio Levels & Pan** | **Native** (`<filter>` Audio Levels) | **Native** (`<adjust-volume>`, audio roles) | **Metadata** (`thefreevideoeditor.volume/pan`)| **Omitted** (Audio levels omitted) |
| **Markers & Comments** | **Native** (`<marker>` sequence & clips) | **Native** (`<marker>` on clips & spine) | **Native** (`Marker.1` elements) | **Approximated** (`* MARKER` remarks) |
| **Titles, Text, Captions** | **Approximated** (Title clipitems) | **Native** (`<title>` and `<text>`) | **Metadata** (`thefreevideoeditor.text`) | **Omitted** (Text not supported in EDL) |
| **Transitions** | **Approximated** (Cross Dissolve) | **Native** (`<transition>` elements) | **Native** (`Transition.1` elements) | **Approximated** (`D` dissolve event) |
| **Effects & Adjustments** | **Omitted** (Render to video) | **Omitted** (Render to video) | **Metadata** (Custom effect tags) | **Omitted** (Render to video) |

---

## 4. Importers & Interactive Relinking

The Free Video Editor provides full parsing for all four formats:
- `parseOtio`: Parses `Timeline.1`, `Stack.1`, `Track.1`, `Clip.2`, `Gap.1`, `LinearTimeWarp.1`, and markers.
- `parseEdl`: Parses CMX3600 EDL files with NDF/DF detection, remark comments, and timecodes.
- `parseFcpxml`: Parses FCPXML v1.7–v1.11 with `<resources>`, `<spine>`, `<gap>`, `<asset-clip>`, and transforms.
- `parseXmeml`: Parses Premiere Pro XML v4 with track structure, `<clipitem>`, `<link>`, and filters.

### Interactive Relink Dialog
When importing a project file or ZIP package:
1. The importer scans for referenced media paths.
2. Any missing assets are surfaced in the **Relink Dialog**:
   - Lists missing assets with expected filenames, paths, and durations.
   - Folder drop zone searches candidates using:
     1. Exact basename match (`1.0` confidence).
     2. Container variation match (`0.9` confidence, e.g. `.mov` $\leftrightarrow$ `.mp4`).
     3. Fuzzy substring match (`0.7` confidence).
   - Manual "Locate" file picker per missing file.
   - Action to "Relink & Import" or "Import as Offline Media".

---

## 5. Decision on `.prproj` Export

Adobe Premiere Pro native project files (`.prproj`) are gzipped binary XML structures with internal schema GUIDs and binary serialized state. Because no golden sample exists in the repository (`/samples/minimal.prproj` is absent), `.prproj` export was deliberately omitted per Gate S requirements to avoid guess-based implementations. Premiere Pro natively imports **xmeml v4 (`.xml`)** and **CMX3600 EDL (`.edl`)** with full fidelity.

