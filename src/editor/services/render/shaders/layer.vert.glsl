#version 300 es
// Draws one layer as a unit quad. u_affine maps (u, v) to composition pixels (y down).
precision highp float;

uniform mat3 u_affine;
uniform vec2 u_size;
uniform vec4 u_crop; // left, top, right, bottom insets as source fractions
uniform int u_targetIsCanvas;

out vec2 v_uv;

void main() {
	// Triangle strip over the unit square, generated from gl_VertexID (no vertex buffers).
	vec2 uv = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
	vec3 pixel = u_affine * vec3(uv, 1.0);
	v_uv = vec2(u_crop.x + uv.x * (1.0 - u_crop.x - u_crop.z), u_crop.y + uv.y * (1.0 - u_crop.y - u_crop.w));
	float y = u_targetIsCanvas == 1 ? (1.0 - pixel.y / u_size.y * 2.0) : (pixel.y / u_size.y * 2.0 - 1.0);
	gl_Position = vec4(pixel.x / u_size.x * 2.0 - 1.0, y, 0.0, 1.0);
}
