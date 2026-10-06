# Rendering

Preview and export share one contract: `resolveFrame(project, time)` produces `ActiveLayer[]`, and a
`FrameRenderer` draws them from a `frameProvider`. Two renderers implement it.

| Renderer | File | Role |
| --- | --- | --- |
| Canvas2D | `services/playback/compositor.ts` (`Canvas2DRenderer`) | Reference. Pixel truth for Phase 1 projects. |
| WebGL2 | `services/render/GlCompositor.ts` | Required by Phase 2 features; parity-tested against Canvas2D. |

## Renderer selection

A canvas can hold only one context type, so the renderer is chosen once per project and canvas.

- `selectRenderer(project)` returns `webgl2` only when `projectNeedsGpu(project)` is true (effects,
  masks, non-normal blend modes, generated sources, sequences, time remap), or the URL has
  `?renderer=webgl2`. `?renderer=canvas2d` forces Canvas2D. If WebGL2 is unavailable it falls back.
- Phase 1 projects therefore stay on Canvas2D in preview and export, so their output is unchanged.
- Export uses the same rule (`exporter.ts`, `ExportRunOptions.renderer`; the worker protocol carries
  `start.renderer` and `done.renderer`). The compatibility (MediaRecorder) path is always Canvas2D.

## WebGL2 pipeline

- Context: `alpha:false`, `antialias:false`, `premultipliedAlpha:true`.
- Each layer is one quad generated from `gl_VertexID`; geometry comes from `core/layerGeometry.ts`
  (`layerAffine`), the same math the Canvas2D path uses: fit (contain) → anchor → scale → rotate →
  translate, in composition pixels with y down.
- Textures are uploaded premultiplied, LINEAR filtering, CLAMP_TO_EDGE, no mipmaps. The fragment shader
  outputs `texture * opacity`.
- Blend functions over an opaque backdrop: normal `(ONE, ONE_MINUS_SRC_ALPHA)`, add `(ONE, ONE)`,
  multiply `(DST_COLOR, ONE_MINUS_SRC_ALPHA)`, screen `(ONE, ONE_MINUS_SRC_COLOR)`.
- Textures are cached per clip id, re-uploaded only when the source object changes, and released after
  300 unused frames or via `releaseUnused` / `dispose`.
- Context loss: `webglcontextlost` is `preventDefault`ed; the program and textures are counted released.
  On `webglcontextrestored` the program is rebuilt and textures re-upload lazily. While lost, `render`
  returns `false`.
- No pixel read-back on the hot path (enforced by `renderBoundary.test.ts`). The module is worker-safe:
  no `window`, and `document` only behind a guard.

## Parity policy

`tests/e2e/render-parity.spec.ts` renders 13 scenes through both renderers. A pixel is "bad" when any
channel differs by more than 3. Strict scenes (no resampling: identity, semi-transparent pixels)
allow ≤ 0.1% bad pixels; transformed scenes ≤ 1%. Analytic quadrant probes (from `layerAffine`) allow ≤ 6.
Known differences: edge anti-aliasing on rotated or fractional-fit rects (letterbox maxDiff 15, rotate
maxDiff 135 on edge pixels only) – interiors match exactly.

## Verified

- Environment: Playwright Chromium, ANGLE / SwiftShader (software). **No real GPU has been tested.**
- `render-gl.spec.ts`: context loss and restore, textures and programs back to 0 after `dispose`, CPU
  submit time for 4 layers at 720p far under the 8 ms budget (this measures CPU submission only; GPU
  time is not captured).
- `export-gl.spec.ts`: the worker export runs WebGL2 (`lastRenderer === 'webgl2'`) and reproduces the
  expected layer pixels.
- Export speed, 481 frames 480p synthetic project, SwiftShader: Canvas2D ≈ 837 fps, WebGL2 ≈ 188 fps.
  WebGL2 is slower here (software GL plus `preserveDrawingBuffer` and canvas → `VideoFrame`). This misses
  the "no more than 15% slower" target on this machine; it is mitigated by Phase 1 projects staying on
  Canvas2D. Re-measure on a real GPU before Gate I relies on it.
