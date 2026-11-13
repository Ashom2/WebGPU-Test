import { Particle, PARTICLE_FLOATS, packParticles } from './particle';
import { CheckWebGPU } from '../helper';
import vertexShaderCode from '../shaders/particle.vert.wgsl?raw';
import fragmentShaderCode from '../shaders/particle.frag.wgsl?raw';

export interface Renderer {
    /** Upload the particles and draw one frame. */
    draw(particles: Particle[]): void;
}

/**
 * Set up WebGPU once and return a renderer that draws particles as instanced quads.
 * The instance buffer is allocated once, sized for `maxParticles`.
 */
export async function createRenderer(
    canvas: HTMLCanvasElement,
    maxParticles: number,
    clearColor: GPUColor = { r: 0.05, g: 0.05, b: 0.1, a: 1.0 },
): Promise<Renderer> {
    const checkgpu = CheckWebGPU();
    if (checkgpu.includes('Your current browser does not support WebGPU!')) {
        console.log(checkgpu);
        throw new Error('Your current browser does not support WebGPU!');
    }

    const adapter = await navigator.gpu?.requestAdapter() as GPUAdapter | null;
    if (!adapter) throw new Error('No GPU adapter found');
    const device = await adapter.requestDevice() as GPUDevice;

    const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!context) throw new Error('WebGPU context not available');

    const format: GPUTextureFormat = 'bgra8unorm';
    context.configure({
        device,
        format,
        alphaMode: 'opaque',
    });

    // Uniform buffer for resolution
    const uniformBuffer = device.createBuffer({
        size: 16, // 2 floats padded to 16
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Allocate the instance buffer ONCE, sized for maxParticles.
    const STRIDE = PARTICLE_FLOATS * 4;
    const instanceBuffer = device.createBuffer({
        size: maxParticles * STRIDE,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const vertexModule = device.createShaderModule({ code: vertexShaderCode });
    const fragmentModule = device.createShaderModule({ code: fragmentShaderCode });

    const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: vertexModule,
            entryPoint: 'main',
            buffers: [{
                arrayStride: STRIDE,
                stepMode: 'instance',
                attributes: [
                    { shaderLocation: 0, offset: 0,  format: 'float32x2' }, // position
                    { shaderLocation: 1, offset: 8,  format: 'float32'   }, // mass
                    { shaderLocation: 2, offset: 16, format: 'float32x4' }, // color
                ],
            }],
        },
        fragment: {
            module: fragmentModule,
            entryPoint: 'main',
            targets: [{
                format,
                blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'one',       dstFactor: 'one-minus-src-alpha', operation: 'add' },
                },
            }],
        },
        primitive: {
            topology: 'triangle-list',
        },
    });

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    const draw = (particles: Particle[]) => {
        if (particles.length > maxParticles) {
            throw new Error(`Too many particles (${particles.length}) for a renderer sized for ${maxParticles}`);
        }

        // Update resolution
        device.queue.writeBuffer(
            uniformBuffer, 0,
            new Float32Array([canvas.width, canvas.height, 0, 0]),
        );

        // Upload instance data
        const packed = packParticles(particles);
        device.queue.writeBuffer(
            instanceBuffer,
            0,
            packed as Float32Array<ArrayBuffer>,
        );

        const commandEncoder = device.createCommandEncoder();
        const textureView = context.getCurrentTexture().createView();

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: clearColor,
                loadOp: 'clear',
                storeOp: 'store',
            }],
        });

        renderPass.setPipeline(pipeline);
        renderPass.setBindGroup(0, bindGroup);
        renderPass.setVertexBuffer(0, instanceBuffer);
        // 6 vertices per quad, one instance per particle
        renderPass.draw(6, particles.length, 0, 0);
        renderPass.end();

        device.queue.submit([commandEncoder.finish()]);
    };

    return { draw };
}