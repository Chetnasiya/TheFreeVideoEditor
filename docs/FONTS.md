# Typography & Font Loading (Gate O)

The Free Video Editor supports both bundled web fonts and user-imported fonts.

## Bundled Fonts

Six distinct typography options are available out of the box across varied categories:

- **Inter**: Modern neutral sans-serif for UI, clean subtitles, and modern titles.
- **Montserrat**: High-impact geometric display sans.
- **Playfair Display**: Elegant editorial serif.
- **Roboto Mono**: Clean monospace font for timecodes, technical notes, or code blocks.
- **Caveat**: Expressive handwriting font.
- **Bebas Neue**: Condensed all-caps headline typeface.

Fonts are loaded asynchronously on-demand using standard browser `FontFace` APIs in both the window and worker contexts, falling back gracefully to system sans-serif or monospace fonts if unavailable.

## User Custom Fonts

Users can import custom font files in standard formats:

- `.ttf` (TrueType)
- `.otf` (OpenType)
- `.woff` & `.woff2` (Web Open Font Format)

Imported font files are stored in the project's media library and persisted in OPFS under kind `font`. When loaded, they are dynamically registered via the browser's `FontFace` API and immediately accessible to text layers.
