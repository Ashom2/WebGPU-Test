export const Shaders = () => {
    const vertex = `
        struct Particle {
            position: vec2<f32>,
            radius: f32,
            _pad: f32,
            color: vec4<f32>,
        };

        @group(0) @binding(0) var<uniform> uResolution : vec2<f32>;

        struct VertexOut {
            @builtin(position) position : vec4<f32>,
            @location(0)       localPos : vec2<f32>,
            @location(1)       color    : vec4<f32>,
        };

        @vertex
        fn main(
            @builtin(vertex_index)   vi       : u32,
            @location(0)             position : vec2<f32>,
            @location(1)             radius   : f32,
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
    `;

    const fragment = `
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
    `;
    return {vertex, fragment};
}