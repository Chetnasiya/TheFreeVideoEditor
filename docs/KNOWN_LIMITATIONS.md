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
- Reverse and shuttle playback are visual-only. Audio is enabled only at normal
  forward speed. The preview corrects video drift by seeking when it exceeds
  approximately 80 ms, which can cause visible jumps on slower decoders.
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
