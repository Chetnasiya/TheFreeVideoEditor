# Contributing to The Free Video Editor (TFVE)

Thank you for your interest in contributing to **The Free Video Editor**! We welcome contributions from developers, designers, video editors, and technical writers of all experience levels.

This document provides a set of guidelines and instructions for contributing to this project.

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please be respectful and considerate in your interactions with fellow contributors and maintainers.

---

## Getting Started

### Prerequisites

- **Node.js**: `>= 22.12.0` (Recommended: latest LTS)
- **npm**: `>= 10.0.0`
- **Modern Browser**: Chrome / Chromium 120+, Edge 120+, Safari 17.4+, or Firefox 128+ with WebCodecs and WebGL2 support.

### Setup Instructions

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/<your-username>/TheFreeVideoEditor.git
   cd TheFreeVideoEditor
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Start the local development server**:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:4321](http://localhost:4321) in your browser.

---

## Architectural Principles & Invariants

Before contributing code, please familiarize yourself with the architectural layers:

### Layer Separation
1. **`src/editor/core/` (Pure Logic & Math)**:
   - Contains pure data structures, timeline math, timecode calculations, project models, and serialization.
   - **Rule**: Never import UI components, React hooks, or browser-specific rendering elements into `core/`. Core must remain deterministic and testable.
2. **`src/editor/services/` (Hardware & Subsystems)**:
   - Houses WebCodecs decoders/encoders, WebGL2 compositors, Web Audio DSP pipelines, OPFS caching, and Web Workers.
   - **Rule**: Encapsulate Web APIs, resource disposal (`dispose()`, `close()`), and memory management (GPU textures, AudioBuffers) cleanly.
3. **`src/editor/state/` (Application State)**:
   - Zustand stores, history stacks (undo/redo), and reactive hooks.
   - **Rule**: State mutations must be deterministic, atomic, and serializable.
4. **`src/editor/ui/` & `src/components/` (Presentation)**:
   - React components, Astro layouts, Tailwind CSS styling, Radix UI primitives, Lucide icons.
   - **Rule**: Keep UI components thin. Delegate computations to `core` and state mutations to `state`.

### Core Invariants
- **Non-destructive Editing**: Media files are never modified in-place; all edits (cuts, transitions, effects) are non-destructive representations over raw media references.
- **Track Overlap Invariant**: Clips placed on the same track must not overlap unless explicitly handled by transition semantics.
- **Zero Frame Drift**: Time calculations must use exact microsecond/rational timestamps (`BigInt` or microsecond integers) to avoid floating-point drift across long timelines.
- **Privacy First**: All processing, AI inference (Whisper/ONNX), decoding, and exporting occur strictly locally on the client machine. No video or audio data may be dispatched to external servers.

---

## Development Workflow

### Creating a Branch
Create a descriptive feature or bugfix branch off `main`:
```bash
git checkout -b feat/add-magnetic-timeline
# or
git checkout -b fix/webcodecs-decoder-stall
```

### Commit Messages
We follow conventional commit guidelines:
- `feat:` A new feature or capability
- `fix:` A bug fix
- `perf:` Performance improvements
- `refactor:` Code restructuring without behavior changes
- `test:` Adding or updating tests
- `docs:` Documentation improvements
- `chore:` Dependency bumps, build script changes

*Example:* `feat(timeline): implement ripple delete keyboard shortcut (Shift+X)`

### Running Quality Checks
Before submitting a pull request, ensure all tests, linting, and type checks pass:

```bash
# Type check TypeScript files
npm run typecheck

# Run test suite with Vitest
npm test

# Run tests with coverage
npm run test:coverage

# Run linter
npm run lint

# Check Astro build
npm run build
```

---

## Adding New Features

### Adding a WebGL Filter / Transition
1. Place GLSL shader code or transition definitions in `src/editor/services/render/`.
2. Ensure uniforms are properly managed and shader resources are cleaned up on disposal.
3. Add corresponding UI controls in `src/editor/ui/inspector/`.

### Adding Audio DSP Effects
1. Implement the node or effect processor under `src/editor/services/audio/`.
2. Connect to the master Web Audio graph cleanly.
3. Ensure offline audio rendering matches real-time playback output.

### Adding New Keyboard Shortcuts
1. Register the action and default keybinding in `src/editor/state/` or keyboard management registry.
2. Avoid hardcoding keycodes; check for modifier keys (`Ctrl`, `Meta`, `Shift`, `Alt`) appropriately for cross-platform compatibility (macOS vs Windows/Linux).

---

## Submitting a Pull Request (PR)

1. **Push your branch** to your GitHub fork:
   ```bash
   git push origin feat/your-feature-name
   ```
2. **Open a Pull Request** against the `main` branch of `TheFreeVideoEditor`.
3. **Fill out the PR template**:
   - Provide a concise description of the change.
   - Mention relevant issue numbers (`Fixes #123`).
   - Include before/after screenshots or screen recordings for UI changes.
   - Confirm that all checks pass (`npm run typecheck`, `npm test`).
4. **Code Review**: Maintainers will review your pull request, suggest improvements, and merge once approved.

---

## Questions and Support

Feel free to open a [GitHub Discussion](https://github.com/TheFreeVideoEditor/TheFreeVideoEditor/discussions) or file an [Issue](https://github.com/TheFreeVideoEditor/TheFreeVideoEditor/issues) if you have any questions or need guidance!

