export const PASS_VERTEX_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform int u_targetIsCanvas;
out vec2 v_uv;
void main() {
    vec2 uv = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
    v_uv = uv;
    float y = u_targetIsCanvas == 1 ? (1.0 - uv.y * 2.0) : (uv.y * 2.0 - 1.0);
    gl_Position = vec4(uv.x * 2.0 - 1.0, y, 0.0, 1.0);
}
`;

export const BLIT_FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_texture;
uniform float u_opacity;
uniform int u_targetIsCanvas;
uniform int u_keepAlpha;
uniform int u_dither;
uniform int u_bitDepth;     // 8 or 10, default 8
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
float tpdfDither(uvec2 coord, uint frame, float qLevels) {
    uint r1 = pcgHash(coord, frame);
    uint r2 = pcgHash(coord + uvec2(17u, 23u), frame + 1u);
    float f1 = float(r1) / 4294967295.0;
    float f2 = float(r2) / 4294967295.0;
    return (f1 + f2 - 1.0) / qLevels;
}

void main() {
    vec4 c = texture(u_texture, v_uv) * u_opacity;
    if (u_dither == 1) {
        float qLevels = u_bitDepth == 10 ? 1023.0 : 255.0;
        float d = tpdfDither(uvec2(gl_FragCoord.xy), u_frameIndex, qLevels);
        c.rgb = clamp(c.rgb + vec3(d), 0.0, 1.0);
    }
    if (u_targetIsCanvas == 1 && u_keepAlpha == 0) {
        outColor = vec4(c.rgb, 1.0);
    } else {
        outColor = c;
    }
}
`;

export const BLIT_MIX_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_original;
uniform sampler2D u_processed;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;
void main() {
    vec4 orig = texture(u_original, v_uv);
    vec4 proc = texture(u_processed, v_uv);
    outColor = mix(orig, proc, u_mix);
}
`;

export const SOLID_FRAG = `#version 300 es
precision highp float;
uniform vec4 u_color;
in vec2 v_uv;
out vec4 outColor;
void main() {
    outColor = u_color;
}
`;

export const GAUSSIAN_BLUR_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform vec2 u_direction; // (1.0 / width, 0.0) or (0.0, 1.0 / height)
uniform float u_radius;
uniform vec2 u_resolution;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

void main() {
    if (u_radius <= 0.0) {
        outColor = texture(u_texture, v_uv);
        return;
    }

    // 9-tap gaussian weights
    float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
    vec4 orig = texture(u_texture, v_uv);
    vec4 color = orig * weights[0];
    vec2 step = u_direction * (u_radius / 4.0);

    for (int i = 1; i < 5; i++) {
        float fi = float(i);
        color += texture(u_texture, v_uv + step * fi) * weights[i];
        color += texture(u_texture, v_uv - step * fi) * weights[i];
    }

    outColor = mix(orig, color, u_mix);
}
`;

export const SHARPEN_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_amount;
uniform float u_radius;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 orig = texture(u_texture, v_uv);
    if (u_amount <= 0.0) {
        outColor = orig;
        return;
    }

    vec2 step = (u_radius / u_resolution);
    vec4 n = texture(u_texture, v_uv + vec2(0.0, -step.y));
    vec4 s = texture(u_texture, v_uv + vec2(0.0, step.y));
    vec4 e = texture(u_texture, v_uv + vec2(step.x, 0.0));
    vec4 w = texture(u_texture, v_uv + vec2(-step.x, 0.0));

    // Unsharp mask
    float strength = u_amount * 0.05;
    vec4 sharpened = orig + (orig * 4.0 - (n + s + e + w)) * strength;
    sharpened = clamp(sharpened, 0.0, 1.0);
    outColor = mix(orig, sharpened, u_mix);
}
`;

export const VIGNETTE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_softness;
uniform float u_amount;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 orig = texture(u_texture, v_uv);
    if (u_amount <= 0.0) {
        outColor = orig;
        return;
    }

    float d = distance(v_uv, u_center);
    float falloff = smoothstep(u_radius, max(0.001, u_radius - u_softness), d);
    vec4 darkened = vec4(orig.rgb * mix(1.0 - u_amount, 1.0, falloff), orig.a);
    outColor = mix(orig, darkened, u_mix);
}
`;

