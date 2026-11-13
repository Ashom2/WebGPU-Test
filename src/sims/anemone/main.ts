import { createRenderer } from '../../core/renderer';
import { createStatsOverlay } from '../../core/stats';
import { updateChunks } from '../../core/chunks';
import { initParticles, updateParticles, FlockSystem, FlockParams } from './simulation';

const MAX_PARTICLES = 10_000;
const PARTICLE_COUNT = 8_100;
const CELL_SIZE = 16; // keep >= PARAMS.repelRadius so the 3×3 search always covers it
const PARAMS: FlockParams = {
    speed: 180,         // px/s
    turnRate: 6,        // rad/s
    noise: 0.2,         // rad
    repelRadius: 16,    // px
    repelWeight: 1 / 3,
};
const TRAIL_HALF_LIFE = 0.1; // s (the original faded by 0.95 per frame at 60 fps)

const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement | null;
if (!canvas) throw new Error('Canvas not found');

const recordStats = createStatsOverlay(document.getElementById('stats'));

let system: FlockSystem;
let lastTime = 0;

const reset = () => {
    system = initParticles(PARTICLE_COUNT, canvas.width, canvas.height, CELL_SIZE, PARAMS);
    // Reset clock
    lastTime = 0;
};

const main = async () => {
    const renderer = await createRenderer(canvas, MAX_PARTICLES, {
        clearColor: { r: 0, g: 0, b: 0, a: 1 },
        trailHalfLife: TRAIL_HALF_LIFE,
    });
    reset();

    /** Use browser dev tools to assess performance (in marker chart), or read the on-screen overlay. */
    const frame = (now: number) => {
        const dt = lastTime === 0 ? 0 : Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        const t0 = performance.now();
        updateParticles(system, dt, canvas.width, canvas.height);
        const t1 = performance.now();
        updateChunks(system);
        const t2 = performance.now();
        renderer.draw(system.particles, dt);
        const t3 = performance.now();

        performance.measure('update', { start: t0, end: t1 });
        performance.measure('chunk',  { start: t1, end: t2 });
        performance.measure('draw',   { start: t2, end: t3 });
        recordStats(now, { update: t1 - t0, chunks: t2 - t1, render: t3 - t2 });

        requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
};

main().catch(console.error);

document.querySelector('#id-btn')?.addEventListener('click', reset);