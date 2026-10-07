# Masks Architecture & Design Specification (Gate L)

## 1. Overview & Coordinate Space

Masks in The Free Video Editor allow clipping, isolating, or feathering video clips, adjustment layers, and individual effects using geometric shapes (rectangles, ellipses, and arbitrary bezier paths).

### Coordinate Space
* **Normalized Layer-Local Coordinates**: Mask coordinates are stored normalized from `(0, 0)` (top-left) to `(1, 1)` (bottom-right) of the cropped source frame.
* **Transform Invariant**: Because masks are defined in normalized source layer space, they naturally follow the layer's crop, transform, scale, position, anchor, and rotation. No mask geometry coordinates are stored in composition pixels.
* **Pixel-Valued Parameters**: `feather` and `expansion` are specified in composition pixels (matching effect parameters in Gate J), converted into layer pixel space via the layer's scale factor.

---

## 2. Pipeline Order

Within each layer rendering pass in the WebGL2 pipeline:

```text
Source Texture
   ↓
Crop Insets (hardware / shader normalized coords)
   ↓
Mask Matte Generation & Evaluation (ping-pong accumulation)
   ↓
Multiply Layer RGBA by Combined Matte M
   ↓
Effects Chain (including per-effect masks via effectId)
   ↓
Transform / Opacity / Blend Mode
   ↓
Accumulation Composite FBO
```

> **Design Consequence**: Because masks run before downstream effects, effects such as Gaussian Blur placed after a mask will naturally soften and blur the mask boundary. If an effect has an `effectId`-linked mask, that mask limits the effect's mix rather than the clip alpha.

---

## 3. Combine Rules & Matte Evaluation

Each mask produces a scalar matte value $m \in [0, 1]$:
1. **Inversion**: If `inverted == true`, $m = 1 - m$.
2. **Opacity**: $m = m \times \text{mask.opacity}$.
3. **Accumulation**: The running matte accumulator $M$ evaluates masks in list order:
   - Initial accumulator value: $M = 0$ if the first mask's mode is `'add'`, otherwise $M = 1$.
   - **Add**: $M = M + m - (M \times m)$
   - **Subtract**: $M = M \times (1 - m)$
   - **Intersect**: $M = M \times m$
4. **Premultiplied Output**: The final layer output is multiplied by $M$:
   $$\text{Layer}_{\text{premultiplied}} = \text{RGBA} \times M$$

---

## 4. Shape Representation & Keyframe Animation

To leverage the existing Gate I keyframe interpolation engine (component-wise numeric arrays) without writing bespoke vector interpolators, mask shapes are represented as flat numeric arrays:

* **Rectangle (`rect`)**:
  `[cx, cy, w, h, rotationDeg, roundness]` (6 numbers)
* **Ellipse (`ellipse`)**:
  `[cx, cy, rx, ry, rotationDeg]` (5 numbers)
* **Path (`path`)**:
  `[x0, y0, inX0, inY0, outX0, outY0, x1, y1, inX1, inY1, outX1, outY1, ...]`
  (6 numbers per control point: anchor position and incoming/outgoing tangent offsets from the anchor).
  - `closed: boolean` is stored as a flag on the `Mask`, not animated.

### Same-Point-Count Invariant
Keyframes of a path shape MUST all share the same number of control points. Adding or deleting control points while shape is animated is blocked in core with a validation error unless animation is first flattened or disabled.

---

## 5. Rendering & Feathering Strategy

1. **Analytic Shaders (Rect & Ellipse)**:
   - Evaluated analytically in signed-distance field (SDF) shaders with 1-pixel anti-aliasing.
   - Expansion is an analytic offset to the SDF.
2. **Path Rasterization**:
   - Rasterized using `Path2D` on `OffscreenCanvas` at layer FBO resolution.
   - Cached by `(mask.id, evaluatedGeometryHash, width, height)` to eliminate redundant redraws on static frames.
3. **Feather Profile**:
   - Feather is implemented as a separable Gaussian blur of the matte with $\sigma = \text{feather} / 2$.
   - Edge boundary pixel matte evaluates to 0.5, with the transition region spanning $\pm \text{feather}$.
4. **Neutral-Skip Optimization**:
   - If a clip has no masks, all masks are disabled, or the combined matte is identity (1.0 across full frame), mask passes are skipped completely, maintaining bit-identical output with mask-free rendering.

---

## 6. Effect-Linked Masks & Adjustment Layers

* **Effect Masking**: If `mask.effectId` is populated with a valid effect instance ID, the mask matte does NOT alter clip alpha; instead, it modulates that specific effect's `u_mix` parameter. The effect is applied inside the matte and bypassed outside.
* **Adjustment Layers**: Masks on adjustment layers constrain the adjustment to the matte region, leaving underlying video unaffected outside the matte.

