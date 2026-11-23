import { CheckWebGPU } from '../helper';

/**
 * Acquire a WebGPU adapter and device. Call this ONCE at app startup and pass
 * the device to every subsystem (renderer, compute, future passes) so they all
 * share the same GPU timeline and can reference each other's buffers.
 *
 * Returns null if WebGPU is unavailable; callers should decide whether that's
 * fatal.
 */
export async function initWebGPU(): Promise<GPUDevice | null> {
    const checkgpu = CheckWebGPU();
    if (checkgpu.includes('Your current browser does not support WebGPU!')) {
        console.log(checkgpu);
        return null;
    }

    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) {
        console.error('No GPU adapter found');
        return null;
    }

    const device = await adapter.requestDevice();
    console.log('WebGPU device acquired successfully.');
    return device;
}