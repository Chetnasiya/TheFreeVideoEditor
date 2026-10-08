# Known Limitations

The current editor includes project persistence, local media import, derived
previews, native `.tfve` files, and multi-track timeline editing. The following
limitations are intentional at this stage:

- Import requires the browser's Origin Private File System (OPFS). Browsers without
  OPFS cannot import media; project metadata remains stored in IndexedDB.
- Media decoding depends on browser and operating-system codec support. MKV and
  some MOV, AAC, and other codec combinations may be rejected even when their
  extensions are accepted.
- Waveform generation is skipped for audio files larger than 300 MB and when
  `OfflineAudioContext` or the waveform worker is unavailable.
- Thumbnails and waveforms are cached locally and may need regeneration if browser
  storage is cleared. Derived previews are not included in `.tfve` archives.
- `.tfve` export reads media incrementally, but browsers using the download
  fallback must hold the generated archive in memory. Import currently buffers
  the archive before restoring media, so very large archives can require
  substantial memory.
- Safari's available OPFS capacity and persistence behavior vary by version and
  device. The editor reports storage failures, but cannot guarantee browser data
  retention.
- Media files imported into `.tfve` are copied into the destination project's
  OPFS directory. Projects exported without media reopen with their assets marked
  offline until each file is relinked.
- The timeline can place, move, trim, split, duplicate, link, unlink, delete, and
  ripple-delete clips, and manage tracks. Playback and basic synchronized preview
  compositing are implemented. Undo/redo is session-only (up to 200 project
  changes); closing or switching projects clears that history.
- Deleted media remains on device while the project is open so undo can restore
  it. Unreferenced media files and derived previews are collected on project
  close, project switch, or next open. Unrecognized files in the project media
  folder are preserved rather than deleted automatically.
- Ripple delete closes gaps on tracks containing the selected clips; it does not
  shift unrelated tracks. Locked tracks block ripple deletion when they contain
  a selected or linked clip.
- Timeline edits are frame-aligned and prevent same-track overlap. A rejected
  drag or trim leaves the project unchanged.
- Timeline clips are virtualized to the visible horizontal viewport with
  overscan. During playback, the timeline follows the playhead; manual scroll,
  scrub, or zoom pauses follow mode until playback resumes.
- Preview decoding depends on browser codecs. Chromium and Safari generally decode
  H.264/AAC when supported by the operating system; Firefox codec availability
  varies by platform. An accepted file extension does not guarantee decoding.
- The Source monitor uses the browser's native media decoder. Unsupported source
  codecs display a decode error rather than a frame preview. On export, an audio
  stream that the browser cannot decode is skipped with an asset-specific warning;
  video export continues.
- Reverse playback and speed ramps operate in seek mode during real-time preview,
  displaying an informational notice ("Preview may be choppy for this speed").
  Audio playback is enabled with pitch preservation for constant speeds between
  0.25× and 4×; reverse and ramp audio is rendered during export via WSOLA.
  The preview corrects video drift by seeking when it exceeds approximately 80 ms,
  which can cause visible jumps on slower decoders.
- Safari and Firefox may seek more slowly or report different media readiness
  events than Chromium. The player pauses its master clock while active media
  buffers, but exact frame presentation remains codec- and browser-dependent.
- Video export uses WebCodecs and Mediabunny in a dedicated module Worker when
  worker WebCodecs and `OffscreenCanvas` are supported. The yielding
  main-thread WebCodecs fallback can still reduce responsiveness. When streaming
  file output is unavailable, the completed video is buffered in memory;
  Worker heap usage is not observable through the page's JavaScript heap metric.
- The MediaRecorder compatibility path records WebM in real time. It may drop
  frames on slower devices and is not frame-accurate. MP4 requires supported
  WebCodecs H.264/AAC encoders.
- Export can be cancelled. Closing or switching the active project while an
  export runs asks before cancelling; cancelling discards the partial output.
- Interchange serializers currently cover basic cuts, tracks, source ranges,
  markers, and media references. Complex effects, transitions, speed changes,
  advanced audio routing, and application-specific metadata are not represented.
  FCPXML targets Final Cut Pro/Resolve; xmeml and EDL are the Premiere routes.
  EDL exports video cuts only. Serializer output has structural tests but has
  not been validated against every target application's parser/version.
- Premiere `.prproj` output is unavailable and is hidden from the export UI.
  There is no serializer or golden-test scaffold yet: both must be derived from
  a minimal real sample with one sequence, one video clip, and one audio clip,
  saved from the exact target Premiere Pro version/build. Use xmeml or EDL for
  Premiere interchange.

## Gate H & I (rendering, animation and keyframes)

- WebGL2 was only verified on ANGLE/SwiftShader in CI; real-GPU behaviour and speed are verified via `npm run test:gpu`.
- Rotated and fractional-fit edges differ slightly between WebGL2 and Canvas2D (anti-aliasing and filtering).
- `timeRemap` is not re-based on a head trim (Gate M).
- Vector properties (position, scale, anchor) share keyframe times and bezier easing handles across X and Y channels.
- Multi-clip transform editing is disabled (single-clip editing only; multi-selection displays an explanatory notice).
- Audio keyframes (volume and pan automation) are deferred to Gate N (audio mixer).

## Gate J (Effects, Color, Curves, Scopes, Adjustment Layers)

- **Color Space**: 8-bit RGBA gamma-encoded sRGB/Rec.709. Operations (EV stops, contrast, lift/gamma/gain, curves) execute in gamma space. Extreme grades or aggressive blurs may produce 8-bit quantization banding. HDR and linear-light blending are not supported.
- **Interchange Compatibility**: EDL, FCPXML, xmeml, and OTIO cannot represent browser-based WebGL shader graphs or OPFS 3D LUT assets. When exporting to interchange formats, clips with effects, adjustment layers, and solid colors are exported without effects or skipped, and an explicit warning is displayed in the Export dialog.
- **Transitions & Masks**: Masks on effects and track transitions are scheduled for Gates K and L and are not active in Gate J.
- **Video Scopes Performance**: Scopes capture up to 256×144 resolution readbacks from the composition FBO. Scopes run on 2D canvases; high monitor refresh rates with all four scopes simultaneously active may increase CPU overhead on low-power devices.
- **LUT Assets**: 3D LUTs (.cube) are parsed and uploaded as 3D textures. Very large LUTs (> 64×64×64) consume more GPU memory and are bounded by `MAX_3D_TEXTURE_SIZE`.

## Gate K (Transitions)

- **Parked Feature Flag**: Track transitions and transitions UI (Effects Library category, Edit menu entry, keyboard shortcut, timeline transition blocks) are parked behind the development flag `?labs=transitions`. Existing projects containing transitions open, retain their data through save and `.tfve` round-trips, and render without crashing.

## Gate L (Masks)

- **Shape Interpolation & Point Counts**: Path mask keyframe interpolation requires equal point counts across all keyframes. Adding or deleting path points while shape is animated requires flattening or disabling animation first.
- **Mask Tracking**: Automated mask motion tracking is out of scope (manual keyframing supported).
- **Interchange Export**: Masks cannot be represented in EDL, FCPXML, xmeml, or OTIO interchange formats and are omitted with a warning during interchange export.
- **Compositor Requirement**: Masks require WebGL2 rendering (`projectNeedsGpu` is true for any clip with masks). Browsers without WebGL2 cannot composite masks.
