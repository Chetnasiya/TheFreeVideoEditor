export const RECT_MASK_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_center;
uniform vec2 u_size;
uniform float u_rotation;
uniform float u_roundness;
uniform float u_expansion;
uniform vec2 u_resolution;
uniform float u_inverted;
uniform float u_opacity;

vec2 rotate2d(vec2 p, float rad) {
    float c = cos(rad);
    float s = sin(rad);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + vec2(r);
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main() {
    vec2 pPix = (v_uv - u_center) * u_resolution;
    vec2 rotPix = rotate2d(pPix, -u_rotation);

    vec2 halfSizePix = (u_size * 0.5) * u_resolution + vec2(u_expansion);
    halfSizePix = max(halfSizePix, vec2(0.5));
    float maxR = min(halfSizePix.x, halfSizePix.y);
    float r = clamp(u_roundness * maxR, 0.0, maxR);

    float dist = sdRoundedBox(rotPix, halfSizePix, r);
    float alpha = clamp(0.5 - dist, 0.0, 1.0);

    if (u_inverted > 0.5) alpha = 1.0 - alpha;
    alpha *= u_opacity;

    outColor = vec4(alpha, alpha, alpha, alpha);
}
`;

export const ELLIPSE_MASK_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_center;
uniform vec2 u_radii;
uniform float u_rotation;
uniform float u_expansion;
uniform vec2 u_resolution;
uniform float u_inverted;
uniform float u_opacity;

vec2 rotate2d(vec2 p, float rad) {
    float c = cos(rad);
    float s = sin(rad);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

void main() {
    vec2 pPix = (v_uv - u_center) * u_resolution;
    vec2 rotPix = rotate2d(pPix, -u_rotation);

    vec2 radiiPix = u_radii * u_resolution + vec2(u_expansion);
    radiiPix = max(radiiPix, vec2(0.5));

    float d = length(rotPix / radiiPix);
    vec2 grad = rotPix / (radiiPix * radiiPix);
    float distPix = (d - 1.0) / max(0.0001, length(grad));

    float alpha = clamp(0.5 - distPix, 0.0, 1.0);
    if (u_inverted > 0.5) alpha = 1.0 - alpha;
    alpha *= u_opacity;

    outColor = vec4(alpha, alpha, alpha, alpha);
}
`;

export const MATTE_ACCUM_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_accumMatte;
uniform sampler2D u_maskMatte;
uniform int u_mode; // 0=add, 1=subtract, 2=intersect

void main() {
    float M = texture(u_accumMatte, v_uv).r;
    float m = texture(u_maskMatte, v_uv).r;
    float res = M;
    if (u_mode == 0) {
        res = M + m - M * m;
    } else if (u_mode == 1) {
        res = M * (1.0 - m);
    } else if (u_mode == 2) {
        res = M * m;
    }
    res = clamp(res, 0.0, 1.0);
    outColor = vec4(res, res, res, res);
}
`;

export const MATTE_MULTIPLY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_layerTexture;
uniform sampler2D u_matteTexture;

void main() {
    vec4 color = texture(u_layerTexture, v_uv);
    float m = texture(u_matteTexture, v_uv).r;
    outColor = color * m;
}
`;

export const FEATHER_BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_texture;
uniform vec2 u_direction;
uniform float u_sigma;

void main() {
    if (u_sigma <= 0.1) {
        outColor = texture(u_texture, v_uv);
        return;
    }
    float twoSigmaSq = 2.0 * u_sigma * u_sigma;
    int radius = int(ceil(u_sigma * 3.0));
    radius = min(radius, 32);

    float totalWeight = 0.0;
    float acc = 0.0;

    for (int i = -radius; i <= radius; i++) {
        float offset = float(i);
        float weight = exp(-(offset * offset) / twoSigmaSq);
        acc += texture(u_texture, v_uv + float(i) * u_direction).r * weight;
        totalWeight += weight;
    }

    float res = acc / totalWeight;
    outColor = vec4(res, res, res, res);
}
`;

export const PATH_MATTE_INIT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_pathRaster;
uniform float u_inverted;
uniform float u_opacity;

void main() {
    float alpha = texture(u_pathRaster, v_uv).a;
    if (u_inverted > 0.5) alpha = 1.0 - alpha;
    alpha *= u_opacity;
    outColor = vec4(alpha, alpha, alpha, alpha);
}
`;

export const BLIT_MASK_MIX_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_original;
uniform sampler2D u_processed;
uniform sampler2D u_maskMatte;
uniform float u_mix;
in vec2 v_uv;
out vec4 outColor;
void main() {
    vec4 orig = texture(u_original, v_uv);
    vec4 proc = texture(u_processed, v_uv);
    float m = texture(u_maskMatte, v_uv).r * u_mix;
    outColor = mix(orig, proc, m);
}
`;
