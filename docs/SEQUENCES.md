# Nested Sequences Architecture & Specification (Gate R)

This document specifies the architecture, data model, recursion contracts, and UI integration for **Nested Sequences** in The Free Video Editor.

---

## 1. Data Model & Pure Access Projection

### Data Structures (`src/editor/core/types.ts` & `src/editor/core/schema.ts`)

A nested sequence is a self-contained multi-track timeline container stored under `Project.sequences`:

```ts
export type SequenceId = Flavor<string, 'SequenceId'>;

export interface Sequence {
  id: SequenceId;
  name: string;
  settings?: Partial<ProjectSettings>; // Optional override for fps/resolution
  tracks: Track[];
}

export interface Project {
  // ...
  tracks: Track[]; // Root sequence tracks
  sequences?: Record<SequenceId, Sequence>; // Additional sequences
}
```

A nested instance placed onto a timeline is a standard `Clip` referencing the sequence via a discriminated union source:

```ts
export type ClipSource =
  | { type: 'asset'; assetId: AssetId }
  | { type: 'solid'; color: RgbaColor }
  | { type: 'text'; textId: string }
  | { type: 'adjustment' }
  | { type: 'sequence'; sequenceId: SequenceId };
```

### View Projection (`src/editor/core/sequences/access.ts`)

All timeline operations take and return a canonical `Project`. Rather than duplicating dozens of operations for sequences, sequence operations use a projection contract:

- `ROOT_SEQUENCE_ID = 'root' as SequenceId`: Canonical identifier for the main project timeline.
- `isRootSequence(id)`: Returns true if `!id || id === ROOT_SEQUENCE_ID`.
- `getSequence(project, id)`: Returns `project.sequences?.[id]` or `undefined`.
- `viewProject(project, sequenceId)`: Returns a virtual `Project` whose `tracks` and `settings` are projected from the sequence (inheriting root settings when sequence settings are omitted). Markers are root-only. Falls back gracefully to root project if the sequence is not found.
- `applyToSequence(project, sequenceId, op)`: Executes any existing `(view: Project) => Project` operation against the projected sequence view and updates `project.sequences[sequenceId].tracks` with the result.

---

## 2. Structural Invariants & Operations (`src/editor/core/sequences/operations.ts`)

1. **Max Nesting Depth (8)**:
   - Evaluated via `getDepthFromRoot(project, sequenceId)`.
   - Nesting deeper than `MAX_SEQUENCE_NESTING_DEPTH = 8` throws `SequenceDepthError`.
2. **Cycle Detection (Acyclic Directed Graph)**:
   - Evaluated via `wouldCreateCycle(project, hostSequenceId, candidateSequenceId)`.
   - Any self-reference or indirect cycle throws `SequenceCycleError`.
3. **Clip & Track Invariants**:
   - Time is integer microseconds.
   - Zero track overlaps within any sequence track.
   - Linked audio/video clips move and trim together.
4. **CRUD & Timeline Operations**:
   - `createSequence(project, name, settings)`: Allocates new sequence with default video and audio tracks.
   - `renameSequence(project, sequenceId, name)`: Renames sequence in `project.sequences`.
   - `deleteSequence(project, sequenceId, removeInstances)`: Checks sequence usage across all sequences and root. If used and `removeInstances = false`, throws `SequenceUsageError`. If `removeInstances = true`, deletes all instances project-wide.
   - `duplicateSequence(project, sequenceId)`: Deep-clones the sequence and all its tracks and clips with new unique IDs.
   - `nestSelection(project, hostSequenceId, clipIds, name)`: Extracts selected clips, creates a new sequence containing them (normalized to start at $t=0$), and replaces them in the host sequence with a linked sequence clip instance.
   - `expandSequenceInstance(project, hostSequenceId, clipId)`: Unrolls a sequence instance back into its component clips onto the host timeline tracks at the instance's timeline position.
   - `makeInstanceUnique(project, clipId)`: Duplicates the referenced sequence and redirects the selected clip instance to the new independent sequence.
   - `flattenForInterchange(project)`: Recursively resolves all sequence clip instances down to leaf media/solid/text clips for export to EDL, FCPXML, and OTIO.

---

## 3. Video Compositing Recursion (`src/editor/core/playback.ts` & `GlCompositor.ts`)

1. **Hierarchical Instance Keys**:
   - To prevent collisions between multiple instances of the same sequence (or identical clips across instances), layers and frame provider caches are keyed by `instanceKey`:
     $$\text{instanceKey} = \text{parentKey} + '/' + \text{sequenceId} + ':' + \text{clipId}$$
