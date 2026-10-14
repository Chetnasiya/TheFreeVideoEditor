/**
 * GLSL Shaders for all 9 Gate K transitions.
 * Each transition is rendered in a full-screen shader pass that samples
 * u_fromTexture and u_toTexture with u_progress (0.0 to 1.0).
 * Pre-multiplied alpha is preserved.
 */

export const TRANSITION_VERT = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const CROSS_DISSOLVE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 fromColor = texture(u_fromTexture, v_uv);
    vec4 toColor = texture(u_toTexture, v_uv);
    outColor = mix(fromColor, toColor, u_progress);
}
`;

export const DIP_TO_BLACK_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 fromColor = texture(u_fromTexture, v_uv);
    vec4 toColor = texture(u_toTexture, v_uv);
    
    // First half: fade fromColor to black (alpha maintained)
    // Second half: fade black to toColor
    if (u_progress < 0.5) {
        float f = 1.0 - (u_progress * 2.0);
        outColor = vec4(fromColor.rgb * f, fromColor.a);
    } else {
        float f = (u_progress - 0.5) * 2.0;
        outColor = vec4(toColor.rgb * f, toColor.a);
    }
}
`;

export const DIP_TO_WHITE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 fromColor = texture(u_fromTexture, v_uv);
    vec4 toColor = texture(u_toTexture, v_uv);
    
    if (u_progress < 0.5) {
        float f = u_progress * 2.0;
        outColor = vec4(mix(fromColor.rgb, vec3(fromColor.a), f), fromColor.a);
    } else {
        float f = (1.0 - u_progress) * 2.0;
        outColor = vec4(mix(toColor.rgb, vec3(toColor.a), f), toColor.a);
    }
}
`;

export const FADE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
in vec2 v_uv;
out vec4 outColor;

void main() {
    // Fade to/from transparent so underlying tracks show through
    vec4 fromColor = texture(u_fromTexture, v_uv);
    vec4 toColor = texture(u_toTexture, v_uv);
    outColor = mix(fromColor, toColor, u_progress);
}
`;

export const WIPE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
uniform float u_angle; // in degrees
uniform float u_softness;
uniform int u_reverse;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 fromColor = texture(u_fromTexture, v_uv);
    vec4 toColor = texture(u_toTexture, v_uv);

    float rad = radians(u_angle);
    vec2 dir = vec2(cos(rad), sin(rad));
    
    // Project centered UV along dir
    vec2 p = v_uv - 0.5;
    float dist = dot(p, dir) + 0.5; // range roughly [0, 1] diagonally
    
    float prog = u_reverse == 1 ? (1.0 - u_progress) : u_progress;
    float soft = max(0.001, u_softness);
    
    float edge = smoothstep(prog - soft, prog + soft, dist);
    if (u_reverse == 1) {
        edge = 1.0 - edge;
    }
    
    outColor = mix(toColor, fromColor, edge);
}
`;

export const SLIDE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
uniform int u_direction; // 0=left, 1=right, 2=up, 3=down
in vec2 v_uv;
out vec4 outColor;

void main() {
    // In Slide: outgoing clip stays stationary; incoming clip slides over it
    vec2 offset = vec2(0.0);
    if (u_direction == 0) { // left (incoming comes from right towards left)
        offset = vec2(1.0 - u_progress, 0.0);
    } else if (u_direction == 1) { // right (incoming comes from left towards right)
        offset = vec2(-(1.0 - u_progress), 0.0);
    } else if (u_direction == 2) { // up (incoming comes from bottom towards up)
        offset = vec2(0.0, 1.0 - u_progress);
    } else if (u_direction == 3) { // down (incoming comes from top towards down)
        offset = vec2(0.0, -(1.0 - u_progress));
    }
    
    vec2 toUv = v_uv - offset;
    if (toUv.x >= 0.0 && toUv.x <= 1.0 && toUv.y >= 0.0 && toUv.y <= 1.0) {
        outColor = texture(u_toTexture, toUv);
    } else {
        outColor = texture(u_fromTexture, v_uv);
    }
}
`;

export const PUSH_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
uniform int u_direction; // 0=left, 1=right, 2=up, 3=down
in vec2 v_uv;
out vec4 outColor;