export const MOSAIC_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_blockSize;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 orig = texture(u_texture, v_uv);
    if (u_blockSize <= 1.0) {
        outColor = orig;
        return;
    }

    vec2 blocks = max(vec2(1.0), u_resolution / max(1.0, u_blockSize));
    vec2 blockUv = (floor(v_uv * blocks) + 0.5) / blocks;
    vec4 mosaic = texture(u_texture, blockUv);
    outColor = mix(orig, mosaic, u_mix);
}
`;

export const FILM_GRAIN_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform float u_amount;
uniform float u_time;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

// Procedural pseudo-random noise
float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec4 orig = texture(u_texture, v_uv);
    if (u_amount <= 0.0) {
        outColor = orig;
        return;
    }

    float noise = (rand(v_uv + vec2(u_time * 0.1, -u_time * 0.07)) - 0.5) * 2.0;
    vec3 noisy = clamp(orig.rgb + noise * u_amount * 0.25, 0.0, 1.0);
    outColor = mix(orig, vec4(noisy, orig.a), u_mix);
}
`;

export const INVERT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform float u_amount;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 orig = texture(u_texture, v_uv);
    vec3 inverted = mix(orig.rgb, 1.0 - orig.rgb, u_amount);
    outColor = mix(orig, vec4(inverted, orig.a), u_mix);
}
`;

export const MIRROR_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform int u_mode; // 0 = horizontal, 1 = vertical, 2 = quad
uniform float u_amount;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 orig = texture(u_texture, v_uv);
    if (u_amount <= 0.0) {
        outColor = orig;
        return;
    }

    vec2 uv = v_uv;
    if (u_mode == 0) {
        uv.x = uv.x < 0.5 ? uv.x : 1.0 - uv.x;
    } else if (u_mode == 1) {
        uv.y = uv.y < 0.5 ? uv.y : 1.0 - uv.y;
    } else if (u_mode == 2) {
        uv.x = uv.x < 0.5 ? uv.x : 1.0 - uv.x;
        uv.y = uv.y < 0.5 ? uv.y : 1.0 - uv.y;
    }

    vec4 mirrored = texture(u_texture, uv);
    vec4 result = mix(orig, mirrored, u_amount);
    outColor = mix(orig, result, u_mix);
}
`;

export const GLOW_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_threshold;
uniform float u_radius;
uniform float u_intensity;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 orig = texture(u_texture, v_uv);
    if (u_radius <= 0.0 || u_intensity <= 0.0) {
        outColor = orig;
        return;
    }

    // Sample blur around bright areas
    vec2 step = (u_radius / u_resolution) * 0.5;
    vec3 glowAcc = vec3(0.0);
    float totalWeight = 0.0;

    for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
            vec2 offset = vec2(float(x), float(y)) * step;
            vec4 col = texture(u_texture, v_uv + offset);
            float luma = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
            vec3 bright = max(vec3(0.0), col.rgb - u_threshold);
            float w = exp(-float(x*x + y*y) / 4.0);
            glowAcc += bright * w;
            totalWeight += w;
        }
    }

    vec3 glow = (glowAcc / totalWeight) * u_intensity * 2.0;
    vec3 result = clamp(orig.rgb + glow, 0.0, 1.0);
    outColor = mix(orig, vec4(result, orig.a), u_mix);
}
`;

export const CHROMA_KEY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform vec3 u_keyColor;
uniform float u_tolerance;
uniform float u_softness;
uniform float u_spill;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

vec3 rgb2ycbcr(vec3 c) {
    float y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    float cb = (c.b - y) / 1.8556;
    float cr = (c.r - y) / 1.5748;
    return vec3(y, cb, cr);
}

void main() {
    vec4 orig = texture(u_texture, v_uv);
    if (u_tolerance <= 0.0) {
        outColor = orig;
        return;
    }

    vec3 pixYcbcr = rgb2ycbcr(orig.rgb);
    vec3 keyYcbcr = rgb2ycbcr(u_keyColor);

    float d = distance(pixYcbcr.yz, keyYcbcr.yz);
    float alpha = smoothstep(u_tolerance, u_tolerance + max(0.001, u_softness), d);

    // Spill suppression: desaturate key hue on edges
    vec3 desaturated = orig.rgb;
    if (alpha < 0.99 && u_spill > 0.0) {
        float luma = dot(orig.rgb, vec3(0.2126, 0.7152, 0.0722));
        desaturated = mix(orig.rgb, vec3(luma), (1.0 - alpha) * u_spill);
    }

    vec4 keyed = vec4(desaturated * alpha, orig.a * alpha);
    outColor = mix(orig, keyed, u_mix);
}
`;

