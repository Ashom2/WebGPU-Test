import { Particle } from './particle';

export interface ComputeOptions {
    /** Number of particles the compute pipeline is sized for. */
    maxParticles: number;
}

export interface Compute {
    /**
     * Advance the simulation by `dt` seconds on the GPU.
     *
     * Stub for now — Step 2 will introduce the particle storage buffer and
     * a WGSL kernel; for now this exists only so the call site can be wired
     * up and the type contract can stabilize.
     */
    update(dt: number, width: number, height: number): void;

    /** Particle data on the GPU. Populated in Step 2. */
    // particleBuffer: GPUBuffer;
}

/**
 * Build a compute pipeline on an EXISTING GPUDevice. The caller owns the
 * device and is expected to share it with the renderer.
 */
export function createComputePipeline(
    device: GPUDevice,
    options: ComputeOptions,
): Compute {
    // Step 2 will create the storage buffer, shader module, and bind group here.
    void device;
    void options;

    return {
        update(_dt, _width, _height) {
            // no-op until Step 2
        },
    };
}