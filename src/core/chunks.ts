import { Particle } from './particle';

export interface ChunkGrid {
    cellSize: number;
    cols: number;
    rows: number;
    // Flat array of length cols*rows, each entry holds particles who fall within that cell
    cells: Particle[][];
}

/**
 * The minimum every simulation's state needs for the chunk helpers to work.
 * A simulation extends this with whatever scratch buffers and params it needs.
 */
export interface ParticleSystem {
    // Invariant: particles[i].id === i
    particles: Particle[];
    grid: ChunkGrid;
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

/** Clear the grid and re-bin every living particle by its current position. */
export function updateChunks(system: ParticleSystem): void {
    for (const cell of system.grid.cells) cell.length = 0;

    const { grid, particles } = system;
    const { cols, cells } = grid;
    for (const p of particles) {
        if (p.mass === 0) continue; // dead particles don't need to be found by anyone
        cells[cellY(grid, p.y) * cols + cellX(grid, p.x)].push(p);
    }
}

function clampInt(v: number, n: number): number {
    if (v < 0) return 0;
    if (v >= n) return n - 1;
    return v;
}

/** Column of the cell containing world x (clamped to the grid). */
export function cellX(grid: ChunkGrid, x: number): number {
    return clampInt(Math.floor(x / grid.cellSize), grid.cols);
}

/** Row of the cell containing world y (clamped to the grid). */
export function cellY(grid: ChunkGrid, y: number): number {
    return clampInt(Math.floor(y / grid.cellSize), grid.rows);
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
    return grid.cells[cellY(grid, y) * grid.cols + cellX(grid, x)];
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