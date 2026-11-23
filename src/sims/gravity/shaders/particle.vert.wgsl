struct Particle {
    position: vec2<f32>,
    mass: f32,
    color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uResolution : vec2<f32>;

struct VertexOut {
    @builtin(position) position : vec4<f32>,
    @location(0)       localPos : vec2<f32>,
    @location(1)       color    : vec4<f32>,
};

// NOTE keep in sync with getRadius function on CPU
fn getRadius(mass: f32) -> f32 {
    return 0.5 * sqrt(mass);
}

@vertex
fn main(
    @builtin(vertex_index)   vi       : u32,
    @location(0)             position : vec2<f32>,
    @location(1)             mass     : f32,
    @location(2)             color    : vec4<f32>,
) -> VertexOut {
    // Unit quad (2 triangles) centered at origin
    var quad = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>( 1.0,  1.0),
    );

    let local = quad[vi];
    let radius = getRadius(mass);
    let pixel = position + local * radius;

    // Convert pixel coords to clip space (-1,1)
    let clip = vec2<f32>(
        (pixel.x / uResolution.x) * 2.0 - 1.0,
        1.0 - (pixel.y / uResolution.y) * 2.0,  // y-down screen
    );

    var out : VertexOut;
    out.position = vec4<f32>(clip, 0.0, 1.0);
    out.localPos = local;
    out.color    = color;
    return out;
}