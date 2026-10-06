#version 300 es
// Textures are uploaded premultiplied and are never flipped; v_uv (0,0) is the image's top-left.
precision highp float;

uniform sampler2D u_texture;
uniform float u_opacity;

in vec2 v_uv;
out vec4 outColor;

void main() {
	outColor = texture(u_texture, v_uv) * u_opacity;
}
