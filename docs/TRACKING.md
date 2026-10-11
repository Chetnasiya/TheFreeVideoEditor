# Motion Tracking & Stabilization Architecture (Gate R)

## 1. Overview & Objectives

Motion tracking in The Free Video Editor enables robust, deterministic, client-side video tracking and 2D camera stabilization directly in the browser. All processing is strictly local (privacy-first), zero telemetry, leveraging Web Workers, WebCodecs/mediabunny sample decoding, and native canvas/typed arrays.

The motion tracking subsystem fulfills three primary workflows:

1. **Point Tracking & Object Follow**: Track features (point, region, or multi-point affine) across frames to bind layer properties (position, rotation, scale) live in playback or bake into discrete keyframes.
2. **Mask Tracking**: Automatically transform and animate vector mask shapes (rectangles, ellipses, and arbitrary bezier path points) over time to track moving subjects.
3. **2D Camera Stabilization**: Smooth camera jitter and shake using Gaussian trajectory filtering with counter-motion compensation and automatic margin calculation (auto-zoom) to eliminate black borders.

---

## 2. Coordinate Spaces & Transformations

Accurate tracking requires strict separation between source media space and timeline composition space:

### Coordinate Systems:

- **Normalized Media Space**: $(u, v) \in [0, 1] \times [0, 1]$ relative to uncropped raw video frame dimensions $(W_{\text{media}}, H_{\text{media}})$.
- **Cropped Source Space**: Normalized coordinates within the active crop bounds defined by `clip.properties.crop` ($[c_{\text{top}}, c_{\text{right}}, c_{\text{bottom}}, c_{\text{left}}]$).
- **Composition Pixel Space**: Relative to the composition center $(W_{\text{comp}}/2, H_{\text{comp}}/2)$ in pixels, matching `clip.properties.position`.

### Conversion Pipeline:

Tracking features are extracted and tracked in **raw media space** ($u, v$) to remain invariant to timeline edits, speed alterations, or crop adjustments.
When binding a tracked feature to a downstream clip or mask:

1. Media time $\tau$ is mapped to timeline time $t$ via `sourceToTimeline(clip, \tau)`.
2. The normalized point $(u, v)$ is converted to composition space:
   $$[x_{\text{comp}}, y_{\text{comp}}] = \text{trackedPointToComposition}(u, v, \text{clip}, t, \text{compositionWidth}, \text{compositionHeight})$$
3. Crop insets, anchor point offsets, scale, rotation, and translation matrices are evaluated analytically via `layerAffine` and `applyAffine`.

---

## 3. Algorithmic Engine & Optical Flow

### Lucas-Kanade Optical Flow with Gaussian Pyramids (`src/editor/core/tracking/lk.ts`)

- **Pyramid Decomposition**: Frames are converted to grayscale and downsampled into multi-level Gaussian pyramids (typically 3–4 levels, scale factor 0.5) to capture large displacements without sacrificing subpixel precision.
- **Iterative Refinement**: At each pyramid level, iterative Lucas-Kanade with bilinear interpolation computes the displacement vector $\mathbf{d} = (\delta x, \delta y)$:
  $$J = \begin{bmatrix} I_x^2 & I_x I_y \\ I_x I_y & I_y^2 \end{bmatrix}, \quad \mathbf{d}_{k+1} = \mathbf{d}_k + J^{-1} \sum \begin{bmatrix} I_x \\ I_y \end{bmatrix} (I_0(\mathbf{x}) - I_1(\mathbf{x} + \mathbf{d}_k))$$
- **Stopping Criteria**: Maximum iterations (typically 15) or displacement threshold $\epsilon < 0.01$ px.

### Normalized Cross-Correlation (NCC) Template Fallback (`src/editor/core/tracking/ncc.ts`)

