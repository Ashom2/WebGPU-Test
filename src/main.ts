import { 
    initParticles, 
    updateParticles, 
    packParticles, 
    ParticleSystem,
} from './particles';
import { CheckWebGPU } from './helper';
import vertexShaderCode from './shaders/particle.vert.wgsl?raw';
import fragmentShaderCode from './shaders/particle.frag.wgsl?raw';

const MAX_PARTICLES = 10_000;
const PARTICLE_COUNT = 10_000;
const CELL_SIZE = 64;
const GRAVITY = {
    G: 200,         // tune: 50-1000
    softening: 4,   // px; keeps close pairs from exploding
    maxAccel: 400,  // px/s²
};

// Reference state holder
let deviceRef: GPUDevice | null = null;
let pipelineRef: GPURenderPipeline | null = null;
let contextRef: GPUCanvasContext | null = null;
let canvasRef: HTMLCanvasElement | null = null;
let uniformBufferRef: GPUBuffer | null = null;
let instanceBufferRef: GPUBuffer | null = null;
let bindGroupRef: GPUBindGroup | null = null;
let formatRef: GPUTextureFormat = 'bgra8unorm';

let particleSys: ParticleSystem | null = null;
let lastTime = 0;

const InitWebGPU = async () => {
    const checkgpu = CheckWebGPU();
    if(checkgpu.includes('Your current browser does not support WebGPU!')){
        console.log(checkgpu);
        throw new Error('Your current browser does not support WebGPU!');
    }

    const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement | null;
    if (!canvas) throw new Error('Canvas not found');
    canvasRef = canvas;

    const adapter = await navigator.gpu?.requestAdapter() as GPUAdapter | null;
    if (!adapter) throw new Error('No GPU adapter found');
    const device = await adapter?.requestDevice() as GPUDevice;
    deviceRef = device;

    const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!context) throw new Error('WebGPU context not available');
    contextRef = context;

    formatRef = 'bgra8unorm';
    context.configure({
        device: device,
        format: formatRef,
        alphaMode: 'opaque'
    });

    // Uniform buffer for resolution
    uniformBufferRef = device.createBuffer({
        size: 16, // 2 floats padded to 16
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Allocate the instance buffer ONCE, sized for MAX_PARTICLES.
    const STRIDE = 8 * 4; // 8 floats per particle
    instanceBufferRef = device.createBuffer({
        size: MAX_PARTICLES * STRIDE,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const vertexModule = device.createShaderModule({ code: vertexShaderCode });
    const fragmentModule = device.createShaderModule({ code: fragmentShaderCode });

    pipelineRef = device.createRenderPipeline({
        layout:'auto',
        vertex: {
            module: vertexModule,
            entryPoint: "main",
            buffers: [{
                arrayStride: STRIDE,
                stepMode: 'instance',
                attributes: [
                    { shaderLocation: 0, offset: 0,  format: 'float32x2' }, // position
                    { shaderLocation: 1, offset: 8,  format: 'float32'   }, // radius
                    { shaderLocation: 2, offset: 16, format: 'float32x4' }, // color
                ],
            }],
        },
        fragment: {
            module: fragmentModule,
            entryPoint: "main",
            targets: [{
                format: formatRef,
                blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'one',       dstFactor: 'one-minus-src-alpha', operation: 'add' },
                },
            }],
        },
        primitive:{
           topology: "triangle-list",
        }
    });

    bindGroupRef = device.createBindGroup({
        layout: pipelineRef.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBufferRef } }],
    });
}

const DrawParticles = () => {
    const device = deviceRef!;
    const pipeline = pipelineRef!;
    const context = contextRef!;
    const canvas = canvasRef!;
    const uniformBuffer = uniformBufferRef!;
    const instanceBuffer = instanceBufferRef!;
    const bindGroup = bindGroupRef!;

    // Update resolution
    device.queue.writeBuffer(
        uniformBuffer, 0,
        new Float32Array([canvas.width, canvas.height, 0, 0]),
    );

    // Upload instance data
    const packed = packParticles(particleSys!.particles);
    device.queue.writeBuffer(
        instanceBuffer, 
        0, 
        packed as Float32Array<ArrayBuffer>
    );

    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: textureView,
            clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
        }],
    });

    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.setVertexBuffer(0, instanceBuffer);
    // 6 vertices per quad, one instance per particle
    renderPass.draw(6, particleSys!.particles.length, 0, 0);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
}

const frame = (now: number) => {
    const canvas = canvasRef!;
    const dt = lastTime === 0 ? 0 : Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    updateParticles(particleSys!, GRAVITY, dt, canvas.width, canvas.height);
    DrawParticles();

    requestAnimationFrame(frame);
};

const main = async () => {
    await InitWebGPU();
    const canvas = canvasRef!;
    particleSys = initParticles(PARTICLE_COUNT, canvas.width, canvas.height, CELL_SIZE);
    lastTime = 0;
    requestAnimationFrame(frame);
};

main().catch(console.error);

document.querySelector('#id-btn')?.addEventListener('click', () => {
    const canvas = canvasRef!;
    particleSys = initParticles(PARTICLE_COUNT, canvas.width, canvas.height, CELL_SIZE);
    // Reset clock
    lastTime = 0;
});