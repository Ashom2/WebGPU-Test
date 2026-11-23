import { GravityBody } from './simulation';

export const GRAVITY_PARTICLE_FLOATS = 8;

export const GRAVITY_VERTEX_ATTRIBUTES: GPUVertexAttribute[] = [
    { shaderLocation: 0, offset: 0,  format: 'float32x2' }, // x, y
    { shaderLocation: 1, offset: 8,  format: 'float32'   }, // mass
    { shaderLocation: 2, offset: 16, format: 'float32x4' }, // r, g, b, a
];

export function packGravityParticles(ps: GravityBody[]): Float32Array {
    const stride = GRAVITY_PARTICLE_FLOATS;
    const data = new Float32Array(ps.length * stride);
    for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const o = i * stride;
        data[o + 0] = p.x;
        data[o + 1] = p.y;
        data[o + 2] = p.mass;
        data[o + 3] = 0; // pad
        data[o + 4] = p.r;
        data[o + 5] = p.g;
        data[o + 6] = p.b;
        data[o + 7] = p.a;
    }
    return data;
}