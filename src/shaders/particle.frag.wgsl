struct VertexOut {
    @builtin(position) position : vec4<f32>,
    @location(0)       localPos : vec2<f32>,
    @location(1)       color    : vec4<f32>,
};

@fragment
fn main(in : VertexOut) -> @location(0) vec4<f32> {
    let d = length(in.localPos);
    if (d > 1.0) {
        discard;
    }
    // Smooth 1px edge anti-aliasing
    let alpha = 1.0 - smoothstep(0.95, 1.0, d);
    return vec4<f32>(in.color.rgb, in.color.a * alpha);
}