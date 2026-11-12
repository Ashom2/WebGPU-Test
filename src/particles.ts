const touchR2 = 0.1;
const collisionEvents: CollisionEvent[] = [];

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
    particles: Particle[];
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
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * maxSpeed;
        particles.push({
            id: i,
            // birthTime: 0,
            x: Math.random() * width,
            y: Math.random() * height,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            mass: 1,
            r: Math.random(),
            g: Math.random(),
            b: Math.random(),
            a: 0.6 + Math.random() * 0.4,
        });
    }

    // Create chunk grid
    const grid = createChunkGrid(width, height, cellSize);
    const particleSystem = { particles, grid };
    // Assign particles to respective cells
    updateChunks(particleSystem);

    return particleSystem;
}

function updateParticle(
    p: Particle,
    grid: ChunkGrid,
    params: GravityParams,
    dt: number,
    width: number,
    height: number,
): void {
    // If it's destroyed, skip
    if (p.mass == 0) return;

    // Update velocity from gravity
    applyNeighborGravity(p, grid, params, dt);

    // Update position according to velocity
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Wrap around (use radius as margin so large circles fully exit first)
    const m = p.mass;
    if (p.x < -m)               p.x = width + m;
    else if (p.x > width + m)   p.x = -m;

    if (p.y < -m)               p.y = height + m;
    else if (p.y > height + m)  p.y = -m;

    // Apply weak drag
    // p.vx *= 0.99; p.vy *= 0.99; // per frame (≈ 45%/s loss at 60fps)
}

export function updateParticles(
    particleSystem: ParticleSystem,
    params: GravityParams,
    dt: number,
    width: number,
    height: number,
): void {
    const { particles, grid } = particleSystem;

    for (let i = 0; i < particles.length; i++) {
        updateParticle(particles[i], grid, params, dt, width, height);
    }

    resolveCollisions(particleSystem, collisionEvents);
}

/** Pack particles into a Float32Array: [x, y, radius, pad, r, g, b, a] per instance. */
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

// This was written by AI so don't trust it
export function applyNeighborGravity(
    thisParticle: Particle,
    grid: ChunkGrid,
    params: GravityParams,
    dt: number, // delta time
): void {
    const { cellSize, cols, rows, cells } = grid;
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

    

    forEachNeighbor(grid, gx, gy, (cell) => {
        for (let i = 0; i < cell.length; i++) {
            const otherParticle = cell[i];
            if (otherParticle === thisParticle) continue;

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

            // Collision detection
            if (r2 < touchR2) {
                if (shouldAbsorb(thisParticle, otherParticle)) {
                    // Is the absorber
                    collisionEvents.push({ absorber: thisParticle.id, victim: otherParticle.id });
                }
                else {
                    // Is the victim
                    return;
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
    thisParticle.vx += ax * dt;
    thisParticle.vy += ay * dt;
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

export interface CollisionEvent {
    // Index of the larger particle (absorber)
    absorber: number;
    // Index of the smaller particle (victim)
    victim: number;
}

export function resolveCollisions(
    system: ParticleSystem,
    events: CollisionEvent[],
): void {
    const { particles } = system;

    // For each victim, pick the single strongest absorber.
    // key = victim index, value = absorber index.
    const winnerForVictim = new Map<number, number>();

    for (const ev of events) {
        const prevAbsorber = winnerForVictim.get(ev.victim);
        if (prevAbsorber === undefined) {
            winnerForVictim.set(ev.victim, ev.absorber);
            continue;
        }
        // Choose the "stronger" suitor: larger mass, tiebreak by lower id.
        const cur = particles[prevAbsorber];
        const cand = particles[ev.absorber];
        if (
            cand.mass > cur.mass ||
            (cand.mass === cur.mass && cand.id < cur.id)
        ) {
            winnerForVictim.set(ev.victim, ev.absorber);
        }
    }

    // Apply. Iterate victims in a deterministic order (id-sorted) for reproducibility.
    const victims = [...winnerForVictim.keys()].sort(
        (i, j) => particles[i].id - particles[j].id,
    );
    for (const vi of victims) {
        const victim = particles[vi];
        if (victim.mass <= 0) continue;           // guard: already consumed
        const winnerIdx = winnerForVictim.get(vi)!;
        const winner = particles[winnerIdx];
        if (winner.mass <= 0) continue;           // guard: winner died earlier this frame

        winner.mass += victim.mass;
        victim.mass = 0;
        // Optional: momentum-conserving merge
        const m = winner.mass + victim.mass; // use pre-sum if you want total momentum
        winner.vx = (winner.mass * winner.vx + victim.mass * victim.vx) / m;
        winner.vy = (winner.mass * winner.vx + victim.mass * victim.vx) / m;
    }
}

















// Written by AI, so don't trust it!!!
/** Recolor every particle by its current cell. Uses HSV→RGB so neighboring
 *  cells are visually distinct. Call after updateChunks(). */
export function debugColorByChunk(system: ParticleSystem): void {
    const { grid, particles } = system;
    const { cols, rows, cellSize, cells } = grid;

    // For each cell, assign a hue once; then copy to its particles.
    for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
            const idx = gy * cols + gx;
            // Golden-ratio hue stepping gives maximally distinct adjacent colors.
            const hue = (idx * 0.61803398875) % 1.0;
            const [r, g, b] = hsvToRgb(hue, 0.75, 1.0);
            for (const p of cells[idx]) {
                p.r = r; p.g = g; p.b = b; p.a = 1.0;
            }
        }
    }
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: return [v, t, p];
        case 1: return [q, v, p];
        case 2: return [p, v, t];
        case 3: return [p, q, v];
        case 4: return [t, p, v];
        default: return [v, p, q];
    }
}