- Used for single-point tracking, occlusions, and recovery from sudden motion spikes.
- Computes zero-mean normalized cross-correlation between the reference patch $T$ and candidate window $I$:
  $$\gamma(u, v) = \frac{\sum_{\mathbf{x}} (I(\mathbf{x} + \mathbf{u}) - \bar{I}_{\mathbf{u}})(T(\mathbf{x}) - \bar{T})}{\sqrt{\sum_{\mathbf{x}} (I(\mathbf{x} + \mathbf{u}) - \bar{I}_{\mathbf{u}})^2 \sum_{\mathbf{x}} (T(\mathbf{x}) - \bar{T})^2}}$$
- Rejects candidate matches where $\gamma < \text{confidenceThreshold}$ (default 0.70).

### Multi-Point Feature Selection & RANSAC (`shiTomasi.ts`, `ransac.ts`)

- **Shi-Tomasi Corner Detection**: Finds strong features by evaluating $\min(\lambda_1, \lambda_2) > \lambda_{\text{min}}$ on the structure tensor $J$.
- **RANSAC Affine Estimation**: Robustly rejects outlier feature vectors when estimating rigid 2D similarity transforms $(t_x, t_y, \theta, s)$ across frames.

---

## 4. Bindings & Baking (Slice 2 & 3)

### Follow Binding (Live Playback)

- Clips can dynamically bind their position, scale, or rotation to an active `TrackRecord`.
- Evaluated in `evaluateLayerProperties` (`src/editor/core/playback.ts`) during frame resolution.
- Live bindings capture an initial offset $(\Delta x, \Delta y, \Delta s, \Delta \theta)$ at binding time so that subject placement remains stable without sudden jumps.

### Keyframe Baking & Thinning

- Keyframe baking iterates over the tracking timeline range and writes discrete keyframe records to `clip.properties`.
- **Ramer-Douglas-Peucker Thinning**: Applied to trajectory keyframes to remove redundant colinear samples within tolerance $\epsilon = 0.5$ px, drastically reducing project file size while preserving trajectory fidelity.

### Mask Tracking

- Tracked motion can be baked directly to vector masks (`rect`, `ellipse`, or arbitrary `path` control points).
- For `path` shapes, position coordinates and cubic bezier tangents are rigidly transformed using the calculated frame-to-frame delta $(\Delta x, \Delta y, \Delta \theta, s)$, preserving shape curvature and feathering.

---

## 5. 2D Camera Stabilization (Slice 4)

### Motion Smoothing

- Tracked frame-to-frame displacements are integrated into a cumulative camera trajectory $T(t) = (x(t), y(t), \theta(t))$.
- A 1D Gaussian kernel smooths the trajectory over a configurable temporal radius $W$ (default radius $\sim 15$ frames, $\sigma = 7.5$):
  $$S(t) = \frac{\sum_{i=-W}^{W} K_i T(t + i)}{\sum_{i=-W}^{W} K_i}$$
- The counter-motion compensation $\Delta(t) = -(T(t) - S(t))$ cancels high-frequency jitter while preserving deliberate camera pans.

### Auto-Zoom & Border Guarantee

- Applying counter-motion translations and rotations introduces potential border voids (black borders).
- `calculateAutoZoomScale` computes the maximum excursions across the clip:
  $$s_{\text{auto}} = \max_t \left( \frac{1}{1 - 2 \frac{|\Delta x(t)|}{W_{\text{comp}}}}, \, \frac{1}{1 - 2 \frac{|\Delta y(t)|}{H_{\text{comp}}}} \right) \times (1 + |\sin \Delta \theta(t)|) \times (1 + \text{margin})$$
- Ensures that stabilized frames completely fill the viewport with zero black border exposure.

---

## 6. Worker Threading & Memory Lifecycle

- Tracking runs inside a dedicated Web Worker (`src/editor/services/tracking/tracking.worker.ts`).
- **Frame Decoding**: Decodes frames via `mediabunny` or WebCodecs off the main UI thread.
- **Proxy Priority**: Automatically leverages proxy media when available (`asset.proxy.status === 'ready'`), yielding up to $4\times$ throughput speedup compared to full-resolution tracking.
- **Resource Management**: ImageBitmaps and Float32Array pyramid allocations are recycled or promptly closed after correlation, ensuring constant memory usage over long video clips.
