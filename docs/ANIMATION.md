# Animation, schema v2 and time remap

## Model (`core/animation.ts`)

- `AnimatedValue<T>` is `{ value }` or `{ keyframes }`. Keyframe times are clip-local timeline µs.
- Interpolations: `hold`, `linear`, `bezier`. Bezier uses the left keyframe's `easeOut` as P1 and the right
  keyframe's `easeIn` as P2; defaults are (0.42, 0) and (0.58, 1).
- Values hold before the first and after the last keyframe. Non-lerpable values hold their left value.
- Colors interpolate per channel in gamma-encoded sRGB (not linear light). Angles unwrap by default, with
  an optional `'shortest'` mode.
- Splitting uses de Casteljau subdivision and is lossless (verified on 1,000 random curves). A head trim
  re-bases keyframes (`retimeAnimatedValue`).

## Clip properties

`clip.properties` ids: `position` [x,y], `scale` [x,y], `rotation` (degrees), `opacity` (0–1),
`anchor` [x,y]. `evaluateLayerProperties` (in `core/playback.ts`) evaluates them at local time and merges
them over the legacy `clip.transform`, so renderers only see plain numbers. Clips without `properties`
resolve exactly as in Phase 1.

## Schema v2

`CURRENT_SCHEMA_VERSION = 2`. v1 → v2 is a no-op that bumps the version; versions > 2 are rejected. New
optional fields: `clip.source`, `properties`, `masks`, `blendMode`, `timeRemap`; `Track.transitions`;
`Project.sequences`; `Asset.proxy`. Ids across effects, masks, transitions and sequences must be unique and
transitions must reference existing clips. `duplicateProject` remaps these ids and drops `proxy`.

## Time remap

`timelineToSource` is bit-identical to Phase 1 without `timeRemap`. With it, the speed curve is integrated
(hold exact, linear trapezoid, bezier composite Simpson, 64 steps); `sourceToTimeline` inverts by binary
search. `splitClipsAt` honours it. **`trimClip` leaves `timeRemap` untouched on a head trim; this is
deferred to Gate M.**

## Not implemented in Gate H

Crop, and any UI for keyframes. Effects and masks exist as schema/types only; transitions are shape only.
