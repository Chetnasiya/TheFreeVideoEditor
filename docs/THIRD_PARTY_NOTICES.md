# Third-Party Notices & Licensing Compliance

This document describes the licensing disciplines, third-party software attributions, and legal compliance policies for **The Free Video Editor** (thefreevideoeditor.com).

---

## 1. Zero Software Codec Patents Policy

### Platform WebCodecs Only for H.264 & HEVC
To protect the project, users, and distributors from patent licensing liabilities (such as MPEG-LA / Access Advance pools for AVC/H.264 and HEVC/H.265):
- **No software H.264 or HEVC encoders/decoders are bundled in this codebase or distributed in its client binaries.**
- AVC/H.264 and HEVC/H.265 encode and decode operations are executed exclusively through the host platform's native hardware-accelerated **WebCodecs API** (`VideoEncoder`, `VideoDecoder`).
- If the client's host platform or browser does not expose hardware support for a proprietary codec profile, the application reports the codec as unsupported or falls back to royalty-free platform codecs (VP9, AV1) rather than attempting software emulation.

---

## 2. LGPL Compliance Disciplines (Advanced Codec Pack)

When the optional **Advanced Codec Pack** (WASM) is compiled from LGPL-licensed libraries (e.g., FFmpeg libraries `libavcodec`, `libavformat`, `libswscale`, `libswresample`):

1. **LGPLv2.1 / LGPLv3 Adherence:**
   - FFmpeg is configured strictly with `--enable-lgpl` (or `--enable-version3` if applicable) and **without** `--enable-gpl` and **without** `--enable-nonfree`.
   - No GPL-only components (e.g. `x264`, `x265`, `libxvid`) are permitted in the build configuration.
2. **Dynamic / Modular Linking:**
   - The codec pack is compiled into a standalone WebAssembly module (`codec-pack.wasm`) loaded dynamically at runtime in a dedicated Web Worker.
   - The core application (`thefreevideoeditor`) contains zero statically linked proprietary or GPL code and communicates with the WASM pack solely via standard postMessage IPC and typed memory buffers.
   - Users possess the legal right and technical mechanism to replace `codec-pack.wasm` with their own customized or recompiled version.
3. **Source Code Offer:**
   - Complete, machine-readable build scripts, patches, and instructions to download upstream source code and rebuild `codec-pack.wasm` are published in `tools/codec-pack/`.
4. **License Texts:**
   - The full text of the GNU Lesser General Public License (LGPL) is distributed alongside any distribution of the binary pack.

---

## 3. Professional Codec Trademarks & Implementations

### Apple ProRes
- "Apple ProRes" is a registered trademark of Apple Inc.
- Any ProRes decoder or encoder included in the optional Advanced Codec Pack is an independent, clean-room reverse-engineered implementation from the FFmpeg project (`prores`, `prores_ks`, `prores_aw`).
- User-facing interfaces, documentation, and metadata must use wording such as **"Apple ProRes-compatible"** or **"ProRes (compatible)"** and must never imply certification, endorsement, or licensing by Apple Inc.

### Avid DNxHD / DNxHR (SMPTE VC-3)
- DNxHD and DNxHR conform to SMPTE 2014 / VC-3 standards.
- Independent implementations provided by FFmpeg are subject to open SMPTE standard compliance.

---

## 4. Bundled Open-Source Libraries

### mediabunny
- License: MPL-2.0 (Mozilla Public License 2.0)
- Copyright (c) mediabunny contributors.
- Usage: Media container demuxing and muxing (MP4, QuickTime MOV, WebM, Matroska, WAV, FLAC, Ogg, MP3).
- Notice: Source modifications (if any) are kept modular and compliant with MPL-2.0 obligations.

### fflate
- License: MIT
- Copyright (c) 101arrowz
- Usage: High-performance compression and decompression.

### Immer
- License: MIT
- Copyright (c) Michel Weststrate
- Usage: Immutable state updates for sequence and project state trees.

### Zustand
- License: MIT
- Copyright (c) Daishi Kato
- Usage: Reactive state management in React editor components.

