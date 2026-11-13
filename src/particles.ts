// "No target": this particle is not being absorbed by anyone
const NONE = -1;

export interface Particle {
    id: number;
    // birthTime: number;
    x: number; y: number;
    vx: number; vy: number;
    mass: number;
    r: number; g: number; b: number; a: number;
}

export interface ChunkGrid {
    cellSize: number;
    cols: number;
    rows: number;
    // Flat array of length cols*rows, each entry holds particles who fall within that cell
    cells: Particle[][];
}

export interface ParticleSystem {
    // Current state. Invariant: particles[i].id === i
    particles: Particle[];
    // Scratch buffer written by pass A (gravity), read by pass B (merge)
    next: Particle[];
    // target[i] = id of the particle that wants to absorb particle i, or NONE
    target: Int32Array;
    claimed: Uint8Array; // claimed[i] = 1 if someone targets i this frame
    grid: ChunkGrid;
}

export function initParticles(
    count: number, 
    width: number, 
    height: number,
    cellSize = 64,
    maxSpeed = 50,
): ParticleSystem {
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
        spawnParticle(p, width, height, maxSpeed);
        particles.push(p);
    }

    // Preallocate the scratch buffers once; nothing is allocated per frame
    const next = particles.map((p) => ({ ...p }));
    const target = new Int32Array(count).fill(NONE);
    // Create chunk grid
    const grid = createChunkGrid(width, height, cellSize);
    const claimed = new Uint8Array(count);
    const particleSystem = { particles, next, target, claimed, grid };

    // Assign particles to respective cells
    updateChunks(particleSystem);

    return particleSystem;
}

/**
 * Give a particle a fresh random position, velocity, color, and mass 1.
 * Used both for the initial population and for respawning dead particles.
 * Writes only to `p` (keeps its id), so it's safe to call from a per-particle pass.
 */
function spawnParticle(
    p: Particle,
    width: number,
    height: number,
    maxSpeed: number,
): void {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * maxSpeed;
    // p.birthTime = 0;
    p.x = Math.random() * width;
    p.y = Math.random() * height;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.mass = 1;
    p.r = Math.random();
    p.g = Math.random();
    p.b = Math.random();
    p.a = 0.6 + Math.random() * 0.4;
}

/**
 * Pass A. Reads particles[i] (and its neighbors), writes ONLY next[i] and target[i].
 * Gravity, integration, wrapping, and "who wants to absorb me?".
 */
function updateParticle(
    i: number,
    system: ParticleSystem,
    params: GravityParams,
    dt: number,
    width: number,
    height: number,
): void {
    const { particles, next, target, claimed, grid } = system;
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
    const radius = getRadius(p);
    if (out.x < -radius)               out.x = width + radius;
    else if (out.x > width + radius)   out.x = -radius;

    if (out.y < -radius)               out.y = height + radius;
    else if (out.y > height + radius)  out.y = -radius;

    // Apply weak drag
    // out.vx *= 0.99; out.vy *= 0.99; // per frame (≈ 45%/s loss at 60fps)
}

export function updateParticles(
    particleSystem: ParticleSystem,
    params: GravityParams,
    dt: number,
    width: number,
    height: number,
    maxSpeed = 50, // for respawned particles; match what you passed to initParticles
): void {
    const { particles } = particleSystem;
    particleSystem.claimed.fill(0);

    // Pass A: gravity + integrate into next[], pick absorbers into target[]
    for (let i = 0; i < particles.length; i++) {
        updateParticle(i, particleSystem, params, dt, width, height);
    }

    // Pass B: resolve absorption back into particles[], respawning absorbed victims
    for (let i = 0; i < particles.length; i++) {
        mergeParticle(i, particleSystem, width, height, maxSpeed);
    }
}

/** Pack particles into a Float32Array: [x, y, mass, pad, r, g, b, a] per instance. */
export function packParticles(ps: Particle[]): Float32Array {
    const stride = 8;
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

/** Allocate an empty grid. */
export function createChunkGrid(
    width: number,
    height: number,
    cellSize = 64,
): ChunkGrid {
    const cols = Math.max(1, Math.ceil(width / cellSize));
    const rows = Math.max(1, Math.ceil(height / cellSize));
    const cells: Particle[][] = new Array(cols * rows);
    for (let i = 0; i < cells.length; i++) cells[i] = [];
    return { cellSize, cols, rows, cells };
}

/** Clear the grid and re-bin every particle by its current position. */
export function updateChunks(particleSystem: ParticleSystem): void {
    for (const cell of particleSystem.grid.cells) cell.length = 0;

    const { cellSize, cols, rows, cells } = particleSystem.grid;
    for (const p of particleSystem.particles) {
        if (p.mass === 0) continue; // dead particles don't need to be found by anyone
        const gx = clampInt(Math.floor(p.x / cellSize), cols);
        const gy = clampInt(Math.floor(p.y / cellSize), rows);
        cells[gy * cols + gx].push(p);
    }
}

function clampInt(v: number, n: number): number {
    if (v < 0) return 0;
    if (v >= n) return n - 1;
    return v;
}

/** Cell contents at integer cell coordinates. Returns undefined if out of bounds. */
export function chunkAt(
    grid: ChunkGrid,
    gx: number,
    gy: number,
): Particle[] | undefined {
    if (gx < 0 || gy < 0 || gx >= grid.cols || gy >= grid.rows) return undefined;
    return grid.cells[gy * grid.cols + gx];
}

/** Get cell contents at a world position. */
export function chunkAtWorld(
    grid: ChunkGrid,
    x: number,
    y: number,
): Particle[] | undefined {
    const gx = clampInt(Math.floor(x / grid.cellSize), grid.cols);
    const gy = clampInt(Math.floor(y / grid.cellSize), grid.rows);
    return grid.cells[gy * grid.cols + gx];
}

/** Visit the 3×3 block of cells centered on (gx, gy). Skips out-of-bounds. */
export function forEachNeighbor(
    grid: ChunkGrid,
    gx: number,
    gy: number,
    fn: (cell: Particle[], nx: number, ny: number) => void,
): void {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const nx = gx + dx;
            const ny = gy + dy;
            if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
            fn(grid.cells[ny * grid.cols + nx], nx, ny);
        }
    }
}



