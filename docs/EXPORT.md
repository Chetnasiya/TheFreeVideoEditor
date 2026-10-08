# Exporting projects and video

Open **Export** in the editor header or choose **File → Export…**. The dialog
contains video and project-interchange outputs.

## Video

The frame-accurate path uses Mediabunny and the browser's WebCodecs encoders.
MP4 uses H.264/AAC; WebM uses a supported VP9/AV1/VP8 codec with Opus where
available. Codec support is checked for the selected size, frame rate, and audio
setting before enabling the export action.

### Rendering architecture

The preferred path creates a module Worker from `export.worker.ts`. It owns
media decoding, frame resolution and compositing on `OffscreenCanvas`, frame
and audio encoding, audio mixdown, and muxing. The main thread prepares an
immutable project snapshot and export plan, transfers the required `File`
objects, reports progress, and writes acknowledged output chunks to the
user-selected file. The writable stream itself is not transferred: chunks are
sent as transferable `ArrayBuffer`s and written on the main thread, which also
works in Chromium versions that do not support transferring a file stream.

The typed Worker protocol has `probe`, `start`, `progress`, `chunk`, `ack`,
`cancel`, `done`, and `error` messages. `chunk`/`ack` provide bounded output
backpressure. Cancellation stops frame/audio work, cancels the muxer, aborts the
selected output, discards buffered chunks, and terminates a Worker that does
not acknowledge cancellation promptly.

If a module Worker, worker WebCodecs, or `OffscreenCanvas` is unavailable, the
WebCodecs pipeline falls back to the main thread and yields between video frames
and audio chunks. The UI displays a compatibility notice. MediaRecorder is a
separate real-time compatibility path for WebM; it can drop frames and is not
frame-accurate.

Exports are deterministic relative to their captured project snapshot, media
bytes, settings, and browser codec implementation. Edits made after export
starts affect the live project only, not the in-flight snapshot. Frame count
and timestamps follow the export plan; codec output pixels and exact encoded
bytes can vary between browser/OS encoder implementations. Playback is paused
for the duration of export.

Offline media is called out before rendering. If the user explicitly continues,
offline video layers render blank and offline audio is silent. Export
cancellation discards the partial output. The active project cannot be closed,
switched, or deleted during export without first confirming cancellation.
Worker export avoids running the render loop on the UI thread, but the yielding
main-thread fallback can still reduce responsiveness. Codec support and decode
performance also depend on the browser, operating system, and media file. In

### Gate M: Speed, Time Remapping, and WSOLA Audio Mixdown

Export pipelines fully support constant speed changes, reverse playback, freeze frames,
and arbitrary non-linear time remapping curves:

- **Audio Mixdown**: `audioMix.ts` integrates with in-house WSOLA time-stretching (`renderRemappedAudio.ts`).
  Pitch is preserved across accelerated, decelerated, and curve-remapped audio chunks when `clip.maintainPitch` is true.
  Reverse playback and hold frames mute audio cleanly.
- **Video Frames & LRU Cache**: `frameProvider.ts` includes a 64-frame LRU `ImageBitmap` cache to
  avoid repeated decodes when evaluating backward seeking, reverse clips, and freeze frames.
- **Interchange Export**: EDL, FCPXML, OTIO, and XMEML exporters evaluate `sourceExtent(clip)` to accurately
  compute source time boundaries under speed adjustments and reversal.

## Project interchange

- **Premiere Pro XML (xmeml)** and **CMX3600 EDL** are the Premiere-oriented
  routes. EDL output contains video cuts only; packaged EDL export creates one
  EDL for each video track and includes an audio limitation note.
- **FCPXML** targets Final Cut Pro and DaVinci Resolve.
- **OpenTimelineIO (.otio)** is an open interchange format supported by various
  editing applications.

Interchange files can be exported alone or packaged with the source media.
Packaged media paths are allocated relative to the package. If an application
cannot find the media after extraction or moving the package, relink the files
in that application. Packaging cannot include assets marked offline.

These serializers represent basic edits, tracks, source ranges, markers, and
media references. Effects, transitions, advanced audio routing, speed changes,
and application-specific metadata are not represented. Structural unit tests do
not guarantee compatibility with every version of an editor.

An experimental `.prproj` serializer is not exposed in the UI because Premiere's
project schema is version-specific. No sample is currently present at
`samples/minimal.prproj`, and neither a serializer nor its golden-test scaffold
has been created; neither should be inferred without a real sample. To proceed,
provide a minimal Premiere Pro project containing one sequence, one video clip,
and one audio clip, saved from the exact Premiere Pro version/build to support.
Include that version/build (as shown in About Premiere Pro) with the sample.
Use xmeml or EDL in the meantime.

## Export dependency and credit

Gate G added `mediabunny` 1.61.3 as the only new dependency. Its published npm
package is 10,867,673 bytes unpacked (about 10.4 MiB) and is licensed under
MPL-2.0. Mediabunny supplies browser-side media demuxing, decoding, encoding,
and muxing; its license is included with the installed package. No other
Gate G-specific dependencies were added.
