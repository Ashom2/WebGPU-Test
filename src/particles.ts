export interface Particle {
    x: number;
    y: number;
    radius: number;
    r: number;
    g: number;
    b: number;
    a: number;
}

export function initParticles(count: number, width: number, height: number): Particle[] {
    const ps: Particle[] = [];
    for (let i = 0; i < count; i++) {
        ps.push({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: 0.5 + Math.random() * 10,
            r: Math.random(),
            g: Math.random(),
            b: Math.random(),
            a: 0.6 + Math.random() * 0.4,
        });
    }
    return ps;
}

// Pack particles into a Float32Array: [x, y, radius, pad, r, g, b, a] per instance
export function packParticles(ps: Particle[]): Float32Array {
    const stride = 8;
    const data = new Float32Array(ps.length * stride);
    for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const o = i * stride;
        data[o + 0] = p.x;
        data[o + 1] = p.y;
        data[o + 2] = p.radius;
        data[o + 3] = 0; // pad
        data[o + 4] = p.r;
        data[o + 5] = p.g;
        data[o + 6] = p.b;
        data[o + 7] = p.a;
    }
    return data;
}