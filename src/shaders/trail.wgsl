// Two fullscreen passes used by the renderer when trails are enabled:
//   fade_fs: blends the background color over the previous frame (alpha = how much to fade this frame)
//   blit_fs: copies the persistent trail texture to the canvas

struct Fade {
    color: vec4f, // rgb = background color, a = fraction of the old frame to replace with it
};

@group(0) @binding(0) var<uniform> fade: Fade;
@group(0) @binding(1) var trail: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
    // One oversized triangle that covers the whole screen
    var corners = array<vec2f, 3>(
        vec2f(-1.0, -1.0),
        vec2f( 3.0, -1.0),
        vec2f(-1.0,  3.0),
    );
    return vec4f(corners[i], 0.0, 1.0);
}

@fragment
fn fade_fs() -> @location(0) vec4f {
    return fade.color;
}

@fragment
fn blit_fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    return vec4f(textureLoad(trail, vec2i(pos.xy), 0).rgb, 1.0);
}