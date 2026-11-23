import { Particle } from '../../core/particle';

/** Floats per instance: [x, y, r, g, b, a]. */
export const ANEMONE_PARTICLE_FLOATS = 6;

export const ANEMONE_VERTEX_ATTRIBUTES: GPUVertexAttribute[] = [
    { shaderLocation: 0, offset: 0, format: 'float32x2' },  // x, y
    { shaderLocation: 1, offset: 8, format: 'float32x4' },  // r, g, b, a
];

export function packAnemoneParticles(ps: Particle[]): Float32Array {
    const stride = ANEMONE_PARTICLE_FLOATS;
    const data = new Float32Array(ps.length * stride);
    for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const o = i * stride;
        data[o + 0] = p.x;
        data[o + 1] = p.y;
        data[o + 2] = p.r;
        data[o + 3] = p.g;
        data[o + 4] = p.b;
        data[o + 5] = p.a;
    }
    return data;
}