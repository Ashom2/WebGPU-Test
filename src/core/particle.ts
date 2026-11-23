export interface Particle {
    id: number;
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