void main() {
    // In Push: both clips move together
    vec2 move = vec2(0.0);
    if (u_direction == 0) { // left
        move = vec2(-u_progress, 0.0);
    } else if (u_direction == 1) { // right
        move = vec2(u_progress, 0.0);
    } else if (u_direction == 2) { // up
        move = vec2(0.0, -u_progress);
    } else if (u_direction == 3) { // down
        move = vec2(0.0, u_progress);
    }

    vec2 fromUv = v_uv - move;
    vec2 toOffset = vec2(0.0);
    if (u_direction == 0) toOffset = vec2(1.0, 0.0);
    else if (u_direction == 1) toOffset = vec2(-1.0, 0.0);
    else if (u_direction == 2) toOffset = vec2(0.0, 1.0);
    else if (u_direction == 3) toOffset = vec2(0.0, -1.0);

    vec2 toUv = v_uv - (move + toOffset);

    if (toUv.x >= 0.0 && toUv.x <= 1.0 && toUv.y >= 0.0 && toUv.y <= 1.0) {
        outColor = texture(u_toTexture, toUv);
    } else if (fromUv.x >= 0.0 && fromUv.x <= 1.0 && fromUv.y >= 0.0 && fromUv.y <= 1.0) {
        outColor = texture(u_fromTexture, fromUv);
    } else {
        outColor = vec4(0.0);
    }
}
`;

export const ZOOM_DISSOLVE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
uniform float u_scale;
in vec2 v_uv;
out vec4 outColor;

void main() {
    float maxScale = max(1.0, u_scale);
    // Outgoing scales up by maxScale as progress goes 0 -> 1
    float fromScale = mix(1.0, maxScale, u_progress);
    vec2 fromUv = (v_uv - 0.5) / fromScale + 0.5;

    // Incoming scales down from maxScale to 1.0 as progress goes 0 -> 1
    float toScale = mix(1.0 / maxScale, 1.0, u_progress);
    vec2 toUv = (v_uv - 0.5) / toScale + 0.5;

    vec4 fromColor = vec4(0.0);
    if (fromUv.x >= 0.0 && fromUv.x <= 1.0 && fromUv.y >= 0.0 && fromUv.y <= 1.0) {
        fromColor = texture(u_fromTexture, fromUv);
    }
    vec4 toColor = vec4(0.0);
    if (toUv.x >= 0.0 && toUv.x <= 1.0 && toUv.y >= 0.0 && toUv.y <= 1.0) {
        toColor = texture(u_toTexture, toUv);
    }

    outColor = mix(fromColor, toColor, u_progress);
}
`;

export const IRIS_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
uniform float u_softness;
uniform int u_reverse;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 fromColor = texture(u_fromTexture, v_uv);
    vec4 toColor = texture(u_toTexture, v_uv);

    // Distance from center (max distance to corner is sqrt(0.5^2 + 0.5^2) ~= 0.7071)
    float maxDist = 0.70710678;
    float d = distance(v_uv, vec2(0.5));
    
    float radius = u_progress * maxDist;
    if (u_reverse == 1) {
        radius = (1.0 - u_progress) * maxDist;
    }

    float soft = max(0.001, u_softness * maxDist);
    float edge = smoothstep(radius - soft, radius + soft, d);
    
    if (u_reverse == 1) {
        edge = 1.0 - edge;
    }

    // Inside iris circle is toColor, outside is fromColor
    outColor = mix(toColor, fromColor, edge);
}
`;

export const GLITCH_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
uniform float u_intensity;
uniform int u_colorShift;
in vec2 v_uv;
out vec4 outColor;

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    float strength = sin(u_progress * 3.14159265);
    float timeSlot = floor(u_progress * 24.0);
    float band = floor(v_uv.y * 32.0);
    float noise = hash(vec2(band, timeSlot));
    
    float shift = 0.0;
    if (noise > 0.6) {
        shift = (hash(vec2(band * 1.7, timeSlot)) - 0.5) * 0.15 * strength * u_intensity;
    }

    vec2 uv = clamp(v_uv + vec2(shift, 0.0), 0.0, 1.0);
    vec4 fromCol = texture(u_fromTexture, uv);
    vec4 toCol = texture(u_toTexture, uv);

    if (u_colorShift == 1 && strength > 0.1) {
        float chrom = 0.03 * strength * u_intensity;
        vec2 uvR = clamp(uv + vec2(chrom, 0.0), 0.0, 1.0);
        vec2 uvB = clamp(uv - vec2(chrom, 0.0), 0.0, 1.0);
        float r = mix(texture(u_fromTexture, uvR).r, texture(u_toTexture, uvR).r, u_progress);
        float g = mix(fromCol.g, toCol.g, u_progress);
        float b = mix(texture(u_fromTexture, uvB).b, texture(u_toTexture, uvB).b, u_progress);
        float a = mix(fromCol.a, toCol.a, u_progress);
        outColor = vec4(r, g, b, a);
    } else {
        outColor = mix(fromCol, toCol, u_progress);
    }
}
`;

