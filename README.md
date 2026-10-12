# The Free Video Editor

> **A professional, 100% free, private, web-native non-linear video editor built on modern Web standards (WebCodecs, WebGL2, Web Audio API, and OPFS).**

The Free Video Editor is an open-source video editing studio that runs completely inside the browser. Media never leaves your machine—no cloud uploads, no server rendering queues, no subscriptions, and no watermarks.

---

## 🌟 Key Features

- **🔒 100% Local & Private Processing**: Everything executes locally via [WebCodecs](https://w3c.github.io/webcodecs/) hardware decoders/encoders and [Origin Private File System (OPFS)](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system).
- **⏱️ Professional Multi-Track Timeline**:
  - Magnetic snapping, ripple edit, razor tool (`C`), rolling edits, slip & slide.
  - Unlimited video, audio, adjustment layers, text, and nested sequence tracks.
  - Sequence markers & Clip markers with 8 standard colors, comments, duration ranges, and quick keyboard navigation.
  - Timecode display, frame-by-frame precision, audio waveforms, and snap-to-marker toggles.
- **🎨 Real-Time GPU Compositor (WebGL2)**:
  - Hardware-accelerated clip transforms, opacity, blend modes, motion graphics, and chroma key / green screen.
  - Multi-point masking (pen bezier, rectangular, elliptical), tracking & stabilization.
  - LUT import (.cube), curves, color grading, adjustment layers, and realtime preview.
- **🔊 Multi-Channel Audio Mixer & DSP**:
  - Per-track and master audio bus routing, volume/pan faders, and stereo meters.
  - Parametric 3-band EQ, dynamic compressor/limiter with interactive visual response curves.
  - Audio fades, automatic ducking, and pitch-preserving time-stretching.
- **🤖 On-Device AI Automatic Captions**:
  - Local speech-to-text generation via Whisper and HuggingFace Transformers.js with WebGPU / WebAssembly.
  - Word-level timing, customizable caption templates, animations, and SRT / VTT export.
- **🔄 Interoperability & Formats**:
  - Native lossless `.tfve` project archives (schema-versioned with zero data loss).
  - Best-effort interchange import/export for Final Cut Pro XML (`FCPXML`), Premiere/EDL, OpenTimelineIO (`OTIO`), and Final Cut Pro 7 XML (`xmeml`).
  - High-performance MP4 (H.264 / AAC), WebM, and ProRes encoding with resolution and bitrate controls.

---

## 🗂️ Code Structure

```text
TheFreeVideoEditor/
├── public/                     # Static public assets (favicons, manifests, robots.txt)
├── src/
│   ├── components/             # Reusable Astro & UI components (Header, Footer, BrandIcon)
│   ├── layouts/                # Base Astro HTML document layout & SEO metadata
│   ├── pages/                  # Astro Multi-Page Application (MPA) routes:
│   │   ├── index.astro         # Marketing landing page & features
│   │   ├── editor.astro        # Editor studio mounting point (<astro-island>)
│   │   ├── about.astro         # About Us & technical architecture overview
│   │   ├── contact.astro       # Support & contact page
│   │   ├── privacy.astro       # Privacy policy
│   │   ├── terms.astro         # Terms of service
│   │   ├── 404.astro           # Custom 404 Not Found error page
│   │   ├── 500.astro           # Custom 500 Server Error page
│   │   └── sitemap.xml.ts      # Dynamic XML sitemap generator
│   ├── styles/                 # Global CSS variables, reset, design tokens
│   └── editor/                 # 🎬 Core Editor Application Engine
│       ├── core/               # Pure business logic & immutable timeline math:
│       │   ├── schema.ts       # Zod project schema definitions
│       │   ├── types.ts        # TypeScript data model types
│       │   ├── timeline.ts     # Track/clip math, placement invariants, collision logic
│       │   ├── markers/        # Marker models, range queries, clip marker mapping
│       │   ├── tracking/       # Feature tracking, homography, point tracker algorithms
│       │   ├── captions/       # SRT/VTT parsing and caption segmentation math
│       │   ├── audio/          # Audio DSP math, ducking, EQ filters, biquad coeffs
│       │   └── proxy/          # Proxy generation planners and dimensions
│       ├── services/           # Browser runtime services, workers & I/O:
│       │   ├── playback/       # WebCodecs video frame clock, compositor, audio engine
│       │   ├── render/         # WebGL2 shader pipelines, render passes, text rasterizer
│       │   ├── export/         # Video rendering & MP4 muxing export pipeline
│       │   ├── captions/       # Web Workers & AI Speech-to-Text inference
│       │   ├── storage/        # OPFS storage layer & IndexedDB caching
│       │   ├── keyboard/       # Hotkey command registry & platform shortcut bindings
│       │   └── interop/        # FCPXML, EDL, OTIO, and xmeml serialization/parsers
│       ├── state/              # Global state management:
│       │   ├── store.ts        # Zustand reactive state store & actions
│       │   └── history.ts      # Undo / Redo history stack with action coalescing
│       └── ui/                 # React UI presentation layer:
│           ├── shell/          # Topbar, menu bar, workspace bar, status bar chrome
│           ├── timeline/       # Virtualized multi-track timeline, ruler, playhead, tools
│           ├── preview/        # Program monitor canvas & Source monitor players
│           ├── inspector/      # Properties panel (Transform, Color, Audio, Tracking)
│           ├── audio/          # Audio mixer panel, VU meters, EQ/Compressor popups
│           ├── captions/       # Subtitles & Captions generation/editing panel
│           ├── effects/        # Effects library & transitions inspector
│           ├── media-library/  # Media bin, asset previews, drag-and-drop targets
│           └── dialogs/        # Modal dialogs (Marker, Export, Shortcuts, Workspaces)
├── docs/                       # Technical design specs & subsystem documentation
├── tests/                      # Test suites:
│   ├── e2e/                    # Playwright end-to-end browser specifications
│   └── fixtures/               # Test media and project JSON fixtures
├── astro.config.mjs            # Astro build & Vite bundler configuration
├── wrangler.toml               # Cloudflare Workers static assets configuration
└── package.json                # Project dependencies and script runner
```

---

## 🛠️ Prerequisites

- **Node.js**: `v22.12.0` or higher
- **Package Manager**: `npm` (v10+)
- **Modern Browser**: Chrome 116+, Edge 116+, or Safari 17.4+ (supporting WebCodecs, WebGL2, and OPFS)

---

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/your-username/TheFreeVideoEditor.git
cd TheFreeVideoEditor
```

### 2. Install dependencies
```bash
npm install
```

### 3. Start the development server
```bash
npm run dev
```
Open [http://localhost:4321](http://localhost:4321) in your browser.

---

## 🧪 Testing & Quality Assurance

We maintain a strict zero-regression test suite covering both deterministic math and end-to-end browser workflows:

```bash
# Run unit & property tests (475+ tests via Vitest)
npm test

# Run TypeScript typechecks and Astro diagnostics
npm run typecheck

# Run ESLint check
npm run lint

# Check code formatting (Prettier)
npm run format:check

# Run Playwright E2E browser tests
npm run test:e2e
```

---

## 📦 Building & Production

To compile the application to optimized static HTML/JS/CSS assets in `./dist`:

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

---

## 🌐 Deploying to Cloudflare Workers

The project is pre-configured for Cloudflare Workers Static Assets via `wrangler.toml`.

```bash
# Build and deploy to Cloudflare Workers
npm run deploy
```

*(Note: Deploy commands will only run when you explicitly execute them.)*

---

## 🤝 Contributing

Contributions from the open-source community are warmly welcomed! Please read our [CONTRIBUTING.md](./CONTRIBUTING.md) guide for details on our code style, architecture principles, and pull request workflow.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/amazing-feature`)
3. Commit your Changes (`git commit -m 'Add amazing feature'`)
4. Verify tests pass (`npm run typecheck && npm test && npm run lint`)
5. Push to the Branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

---

## 📄 License

This project is open source and available under the [MIT License](./LICENSE).
