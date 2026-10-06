# Debugging media and preview issues

## Source and Program monitors

- Select a file in the Project panel to load it in the Source monitor.
- The Source monitor uses the browser's media decoder. If it reports a decode
  error, try a browser-supported codec/container or transcode the file before
  importing it.
- The Program monitor displays the layers under the timeline playhead. Move the
  playhead into a clip's range; a clip elsewhere on the timeline will not appear
  in the current frame.
- Offline media is shown by name in the monitor. Relink it from the Project
  panel before expecting it to render or play.

## Audio metadata and export

- Media import inspects container tracks and records whether a video file has
  audio. This prevents video-only files from creating an empty linked audio clip.
- Older projects are re-inspected when opened and again before video export.
  If inspection confirms a video file has no audio, its orphaned linked audio
  clip is removed and the Project panel reports which file was corrected.
- If an audio codec cannot be decoded, the export dialog warns before export.
  A decode failure during export names the affected file, skips that audio, and
  continues rendering video.
- If audio is missing, verify that the intended audio track is not muted, that
  the source file contains an audio stream, and that the browser supports its
  codec. Audio encoding support is separate from source audio decoding support.

## Storage and recovery

- Imported files are stored in the browser's Origin Private File System (OPFS);
  project records are stored in IndexedDB. Clearing site data removes both.
- If media appears offline, use Relink in the Project panel and choose the
  original file. A matching filename is not sufficient when the file's content
  differs; review any relink mismatch warning.
- If an edit or metadata repair is not yet saved, wait for the save indicator to
  report “Saved” before reloading the editor.
