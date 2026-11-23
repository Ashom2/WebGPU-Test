import { initWebGPU } from '../../core/device';
import { createRenderPipeline } from '../../core/renderer';
import { createComputePipeline } from '../../core/compute';
import { createStatsOverlay } from '../../core/stats';
import { updateChunks } from '../../core/chunks';
import { initSystem, updateParticles, GravitySystem, seedOrbitTest, seedCloudTest } from './simulation';
import particleVert from './shaders/particle.vert.wgsl?raw';
import particleFrag from './shaders/particle.frag.wgsl?raw';

const MAX_PARTICLES = 10_000;
const PARTICLE_COUNT = 4_000;
const CELL_SIZE = 128;
const PARAMS = {
    G: 20,
    softening: 4,
    maxAcceleration: 10000,
    collisionMode: 0,
    maxMass: 50,
    explosionSpeed: 40,
    drag: 1.0,
    spawnImmunity: 0.25,
};

const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement | null;
if (!canvas) throw new Error('Canvas not found');

const recordStats = createStatsOverlay(document.getElementById('stats'));

let system: GravitySystem;
let lastTime = 0;

const reset = () => {
    system = initSystem(PARTICLE_COUNT, canvas.width, canvas.height, CELL_SIZE, 50, PARAMS);
    seedOrbitTest(system, canvas.width, canvas.height, 4000, 1000);
    // seedCloudTest(system, canvas.width, canvas.height)
    lastTime = 0;
};

const main = async () => {
    const device = await initWebGPU();
    if (!device) throw new Error('WebGPU unavailable');
    const renderer = await createRenderPipeline(device, canvas, MAX_PARTICLES, {
        shaders: { particleVert, particleFrag },
    });
    const compute = await createComputePipeline(device, { maxParticles: 10 });

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
        renderer.draw(system.particles);
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