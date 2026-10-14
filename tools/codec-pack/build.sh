#!/usr/bin/env bash
# ==============================================================================
# The Free Video Editor — Advanced Codec Pack Build Recipe (LGPL-only)
# ==============================================================================
# This script compiles an LGPL-only, WASM-targeted build of FFmpeg libraries
# (libavcodec, libavformat, libavutil, libswscale, libswresample).
#
# STRICT LEGAL / COMPLIANCE CONSTRAINTS:
# 1. MUST NOT pass --enable-gpl or --enable-nonfree.
# 2. MUST NOT bundle software H.264 or HEVC encoders (x264, x265, libopenh264).
# 3. Codecs enabled:
#    - Apple ProRes compatible decode and encode (prores, prores_ks)
#    - Avid DNxHD / DNxHR decode and encode (dnxhd)
#    - MPEG-2 Video 4:2:2 decode (mpeg2video)
#    - FFV1 lossless archival decode (ffv1)
#    - PCM audio: 16-bit, 24-bit, 32-bit float (pcm_s16le, pcm_s24le, pcm_f32le)
# 4. Containers enabled:
#    - QuickTime MOV demuxer & muxer (mov)
#    - Material eXchange Format demuxer (mxf)
#    - MPEG Transport Stream demuxer (mpegts)
#    - WAV demuxer & muxer (wav)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
OUTPUT_DIR="${ROOT_DIR}/public/codecs"
FFMPEG_VERSION="7.0.2"
FFMPEG_TAR="ffmpeg-${FFMPEG_VERSION}.tar.xz"
FFMPEG_URL="https://ffmpeg.org/releases/${FFMPEG_TAR}"

echo "=== The Free Video Editor: Advanced Codec Pack Builder ==="

# 1. Toolchain verification
if ! command -v emcc >/dev/null 2>&1; then
    echo "ERROR: Emscripten (emcc) is not found in PATH." >&2
    echo "To install Emscripten:" >&2
    echo "  git clone https://github.com/emscripten-core/emsdk.git ~/emsdk" >&2
    echo "  cd ~/emsdk && ./emsdk install latest && ./emsdk activate latest" >&2
    echo "  source ~/emsdk/emsdk_env.sh" >&2
    exit 1
fi

echo "Emscripten compiler detected: $(emcc -v 2>&1 | head -n 1)"

mkdir -p "${BUILD_DIR}"
mkdir -p "${OUTPUT_DIR}"
cd "${BUILD_DIR}"

# 2. Source download and verification
if [ ! -f "${FFMPEG_TAR}" ]; then
    echo "Downloading FFmpeg ${FFMPEG_VERSION}..."
    curl -fLO "${FFMPEG_URL}"
fi

if [ ! -d "ffmpeg-${FFMPEG_VERSION}" ]; then
    echo "Extracting FFmpeg source..."
    tar -xf "${FFMPEG_TAR}"
fi

cd "ffmpeg-${FFMPEG_VERSION}"

# 3. LGPL-only Configure
echo "Configuring FFmpeg for WebAssembly (LGPL-only)..."

emconfigure ./configure \
    --prefix="${BUILD_DIR}/dist" \
    --target-os=none \
    --arch=x86_32 \
    --cpu=generic \
    --enable-cross-compile \
    --cc="emcc" \
    --cxx="em++" \
    --ar="emar" \
    --ranlib="emranlib" \
    --nm="emnm" \
    --disable-gpl \
    --disable-nonfree \
    --enable-version3 \
    --disable-programs \
    --disable-doc \
    --disable-avdevice \
    --disable-postproc \
    --disable-network \
    --disable-pthreads \
    --disable-w32threads \
    --disable-os2threads \
    --disable-all \
    --enable-avcodec \
    --enable-avformat \
    --enable-avutil \
    --enable-swscale \
    --enable-swresample \
    --enable-decoder=prores \
    --enable-decoder=dnxhd \
    --enable-decoder=mpeg2video \
    --enable-decoder=ffv1 \
    --enable-decoder=pcm_s16le \
    --enable-decoder=pcm_s24le \
    --enable-decoder=pcm_f32le \
    --enable-encoder=prores_ks \
    --enable-encoder=dnxhd \
    --enable-encoder=pcm_s16le \
    --enable-encoder=pcm_s24le \
    --enable-encoder=pcm_f32le \
    --enable-demuxer=mov \
    --enable-demuxer=mxf \
    --enable-demuxer=mpegts \
    --enable-demuxer=wav \
    --enable-muxer=mov \
    --enable-muxer=wav \
    --enable-parser=mpegaudio \
    --enable-protocol=file \
    --extra-cflags="-O3 -msimd128 -D_POSIX_C_SOURCE=200809L" \
    --extra-ldflags="-O3"

# 4. Compilation
echo "Compiling FFmpeg libraries..."
emmake make -j"$(sysctl -n hw.logicalcpu 2>/dev/null || nproc 2>/dev/null || echo 4)"
emmake make install

# 5. Link WASM Bridge Module
echo "Linking WASM bridge module..."
emcc \
    -O3 \
    -msimd128 \
    -s WASM=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MAXIMUM_MEMORY=2147483648 \
    -s INITIAL_MEMORY=67108864 \
    -s EXPORTED_FUNCTIONS="['_malloc','_free','_main']" \
    -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap','addFunction','removeFunction','setValue','getValue']" \
    -I"${BUILD_DIR}/dist/include" \
    -L"${BUILD_DIR}/dist/lib" \
    -lavformat -lavcodec -lswscale -lswresample -lavutil \
    -o "${OUTPUT_DIR}/tfve-codec-pack.js"

echo "=== Build Complete ==="
echo "Artifacts placed in: ${OUTPUT_DIR}/"
ls -la "${OUTPUT_DIR}"

