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
