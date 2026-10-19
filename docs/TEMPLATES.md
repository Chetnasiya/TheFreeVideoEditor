# Title Graphics & Motion Templates (Gate O)

A motion template is a small multi-track timeline stored in a `.tfvetemplate` file. Dropping one on the
timeline creates a **nested sequence instance**: one clip that plays the template's layers, with a few
published fields (text, colours, size) the user can edit.

## Where templates come from

| Source                     | Where                                            | Notes                                                                              |
| -------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Built-in library           | `public/templates/*.tfvetemplate`                | Loaded at build time by `core/templates/builtinTemplates.ts` (`import.meta.glob`). |
| Imported by the user       | Graphics panel, Import, stored in `localStorage` | Read by the same `deserializeTemplate`.                                            |
| Saved from the timeline    | Graphics panel, Save as template                 | Built by `createTemplateFromClips`.                                                |
| Author sample (not listed) | `public/templates/example.tfvetemplate`          | A small template to copy from; excluded from the library.                          |

The files are the source of truth. The built-in library is whatever is in `public/templates/`, listed in
file-name order, and a file that does not read cleanly fails the build with its path in the error. The
Graphics panel's Templates tab lists this library (`filterBuiltinTemplates`), so a file added there shows up
in the tab.

## File format

A `.tfvetemplate` is JSON. The reader is `deserializeTemplate` and the schema is
`core/templates/templateSchema.ts`.

- **Envelope**: `$schema` and `tfve_type: "motion_template"`. Both are dropped on read. A file with a
  different `tfve_type` is refused.
- **`version`**: a positive whole number, currently `1`. A newer version is refused with a message
  asking the user to update the editor; a missing version is read as `1`.
- **Template fields**: `id`, `name`, `category`, `description`, `author`, `createdAt`, `duration`
  (microseconds), `responsiveTiming` (`introDuration`, `outroDuration`), `bounds` (`width`, `height`,
  `originX`, `originY`), `tracks`, `publishedParams`, `previewThumbnail`.
- **`tracks`** use the same schema as a project's tracks, so a template cannot hold anything a project
  could not. Errors name the field, for example `tracks.0.clips.0.duration`.
- **Unknown top-level fields** are kept when a template is read and written back.
- **Track order**: the first track is the top layer. Put text above its background shape.
- **Units**: crop is a fraction of the source (`0` to `1`), not a percentage. Positions are relative to
  the centre of the template's own canvas (`bounds`).

### Published fields

Each entry in `publishedParams` points at a clip in the template and a property on it:

| `targetProperty`                                   | Effect                                                        |
| -------------------------------------------------- | ------------------------------------------------------------- |
| `text.content`, `text.fontFamily`, `text.fontSize` | Text, font, and size (`text.fontSize` property).              |
| `text.fill`, `text.accentBarColor`                 | Recolours; keyframed colours keep their animation.            |
| `shape.fill`, `shape.stroke`                       | Recolours the shape, including an animated `shape.fillColor`. |
| `solid.color`, `shape.gradient`                    | Solid colour and shape gradient.                              |
| `transform.scale`, `transform.opacity`             | Scale and opacity of the layer.                               |

`text.stroke` is accepted by the schema but not applied yet.

## Writing a template

1. Copy `public/templates/example.tfvetemplate`, give it a new `id` and `name`.
2. Edit the layers. Keep clips on one track from overlapping in time.
3. Keep every `publishedParams[].targetClipId` pointing at a clip id in the file.
4. Import it from the Graphics panel to try it. To ship it, add it to `public/templates/`.

## The legacy generator

Thirteen of the shipped files are generated from the older definitions in
`core/text/graphicsTemplates.ts` by `core/templates/templateConverter.ts`. After changing either, run:

```
npm run templates:generate
```

It rewrites the files in `public/templates/` (keeping each file's `createdAt`). `npm test` never writes
files; it only checks that the shipped files match the converter output and tells you to run the script if
they do not.

## Tests

- `builtinTemplates.test.ts`: the library is exactly the shipped files; the example reads and renders.
- `templateSchema.test.ts`: exact round trips, version and validation errors.
- `templateMapping.test.ts`: overrides, crop units, frame decorations, layer order.
- `templateConverter.test.ts`: the shipped files match the converter.
- `tests/e2e/template-parity.spec.ts`: a card's pixels match the Program monitor.
