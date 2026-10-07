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

## Gate I: Properties, Keyframing and Transform Gizmo

### Clip Properties & Crop

- Property IDs: `position` [x, y], `scale` [x, y], `rotation` (degrees), `opacity` (0–1), `anchor` [x, y], and `crop` [left, top, right, bottom] (0–1 fractions).
- Crop insets are clamped such that `left + right < 1` and `top + bottom < 1`, preserving at least 1% visible content.

### Legacy `clip.transform` Policy

- The Inspector treats `clip.properties` as the single source of truth.
- On the first Inspector edit of a clip containing a legacy static `clip.transform`, `migrateLegacyTransform(clip)` converts it to constant entries in `clip.properties` and removes `clip.transform` within that same single recorded history entry.
- Reading continues to fall back to `clip.transform` transparently for Phase 1 projects that have not been modified.

### Inspector Editing Semantics

- Editing a constant property replaces the constant value.
- Editing an animated property auto-keys at the playhead time (frame-snapped).
- Scrubbing inputs coalesces into a single undo step.
- Stopwatch toggles animation on/off: turning on creates a keyframe at the playhead; turning off flattens the property to the current value.

### On-Canvas Gizmo Math & Coordinate Spaces

- Coordinate transformation hierarchy:
  1. **Monitor CSS px → Composition px**: Divide by `monitorScale` (monitor pixels per composition pixel, incorporating fit scale and user zoom).
  2. **Composition px → Clip-Local Layer Space**: Subtract the pivot $T = (W/2 + x + ax, H/2 + y + ay)$, apply inverse rotation $R(-\theta)$, and divide by scale $(s_x, s_y)$.
- `layerAffine` is the single source of truth for mapping the unit quad $(u, v) \in [0, 1]^2$ to composition pixels (y down).
- **Pivot & Anchor Math**:
  When dragging the anchor handle, the anchor point moves in composition space to the pointer location. The `position` property is simultaneously compensated via `positionForPivot` so that the layer content does not visually shift on the screen.
- **Snapping**:
  Bounding box features (left, center, right; top, middle, bottom) snap to composition guides (center, edges, third lines, safe areas) within a tolerance in composition pixels.

## Gate J: Effect Parameter Keyframing

Effect parameters use dynamic property IDs adhering to the pattern:

```
effect:<type>:<instanceId>:<paramName>
```

- **Universal Contract**: By implementing dynamic lookup in `descriptorFor(propertyId)` (`core/properties.ts`), all effect parameters inherit the full animation infrastructure:
  - Linear, hold, and bezier ease curve evaluation via `core/animation.ts`.
  - Inspector stopwatch toggles, keyframe diamond steppers, and auto-keying at current playhead.
  - Timeline keyframe diamond lanes with drag-move, drag-box marquee selection, copy (`mod+c`), paste (`mod+v`), and delete (`delete`).
  - Graph Editor cubic bezier visual manipulation (`shift+g`) and Easy Ease (`f9`).
- **Splitting & Retiming**:
  - `splitAnimatedValue` and `retimeAnimatedValue` cleanly subdivide and shift effect parameter keyframes when clips are trimmed or split on the timeline.
