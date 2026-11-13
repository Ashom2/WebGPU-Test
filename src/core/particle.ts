export interface Particle {
    id: number;
    // birthTime: number;
    x: number; y: number;
    vx: number; vy: number;
    mass: number;
    r: number; g: number; b: number; a: number;
}

/** Floats per particle in the instance buffer. Keep in sync with packParticles and the renderer's vertex layout. */
export const PARTICLE_FLOATS = 8;

// NOTE keep in sync with getRadius function in vertex shader
export function getRadius(particle: Particle): number {
    return 0.5 * Math.sqrt(particle.mass);
}

// NOTE keep in sync with getRadius
export function getRadius2(particle: Particle): number {
    return 0.25 * particle.mass;
}

/** Random direction, random speed in [0.5 * maxSpeed, maxSpeed). */
export function randomizeVelocity(p: Particle, maxSpeed: number): void {
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.5 + 0.5 * Math.random()) * maxSpeed;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
}

/**
 * Give a particle a fresh random position, velocity, color, and mass 1.
 * Writes only to `p` (keeps its id), so it's safe to call from a per-particle pass.
 */
export function spawnParticle(
    p: Particle,
    width: number,
    height: number,
    spawnSpeed: number,
): void {
    // p.birthTime = 0;
    p.x = Math.random() * width;
    p.y = Math.random() * height;
    randomizeVelocity(p, spawnSpeed);
    p.mass = 1;
    p.r = Math.random();
    p.g = Math.random();
    p.b = Math.random();
    p.a = 1.0;
}

/** Create `count` randomly spawned particles. Invariant: particles[i].id === i */
export function createParticles(
    count: number,
    width: number,
    height: number,
    spawnSpeed: number,
): Particle[] {
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
        const p: Particle = {
            id: i,
            // birthTime: 0,
            x: 0, y: 0,
            vx: 0, vy: 0,
            mass: 1,
            r: 0, g: 0, b: 0, a: 1,
        };
        spawnParticle(p, width, height, spawnSpeed);
        particles.push(p);
    }
    return particles;
}

/** Toroidal wrap. `margin` is how far past an edge the particle may go before it reappears on the other side. */
export function wrapPosition(
    p: Particle,
    margin: number,
    width: number,
    height: number,
): void {
    if (p.x < -margin)               p.x = width + margin;
    else if (p.x > width + margin)   p.x = -margin;

    if (p.y < -margin)               p.y = height + margin;
    else if (p.y > height + margin)  p.y = -margin;
}

/** Pack particles into a Float32Array: [x, y, mass, pad, r, g, b, a] per instance. */
export function packParticles(ps: Particle[]): Float32Array {
    const stride = PARTICLE_FLOATS;
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