export const LIGHT_LEAK_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
uniform float u_warmth;
uniform float u_intensity;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 fromColor = texture(u_fromTexture, v_uv);
    vec4 toColor = texture(u_toTexture, v_uv);
    vec4 base = mix(fromColor, toColor, u_progress);
    
    float bloom = sin(u_progress * 3.14159265);
    float d1 = distance(v_uv, vec2(0.2, 0.1));
    float d2 = distance(v_uv, vec2(0.85, 0.75));
    float glow1 = smoothstep(1.1, 0.0, d1);
    float glow2 = smoothstep(0.9, 0.0, d2);
    float leak = (glow1 * 0.7 + glow2 * 0.5) * bloom * u_intensity;
    
    vec3 leakColor = vec3(1.0, 0.65 * u_warmth + 0.1, 0.25 * (2.0 - u_warmth));
    vec3 resultRgb = base.rgb + leakColor * leak * base.a;
    
    outColor = vec4(clamp(resultRgb, 0.0, 1.0), base.a);
}
`;

export const RADIAL_WIPE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
uniform float u_startAngle;
uniform float u_softness;
uniform int u_reverse;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 fromColor = texture(u_fromTexture, v_uv);
    vec4 toColor = texture(u_toTexture, v_uv);

    vec2 p = v_uv - vec2(0.5);
    float angle = atan(p.y, p.x) - radians(u_startAngle);
    float normAngle = fract((angle / 6.2831853) + 1.0);
    
    float prog = u_reverse == 1 ? (1.0 - u_progress) : u_progress;
    float soft = max(0.001, u_softness);
    
    float edge = smoothstep(prog - soft, prog + soft, normAngle);
    if (u_reverse == 1) edge = 1.0 - edge;
    
    outColor = mix(toColor, fromColor, edge);
}
`;

export const BLINDS_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
uniform float u_count;
uniform int u_direction;
uniform float u_softness;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 fromColor = texture(u_fromTexture, v_uv);
    vec4 toColor = texture(u_toTexture, v_uv);

    float coord = u_direction == 1 ? v_uv.y : v_uv.x;
    float slat = fract(coord * max(1.0, u_count));
    
    float soft = max(0.001, u_softness);
    float edge = smoothstep(u_progress - soft, u_progress + soft, slat);
    
    outColor = mix(toColor, fromColor, edge);
}
`;

export const DIAMOND_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
uniform float u_softness;
uniform int u_reverse;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec4 fromColor = texture(u_fromTexture, v_uv);
    vec4 toColor = texture(u_toTexture, v_uv);

    float d = abs(v_uv.x - 0.5) + abs(v_uv.y - 0.5);
    float prog = u_reverse == 1 ? (1.0 - u_progress) : u_progress;
    float radius = prog * 1.05;
    float soft = max(0.001, u_softness);
    
    float edge = smoothstep(radius - soft, radius + soft, d);
    if (u_reverse == 1) edge = 1.0 - edge;
    
    outColor = mix(toColor, fromColor, edge);
}
`;

export const WHIP_PAN_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
uniform int u_direction;
uniform float u_blur;
in vec2 v_uv;
out vec4 outColor;