export const COLOR_CORRECTION_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;
uniform float u_temperature;
uniform float u_tint;
uniform float u_saturation;
uniform float u_vibrance;
uniform vec3 u_lift;
uniform vec3 u_gamma;
uniform vec3 u_gain;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

float rec709Luma(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
    vec4 orig = texture(u_texture, v_uv);
    vec3 c = orig.rgb;

    // 1. Exposure
    if (abs(u_exposure) > 0.0001) {
        c *= exp2(u_exposure);
    }

    // 2. Temperature & Tint
    if (abs(u_temperature) > 0.0001) {
        c.r += u_temperature * 0.15;
        c.b -= u_temperature * 0.15;
    }
    if (abs(u_tint) > 0.0001) {
        c.g -= u_tint * 0.15;
    }

    // 3. Contrast (pivoted at 0.5)
    if (abs(u_contrast) > 0.0001) {
        c = (c - 0.5) * (1.0 + u_contrast) + 0.5;
    }
    c = clamp(c, 0.0, 1.0);

    // 4. Tone curves (highlights, shadows, whites, blacks)
    float luma = clamp(rec709Luma(c), 0.0, 1.0);
    float offset = 0.0;
    if (abs(u_shadows) > 0.0001) {
        float sBase = clamp(1.0 - luma * 2.0, 0.0, 1.0);
        float shadowWeight = sBase > 0.0001 ? pow(sBase, 1.5) : 0.0;
        offset += u_shadows * shadowWeight * 0.25;
    }
    if (abs(u_highlights) > 0.0001) {
        float hBase = clamp((luma - 0.5) * 2.0, 0.0, 1.0);
        float highlightWeight = hBase > 0.0001 ? pow(hBase, 1.5) : 0.0;
        offset += u_highlights * highlightWeight * 0.25;
    }
    if (abs(u_blacks) > 0.0001) {
        float bBase = clamp(1.0 - luma * 4.0, 0.0, 1.0);
        float blackWeight = bBase * bBase;
        offset += u_blacks * blackWeight * 0.2;
    }
    if (abs(u_whites) > 0.0001) {
        float wBase = clamp((luma - 0.75) * 4.0, 0.0, 1.0);
        float whiteWeight = wBase * wBase;
        offset += u_whites * whiteWeight * 0.2;
    }
    c = clamp(c + offset, 0.0, 1.0);

    // 5. Vibrance
    if (abs(u_vibrance) > 0.0001) {
        float maxVal = max(c.r, max(c.g, c.b));
        float minVal = min(c.r, min(c.g, c.b));
        float sat = maxVal - minVal;
        float factor = 1.0 + u_vibrance * (1.0 - sat);
        float lum = rec709Luma(c);
        c = mix(vec3(lum), c, factor);
    }

    // 6. Saturation
    if (abs(u_saturation) > 0.0001) {
        float lum = rec709Luma(c);
        c = mix(vec3(lum), c, max(0.0, 1.0 + u_saturation));
    }
    c = clamp(c, 0.0, 1.0);

    // 7. Lift / Gamma / Gain
    if (dot(abs(u_lift), vec3(1.0)) > 0.0001) {
        c += u_lift * (1.0 - c);
    }
    if (dot(abs(u_gain), vec3(1.0)) > 0.0001) {
        c *= max(vec3(0.0), vec3(1.0) + u_gain);
    }
    if (dot(abs(u_gamma), vec3(1.0)) > 0.0001) {
        vec3 gammaExp = max(vec3(0.05), vec3(1.0) - u_gamma * 0.5);
        c = pow(max(vec3(1e-5), clamp(c, 0.0, 1.0)), gammaExp);
    }

    c = clamp(c, 0.0, 1.0);
    vec4 result = vec4(c, orig.a);
    outColor = mix(orig, result, u_mix);
}
`;

export const CURVES_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform sampler2D u_curveLut; // 256x1 RGBA texture
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 orig = texture(u_texture, v_uv);
    // Half pixel offset for exact 256 sampling
    float r = texture(u_curveLut, vec2((orig.r * 255.0 + 0.5) / 256.0, 0.5)).r;
    float g = texture(u_curveLut, vec2((orig.g * 255.0 + 0.5) / 256.0, 0.5)).g;
    float b = texture(u_curveLut, vec2((orig.b * 255.0 + 0.5) / 256.0, 0.5)).b;

    vec4 curved = vec4(r, g, b, orig.a);
    outColor = mix(orig, curved, u_mix);
}
`;

