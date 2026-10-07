# Rendering

Preview and export share one contract: `resolveFrame(project, time)` produces `ActiveLayer[]`, and a
`FrameRenderer` draws them from a `frameProvider`. Two renderers implement it.

| Renderer | File                                                   | Role                                                          |
| -------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| Canvas2D | `services/playback/compositor.ts` (`Canvas2DRenderer`) | Reference. Pixel truth for Phase 1 projects.                  |
| WebGL2   | `services/render/GlCompositor.ts`                      | Required by Phase 2 features; parity-tested against Canvas2D. |

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

## Crop rendering

Crop insets [left, top, right, bottom] as source fractions (0–1) are supported identically across both renderers:

- **Canvas2D**: Computes source rect and destination rect in `drawImage`, displaying only the uncropped sub-rectangle without shifting its composition-space anchor or scale.
- **WebGL2**: Passes insets as `u_crop` to `layer.vert.glsl` and offsets vertex texture coordinates, paired with `layerAffine` using `croppedFitRect` so the visible part maintains its exact on-screen geometry.

## Effects & accumulation pipeline (Gate J)

When frames contain effects, adjustment layers, or solid colors (`projectNeedsGpu(project)` is true):

- **Accumulation FBO**: A persistent RGBA8 framebuffer composites bottom-to-top track by track.
- **Layer-space Processing**: Effects run in a layer-space framebuffer sized to the cropped source resolution capped at 2× the composition dimensions, preserving sharpness without double resampling.
- **Ping-Pong Passes**: Multi-pass or chained shaders (e.g., Gaussian Blur separable passes, Glow) cycle through an `FboPool`.
- **Adjustment Layers**: Sample the current accumulation texture, process it through the adjustment layer's effect stack, and blend the result back over lower tracks.
- **Fast Path Bit-Identical**: Frames with no active effects or adjustment layers skip accumulation passes and render directly to the canvas, preserving 100% bit parity with Phase 1 / Gate H baseline.

## Video scopes readback

Video scopes (`ScopesPanel`) operate on downsampled 2D canvases alongside the preview monitor:

- Readbacks via `gl.readPixels` are capped at `≤ 256×144` resolution to preserve 60 fps playback.
- Only the currently active scope mode executes analysis.

## Real-GPU verification (`test:gpu`)

Gate H, Gate I, and Gate J baseline tests in Playwright Chromium can be run with hardware acceleration:

```bash
npm run test:gpu
```

This runs Playwright under the `chrome-gpu` project using locally installed Google Chrome with `--enable-gpu` and `--ignore-gpu-blocklist`. It prints the unmasked GPU renderer string via `WEBGL_debug_renderer_info` and executes:

- `render-parity.spec.ts`: Canvas2D vs WebGL2 bit parity on 16 test scenes.
- `render-gl.spec.ts`: context loss/restore, leak tests, and CPU submit time.
- `export-gl.spec.ts`: worker export parity with WebGL2.
- `gate-i-evidence.spec.ts`: export speed benchmark and 1,000 keyframes timeline scrub latency.
- `effects.spec.ts`: effects library, color panel (basic, curves, wheels, LUT), scopes toggle, adjustment layers, solid color layers, and interchange warnings.

## Verified

- Environment: Hardware Google Chrome on Apple Silicon (Apple M4, Metal ANGLE) & Playwright Chromium.
- `render-gl.spec.ts`: context loss and restore, textures and programs back to 0 after `dispose`, CPU submit time under budget.
- `export-gl.spec.ts`: worker export runs WebGL2 and reproduces expected pixels.
- `render-parity.spec.ts`: strict and transformed scenes match Canvas2D reference.
- `effects.spec.ts`: all 5 Gate J UI and rendering tests passing.
