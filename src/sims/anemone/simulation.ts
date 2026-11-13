import {
    Particle,
    getRadius,
    createParticles,
    wrapPosition,
} from '../../core/particle';
import {
    ChunkGrid,
    ParticleSystem,
    createChunkGrid,
    updateChunks,
    forEachNeighbor,
    cellX,
    cellY,
} from '../../core/chunks';

// The renderer draws a particle with radius 0.5 * sqrt(mass) px. Radius 1.5 is about as wide as one step
// at 60 fps with the default speed, so the trails come out unbroken.
const PARTICLE_MASS = 9;

export interface FlockParams {
    // Constant speed of every particle, px/s
    speed: number;
    // Max turning speed, rad/s
    turnRate: number;
    // Random jitter (rad) added to the target heading each frame
    noise: number;
    // Closer than this to the nearest neighbor, a particle also steers away from it (px)
    repelRadius: number;
    // Strength of that push relative to the neighbor's heading (1 = as strong as the heading itself)
    repelWeight: number;
    // Particles closer than this to the mouse steer away from it (px)
    mouseRadius: number;
    // Strength of that push at the mouse itself, relative to a unit heading. Fades linearly to 0 at mouseRadius.
    mouseWeight: number;
}

/** Mouse position in canvas pixels. Not `active` when the pointer is off the canvas. */
export interface Mouse {
    x: number;
    y: number;
    active: boolean;
}

/** Everything this simulation needs on top of the generic particles + chunk grid. */
export interface FlockSystem extends ParticleSystem {
    // Written by updateParticles, then swapped with `particles`. Always the same length.
    next: Particle[];
    params: FlockParams;
}

export function initParticles(
    count: number,
    width: number,
    height: number,
    cellSize = 16,
    params: FlockParams,
): FlockSystem {
    const particles = createParticles(count, width, height, params.speed);
    for (const p of particles) {
        // White, and exactly `speed` in a random direction (speed is constant from here on)
        p.mass = PARTICLE_MASS;
        p.r = 1; p.g = 1; p.b = 1;
        const angle = Math.random() * Math.PI * 2;
        p.vx = Math.cos(angle) * params.speed;
        p.vy = Math.sin(angle) * params.speed;
    }

    // Colors and mass never change, so both buffers can start as identical copies
    const next = particles.map((p) => ({ ...p }));
    const grid = createChunkGrid(width, height, cellSize);
    const system: FlockSystem = { particles, grid, next, params };

    // Assign particles to respective cells
    updateChunks(system);

    return system;
}

export function updateParticles(
    system: FlockSystem,
    dt: number,
    width: number,
    height: number,
    mouse: Mouse,
): void {
    const { particles } = system;

    // Each particle reads the old state of `particles` and writes only its own slot in `next`
    for (let i = 0; i < particles.length; i++) {
        updateParticle(i, system, dt, width, height, mouse);
    }

    // Swap buffers. The grid still points at the old objects until updateChunks rebuilds it.
    system.particles = system.next;
    system.next = particles;
}

/** Reads particles[i] (and its neighbors), writes ONLY next[i]. */
function updateParticle(
    i: number,
    system: FlockSystem,
    dt: number,
    width: number,
    height: number,
    mouse: Mouse,
): void {
    const { particles, next, grid, params } = system;
    const p = particles[i];
    const out = next[i];

    let angle = Math.atan2(p.vy, p.vx);

    // Desired heading, built up from whatever is influencing this particle
    let dx = 0, dy = 0;
    let steering = false;

    const nearest = findNearest(p, grid);
    if (nearest !== null) {
        steering = true;

        // Start from the nearest neighbor's heading, as a unit vector
        dx = nearest.vx / params.speed;
        dy = nearest.vy / params.speed;

        // Push away from it if it's too close
        const rx = p.x - nearest.x;
        const ry = p.y - nearest.y;
        const dist2 = rx * rx + ry * ry; // never 0, findNearest skips coincident particles
        if (dist2 < params.repelRadius * params.repelRadius) {
            const invDist = 1 / Math.sqrt(dist2);
            dx += rx * invDist * params.repelWeight;
            dy += ry * invDist * params.repelWeight;
        }
    }

    // Push away from the mouse, stronger the closer we are
    if (mouse.active) {
        const mx = p.x - mouse.x;
        const my = p.y - mouse.y;
        const mouseDist2 = mx * mx + my * my;
        if (mouseDist2 > 0 && mouseDist2 < params.mouseRadius * params.mouseRadius) {
            if (!steering) {
                // Nothing else is steering us, so start from our own heading
                dx = p.vx / params.speed;
                dy = p.vy / params.speed;
                steering = true;
            }
            const mouseDist = Math.sqrt(mouseDist2);
            const push = params.mouseWeight * (1 - mouseDist / params.mouseRadius);
            // Repel from mouse
            dx += (mx / mouseDist) * push;
            dy += (my / mouseDist) * push;
            // If you want spiraling behaviour around mouse:
            // dx += (my / mouseDist) * push;
            // dy -= (mx / mouseDist) * push;
        }
    }

    if (steering) {
        // Glide toward the desired heading, turning at most turnRate
        const target = Math.atan2(dy, dx) + (Math.random() * 2 - 1) * params.noise;
        const maxTurn = params.turnRate * dt;
        angle += clamp(wrapAngle(target - angle), -maxTurn, maxTurn);
    }

    out.vx = Math.cos(angle) * params.speed;
    out.vy = Math.sin(angle) * params.speed;
    out.x = p.x + out.vx * dt;
    out.y = p.y + out.vy * dt;

    // Wrap around (use radius as margin so the circle fully exits first)
    wrapPosition(out, getRadius(p), width, height);
}

/**
 * Nearest other particle within the 3×3 cells around `p`, or null if there is none.
 * Like the original, this doesn't see across the wrapped edges of the screen.
 */
function findNearest(p: Particle, grid: ChunkGrid): Particle | null {
    let nearest: Particle | null = null;
    let nearestR2 = Infinity;

    forEachNeighbor(grid, cellX(grid, p.x), cellY(grid, p.y), (cell) => {
        for (let k = 0; k < cell.length; k++) {
            const q = cell[k];
            if (q === p) continue;

            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const r2 = dx * dx + dy * dy;
            if (r2 === 0 || r2 >= nearestR2) continue;

            nearest = q;
            nearestR2 = r2;
        }
    });

    return nearest;
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

/** Wrap an angle difference into [-π, π] so we always turn the short way round. */
function wrapAngle(a: number): number {
    return a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
}