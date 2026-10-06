# Timeline Editing

The timeline is backed by the active project in the editor store. Clip and track
operations are implemented as framework-independent project transformations in
`src/editor/core`; the store validates and commits edits through its shared
project mutation path.

## Placement and overlap

- Time is stored as integer microseconds. Pointer edits and clip placements are
  rounded to the project's frame grid.
- Clips on the same track may not overlap. When adding a clip, the editor places
  it at the nearest non-overlapping start to the requested position. Ties resolve
  toward the earlier position.
- Moving or trimming clips that would overlap another clip is rejected. During
  a drag, the proposed positions are shown as a preview and invalid positions are
  not committed.
- Drag previews are coalesced to animation frames. A successful pointer release
  commits one project mutation; cancellation leaves the project unchanged.

## Tracks and linked clips

Video and image assets can be placed on video tracks; audio assets can be placed
on audio tracks. Adding a video with audio creates a linked audio clip on an
available audio track, creating one when needed. Linked clips move, trim, split,
duplicate, delete, and ripple-delete together unless the edit explicitly unlinks
them.

Tracks can be added, renamed, reordered, locked, hidden, muted, and removed.
Removing a populated track requires confirmation. A locked track also prevents
an edit that would remove or modify its clips, including linked partners.

## Controls

- Drag a media item onto a compatible track to add it.
- Drag a clip to move it, or drag either clip edge to trim it.
- Drag across the lanes to select clips; Shift-click and Command/Ctrl-click
  extend or toggle the selection.
- Drag a track header to reorder it. Alt+Up/Down also reorders the focused track.
- Scrub the ruler or press Left/Right to move the playhead by one frame.
- Alt+Left/Right nudges selected clips by one frame; Shift multiplies the trim
  keyboard step to 10 frames when a trim handle is focused.
- S splits at the playhead; Delete removes selection; Shift+Delete ripple-deletes;
  Command/Ctrl+A selects all clips; Command/Ctrl+D duplicates selection; N toggles
  snapping.
- Ctrl/Command+wheel adjusts timeline zoom. The zoom slider and Fit action are
  available in the toolbar.

## Scope

Timeline editing, clip thumbnails/waveforms, snapping, and project persistence
are active. Playback, audio mixing, preview compositing, undo/redo, and export
are not part of this milestone. The monitor's playback controls remain disabled
until those systems are implemented.