void main() {
    float t = smoothstep(0.0, 1.0, u_progress);
    
    vec2 dir = vec2(-1.0, 0.0);
    if (u_direction == 1) dir = vec2(1.0, 0.0);
    else if (u_direction == 2) dir = vec2(0.0, -1.0);
    else if (u_direction == 3) dir = vec2(0.0, 1.0);
    
    vec2 pan = dir * t;
    vec2 toOffset = -dir;
    
    float blurAmt = sin(t * 3.14159265) * u_blur * 0.15;
    
    vec4 fromAcc = vec4(0.0);
    vec4 toAcc = vec4(0.0);
    float samples = 7.0;
    
    for (float i = -3.0; i <= 3.0; i += 1.0) {
        vec2 blurStep = dir * (i / 3.0) * blurAmt;
        vec2 fUv = v_uv - pan + blurStep;
        vec2 tUv = v_uv - (pan + toOffset) + blurStep;
        
        if (fUv.x >= 0.0 && fUv.x <= 1.0 && fUv.y >= 0.0 && fUv.y <= 1.0) {
            fromAcc += texture(u_fromTexture, fUv);
        }
        if (tUv.x >= 0.0 && tUv.x <= 1.0 && tUv.y >= 0.0 && tUv.y <= 1.0) {
            toAcc += texture(u_toTexture, tUv);
        }
    }
    
    fromAcc /= samples;
    toAcc /= samples;
    
    outColor = mix(fromAcc, toAcc, t);
}
`;

export const PIXELIZE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
uniform float u_maxBlockSize;
in vec2 v_uv;
out vec4 outColor;

void main() {
    float peak = sin(u_progress * 3.14159265);
    float blockSize = max(1.0, peak * u_maxBlockSize);
    
    vec2 blocks = vec2(64.0 / blockSize * 10.0, 36.0 / blockSize * 10.0);
    vec2 pixelUv = floor(v_uv * blocks) / blocks;
    
    vec4 fromColor = texture(u_fromTexture, pixelUv);
    vec4 toColor = texture(u_toTexture, pixelUv);
    
    outColor = mix(fromColor, toColor, u_progress);
}
`;

export const SWIRL_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
uniform float u_radius;
uniform float u_turns;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec2 p = v_uv - vec2(0.5);
    float r = length(p);
    float angle = atan(p.y, p.x);
    
    float strength = sin(u_progress * 3.14159265);
    float swirlAngle = (1.0 - smoothstep(0.0, max(0.01, u_radius), r)) * u_turns * 3.14159265 * strength;
    
    vec2 swirledUv = vec2(0.5) + vec2(cos(angle + swirlAngle), sin(angle + swirlAngle)) * r;
    swirledUv = clamp(swirledUv, 0.0, 1.0);
    
    vec4 fromColor = texture(u_fromTexture, swirledUv);
    vec4 toColor = texture(u_toTexture, swirledUv);
    
    outColor = mix(fromColor, toColor, u_progress);
}
`;

export const RIPPLE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
uniform float u_frequency;
uniform float u_amplitude;
uniform float u_speed;
in vec2 v_uv;
out vec4 outColor;

void main() {
    vec2 p = v_uv - vec2(0.5);
    float d = length(p);
    
    float strength = sin(u_progress * 3.14159265);
    float wave = sin(d * u_frequency - u_progress * u_speed * 12.0) * u_amplitude * strength;
    
    vec2 dir = d > 0.0001 ? (p / d) : vec2(0.0);
    vec2 rippleUv = clamp(v_uv + dir * wave, 0.0, 1.0);
    
    vec4 fromColor = texture(u_fromTexture, rippleUv);
    vec4 toColor = texture(u_toTexture, rippleUv);
    
    outColor = mix(fromColor, toColor, u_progress);
}
`;

export const BLUR_DISSOLVE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fromTexture;
uniform sampler2D u_toTexture;
uniform float u_progress;
uniform float u_angle;
uniform float u_strength;
in vec2 v_uv;
out vec4 outColor;

void main() {
    float peak = sin(u_progress * 3.14159265);
    float rad = radians(u_angle);
    vec2 dir = vec2(cos(rad), sin(rad)) * peak * u_strength * 0.08;
    
    vec4 fromAcc = vec4(0.0);
    vec4 toAcc = vec4(0.0);
    float samples = 7.0;
    
    for (float i = -3.0; i <= 3.0; i += 1.0) {
        vec2 offset = dir * (i / 3.0);
        vec2 sampleUv = clamp(v_uv + offset, 0.0, 1.0);
        fromAcc += texture(u_fromTexture, sampleUv);
        toAcc += texture(u_toTexture, sampleUv);
    }
    
    fromAcc /= samples;
    toAcc /= samples;
    
    outColor = mix(fromAcc, toAcc, u_progress);
}
`;
