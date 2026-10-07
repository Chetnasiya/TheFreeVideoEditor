# Effects & Color Architecture (Gate J)

This document details the effects, color correction, curves, 3D LUTs, video scopes, and adjustment/solid layer subsystems implemented in Gate J.

## 1. Effects Framework

### Registry & Data Model

Effects in The Free Video Editor are defined declaratively as pure data structures and registered in `src/editor/core/effects/registry.ts`.

- **EffectDefinition**:
  - `id`: unique effect identifier (e.g., `'gaussianBlur'`, `'colorCorrection'`)
  - `name`: user-facing label
  - `category`: `'blur' | 'stylize' | 'color' | 'keying' | 'distort'`
  - `version`: integer schema version for migration
  - `params`: schema dictionary with defaults, min/max, step, unit, and animatability
  - `isNeutral`: pure predicate function evaluating whether current parameter values constitute a no-op / pass-through
- **EffectInstance**:
  - Attached to `clip.effects: EffectInstance[]`
  - `id`: unique instance ID
  - `type`: matching definition ID
  - `enabled`: boolean toggle (defaults to `true`)
  - `params`: dictionary of constant values or `AnimatedValue<T>`

### Parameter Keyframe Integration

Effect parameters are first-class citizens in the keyframe system. Property IDs follow the format:

```
effect:<type>:<instanceId>:<paramName>
```

Because `descriptorFor` in `src/editor/core/properties.ts` recognizes this format dynamically, effect parameters immediately gain:

- Stopwatch enable/disable (`enableAnimation`, `disableAnimation`)
- Keyframe insertion/editing (`setPropertyAtTime`, `toggleKeyframe`)
- Timeline keyframe diamonds and diamond rows
- Timeline keyframe lanes
- Bezier spline Graph Editor integration (`shift+g`)

---

## 2. Starter Effects (12 Core Processors)

| Effect               | Category  | Primary Parameters                                                                                                          | Neutral State                                 | Alpha Handling                                                                  |
| :------------------- | :-------- | :-------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------- | :------------------------------------------------------------------------------ |
| **Gaussian Blur**    | `blur`    | `radius` (0–100 px), `mix`                                                                                                  | `radius === 0 \|\| mix === 0`                 | 2-pass separable 9-tap blur; preserves edge alpha                               |
| **Sharpen**          | `blur`    | `amount` (0–100%), `mix`                                                                                                    | `amount === 0 \|\| mix === 0`                 | Unsharp mask Laplacian kernel; preserves alpha                                  |
| **Vignette**         | `stylize` | `amount` (0–1), `radius` (0.1–1), `softness` (0.01–1), `mix`                                                                | `amount === 0 \|\| mix === 0`                 | Radial cosine falloff; darkens RGB, preserves alpha                             |
| **Mosaic**           | `stylize` | `blockSize` (1–100 px), `mix`                                                                                               | `blockSize === 1 \|\| mix === 0`              | UV quantizer block sampler; preserves source alpha                              |
| **Film Grain**       | `stylize` | `amount` (0–1), `size` (1–10 px), `mix`                                                                                     | `amount === 0 \|\| mix === 0`                 | Hash-based PRNG noise generator; preserves source alpha                         |
| **Invert**           | `color`   | `mix` (0–1)                                                                                                                 | `mix === 0`                                   | Inverts RGB channels (`1 - rgb`); strictly preserves alpha                      |
| **Mirror**           | `distort` | `mode` (`leftToRight`, `rightToLeft`, `topToBottom`, `bottomToTop`), `mix`                                                  | `mix === 0`                                   | Reflects UV coordinates around axis; preserves alpha                            |
| **Glow**             | `stylize` | `threshold` (0–1), `intensity` (0–5), `radius` (0–50 px), `mix`                                                             | `intensity === 0 \|\| mix === 0`              | Luma isolation + blur pass + additive composite                                 |
| **Chroma Key**       | `keying`  | `keyColor` (RGBA), `similarity` (0–1), `smoothness` (0–1), `spill` (0–1), `mix`                                             | `similarity === 0 \|\| mix === 0`             | Color difference in YCbCr space; clears key alpha & suppresses green/blue spill |
| **Color Correction** | `color`   | `exposure`, `contrast`, `highlights`, `shadows`, `whites`, `blacks`, `temperature`, `tint`, `saturation`, `vibrance`, `mix` | All CC params at 0 \|\| `mix === 0`           | Lift/Gamma/Gain + EV stops + Rec.709 saturation + vibrance + tint               |
| **Curves**           | `color`   | `points` (CurvePoint[] per Master, Red, Green, Blue), `mix`                                                                 | Linear diagonal (0,0)->(1,1) \|\| `mix === 0` | Fritsch-Carlson monotone cubic spline evaluated into 256x1 LUT texture          |
| **3D LUT**           | `color`   | `lutAssetId` (OPFS asset reference), `mix`                                                                                  | Empty asset \|\| `mix === 0`                  | Trilinear interpolation sampler across 3D RGBA32F texture                       |

