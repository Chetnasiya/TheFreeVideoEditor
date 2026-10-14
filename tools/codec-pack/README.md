# Advanced Codec Pack — Architecture & Build Guide

## Overview

The **Advanced Codec Pack** provides optional WebAssembly-based support for professional camera and archival codecs:
- **Apple ProRes**: Proxy, LT, Standard (422), 422 HQ, and 4444 decode and encode (in QuickTime MOV).
- **Avid DNxHD / DNxHR**: SMPTE VC-3 decode and encode (in QuickTime MOV).
- **MPEG-2 Video**: 4:2:2 XDCAM-style decode (camera ingest).
- **FFV1**: Lossless preservation/archival decode.
- **Uncompressed PCM Audio**: 24-bit integer (`pcm_s24le`) and 32-bit floating point (`pcm_f32le`).
- **Demuxing**: QuickTime MOV, Material eXchange Format (MXF), and MPEG-TS containers.

---

## Legal & Licensing Compliance

1. **LGPL v2.1+ / v3 Only**:
   - The codec pack is built strictly from LGPL-licensed libraries: `libavcodec`, `libavformat`, `libavutil`, `libswscale`, `libswresample`.
   - Flags `--enable-gpl` and `--enable-nonfree` are **forbidden**.
   - No software H.264 or HEVC encoders (`x264`, `x265`, `openh264`) are bundled. Platform H.264/HEVC encoding uses standard browser WebCodecs hardware APIs.

2. **Apple ProRes Disclaimer**:
   - *Apple ProRes is a trademark of Apple Inc.*
   - The ProRes encoder used in this pack is an independent, open-source, reverse-engineered implementation (`prores_ks`). It is not certified, tested, or endorsed by Apple Inc.

3. **Avid DNxHD / DNxHR Disclaimer**:
   - *Avid, DNxHD, and DNxHR are trademarks or registered trademarks of Avid Technology, Inc.*

4. **Source Code Offer**:
   - In accordance with the LGPL, the full corresponding source code and exact configure scripts used to generate the WebAssembly binaries are published and available in this repository under `tools/codec-pack/`.

---

## Host Feasibility & Step 0 Decision

During Step 0 environment auditing:
- The host system lacked Emscripten (`emcc`) and Docker.
- Per the project feasibility gate, Tier 2 WASM compilation was **deferred**, while complete architecture plumbing, worker protocols, OPFS SyncAccessHandle readers, UI consent/manager dialogs, and this reproducible build recipe are delivered and integrated.

---

## How to Build the Pack

### Prerequisites

1. Install Emscripten SDK:
   ```bash
   git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
   cd ~/emsdk
   ./emsdk install latest
   ./emsdk activate latest
   source ~/emsdk/emsdk_env.sh
   ```

2. Run the build script:
   ```bash
   ./tools/codec-pack/build.sh
   ```

3. Output artifacts:
   - `public/codecs/tfve-codec-pack.js`
   - `public/codecs/tfve-codec-pack.wasm`

