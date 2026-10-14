/**
 * GLSL ES 3.0 shaders for GPU color conversion, chroma subsampling, and deterministic dithering.
 * Supports ITU-R BT.709 (HD/SDR) and ITU-R BT.2020 (UHD/HDR) in limited and full quantization ranges.
 * Implements true 10-bit RGBA packing and bit-deterministic PCG TPDF dithering.
 */

export const YUV_CONVERSION_FRAG = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_rgbTexture;
uniform vec2 u_resolution;
uniform int u_matrix;       // 0: BT.709, 1: BT.2020
uniform int u_range;        // 0: Limited (16..235), 1: Full (0..255)
uniform int u_plane;        // 0: Y (full res), 1: U/Cb (half res), 2: V/Cr (half res), 3: Alpha
uniform int u_bitDepth;     // 8 or 10
uniform int u_dither;       // 0: off, 1: deterministic TPDF
uniform uint u_frameIndex;  // deterministic frame sequence seed

in vec2 v_uv;
out vec4 outColor;

// Bit-deterministic unsigned integer PCG-style hash
uint pcgHash(uvec2 p, uint frame) {
    uint state = p.x * 3266489917u + p.y * 668265263u + frame * 374761393u + 1013904223u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

// Triangular Probability Density Function (TPDF) dither
float getDither(uvec2 coord, uint frame, float qLevels) {
    uint r1 = pcgHash(coord, frame);
    uint r2 = pcgHash(coord + uvec2(17u, 23u), frame + 1u);
    float f1 = float(r1) / 4294967295.0;
    float f2 = float(r2) / 4294967295.0;
    return (f1 + f2 - 1.0) / qLevels;
}

vec4 packChannel(float val, int bitDepth) {
    float clamped = clamp(val, 0.0, 1.0);
    if (bitDepth == 10) {
        uint v10 = uint(clamp(floor(clamped * 1023.0 + 0.5), 0.0, 1023.0));
        uint hi8 = v10 >> 2u;
        uint low2 = (v10 & 3u) << 6u;
        return vec4(float(hi8) / 255.0, float(low2) / 255.0, 0.0, 1.0);
    } else {
        return vec4(clamped, clamped, clamped, 1.0);
    }
}

void main() {
    float qLevels = u_bitDepth == 10 ? 1023.0 : 255.0;
    float ditherVal = (u_dither == 1) ? getDither(uvec2(gl_FragCoord.xy), u_frameIndex, qLevels) : 0.0;

    if (u_plane == 0) {
        // Y Plane: full resolution
        vec4 rgbSample = texture(u_rgbTexture, v_uv);
        float r = rgbSample.r;
        float g = rgbSample.g;
        float b = rgbSample.b;

        float Ey = (u_matrix == 1)
            ? (0.2627 * r + 0.6780 * g + 0.0593 * b)
            : (0.2126 * r + 0.7152 * g + 0.0722 * b);

        float yNorm = (u_range == 1)
            ? Ey
            : (16.0 / 255.0 + (219.0 / 255.0) * Ey);

        outColor = packChannel(yNorm + ditherVal, u_bitDepth);
    } else if (u_plane == 1 || u_plane == 2) {
        // Chroma Subsampling 4:2:0: box-filter 2x2 neighborhood
        vec2 texel = 1.0 / u_resolution;
        vec4 s00 = texture(u_rgbTexture, v_uv + vec2(-0.5, -0.5) * texel);
        vec4 s10 = texture(u_rgbTexture, v_uv + vec2( 0.5, -0.5) * texel);
        vec4 s01 = texture(u_rgbTexture, v_uv + vec2(-0.5,  0.5) * texel);
        vec4 s11 = texture(u_rgbTexture, v_uv + vec2( 0.5,  0.5) * texel);
        vec3 avg = (s00.rgb + s10.rgb + s01.rgb + s11.rgb) * 0.25;

        float r = avg.r;
        float g = avg.g;
        float b = avg.b;

        float Ey = (u_matrix == 1)
            ? (0.2627 * r + 0.6780 * g + 0.0593 * b)
            : (0.2126 * r + 0.7152 * g + 0.0722 * b);

        if (u_plane == 1) {
            // Cb / U Plane
            float Ecb = (u_matrix == 1)
                ? ((b - Ey) / 1.8814)
                : ((b - Ey) / 1.8556);

            float cbNorm = (u_range == 1)
                ? (Ecb + 0.5)
                : (128.0 / 255.0 + (224.0 / 255.0) * Ecb);

            outColor = packChannel(cbNorm + ditherVal, u_bitDepth);
        } else {
            // Cr / V Plane
            float Ecr = (u_matrix == 1)
                ? ((r - Ey) / 1.4746)
                : ((r - Ey) / 1.5748);

            float crNorm = (u_range == 1)
                ? (Ecr + 0.5)
                : (128.0 / 255.0 + (224.0 / 255.0) * Ecr);

            outColor = packChannel(crNorm + ditherVal, u_bitDepth);
        }
    } else {
        // Alpha Plane
        vec4 s = texture(u_rgbTexture, v_uv);
        outColor = packChannel(s.a + ditherVal, u_bitDepth);
    }
}
`;