---

## 3. Rendering Pipeline & Frame Accumulation

### Pipeline Order per Layer

```
Source Texture (Video / Image / Canvas / Solid)
  │
  ▼
Crop (UV sub-rect clamp)
  │
  ▼
Effect Stack (FBO ping-pong: layer-space resolution capped at 2× composition dimensions)
  │
  ▼
Transform / Opacity / Blend Mode
  │
  ▼
Composite into RGBA8 Accumulation Framebuffer
```

### Fast-Path Parity Guarantee

- Frames without active effects or adjustment layers bypass the intermediate ping-pong passes and composite directly using the existing WebGL2 and Canvas2D shaders.
- Parity tests (`render-parity.spec.ts`) pass with zero diff on axis-aligned scenes, guaranteeing bit-identical rendering against the reference renderer.

### Adjustment Layers

Adjustment layers (`source: { type: 'adjustment' }`) have no visual asset of their own. When encountered during compositor traversal from bottom to top:

1. The lower tracks are rendered into the accumulation framebuffer.
2. The current accumulation texture is copied into the adjustment layer's input FBO.
3. The adjustment layer's effect stack processes this texture.
4. The result is blended back into the accumulation framebuffer with the adjustment layer's transform, opacity, and blend mode.

### Solid Color Layers

Solid color layers (`source: { type: 'solid', color: { r, g, b, a } }`) generate a 1x1 color texture uploaded to the GPU and rendered with full transform, crop, and effect capabilities.

---

## 4. Color Working Space

- **Space**: 8-bit RGBA, gamma-encoded sRGB / Rec.709.
- **Operations**: Exposure EV stops, contrast pivots (0.5), Rec.709 luma (`0.2126 R + 0.7152 G + 0.0722 B`), and HSL/YCbCr color differences operate directly in this space.
- **Consequences**:
  - Possible 8-bit posterization/banding after extreme color grading or heavy blurs.
  - No HDR / high dynamic range values (> 1.0) preserved between passes.
  - Blending is performed in gamma-encoded space without linear-light expansion (standard NLE preview mode).

---

## 5. Video Scopes

Scopes run on a dedicated 2D canvas rendered beside the program monitor:

- **Downsampled Readback**: Captured from the composition FBO downsampled to `≤ 256×144` pixels (`gl.readPixels`) to guarantee 60 fps responsiveness.
- **On-Demand Processing**: Only the currently active scope mode computes its analysis:
  1. **Waveform**:
     - _Luma Mode_: Rec.709 luma intensity column histogram mapped from 0 to 100 IRE.
     - _RGB Overlay_: Simultaneous red, green, and blue waveforms rendered with additive blending.
  2. **RGB Parade**: Red, Green, and Blue columns side by side, allowing immediate white/black balance inspection.
  3. **Histogram**: 256-bin distribution for R, G, B, and Luma channels.
  4. **Vectorscope**: Cb-Cr chrominance plot centered on neutral gray with Rec.709 75% target boxes (R, Mg, B, Cy, G, Yl) and a skin tone line (I-axis, 123°).

---

## 6. Interchange Warnings

Because standard interchange formats (EDL, Final Cut Pro XML, Apple FCPXML, OpenTimelineIO) do not serialize browser WebGL shader graphs or custom LUT assets:

- When exporting to any interchange format, the Export Dialog computes all clips containing effects, adjustment layers, or solid color layers.
- A prominent amber warning banner informs the user:
  > _"Effects, Adjustment Layers, and Solid Colors are not included in project files; use Video export to render them."_