export interface GravityParams {
    /** Gravitational constant, px/s² per unit mass. */
    G: number;
    /** Softening length in px; avoids 1/r² blowup. */
    softening: number;
    /** Max acceleration magnitude per particle (px/s²). */
    maxAccel: number;
}

// NOTE keep in sync with getRadius function in vertex shader
function getRadius(particle: Particle): number {
    return 0.5 * Math.sqrt(particle.mass);
}

// NOTE keep in sync with getRadius
function getRadius2(particle: Particle): number {
    return 0.25 * particle.mass;
}

/**
 * Accumulates gravity on `thisParticle` from its neighbors and writes the new velocity to `out`
 * (never to thisParticle, so other particles can still read the old state).
 * Returns the id of the strongest touching neighbor that outranks thisParticle, or NONE.
 */
export function applyNeighborGravity(
    thisParticle: Particle,
    out: Particle,
    grid: ChunkGrid,
    params: GravityParams,
    dt: number, // delta time
    particles: Particle[],
): number {
    const { cellSize, cols, rows } = grid;
    const G = params.G;
    const soft2 = params.softening * params.softening;
    const maxAcc2 = params.maxAccel * params.maxAccel;

    // Interact radius: anything within this distance is definitely in the 3×3 cells.
    // (Any particle outside this radius we deliberately ignore, so 3×3 is sufficient.)
    const R = cellSize;

    const x = thisParticle.x;
    const y = thisParticle.y;

    const gx = clampInt(Math.floor(x / cellSize), cols);
    const gy = clampInt(Math.floor(y / cellSize), rows);

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

            // Collision detection: am I engulfed by someone who outranks me?
            // My center must be inside the winner's circle. Keep only the strongest such neighbor.
            if (shouldAbsorb(otherParticle, thisParticle) && r2 < getRadius2(otherParticle)) {
                if (absorber === NONE || shouldAbsorb(otherParticle, particles[absorber])) {
                    absorber = otherParticle.id;
                }
            }
        }
    });

    // Clamp acceleration magnitude
    const a2 = ax * ax + ay * ay;
    if (a2 > maxAcc2) {
        const s = params.maxAccel / Math.sqrt(a2);
        ax *= s;
        ay *= s;
    }

    // Apply to velocity. dt is handled by the caller via updateParticles
    out.vx = thisParticle.vx + ax * dt;
    out.vy = thisParticle.vy + ay * dt;

    return absorber;
}

// returns true if `a` should absorb `b` (i.e. a "wins" the pair)
function shouldAbsorb(a: Particle, b: Particle): boolean {
    // Greater mass
    if (a.mass !== b.mass) return a.mass > b.mass;
    // Or greater age
    // if (a.birthTime !== b.birthTime) return a.birthTime < b.birthTime;
    // Fallback on id
    return a.id < b.id;
}

/**
 * Pass B. Reads next[*] and target[*], writes ONLY particles[i].
 * Either dies (absorbed) and respawns, or collects the mass and momentum of everyone who targeted it.
 */
function mergeParticle(
    i: number,
    particleSystem: ParticleSystem,
    width: number,
    height: number,
    maxSpeed: number,
): void {
    const { particles, next, target, claimed, grid } = particleSystem;
    const cur = particles[i];
    const p = next[i];
    const t = target[i];

    // Already dead (with respawn enabled this is just a safety net)
    if (p.mass === 0) {
        // Recycle the slot (comment out to let particles stay dead)
        // spawnParticle(cur, width, height, maxSpeed);
        return;
    }

    // Victim whose winner survives this frame: absorbed.
    // (If the winner is itself a victim, we wait a frame, so mass never vanishes in a chain.)
    // Its mass has already been collected by the winner via next[], so we kill it...
    if (t !== NONE && target[t] === NONE) {
        cur.mass = 0;
        // Recycle the slot (comment out to let particles stay dead)
        // spawnParticle(cur, width, height, maxSpeed);
        return;
    }

    let m = p.mass;
    let px = p.mass * p.vx;
    let py = p.mass * p.vy;

    // Only a "root" (not itself a victim) collects mass.
    if (t === NONE && claimed[i]) {
        // Grid was built from the *old* positions, and so was target[], so look up by cur
        const gx = clampInt(Math.floor(cur.x / grid.cellSize), grid.cols);
        const gy = clampInt(Math.floor(cur.y / grid.cellSize), grid.rows);

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