# Workspaces Architecture & Docking Specification

This document details the workspace and docking architecture introduced in The Free Video Editor (Phase 2 UI reorganization).

---

## 1. Design & Product Goals

The Free Video Editor features a flexible, Premiere Pro-style workspace system allowing editors to switch between specialized panel arrangements instantly:
- **Assembly**: Media library prominent for logging, reviewing source footage, tagging, and initial cuts.
- **Editing**: The standard balanced default layout with Media bottom-left, Program/Source monitors top-center, Timeline bottom, and Inspector right.
- **Color**: Large Program monitor with side-by-side scopes and Color controls.
- **Effects**: Dedicated column for Effects library, expanded Inspector sections, Timeline with Graph Editor tab.
- **Audio**: Multi-track Audio mixer, expanded audio track heights, and Inspector audio controls.
- **Graphics**: Large canvas preview, Titles & text templates, Captions panel, and text inspector.

---

## 2. Core Architectural Guarantees & Contracts

### 2.1 State Isolation
- **User Preference, Never Project State**: Workspace layouts, active tab positions, splitter sizes, and user-customized presets are stored exclusively in `localStorage` under `tfve:workspace-state`.
- **Zero History Pollution**: Modifying a workspace layout, switching workspaces, or resizing splitters never touches `mutateProject` and never creates patches in the session history stack (`undo`/`redo`).
- **No Side-Effects on Playback State**: Playhead position, active sequence, selection, playback state, and media pool are 100% preserved during workspace transitions.

### 2.2 Program Monitor & Canvas Lifecycle (`keepAlive`)
- The playback engine, WebGL2/WebCodecs context, audio graph, and timeline virtualization rely on the canvas elements in `ProgramMonitor` (`ui/preview/PreviewPanel.tsx`) and `Timeline` (`ui/timeline/Timeline.tsx`).
- In `WorkspaceShell.tsx`, panels marked as `keepAlive: true` in the panel registry are **never unmounted** when switching between workspaces or active tabs.
- Instead, they are kept in a persistent container and toggled or repositioned using display visibility/flex constraints. This ensures zero WebGL context recreation, no video decoder teardown, and no screen flicker.

---

## 3. Docking Implementation Decision Note

During evaluation, two primary paths were considered:

### Option A: Third-Party Docking Library (e.g. `dockview`, `flexlayout-react`)
- **Pros**: Built-in tab reordering and drag-to-dock out of the box.
- **Cons / Risks**:
  1. **Bundle Size**: Adds 50–120 kB of minified JS.
  2. **Styling & Token Compatibility**: Heavy override requirements to match `src/styles/tokens.css` and Vercel-like design tokens.
  3. **React 19 / Modern Island Compatibility**: Compatibility risks with Astro React islands.
  4. **DOM Teardown & Canvas Re-parenting**: Most docking libraries unmount React tree components on tab switches or dock drops, which would destroy the WebGL2 rendering context and WebCodecs decoders.
  5. **Playwright Reliability**: Simulated pointer drag events on third-party docking canvases are notoriously flaky in CI.

### Option B: Custom Pure Layout Engine (Selected)
- **Architecture**:
  - Pure, serializable tree data model (`LayoutNode = SplitNode | StackNode`).
  - Pure layout operations with minimum-size clamping (`src/editor/ui/layout/operations.ts`).
  - Pure CSS Grid / Flexbox with custom keyboard-accessible splitters (`role="separator"`, `tabIndex={0}`, arrow keys support).
  - ARIA-compliant tab stacks (`role="tablist"`, `role="tab"`, `role="tabpanel"`).
  - Native maximize toggle (via \` \` \` backquote shortcut or double click).
- **Decision**: Option B was selected. It provides 0 KB external dependency footprint, zero context teardowns for canvas/audio, 100% adherence to design tokens, and robust, deterministic E2E testability. Drag-to-re-dock between arbitrary splits is safely deferred without blocking core workflow requirements.

---

## 4. Keyboard Shortcuts & Accessibility

- **Workspace Switching**: `Alt+Shift+1` through `Alt+Shift+6` switches instantly between `Assembly`, `Editing`, `Color`, `Effects`, `Audio`, and `Graphics`.
- **Maximize Panel**: Pressing \` \` \` (`Backquote`) maximizes the currently hovered or active panel to occupy the entire workspace; pressing it again restores the split layout.
- **Splitter Adjustment**: Focusable separator bars allow resizing splits using arrow keys (`Left`/`Right` or `Up`/`Down`).
- **Screen Reader Announcements**: Live region alerts announce workspace changes (`aria-live="polite"`).

---

## 5. Persistence & Migration

Older sessions that stored panel sizes in `tfve:panel-sizes` are automatically read and migrated into the `Editing` workspace layout override on first launch. If a corrupted layout is loaded, the validator automatically resets to built-in presets without crashing the editor.

---

## 6. Audio Workspace Specification (Premiere Pro 6-Zone Layout)

The **Audio** workspace (`PRESET_AUDIO` / `Alt+Shift+5`) mirrors the professional Premiere Pro audio editing environment:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Left Stack           │ Center Monitor / Inspector    │ Right Stack          │
│ • Project Media      │ • Source Monitor              │ • Essential Sound    │
│ • Effects Library    │ • Effect Controls (Audio)     │ • Audio Inspector    │
│                      │ • Program Monitor             │                      │
├──────────────────────┴───────────────────────────────┴──────────────────────┤
│ Lower Left / Center                  │ Lower Right                          │
│ • Timeline (Tracks A1–A4 + Master)   │ • Audio Track Mixer (Faders & Sends) │
│                                      │ • Loudness Panel (EBU R128 / BS.1770)│
└──────────────────────────────────────┴──────────────────────────────────────┘
```

### Registered Panels
All 10 panels are registered in `KNOWN_PANEL_IDS` and layout operations:
1. `media`: Project media library and imported audio/video assets.
2. `effects`: Effects library with dedicated Audio tab (15 real-time DSP effects).
3. `source`: Source footage audio/video preview.
4. `effect-controls-audio`: Premiere Pro-style clip audio inspector with Volume level dB slider, PanControl, and applied audio effects rack.
5. `program`: Program monitor preview canvas (`keepAlive: true`).
6. `essential-sound`: Dialogue/Music/SFX/Ambience tagging, auto-match loudness, repair, clarity, and ducking.
7. `inspector`: Standard inspector properties tab.
8. `timeline`: Video and audio tracks with tall audio track lanes (`keepAlive: true`).
9. `mixer`: Full multi-channel audio mixer with Trim, EQ, Dynamics, Faders, PanControl, Phase Invert, Solo Safe, Channel Mode, Sends, and Master True-Peak Limiter.
10. `loudness`: Calibrated ITU-R BS.1770-4 / EBU R128 Loudness Radar and Metering.


