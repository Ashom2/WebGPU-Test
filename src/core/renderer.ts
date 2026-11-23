import { Particle } from './particle';

// Trails live in a float texture: with 8 bits, repeated fading stalls once value * (1 - fade) rounds back to value,
// which leaves a faint permanent ghost of every trail.
const TRAIL_FORMAT: GPUTextureFormat = 'rgba16float';

export interface BaseRendererShaders {
    particleVert: string;
    particleFrag: string;
}

/** Trails are opt-in: if you pass `trailHalfLife`, you must also pass a trail shader. */
export interface TrailedRendererShaders extends BaseRendererShaders {
    trail: string;
}

/**
 * A sim supplies:
 *  - its shader sources,
 *  - its instance packing (layout is per-sim),
 *  - the vertex attribute descriptor that matches that packing.
 */
export interface BaseRendererOptions {
    shaders: BaseRendererShaders;
    particleFloats: number;
    vertexAttributes: GPUVertexAttribute[];
    packParticles: (particles: Particle[]) => Float32Array;
    clearColor?: GPUColorDict;
}

export interface TrailedRendererOptions extends BaseRendererOptions {
    shaders: TrailedRendererShaders;
    trailHalfLife: number;
}

export type RendererOptions =
    | (BaseRendererOptions & { trailHalfLife?: undefined })
    | TrailedRendererOptions;

export interface Renderer {
    /** Upload the particles and draw one frame. `dt` (seconds) only matters when trails are on. */
    draw(particles: Particle[], dt?: number): void;
}

/**
 * Build a renderer on an EXISTING GPUDevice. The caller owns the device and
 * is expected to share it with other subsystems (e.g. a per-sim compute pass).
 *
 * The instance buffer is allocated once, sized for `maxParticles`.
 */
export function createRenderPipeline(
    device: GPUDevice,
    canvas: HTMLCanvasElement,
    maxParticles: number,
    options: RendererOptions,
): Renderer {
    const {
        shaders,
        particleFloats,
        vertexAttributes,
        packParticles,
        clearColor = { r: 0.05, g: 0.05, b: 0.1, a: 1.0 },
        trailHalfLife,
    } = options;

    const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!context) throw new Error('WebGPU context not available');

    const canvasFormat: GPUTextureFormat = 'bgra8unorm';
    context.configure({
        device,
        format: canvasFormat,
        alphaMode: 'opaque',
    });

    // With trails, particles are drawn into the offscreen texture instead of straight to the canvas
    const trail = trailHalfLife === undefined
        ? null
        : createTrailPass(device, canvas, canvasFormat, clearColor, trailHalfLife, shaders.trail);
    const sceneFormat = trail ? TRAIL_FORMAT : canvasFormat;
    let firstFrame = true;

    // Uniform buffer for resolution
    const uniformBuffer = device.createBuffer({
        size: 16, // 2 floats padded to 16
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Allocate the instance buffer ONCE, sized for maxParticles.
    const STRIDE = particleFloats * 4;
    const instanceBuffer = device.createBuffer({
        size: maxParticles * STRIDE,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const vertexModule = device.createShaderModule({ code: shaders.particleVert });
    const fragmentModule = device.createShaderModule({ code: shaders.particleFrag });

    const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: vertexModule,
            entryPoint: 'main',
            buffers: [{
                arrayStride: STRIDE,
                stepMode: 'instance',
                attributes: vertexAttributes,
            }],
        },
        fragment: {
            module: fragmentModule,
            entryPoint: 'main',
            targets: [{
                format: sceneFormat,
                blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'one',       dstFactor: 'one-minus-src-alpha', operation: 'add' },
                },
            }],
        },
        primitive: { topology: 'triangle-list' },
    });

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    const draw = (particles: Particle[], dt = 1 / 60) => {
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

        // Fraction of the old frame that gets replaced by the background this frame (frame-rate independent)
        if (trail) {
            const amount = 1 - Math.pow(0.5, dt / trail.halfLife);
            device.queue.writeBuffer(
                trail.fadeBuffer, 0,
                new Float32Array([clearColor.r, clearColor.g, clearColor.b, amount]),
            );
        }

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: trail ? trail.view : context.getCurrentTexture().createView(),
                clearValue: clearColor,
                // With trails, keep what's already in the texture (except on the very first frame)
                loadOp: trail && !firstFrame ? 'load' : 'clear',
                storeOp: 'store',
            }],
        });

        if (trail) {
            renderPass.setPipeline(trail.fadePipeline);
            renderPass.setBindGroup(0, trail.fadeBindGroup);
            renderPass.draw(3);
        }

        renderPass.setPipeline(pipeline);
        renderPass.setBindGroup(0, bindGroup);
        renderPass.setVertexBuffer(0, instanceBuffer);
        // 6 vertices per quad, one instance per particle
        renderPass.draw(6, particles.length, 0, 0);
        renderPass.end();
        firstFrame = false;

        // Show the trail texture on the canvas
        if (trail) {
            const blitPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: context.getCurrentTexture().createView(),
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
            });
            blitPass.setPipeline(trail.blitPipeline);
            blitPass.setBindGroup(0, trail.blitBindGroup);
            blitPass.draw(3);
            blitPass.end();
        }

        device.queue.submit([commandEncoder.finish()]);
    };

    return { draw };
}

/** Everything needed to keep the previous frame around and fade it: the texture, a fade pass, and a blit to the canvas. */
function createTrailPass(
    device: GPUDevice,
    canvas: HTMLCanvasElement,
    canvasFormat: GPUTextureFormat,
    clearColor: GPUColorDict,
    halfLife: number,
    trailShaderSource: string,
) {
    const module = device.createShaderModule({ code: trailShaderSource });

    // Sized once from the canvas; recreate the renderer if the canvas is resized
    const view = device.createTexture({
        size: [canvas.width, canvas.height],
        format: TRAIL_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    }).createView();

    // Fade: draw the background color over the old frame with alpha = fade amount
    const fadeBuffer = device.createBuffer({
        size: 16, // vec4f
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(
        fadeBuffer, 0,
        new Float32Array([clearColor.r, clearColor.g, clearColor.b, 0]),
    );
    const fadePipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: {
            module,
            entryPoint: 'fade_fs',
            targets: [{
                format: TRAIL_FORMAT,
                blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'zero',      dstFactor: 'one',                 operation: 'add' },
                },
            }],
        },
    });
    const fadeBindGroup = device.createBindGroup({
        layout: fadePipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: fadeBuffer } }],
    });

    // Blit: copy the trail texture to the canvas
    const blitPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'blit_fs', targets: [{ format: canvasFormat }] },
    });
    const blitBindGroup = device.createBindGroup({
        layout: blitPipeline.getBindGroupLayout(0),
        entries: [{ binding: 1, resource: view }],
    });

    return { halfLife, view, fadeBuffer, fadePipeline, fadeBindGroup, blitPipeline, blitBindGroup };
}