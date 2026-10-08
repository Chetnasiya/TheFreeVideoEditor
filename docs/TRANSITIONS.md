# Transitions Architecture (Gate K)

TheFreeVideoEditor provides a high-performance, GPU-accelerated video transition pipeline combined with audio crossfades that run bit-identically across real-time playback previews and worker WebCodecs export sessions.

---

## 1. Core Transition Model

Every transition is defined on a `Track` targeting either an adjacent cut point between two clips or an edge fade (head/tail):

```typescript
export type TransitionEdge =
	| { kind: 'cut'; fromClipId: ClipId; toClipId: ClipId }
	| { kind: 'head'; clipId: ClipId }
	| { kind: 'tail'; clipId: ClipId };

export interface Transition {
	id: string;
	type: TransitionType;
	duration: Time; // microseconds
	alignment: 'center' | 'start' | 'end';
	edge: TransitionEdge;
	params: Record<string, JsonValue>;
}
```

### Supported Transitions

1. **Cross Dissolve** (`crossDissolve`): Smooth equalized blend between outgoing and incoming clip frames.
2. **Dip to Black** (`dipToBlack`): Outgoing clip fades to black at mid-point, incoming clip fades in from black.
3. **Dip to White** (`dipToWhite`): Outgoing clip flashes up to pure white at mid-point, incoming clip recovers from white.
4. **Fade** (`fade`): Tail/head transparency or cross-mix fade.
5. **Wipe** (`wipe`): Directional horizontal, vertical, or angled curtain wipe with configurable edge softness.
6. **Slide** (`slide`): Incoming clip slides over outgoing clip while outgoing clip stays static.
7. **Push** (`push`): Incoming clip pushes outgoing clip laterally or vertically out of the viewport.
8. **Zoom Dissolve** (`zoomDissolve`): Rapid scale zoom and blend effect across cut boundary.
9. **Iris** (`iris`): Expanding or contracting circular iris with configurable softness and center coordinates.

---

## 2. Window and Media Handle Math

Transitions placed on cut points require source media frames beyond the trimmed boundaries:

- **Incoming clip B**: Needs source media frames before `clipB.sourceIn` ($[sourceIn - \text{duration}/2, sourceIn]$ for center alignment).
- **Outgoing clip A**: Needs source media frames after `clipA.sourceOut` ($[sourceOut, sourceOut + \text{duration}/2]$ for center alignment).

### Mathematical Helper: `transitionWindow(cutTime, duration, alignment)`

- `center`: $[\text{cutTime} - \text{duration}/2, \text{cutTime} + \text{duration}/2]$
- `start`: $[\text{cutTime}, \text{cutTime} + \text{duration}]$
- `end`: $[\text{cutTime} - \text{duration}, \text{cutTime}]$

### Handle Inspection: `availableHandles(clipA, clipB, assetA, assetB, project)`

Evaluates:

- `handleA = assetA.duration - clipA.sourceOut`
- `handleB = clipB.sourceIn`
- Clamps durations to available handles or alerts the user with an Insufficient Handles warning in the Inspector.

---

## 3. Playback and Composition Pipeline

Transitions integrate seamlessly with `resolveFrame`:

```text
Project / Track State
        ↓
resolveFrame(project, time)
        ↓
Detects active transition window [start, end)
        ↓
Extracts layerA (outgoing) & layerB (incoming) with extended source time handles
        ↓
Emits composite ActiveLayer {
  transition: { type, progress, fromLayer, toLayer, params }
}
```

### GlCompositor & ShaderPass Execution

1. Outgoing and incoming layers are rendered to offscreen textures through the full `transform` $\to$ `crop` $\to$ `effects` pipeline.
2. `ShaderPassManager.applyTransition(type, fromTex, toTex, progress, params, targetFbo, w, h)` runs the dedicated GLSL transition fragment shader.
3. Fast-path optimization: clips without transitions skip intermediate render targets entirely and write directly to the canvas / accumulation buffer.

---

## 4. Audio Crossfade Parity

Both live timeline playback (`audioEngine`) and background offline export (`audioMix`) execute identical audio crossfade calculations:

```typescript
export function transitionGain(
	time: Time,
	win: TransitionWindow,
	curve: AudioCrossfadeCurve = 'equalPower'
): { gainA: number; gainB: number } {
	const p = transitionProgress(time, win, 'linear');
	if (curve === 'equalPower') {
		// Equal-power crossfade (preserves constant acoustic power)
		const angle = p * (Math.PI / 2);
		return { gainA: Math.cos(angle), gainB: Math.sin(angle) };
	}
	// Linear crossfade
	return { gainA: 1 - p, gainB: p };
}
```

---

## 5. UI Integration

- **Timeline**: Cut boundaries display transition blocks with interactive drag-trim handles and delete/context operations.
- **Inspector**: Displays transition type selector, duration editor, alignment controls, available media handle status, and parameter sliders (direction, softness, reverse).
- **Effects Library**: Includes a dedicated "Transitions" tab allowing drag-and-drop onto cut points or double-clicking to add default transitions.
