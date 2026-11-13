import {
    Particle,
    getRadius,
    getRadius2,
    createParticles,
    randomizeVelocity,
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



// "No target": this particle is not being absorbed by anyone
const NONE = -1;
const GOLDEN_ANGLE = 2.399963229728653; // spreads fragments evenly over a disc

export interface Params {
    // Velocity damping factor per frame
    drag: number;
    // Gravitational constant, px/s² per unit mass
    G: number;
    // Softening length in px; avoids 1/r² blowup
    softening: number;
    // Max acceleration magnitude per particle (px/s²)
    maxAcceleration: number;
    // Collision mode, 0: off, 1: constant distance, 2: touching
    collisionMode: number;
    // A particle that reaches this mass explodes into that many mass-1 particles
    maxMass: number;
    // max px/s of fragments
    explosionSpeed: number;
}

/** A particle that remembers when it was born. age = system.time - birthTime */
export interface Body extends Particle {
    birthTime: number;
}

/** Everything this simulation needs on top of the generic particles + chunk grid. */
export interface GravitySystem extends ParticleSystem<Body> {
    // Scratch buffer written by pass A (gravity), read by pass B (merge)
    next: Body[];
    time: number;
    // target[i] = id of the particle that wants to absorb particle i, or NONE
    target: Int32Array;
    claimed: Uint8Array;     // claimed[i] = 1 if someone targets i this frame
    // Explosion scratch, rebuilt every frame
    deadSlots: Int32Array;   // indices of mass-0 particles
    exploders: Int32Array;   // indices of particles with mass >= params.maxMass
    offsets: Int32Array;     // offsets[e] = first dead-slot rank owned by exploder e (length count+1)
    params: Params;
}

export function initParticles(
    count: number,
    width: number,
    height: number,
    cellSize = 64,
    spawnSpeed = 50,
    params: Params,
): GravitySystem {
    const particles: Body[] = createParticles(count, width, height, spawnSpeed)
    .map((p) => ({ ...p, birthTime: 0 }));
    const grid = createChunkGrid<Body>(width, height, cellSize);
    const next = particles.map((p) => ({ ...p }));
    const target = new Int32Array(count).fill(NONE);
    const claimed = new Uint8Array(count);
    const deadSlots = new Int32Array(count);
    const exploders = new Int32Array(count);
    const offsets = new Int32Array(count + 1);

    const system: GravitySystem = {
        particles, grid, next, target, claimed, deadSlots, exploders, offsets, params,
        time: 0,
    };

    // Assign particles to respective cells
    updateChunks(system);

    return system;
}

export function updateParticles(
    system: GravitySystem,
    dt: number,
    width: number,
    height: number,
): void {
    const { particles, offsets } = system;

    system.time += dt;

    system.claimed.fill(0);

    // Pass A: gravity + integrate into next[], pick absorbers into target[]
    for (let i = 0; i < particles.length; i++) {
        updateParticle(i, system, dt, width, height);
    }

    // Pass B: resolve absorption back into particles[]
    for (let i = 0; i < particles.length; i++) {
        mergeParticle(i, system);
    }

    // Pass C: explosions. Slots freed by pass B are reusable immediately.
    const numExploding = collectSlots(system);
    const numChildren = offsets[numExploding];
    for (let r = 0; r < numChildren; r++) {      // parallel over dead-slot ranks
        fillDeadSlot(r, system, numExploding);
    }
    // (on the GPU: barrier here, because fill reads parent mass and reset overwrites it)
    for (let e = 0; e < numExploding; e++) {     // parallel over exploders
        finishExplosion(e, system);
    }
}

/**
 * Pass A. Reads particles[i] (and its neighbors), writes ONLY next[i] and target[i].
 * Gravity, integration, wrapping, and "who wants to absorb me?".
 */
function updateParticle(
    i: number,
    system: GravitySystem,
    dt: number,
    width: number,
    height: number,
): void {
    const { particles, next, target, claimed, grid, params } = system;
    const p = particles[i];
    const out = next[i];

    // Start from the current state
    out.x = p.x; out.y = p.y;
    out.vx = p.vx; out.vy = p.vy;
    out.mass = p.mass;

    // If it's destroyed, skip
    if (p.mass === 0) {
        target[i] = NONE;
        return;
    }

    // Update velocity from gravity (written to out), and find who wants to absorb us
    target[i] = applyNeighborGravity(p, out, grid, params, dt, particles);

    // Mark claimed targets
    if (target[i] !== NONE) claimed[target[i]] = 1;

    // Update position according to velocity
    out.x += out.vx * dt;
    out.y += out.vy * dt;

    // Wrap around (use radius as margin so large circles fully exit first)
    wrapPosition(out, getRadius(p), width, height);

    // Apply weak drag
    out.vx *= params.drag; out.vy *= params.drag;
}

/**
 * Accumulates gravity on `thisParticle` from its neighbors and writes the new velocity to `out`
 * (never to thisParticle, so other particles can still read the old state).
 * Returns the id of the strongest neighbor that absorbs thisParticle, or NONE.
 */
function applyNeighborGravity(
    thisParticle: Body,
    out: Body,
    grid: ChunkGrid<Body>,
    params: Params,
    dt: number, // delta time
    particles: Body[],
): number {
    const { cellSize } = grid;
    const G = params.G;
    const soft2 = params.softening * params.softening;
    const maxAcc2 = params.maxAcceleration * params.maxAcceleration;

    // Interact radius: anything within this distance is definitely in the 3×3 cells.
    // (Any particle outside this radius we deliberately ignore, so 3×3 is sufficient.)
    const R = cellSize;

    const x = thisParticle.x;
    const y = thisParticle.y;

    const gx = cellX(grid, x);
    const gy = cellY(grid, y);

    let ax = 0, ay = 0;
    let absorber = NONE;

    forEachNeighbor(grid, gx, gy, (cell) => {
        for (let i = 0; i < cell.length; i++) {
            const otherParticle = cell[i];
            if (otherParticle === thisParticle) continue;
            if (otherParticle.mass === 0) continue;

            const ddx = otherParticle.x - x;
            const ddy = otherParticle.y - y;
            const r2 = ddx * ddx + ddy * ddy;
            if (r2 > R * R || r2 === 0) continue;

            // Plummer-softened gravity
            const invR2 = 1 / (r2 + soft2);                         // 1/(r²+ε²)
            const invLen = Math.sqrt(invR2);                        // 1/√(r²+ε²)
            const mag = G * otherParticle.mass * invR2 * invLen;    // G / (r²+ε²)^1.5
            ax += ddx * mag;
            ay += ddy * mag;

            if (params.collisionMode == 1) {
                // Collision detection: am I engulfed by someone who outranks me?
                if (shouldAbsorb(otherParticle, thisParticle) && r2 < getRadius2(otherParticle)) {
                    if (absorber === NONE || shouldAbsorb(otherParticle, particles[absorber])) {
                        absorber = otherParticle.id;
                    }
                }
            }
            else if (params.collisionMode == 2) {
                // Collision detection: am I within a distance of a particle who outranks me?
                if (shouldAbsorb(otherParticle, thisParticle) && r2 < 0.05) {
                    if (absorber === NONE || shouldAbsorb(otherParticle, particles[absorber])) {
                        absorber = otherParticle.id;
                    }
                }
            }
        }
    });

    // Clamp acceleration magnitude
    const a2 = ax * ax + ay * ay;
    if (a2 > maxAcc2) {
        const s = params.maxAcceleration / Math.sqrt(a2);
        ax *= s;
        ay *= s;
    }

    // Apply to velocity. dt is handled by the caller via updateParticles
    out.vx = thisParticle.vx + ax * dt;
    out.vy = thisParticle.vy + ay * dt;

    return absorber;
}

// returns true if `a` should absorb `b` (i.e. a "wins" the pair)
function shouldAbsorb(a: Body, b: Body): boolean {
    // Greater mass
    if (a.mass !== b.mass) return a.mass > b.mass;
    // Or greater age
    if (a.birthTime !== b.birthTime) return a.birthTime < b.birthTime;
    // Fallback on id
    return a.id < b.id;
}

/**
 * Pass B. Reads next[*] and target[*], writes ONLY particles[i].
 * Either dies (absorbed), or collects the mass and momentum of everyone who targeted it.
 */
function mergeParticle(i: number, system: GravitySystem): void {
    const { particles, next, target, claimed, grid } = system;
    const cur = particles[i];
    const p = next[i];
    const t = target[i];

    // Already dead
    if (p.mass === 0) return;

    // Victim whose winner survives this frame: absorbed (mass already collected via next[])
    if (t !== NONE && target[t] === NONE) {
        cur.mass = 0;
        return;
    }

    let m = p.mass;
    let px = p.mass * p.vx;
    let py = p.mass * p.vy;

    // Only a "root" (not itself a victim) collects mass.
    if (t === NONE && claimed[i]) {
        // Grid was built from the *old* positions, and so was target[], so look up by cur
        const gx = cellX(grid, cur.x);
        const gy = cellY(grid, cur.y);

        forEachNeighbor(grid, gx, gy, (cell) => {
            for (let k = 0; k < cell.length; k++) {
                const q = cell[k].id;
                if (target[q] !== i) continue;
                const v = next[q];
                // Momentum-conserving merge
                m  += v.mass;
                px += v.mass * v.vx;
                py += v.mass * v.vy;
            }
        });
    }

    cur.x = p.x; cur.y = p.y;
    cur.vx = px / m;
    cur.vy = py / m;
    cur.mass = m;
}

/**
 * Stream compaction + exclusive scan (a prefix sum on the GPU).
 * Lists dead slots and exploders, and gives each exploder a contiguous range of dead-slot ranks.
 * Returns the number of exploders that will actually explode this frame.
 */
function collectSlots(system: GravitySystem): number {
    const { particles, deadSlots, exploders, offsets, params } = system;

    let numDead = 0, numExploding = 0;
    for (let i = 0; i < particles.length; i++) {
        const m = particles[i].mass;
        if (m === 0) deadSlots[numDead++] = i;
        else if (m >= params.maxMass) exploders[numExploding++] = i;
    }

    // Each exploder reuses its own slot, so it needs (mass - 1) dead slots
    let total = 0, e = 0;
    for (; e < numExploding; e++) {
        const need = particles[exploders[e]].mass - 1;
        if (total + need > numDead) break;   // can't happen while total mass == count; otherwise wait a frame
        offsets[e] = total;
        total += need;
    }
    offsets[e] = total;
    return e;
}

/** Dead slot `r` finds the exploder that owns it and becomes one of its fragments. Writes only its own slot. */
function fillDeadSlot(r: number, system: GravitySystem, numExploding: number): void {
    const { particles, deadSlots, exploders, offsets, params } = system;

    // Binary search: the last exploder whose offset is <= r
    let lo = 0, hi = numExploding - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (offsets[mid] <= r) lo = mid; else hi = mid - 1;
    }

    const parent = particles[exploders[lo]];
    const child = particles[deadSlots[r]];

    // j = 0 is the exploder itself (stays at the center); fragments are 1..mass-1
    const j = r - offsets[lo] + 1;
    const spread = getRadius(parent) * Math.sqrt((j + 0.5) / parent.mass);
    const angle = j * GOLDEN_ANGLE;

    child.x = parent.x + Math.cos(angle) * spread;
    child.y = parent.y + Math.sin(angle) * spread;
    child.mass = 1;
    child.birthTime = system.time;
    child.r = parent.r; child.g = parent.g; child.b = parent.b; child.a = parent.a;
    randomizeVelocity(child, params.explosionSpeed);
}

/** The exploder's own slot becomes the last fragment. Writes only its own slot. */
function finishExplosion(e: number, system: GravitySystem): void {
    const p = system.particles[system.exploders[e]];
    p.mass = 1;
    p.birthTime = system.time;
    randomizeVelocity(p, system.params.explosionSpeed);
}