2. **Layer Resolution (`resolveFrame`)**:
   - When encountering a sequence clip at time $t$, calculates local nested time:
     $$t_{nested} = \text{clip.sourceIn} + (t - \text{clip.start}) \times \text{clip.speed}$$
   - Recursively resolves frames from the child sequence at $t_{nested}$.
   - Yields an `ActiveLayer` with `kind: 'sequence'`, `instanceKey`, and `nested: { sequenceId, nestedTime, size, layers }`.
3. **Offscreen FBO Rendering (`GlCompositor.ts`)**:
   - Nested sequences render into pooled offscreen framebuffers (`FboPool`) sized to the sequence composition dimensions.
   - The resulting texture is composited onto the parent target with the sequence clip's transform, opacity, blend mode, effects, and masks.
   - FBOs are acquired and released within each render frame, preventing GPU memory leaks.
4. **Media Pool Deduplication (`mediaPool.ts` & `frameProvider.ts`)**:
   - Video elements and active frame decoders are pooled by `instanceKey ?? clipId`.
   - Overlapping instances of the same sequence play concurrently without contending for the same HTMLVideoElement.

---

## 4. Audio Routing & Sub-Bus (Decision 6, `src/editor/services/audio/graph.ts`)

1. **Live Sub-Graph Architecture (Speed = 1)**:
   - For 1.0× speed nested sequence instances, audio routing creates a direct, live Web Audio sub-graph without latency or intermediate bouncing:
     $$\text{Nested clip sources} \xrightarrow{\text{gain/pan}} \text{Nested track chains (EQ, dynamics, mute/solo, fader, pan)} \xrightarrow{\text{Sub-bus}} \text{Host instance bus} \xrightarrow{\text{host vol/pan/fades}} \text{Host track input}$$
   - Any live volume, pan, EQ, compressor, or mute/solo changes inside the nested sequence immediately reflect in host playback with zero latency.
2. **Offline Bounce Sub-Path (Speed $\ne$ 1 / Time Remap)**:
   - For remapped or variable-speed nested sequence instances (e.g. 200% speed, reverse, curve remap), the instance is rendered via `renderOfflineAudio` with WSOLA pitch processing.
   - The bounced buffer is cached in `bouncedAudioCache` keyed by `${sequenceId}:${sourceIn}:${dur}:${speed}`.
   - Any edit to the child sequence immediately invokes `invalidateBouncedAudioCache()`, clearing stale renders.
   - While an offline bounce is rendering, the instance exposes a visible "rendering audio" state badge.
3. **DSP Oracle Parity & A/V Sync**:
   - Preview and export audio paths share 1:1 mathematical DSP parity (constant-power pan law, equal-power fades, biquad filter curves).
   - Audio/video sync is maintained within 1 video frame across both live sub-graph and bounced instances.

---

## 5. UI Integration

1. **Active Sequence & Per-Sequence Playheads**:
   - `store.activeSequenceId: SequenceId` (ephemeral session state, defaults to `ROOT_SEQUENCE_ID`).
   - `store.sequencePlayheads: Record<SequenceId, Time>` preserves playhead position per sequence.
2. **Timeline Breadcrumbs (`Timeline.tsx`)**:
   - Rendered in `.timeline-tabs` toolbar: `Main › [Sequence Name]`.
   - Clicking `Main` returns to the root composition.
3. **Media Library (`MediaLibrary.tsx`)**:
   - Filter tabs: `All`, `Media`, `Sequences`.
   - "+ Sequence" button creates new sequences via dialog prompt.
   - Sequence cards display duration and track count.
   - Drag-and-drop (`application/x-tfve-sequence`) places instances onto the timeline.
   - Double-clicking opens the sequence in the timeline.
   - Context/hover actions allow Renaming, Duplicating, and Deleting (with usage warnings).
4. **Timeline Context Menu (`Timeline.tsx` & `ClipView.tsx`)**:
   - Multi-selection: "Nest Selection…" opens modal to create a sequence from selected clips.
   - Single sequence clip: "Open in Timeline", "Expand Sequence", and "Make Unique".
5. **Export Dialog (`ExportDialog.tsx`)**:
   - Sequence selector dropdown in Video and Project panels.
   - Allows exporting any individual sequence or the main project timeline.
   - Interchange export flattens sequences using `flattenForInterchange`.