export const LUT_3D_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform highp sampler3D u_lut3d;
uniform float u_intensity;
uniform float u_mix;
uniform float u_lutSize;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 orig = texture(u_texture, v_uv);
    if (orig.a <= 0.0001) {
        outColor = orig;
        return;
    }
    vec3 unmult = clamp(orig.rgb / orig.a, 0.0, 1.0);
    float size = max(2.0, u_lutSize);
    vec3 coord = clamp((unmult * (size - 1.0) + 0.5) / size, 0.0, 1.0);
    vec3 lutColor = texture(u_lut3d, coord).rgb;
    vec3 graded = mix(unmult, lutColor, clamp(u_intensity, 0.0, 1.0));
    vec4 processed = vec4(graded * orig.a, orig.a);
    outColor = mix(orig, processed, clamp(u_mix, 0.0, 1.0));
}
`;

export const RGB_SPLIT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_amount;
uniform float u_angle; // radians
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 orig = texture(u_texture, v_uv);
    if (u_amount <= 0.0) {
        outColor = orig;
        return;
    }
    vec2 offset = vec2(cos(u_angle), sin(u_angle)) * (u_amount / max(vec2(1.0), u_resolution));
    float r = texture(u_texture, clamp(v_uv + offset, 0.0, 1.0)).r;
    float g = texture(u_texture, v_uv).g;
    float b = texture(u_texture, clamp(v_uv - offset, 0.0, 1.0)).b;
    float a = orig.a;
    vec4 split = vec4(r, g, b, a);
    outColor = mix(orig, split, u_mix);
}
`;

export const DIRECTIONAL_BLUR_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_length;
uniform float u_angle; // radians
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 orig = texture(u_texture, v_uv);
    if (u_length <= 0.0) {
        outColor = orig;
        return;
    }
    vec2 dir = vec2(cos(u_angle), sin(u_angle)) * (u_length / max(vec2(1.0), u_resolution)) * 0.125;
    vec4 acc = orig;
    float total = 1.0;
    for (int i = 1; i <= 8; i++) {
        float f = float(i);
        float w = 1.0 - (f / 9.0);
        acc += texture(u_texture, clamp(v_uv + dir * f, 0.0, 1.0)) * w;
        acc += texture(u_texture, clamp(v_uv - dir * f, 0.0, 1.0)) * w;
        total += w * 2.0;
    }
    vec4 blurred = acc / total;
    outColor = mix(orig, blurred, u_mix);
}
`;

export const ZOOM_BLUR_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform vec2 u_center;
uniform float u_strength;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 orig = texture(u_texture, v_uv);
    if (u_strength <= 0.0) {
        outColor = orig;
        return;
    }
    vec4 acc = orig;
    float total = 1.0;
    for (int i = 1; i <= 10; i++) {
        float p = float(i) / 10.0;
        float scale = 1.0 - u_strength * 0.5 * p;
        vec2 sampleUv = clamp(u_center + (v_uv - u_center) * scale, 0.0, 1.0);
        float w = 1.0 - p * 0.5;
        acc += texture(u_texture, sampleUv) * w;
        total += w;
    }
    vec4 blurred = acc / total;
    outColor = mix(orig, blurred, u_mix);
}
`;

