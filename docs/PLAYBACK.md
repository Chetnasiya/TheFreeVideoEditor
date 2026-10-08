# Playback and preview

The preview uses one frame-snapped clock as its source of truth. The playback
engine resolves the active project clips at that integer-microsecond time, asks
the media pool for decoded sources, composites video layers to the Program
canvas, and synchronizes eligible audio clips through Web Audio.

## Runtime flow

1. `createPlaybackClock` advances time from animation-frame timestamps, snaps it
   to project frames, and owns play, pause, loop, end-of-sequence, and shuttle
   behavior.
2. `resolveFrame` returns active video layers and audio sources in timeline
   order. Muted audio tracks, hidden video tracks, gaps, and offline assets are
   handled before media is requested.
3. `MediaPool` loads OPFS-backed media into a bounded set of detached media
   elements, seeks to the requested source time, preloads nearby clips, and
   releases idle resources. Buffering in an active clip pauses the clock; it
   resumes only when active media is ready and playback has not been explicitly
   paused.
4. `renderFrame` clears the Program canvas to black, draws layers bottom-to-top,
   and retains each clip's last good frame while a new seek is decoding.
5. `AudioEngine` connects audio elements to per-clip gains and a master gain.
   Audio plays only at normal forward speed; reverse and faster shuttle rates
   remain visual-only.

The compositor accepts an injected `FrameProvider` (`(layer) => FrameSource |
null`) rather than owning media decoding. This boundary keeps composition
testable with fake frame sources and allows a future WebCodecs/Worker decoder to
replace the current HTML media-element pool without changing timeline
resolution or canvas compositing.

Playback tests can inspect development-only engine statistics through
`window.__tfvePlaybackTest`. That hook is not attached in production builds.

## Current constraints

- Decoding depends on browser and OS codec support. File extensions alone do not
  guarantee that a clip can be played.
- Seeking and frame presentation are approximate at the browser decoder
  boundary. The clock remains frame-snapped, but HTML media elements may deliver
  a neighboring decoded frame.
- Video drift is corrected when the decoder differs from the requested source
  time by more than approximately 80 ms. Recovery can be visible on slow media.
- Safari and Firefox may use different OPFS, codec, and media readiness behavior
  from Chromium. Active-media buffering pauses the clock, but browser-specific
  seeking behavior may still vary.
- In Gate M, constant forward speeds ([0.25×, 4.0×]) preserve pitch via
  `HTMLMediaElement.preservesPitch` and `playbackRate`. Reverse playback, freeze
  frames, and non-linear speed ramps operate in seek mode with an active preview hint;
  audio export preserves pitch across arbitrary curves via WSOLA.
