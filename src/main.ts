import { CheckWebGPU } from './helper';
import { Shaders } from './shaders';

const CreateTriangle = async (color='(1.0,1.0,1.0,1.0)') => {
    const checkgpu = CheckWebGPU();
    if(checkgpu.includes('Your current browser does not support WebGPU!')){
        console.log(checkgpu);
        throw('Your current browser does not support WebGPU!');
    }

    const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement | null;
    if (!canvas) {
        throw new Error('Canvas not found');
    }

    const adapter = await navigator.gpu?.requestAdapter() as GPUAdapter | null;
    if (!adapter) {
        throw new Error('No GPU adapter found');
    }

    const device = await adapter?.requestDevice() as GPUDevice;
    const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!context) {
        throw new Error('WebGPU context not available');
    }

    const format = 'bgra8unorm';
  
    context.configure({
        device: device,
        format: format,
        alphaMode: 'opaque'
    });
    
    const shader = Shaders(color);
    const pipeline = device.createRenderPipeline({
        layout:'auto',
        vertex: {
            module: device.createShaderModule({                    
                code: shader.vertex
            }),
            entryPoint: "main"
        },
        fragment: {
            module: device.createShaderModule({                    
                code: shader.fragment
            }),
            entryPoint: "main",
            targets: [{
                format: format as GPUTextureFormat
            }]
        },
        primitive:{
           topology: "triangle-list",
        }
    });

    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: textureView,
            clearValue: { r: 0.5, g: 0.5, b: 0.8, a: 1.0 }, //background color
            loadOp: 'clear',
            storeOp: 'store'
        }]
    });

    renderPass.setPipeline(pipeline);
    renderPass.draw(3, 1, 0, 0);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
}

CreateTriangle();

document.querySelector('#id-btn')?.addEventListener('click', () => {
  const colorInput = document.querySelector('#id-color') as HTMLInputElement | null;
  const color = colorInput?.value ?? '(1.0,1.0,1.0,1.0)';
  CreateTriangle(color);
});