export const SCANLINES_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform float u_count;
uniform float u_intensity;
uniform float u_time;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 orig = texture(u_texture, v_uv);
    if (u_intensity <= 0.0) {
        outColor = orig;
        return;
    }
    float scan = sin((v_uv.y + u_time * 0.05) * max(10.0, u_count) * 6.2831853);
    float lineFactor = 1.0 - (scan * 0.5 + 0.5) * u_intensity;
    vec3 result = clamp(orig.rgb * lineFactor, 0.0, 1.0);
    outColor = mix(orig, vec4(result, orig.a), u_mix);
}
`;

export const NEON_EDGES_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec3 u_neonColor;
uniform float u_threshold;
uniform float u_brightness;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

float luma(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
    vec4 orig = texture(u_texture, v_uv);
    vec2 step = 1.0 / max(vec2(1.0), u_resolution);

    float tl = luma(texture(u_texture, clamp(v_uv + vec2(-step.x, -step.y), 0.0, 1.0)).rgb);
    float t  = luma(texture(u_texture, clamp(v_uv + vec2(0.0, -step.y), 0.0, 1.0)).rgb);
    float tr = luma(texture(u_texture, clamp(v_uv + vec2(step.x, -step.y), 0.0, 1.0)).rgb);
    float l  = luma(texture(u_texture, clamp(v_uv + vec2(-step.x, 0.0), 0.0, 1.0)).rgb);
    float r  = luma(texture(u_texture, clamp(v_uv + vec2(step.x, 0.0), 0.0, 1.0)).rgb);
    float bl = luma(texture(u_texture, clamp(v_uv + vec2(-step.x, step.y), 0.0, 1.0)).rgb);
    float b  = luma(texture(u_texture, clamp(v_uv + vec2(0.0, step.y), 0.0, 1.0)).rgb);
    float br = luma(texture(u_texture, clamp(v_uv + vec2(step.x, step.y), 0.0, 1.0)).rgb);

    float gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
    float gy = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);
    float edge = length(vec2(gx, gy));

    float edgeFactor = smoothstep(u_threshold, u_threshold + 0.25, edge);
    vec3 neon = u_neonColor * edgeFactor * u_brightness;
    vec3 composite = clamp(orig.rgb * (1.0 - edgeFactor * 0.4) + neon, 0.0, 1.0);
    outColor = mix(orig, vec4(composite, orig.a), u_mix);
}
`;

export const DUOTONE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform vec3 u_shadowColor;
uniform vec3 u_highlightColor;
uniform float u_contrast;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 orig = texture(u_texture, v_uv);
    float lum = dot(orig.rgb, vec3(0.2126, 0.7152, 0.0722));
    if (abs(u_contrast) > 0.001) {
        lum = clamp((lum - 0.5) * (1.0 + u_contrast) + 0.5, 0.0, 1.0);
    }
    vec3 tone = mix(u_shadowColor, u_highlightColor, clamp(lum, 0.0, 1.0));
    outColor = mix(orig, vec4(tone, orig.a), u_mix);
}
`;

export const WAVE_DISTORT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_amplitude;
uniform float u_frequency;
uniform float u_speed;
uniform float u_time;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 orig = texture(u_texture, v_uv);
    if (u_amplitude <= 0.0) {
        outColor = orig;
        return;
    }
    float phase = u_time * u_speed;
    float waveX = sin(v_uv.y * u_frequency + phase);
    float waveY = cos(v_uv.x * u_frequency + phase);
    vec2 offset = vec2(waveX, waveY) * (u_amplitude / max(vec2(1.0), u_resolution));
    vec4 warped = texture(u_texture, clamp(v_uv + offset, 0.0, 1.0));
    outColor = mix(orig, warped, u_mix);
}
`;

export const SEPIA_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform float u_amount;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 orig = texture(u_texture, v_uv);
    if (u_amount <= 0.0) {
        outColor = orig;
        return;
    }
    vec3 c = orig.rgb;
    vec3 sepia = vec3(
        dot(c, vec3(0.393, 0.769, 0.189)),
        dot(c, vec3(0.349, 0.686, 0.168)),
        dot(c, vec3(0.272, 0.534, 0.131))
    );
    vec3 toned = clamp(mix(c, sepia, u_amount), 0.0, 1.0);
    outColor = mix(orig, vec4(toned, orig.a), u_mix);
}
`;
