export interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    r: number;
    g: number;
    b: number;
    a: number;
}

export function initParticles(
    count: number, 
    width: number, 
    height: number,
    maxSpeed = 50,
): Particle[] {
    const ps: Particle[] = [];
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * maxSpeed;
        ps.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 0.5 + Math.random() * 10,
            r: Math.random(),
            g: Math.random(),
            b: Math.random(),
            a: 0.6 + Math.random() * 0.4,
        });
    }
    return ps;
}

export function updateParticles(
    particles: Particle[],
    dt: number,
    width: number,
    height: number,
): void {
    for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Wrap around (use radius as margin so large circles fully exit first)
        const m = p.radius;
        if (p.x < -m)               p.x = width + m;
        else if (p.x > width + m)   p.x = -m;

        if (p.y < -m)               p.y = height + m;
        else if (p.y > height + m)  p.y = -m;
    }
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