export interface Particle {
    x: number; y: number;
    vx: number; vy: number;
    radius: number;
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
            x: Math.random() * width,
            y: Math.random() * height,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 0.5 + Math.random() * 2,
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
    // Update velocity from gravity
    applyNeighborGravity(p, grid, params, dt);

    // Update position according to velocity
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Wrap around (use radius as margin so large circles fully exit first)
    const m = p.radius;
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
        data[o + 2] = p.radius;
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

    // for (const a of particles) {
    const gx = clampInt(Math.floor(thisParticle.x / cellSize), cols);
    const gy = clampInt(Math.floor(thisParticle.y / cellSize), rows);

    let ax = 0;
    let ay = 0;

    // 3×3 neighbor block
    for (let dy = -1; dy <= 1; dy++) {
        const ny = gy + dy;
        if (ny < 0 || ny >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
            const nx = gx + dx;
            if (nx < 0 || nx >= cols) continue;

            const cell = cells[ny * cols + nx];
            for (const otherParticle of cell) {
                if (otherParticle === thisParticle) continue;
                const ddx = otherParticle.x - thisParticle.x;
                const ddy = otherParticle.y - thisParticle.y;
                const r2 = ddx * ddx + ddy * ddy;
                if (r2 > R * R || r2 === 0) continue;

                // Plummer-softened gravity
                // 1/(r² + ε²) with sqrt for direction
                const invLen = 1 / Math.sqrt(r2 + soft2);
                const invLen2 = invLen * invLen;
                // acceleration toward otherParticle, magnitude G / (r² + ε²)
                const mag = G * invLen2;
                ax += (ddx * invLen) * mag;
                ay += (ddy * invLen) * mag;
            }
        }
    }

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