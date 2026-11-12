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
    const ps: Particle[] = [];
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * maxSpeed;
        ps.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 0.5 + Math.random() * 4,
            r: Math.random(),
            g: Math.random(),
            b: Math.random(),
            a: 0.6 + Math.random() * 0.4,
        });
    }

    // Create chunk grid
    const grid = createChunkGrid(width, height, cellSize);
    const particleSystem = { particles: ps, grid };
    // Assign particles to respective cells
    updateChunks(particleSystem);

    return particleSystem;
}

export function updateParticles(
    particleSystem: ParticleSystem,
    dt: number,
    width: number,
    height: number,
): void {

    for (const p of particleSystem.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Wrap around (use radius as margin so large circles fully exit first)
        const m = p.radius;
        if (p.x < -m)               p.x = width + m;
        else if (p.x > width + m)   p.x = -m;

        if (p.y < -m)               p.y = height + m;
        else if (p.y > height + m)  p.y = -m;
    }

    updateChunks(particleSystem);
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