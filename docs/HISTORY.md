# Undo and redo

Project edits can be undone and redone during the current editor session with
the toolbar controls, the Edit menu, or the platform-specific keyboard
shortcuts. History is held in memory, is limited to 200 edits, and is cleared
when a different project is opened or the current project is closed.

Continuous edits with the same merge key are coalesced for up to 500 ms. Undo
and redo update the regular project revision and autosave state, but playhead
and selection changes are not separate history entries. Undo restores the clip
selection associated with the edit when those clips still exist.

Relinking media replaces the stored bytes and cannot be safely reversed with
project-data patches. Relinking therefore creates a history barrier and reports
when earlier undo history has been cleared.

Deleting an asset removes it from the project immediately but keeps its media
and derived previews on device until the project closes or switches. This makes
undo safe. Garbage collection removes only unreferenced files whose names match
the editor's asset-id format; unknown files are reported and retained. Cache
cleanup follows the same project-asset reference set.

Use **Help → Keyboard Shortcuts** or press `?` to search the shortcut registry.
Shortcuts are ignored while typing, composing text, or interacting with an open
dialog.
