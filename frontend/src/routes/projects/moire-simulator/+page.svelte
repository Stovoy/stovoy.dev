<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  type Controls = {
    frequencyA: number;
    widthA: number;
    rotationA: number;
    phaseA: number;
    frequencyB: number;
    widthB: number;
    rotationB: number;
    phaseB: number;
    warpAmount: number;
    warpFrequency: number;
    warpSpeed: number;
    contrast: number;
    brightness: number;
    saturation: number;
    invert: boolean;
    blendMode: number;
    animate: boolean;
    timeScale: number;
    colorAHue: number;
    colorASat: number;
    colorALight: number;
    colorBHue: number;
    colorBSat: number;
    colorBLight: number;
    backgroundHue: number;
    backgroundSat: number;
    backgroundLight: number;
    resolutionScale: number;
  };

  const defaults: Controls = {
    frequencyA: 46,
    widthA: 0.08,
    rotationA: -12,
    phaseA: 0,
    frequencyB: 44,
    widthB: 0.075,
    rotationB: 14,
    phaseB: 0.2,
    warpAmount: 0.15,
    warpFrequency: 2.8,
    warpSpeed: 0.35,
    contrast: 1.2,
    brightness: 1,
    saturation: 1.25,
    invert: false,
    blendMode: 0,
    animate: true,
    timeScale: 1,
    colorAHue: 12,
    colorASat: 88,
    colorALight: 62,
    colorBHue: 192,
    colorBSat: 86,
    colorBLight: 60,
    backgroundHue: 226,
    backgroundSat: 34,
    backgroundLight: 9,
    resolutionScale: 1
  };

  let controls: Controls = structuredClone(defaults);
  let canvasEl: HTMLCanvasElement;
  let containerEl: HTMLDivElement;
  let status = 'Booting WebGPU...';
  let ready = false;
  let isFullscreen = false;
  type ActiveRenderer = 'webgpu' | 'cpu' | 'none';
  let renderer: ActiveRenderer = 'none';
  let cpuCtx: CanvasRenderingContext2D | null = null;
  let cpuImageData: ImageData | null = null;

  const statusPrefix = () => {
    if (!ready) return 'WebGPU Unavailable';
    return renderer === 'webgpu' ? 'WebGPU Ready' : 'Fallback Renderer';
  };

  let device: GPUDevice | null = null;
  let context: GPUCanvasContext | null = null;
  let pipeline: GPURenderPipeline | null = null;
  let uniformBuffer: GPUBuffer | null = null;
  let bindGroup: GPUBindGroup | null = null;
  let animationFrame = 0;
  let startTime = 0;
  let resizeObserver: ResizeObserver | null = null;

  const shaderCode = /* wgsl */`
struct Uniforms {
  screen: vec4<f32>,
  pattern1: vec4<f32>,
  pattern2: vec4<f32>,
  warp: vec4<f32>,
  colorA: vec4<f32>,
  colorB: vec4<f32>,
  mixCfg: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

fn rotate2D(v: vec2<f32>, deg: f32) -> vec2<f32> {
  let a = radians(deg);
  let c = cos(a);
  let s = sin(a);
  return vec2<f32>(c * v.x - s * v.y, s * v.x + c * v.y);
}

fn lineMask(coord: f32, freq: f32, width: f32, phase: f32) -> f32 {
  let signal = abs(sin((coord * freq + phase) * 6.2831853));
  return 1.0 - smoothstep(0.0, max(width, 0.0001), signal);
}

fn layerGrid(pos: vec2<f32>, freq: f32, width: f32, phase: f32) -> f32 {
  let xMask = lineMask(pos.x, freq, width, phase);
  let yMask = lineMask(pos.y, freq, width, phase * 0.89);
  return max(xMask, yMask);
}

fn saturateColor(color: vec3<f32>, amount: f32) -> vec3<f32> {
  let luma = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
  return mix(vec3<f32>(luma), color, amount);
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );

  let p = positions[vertexIndex];
  return vec4<f32>(p, 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let res = max(u.screen.xy, vec2<f32>(1.0, 1.0));
  let aspect = res.x / res.y;

  var uv = fragCoord.xy / res;
  var p = uv - 0.5;
  p.x *= aspect;

  let t = u.screen.z;
  let warpPhase = t * u.warp.z;
  let q = p * u.warp.y;
  let waveA = sin(q.x * 2.17 + q.y * 1.31 + warpPhase);
  let waveB = sin(q.x * -1.43 + q.y * 2.03 - warpPhase * 0.83);
  let radial = sin(length(q) * 3.1 - warpPhase * 0.57);
  let warpVec = vec2<f32>(waveA + radial * 0.55, waveB - radial * 0.55);
  p += warpVec * (u.warp.x * 0.35);

  let p1 = rotate2D(p, u.pattern1.z);
  let p2 = rotate2D(p, u.pattern2.z);

  let layerA = layerGrid(p1, u.pattern1.x, u.pattern1.y, u.pattern1.w + t * 0.05);
  let layerB = layerGrid(p2, u.pattern2.x, u.pattern2.y, u.pattern2.w - t * 0.03);

  let interference = 0.5 + 0.5 * sin((layerA - layerB) * 20.0 + t * 0.2);
  var moire = interference;
  if (u.mixCfg.w > 0.5) {
    moire = clamp(layerA * layerB + interference * 0.35, 0.0, 1.0);
  }

  moire = pow(clamp(moire, 0.0, 1.0), max(u.warp.w, 0.35));

  var color = mix(u.colorA.rgb, u.colorB.rgb, moire);
  let gridEnergy = pow(max(layerA, layerB), 0.65);
  color += vec3<f32>(gridEnergy * 0.42);
  color = saturateColor(color, u.mixCfg.y);
  color = color * u.mixCfg.x;

  if (u.mixCfg.z > 0.5) {
    color = vec3<f32>(1.0) - color;
  }

  let bg = vec3<f32>(u.colorA.w, u.colorB.w, u.mixCfg.x * 0.16);
  color = mix(bg, color, 0.97);

  return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

  function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const sat = s / 100;
    const light = l / 100;
    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const hp = (h % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));

    let r = 0;
    let g = 0;
    let b = 0;

    if (hp >= 0 && hp < 1) {
      r = c;
      g = x;
    } else if (hp < 2) {
      r = x;
      g = c;
    } else if (hp < 3) {
      g = c;
      b = x;
    } else if (hp < 4) {
      g = x;
      b = c;
    } else if (hp < 5) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }

    const m = light - c / 2;
    return [r + m, g + m, b + m];
  }

  function uniformData(timeSeconds: number): Float32Array {
    const [aR, aG, aB] = hslToRgb(controls.colorAHue, controls.colorASat, controls.colorALight);
    const [bR, bG, bB] = hslToRgb(controls.colorBHue, controls.colorBSat, controls.colorBLight);
    const [bgR, bgG, bgB] = hslToRgb(controls.backgroundHue, controls.backgroundSat, controls.backgroundLight);

    const width = canvasEl?.width || 1;
    const height = canvasEl?.height || 1;
    const t = controls.animate ? timeSeconds * controls.timeScale : 0;

    return new Float32Array([
      width,
      height,
      t,
      window.devicePixelRatio || 1,
      controls.frequencyA,
      controls.widthA,
      controls.rotationA,
      controls.phaseA,
      controls.frequencyB,
      controls.widthB,
      controls.rotationB,
      controls.phaseB,
      controls.warpAmount,
      controls.warpFrequency,
      controls.warpSpeed,
      controls.contrast,
      aR,
      aG,
      aB,
      bgR,
      bR,
      bG,
      bB,
      bgG,
      controls.brightness,
      controls.saturation,
      controls.invert ? 1 : 0,
      controls.blendMode,
      bgB,
      0,
      0,
      0
    ]);
  }

  function configureCanvas() {
    if (!canvasEl || !containerEl) return;

    const dpr = window.devicePixelRatio || 1;
    const scale = Math.max(0.35, controls.resolutionScale);
    const width = Math.max(320, Math.floor(containerEl.clientWidth * dpr * scale));
    const height = Math.max(220, Math.floor(containerEl.clientHeight * dpr * scale));

    canvasEl.width = width;
    canvasEl.height = height;

    if (renderer === 'webgpu' && context && device) {
      context.configure({
        device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: 'opaque'
      });
    }

    cpuImageData = null;
  }

  function renderFrame(ts: number) {
    if (!device || !context || !pipeline || !uniformBuffer || !bindGroup) return;

    const elapsed = (ts - startTime) / 1000;
    const data = uniformData(elapsed);
    device.queue.writeBuffer(uniformBuffer, 0, data);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();

    device.queue.submit([encoder.finish()]);
    animationFrame = window.requestAnimationFrame(renderFrame);
  }

  function clamp(v: number, min = 0, max = 1): number {
    return Math.max(min, Math.min(max, v));
  }

  function rotatePoint(x: number, y: number, deg: number): [number, number] {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [c * x - s * y, s * x + c * y];
  }

  function lineMask(coord: number, freq: number, width: number, phase: number): number {
    const signal = Math.abs(Math.sin((coord * freq + phase) * Math.PI * 2));
    return 1 - clamp(signal / Math.max(width, 0.0001));
  }

  function layerGrid(x: number, y: number, freq: number, width: number, phase: number): number {
    return Math.max(lineMask(x, freq, width, phase), lineMask(y, freq, width, phase * 0.89));
  }

  function saturateColor([r, g, b]: [number, number, number], amount: number): [number, number, number] {
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    return [luma + (r - luma) * amount, luma + (g - luma) * amount, luma + (b - luma) * amount];
  }

  function renderCpuFrame(ts: number) {
    if (!cpuCtx || !canvasEl || renderer !== 'cpu') return;

    const w = canvasEl.width;
    const h = canvasEl.height;
    if (!cpuImageData || cpuImageData.width !== w || cpuImageData.height !== h) {
      cpuImageData = cpuCtx.createImageData(w, h);
    }

    const data = cpuImageData.data;
    const elapsed = (ts - startTime) / 1000;
    const t = controls.animate ? elapsed * controls.timeScale : 0;
    const aspect = w / Math.max(h, 1);

    const [aR, aG, aB] = hslToRgb(controls.colorAHue, controls.colorASat, controls.colorALight);
    const [bR, bG, bB] = hslToRgb(controls.colorBHue, controls.colorBSat, controls.colorBLight);
    const [bgR, bgG, bgB] = hslToRgb(controls.backgroundHue, controls.backgroundSat, controls.backgroundLight);

    let i = 0;
    for (let y = 0; y < h; y += 1) {
      const ny = y / h - 0.5;
      for (let x = 0; x < w; x += 1) {
        const nx = (x / w - 0.5) * aspect;
        const warpPhase = t * controls.warpSpeed;
        const qx = nx * controls.warpFrequency;
        const qy = ny * controls.warpFrequency;
        const waveA = Math.sin(qx * 2.17 + qy * 1.31 + warpPhase);
        const waveB = Math.sin(qx * -1.43 + qy * 2.03 - warpPhase * 0.83);
        const radial = Math.sin(Math.hypot(qx, qy) * 3.1 - warpPhase * 0.57);
        const warpX = (waveA + radial * 0.55) * controls.warpAmount * 0.35;
        const warpY = (waveB - radial * 0.55) * controls.warpAmount * 0.35;
        const px = nx + warpX;
        const py = ny + warpY;

        const [aX, aY] = rotatePoint(px, py, controls.rotationA);
        const [bX, bY] = rotatePoint(px, py, controls.rotationB);

        const layerA = layerGrid(aX, aY, controls.frequencyA, controls.widthA, controls.phaseA + t * 0.05);
        const layerB = layerGrid(bX, bY, controls.frequencyB, controls.widthB, controls.phaseB - t * 0.03);

        const interference = 0.5 + 0.5 * Math.sin((layerA - layerB) * 20 + t * 0.2);
        let moire = interference;
        if (controls.blendMode > 0.5) {
          moire = clamp(layerA * layerB + interference * 0.35);
        }

        moire = Math.pow(clamp(moire), Math.max(controls.contrast, 0.35));
        const gridEnergy = Math.pow(Math.max(layerA, layerB), 0.65) * 0.42;

        let r = aR + (bR - aR) * moire + gridEnergy;
        let g = aG + (bG - aG) * moire + gridEnergy;
        let b = aB + (bB - aB) * moire + gridEnergy;

        [r, g, b] = saturateColor([r, g, b], controls.saturation);
        r *= controls.brightness;
        g *= controls.brightness;
        b *= controls.brightness;

        if (controls.invert) {
          r = 1 - r;
          g = 1 - g;
          b = 1 - b;
        }

        r = bgR * 0.03 + r * 0.97;
        g = bgG * 0.03 + g * 0.97;
        b = bgB * 0.03 + b * 0.97;

        data[i] = Math.floor(clamp(r) * 255);
        data[i + 1] = Math.floor(clamp(g) * 255);
        data[i + 2] = Math.floor(clamp(b) * 255);
        data[i + 3] = 255;
        i += 4;
      }
    }

    cpuCtx.putImageData(cpuImageData, 0, 0);
    animationFrame = window.requestAnimationFrame(renderCpuFrame);
  }

  function initCpuRenderer(message?: string) {
    renderer = 'cpu';
    cpuCtx = canvasEl.getContext('2d', { alpha: false });
    if (!cpuCtx) {
      ready = false;
      status = 'No compatible canvas renderer available.';
      return;
    }

    configureCanvas();
    resizeObserver = new ResizeObserver(() => {
      configureCanvas();
    });
    resizeObserver.observe(containerEl);

    startTime = performance.now();
    animationFrame = window.requestAnimationFrame(renderCpuFrame);
    ready = true;
    status = message ?? 'CPU fallback renderer active with full controls.';
  }

  async function initWebGPU(): Promise<boolean> {
    if (!('gpu' in navigator)) {
      return false;
    }

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      return false;
    }

    device = await adapter.requestDevice();
    context = canvasEl.getContext('webgpu');

    if (!context) {
      return false;
    }

    const shaderModule = device.createShaderModule({ code: shaderCode });
    const format = navigator.gpu.getPreferredCanvasFormat();

    pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format }]
      },
      primitive: { topology: 'triangle-list' }
    });

    uniformBuffer = device.createBuffer({
      size: 32 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
    });

    renderer = 'webgpu';
    configureCanvas();

    resizeObserver = new ResizeObserver(() => {
      configureCanvas();
    });

    resizeObserver.observe(containerEl);

    startTime = performance.now();
    animationFrame = window.requestAnimationFrame(renderFrame);

    ready = true;
    status = 'Interactive moire shader is running.';
    return true;
  }

  async function initRenderer() {
    const search = new URLSearchParams(window.location.search);
    const forceCpu = search.get('renderer') === 'cpu';
    const isHeadless = /HeadlessChrome/i.test(window.navigator.userAgent);

    if (forceCpu || isHeadless) {
      initCpuRenderer('CPU fallback renderer active (headless compatible).');
      return;
    }

    try {
      const webgpuReady = await initWebGPU();
      if (!webgpuReady) {
        initCpuRenderer('WebGPU unavailable; switched to CPU fallback renderer.');
      }
    } catch {
      initCpuRenderer('WebGPU failed to initialize; switched to CPU fallback renderer.');
    }
  }

  function randomizeControls() {
    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    controls = {
      ...controls,
      frequencyA: rand(0, 440),
      widthA: rand(0.005, 8),
      rotationA: rand(-90, 90),
      phaseA: rand(-4, 4),
      frequencyB: rand(0, 440),
      widthB: rand(0.005, 8),
      rotationB: rand(-90, 90),
      phaseB: rand(-4, 4),
      warpAmount: rand(0, 0.8),
      warpFrequency: rand(0.1, 12),
      warpSpeed: rand(0, 3),
      contrast: rand(0.4, 3),
      brightness: rand(0.2, 2),
      saturation: rand(0, 2),
      blendMode: Math.random() > 0.5 ? 1 : 0,
      invert: Math.random() > 0.75,
      timeScale: rand(0, 3),
      colorAHue: rand(0, 360),
      colorASat: rand(0, 100),
      colorALight: rand(0, 100),
      colorBHue: rand(0, 360),
      colorBSat: rand(0, 100),
      colorBLight: rand(0, 100),
      backgroundHue: rand(0, 360),
      backgroundSat: rand(0, 100),
      backgroundLight: rand(0, 100),
      resolutionScale: rand(0.35, 1.5)
    };

    configureCanvas();
  }

  function exportPreset() {
    const content = JSON.stringify(controls, null, 2);
    navigator.clipboard.writeText(content).then(() => {
      status = 'Preset JSON copied to clipboard.';
      window.setTimeout(() => {
        if (ready) status = 'Interactive moire shader is running.';
      }, 1000);
    });
  }

  async function importPreset() {
    try {
      const content = await navigator.clipboard.readText();
      const parsed = JSON.parse(content) as Partial<Controls>;
      controls = {
        ...controls,
        ...parsed
      };
      configureCanvas();
      status = 'Preset JSON pasted from clipboard.';
    } catch {
      status = 'Paste failed. Clipboard must contain valid preset JSON.';
    }

    window.setTimeout(() => {
      if (ready) status = 'Interactive moire shader is running.';
    }, 1400);
  }

  function setFullscreen(next: boolean) {
    isFullscreen = next;
    window.setTimeout(() => {
      configureCanvas();
    }, 0);
  }

  function toggleFullscreen() {
    setFullscreen(!isFullscreen);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isFullscreen) {
      setFullscreen(false);
    }
  }

  onMount(() => {
    initRenderer();
    window.addEventListener('keydown', onKeydown);
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('keydown', onKeydown);
    }
    resizeObserver?.disconnect();
  });
</script>

<svelte:head>
  <title>Moiré Simulator</title>
</svelte:head>

<div class="moire-page" class:fullscreen-mode={isFullscreen}>
  <header class="hero" hidden={isFullscreen}>
    <p class="eyebrow">Moiré Simulator</p>
  </header>

  <section class="workspace">
    <div class="preview" class:preview-fullscreen={isFullscreen} bind:this={containerEl} on:dblclick={() => setFullscreen(false)}>
      <canvas bind:this={canvasEl} data-testid="moire-canvas"></canvas>
    </div>

    <aside class="controls" data-testid="control-panel" hidden={isFullscreen}>
      <div class="controls-header">
        <h2>Controls</h2>
        <div class="button-row">
          <button type="button" on:click={toggleFullscreen} data-testid="fullscreen-toggle">fullscreen</button>
          <button type="button" on:click={randomizeControls} data-testid="randomize">randomize</button>
          <button type="button" on:click={exportPreset} data-testid="copy-preset">copy</button>
          <button type="button" on:click={importPreset} data-testid="paste-preset">paste</button>
        </div>
      </div>

      <div class="grid-controls">
        <label class="slider-control">
          <span class="slider-header">Frequency A: {controls.frequencyA.toFixed(1)}</span>
          <div class="slider-inputs">
            <input data-testid="ctrl-frequency-a" type="range" min="0" max="440" step="0.1" bind:value={controls.frequencyA} />
            <input class="number-input" type="number" min="0" max="440" step="0.1" bind:value={controls.frequencyA} />
          </div>
        </label>
        <label class="slider-control">
          <span class="slider-header">Width A: {controls.widthA.toFixed(3)}</span>
          <div class="slider-inputs">
            <input type="range" min="0.005" max="8" step="0.001" bind:value={controls.widthA} />
            <input class="number-input" type="number" min="0.005" max="8" step="0.001" bind:value={controls.widthA} />
          </div>
        </label>
        <label class="slider-control">
          <span class="slider-header">Rotation A: {controls.rotationA.toFixed(1)}&deg;</span>
          <div class="slider-inputs">
            <input type="range" min="-90" max="90" step="0.1" bind:value={controls.rotationA} />
            <input class="number-input" type="number" min="-90" max="90" step="0.1" bind:value={controls.rotationA} />
          </div>
        </label>
        <label class="slider-control">
          <span class="slider-header">Phase A: {controls.phaseA.toFixed(2)}</span>
          <div class="slider-inputs">
            <input type="range" min="-4" max="4" step="0.01" bind:value={controls.phaseA} />
            <input class="number-input" type="number" min="-4" max="4" step="0.01" bind:value={controls.phaseA} />
          </div>
        </label>

        <label class="slider-control">
          <span class="slider-header">Frequency B: {controls.frequencyB.toFixed(1)}</span>
          <div class="slider-inputs">
            <input data-testid="ctrl-frequency-b" type="range" min="0" max="440" step="0.1" bind:value={controls.frequencyB} />
            <input class="number-input" type="number" min="0" max="440" step="0.1" bind:value={controls.frequencyB} />
          </div>
        </label>
        <label class="slider-control">
          <span class="slider-header">Width B: {controls.widthB.toFixed(3)}</span>
          <div class="slider-inputs">
            <input type="range" min="0.005" max="8" step="0.001" bind:value={controls.widthB} />
            <input class="number-input" type="number" min="0.005" max="8" step="0.001" bind:value={controls.widthB} />
          </div>
        </label>
        <label class="slider-control">
          <span class="slider-header">Rotation B: {controls.rotationB.toFixed(1)}&deg;</span>
          <div class="slider-inputs">
            <input type="range" min="-90" max="90" step="0.1" bind:value={controls.rotationB} />
            <input class="number-input" type="number" min="-90" max="90" step="0.1" bind:value={controls.rotationB} />
          </div>
        </label>
        <label class="slider-control">
          <span class="slider-header">Phase B: {controls.phaseB.toFixed(2)}</span>
          <div class="slider-inputs">
            <input type="range" min="-4" max="4" step="0.01" bind:value={controls.phaseB} />
            <input class="number-input" type="number" min="-4" max="4" step="0.01" bind:value={controls.phaseB} />
          </div>
        </label>

        <label class="slider-control">
          <span class="slider-header">Warp Amount: {controls.warpAmount.toFixed(3)}</span>
          <div class="slider-inputs">
            <input type="range" min="0" max="0.8" step="0.001" bind:value={controls.warpAmount} />
            <input class="number-input" type="number" min="0" max="0.8" step="0.001" bind:value={controls.warpAmount} />
          </div>
        </label>
        <label class="slider-control">
          <span class="slider-header">Warp Frequency: {controls.warpFrequency.toFixed(2)}</span>
          <div class="slider-inputs">
            <input type="range" min="0.1" max="12" step="0.01" bind:value={controls.warpFrequency} />
            <input class="number-input" type="number" min="0.1" max="12" step="0.01" bind:value={controls.warpFrequency} />
          </div>
        </label>
        <label class="slider-control">
          <span class="slider-header">Warp Speed: {controls.warpSpeed.toFixed(2)}</span>
          <div class="slider-inputs">
            <input type="range" min="0" max="3" step="0.01" bind:value={controls.warpSpeed} />
            <input class="number-input" type="number" min="0" max="3" step="0.01" bind:value={controls.warpSpeed} />
          </div>
        </label>

        <label class="slider-control">
          <span class="slider-header">Contrast: {controls.contrast.toFixed(2)}</span>
          <div class="slider-inputs">
            <input type="range" min="0.4" max="3" step="0.01" bind:value={controls.contrast} />
            <input class="number-input" type="number" min="0.4" max="3" step="0.01" bind:value={controls.contrast} />
          </div>
        </label>
        <label class="slider-control">
          <span class="slider-header">Brightness: {controls.brightness.toFixed(2)}</span>
          <div class="slider-inputs">
            <input type="range" min="0.2" max="2" step="0.01" bind:value={controls.brightness} />
            <input class="number-input" type="number" min="0.2" max="2" step="0.01" bind:value={controls.brightness} />
          </div>
        </label>
        <label class="slider-control">
          <span class="slider-header">Saturation: {controls.saturation.toFixed(2)}</span>
          <div class="slider-inputs">
            <input type="range" min="0" max="2" step="0.01" bind:value={controls.saturation} />
            <input class="number-input" type="number" min="0" max="2" step="0.01" bind:value={controls.saturation} />
          </div>
        </label>

        <label class="switch-row">
          <span>Animate</span>
          <input data-testid="ctrl-animate" type="checkbox" bind:checked={controls.animate} />
        </label>
        <label class="slider-control">
          <span class="slider-header">Time Scale: {controls.timeScale.toFixed(2)}</span>
          <div class="slider-inputs">
            <input type="range" min="0" max="3" step="0.01" bind:value={controls.timeScale} />
            <input class="number-input" type="number" min="0" max="3" step="0.01" bind:value={controls.timeScale} />
          </div>
        </label>
        <label class="switch-row">
          <span>Invert Palette</span>
          <input type="checkbox" bind:checked={controls.invert} />
        </label>

        <label>
          <span>Blend Mode</span>
          <select bind:value={controls.blendMode} data-testid="ctrl-blend-mode">
            <option value={0}>Difference</option>
            <option value={1}>Multiply</option>
          </select>
        </label>

        <label class="slider-control">
          <span class="slider-header">Color A Hue: {controls.colorAHue.toFixed(0)}</span>
          <div class="slider-inputs">
            <input type="range" min="0" max="360" step="1" bind:value={controls.colorAHue} />
            <input class="number-input" type="number" min="0" max="360" step="1" bind:value={controls.colorAHue} />
          </div>
        </label>
        <label class="slider-control">
          <span class="slider-header">Color A Saturation: {controls.colorASat.toFixed(0)}%</span>
          <div class="slider-inputs">
            <input type="range" min="0" max="100" step="1" bind:value={controls.colorASat} />
            <input class="number-input" type="number" min="0" max="100" step="1" bind:value={controls.colorASat} />
          </div>
        </label>
        <label class="slider-control">
          <span class="slider-header">Color A Lightness: {controls.colorALight.toFixed(0)}%</span>
          <div class="slider-inputs">
            <input type="range" min="0" max="100" step="1" bind:value={controls.colorALight} />
            <input class="number-input" type="number" min="0" max="100" step="1" bind:value={controls.colorALight} />
          </div>
        </label>

        <label class="slider-control">
          <span class="slider-header">Color B Hue: {controls.colorBHue.toFixed(0)}</span>
          <div class="slider-inputs">
            <input type="range" min="0" max="360" step="1" bind:value={controls.colorBHue} />
            <input class="number-input" type="number" min="0" max="360" step="1" bind:value={controls.colorBHue} />
          </div>
        </label>
        <label class="slider-control">
          <span class="slider-header">Color B Saturation: {controls.colorBSat.toFixed(0)}%</span>
          <div class="slider-inputs">
            <input type="range" min="0" max="100" step="1" bind:value={controls.colorBSat} />
            <input class="number-input" type="number" min="0" max="100" step="1" bind:value={controls.colorBSat} />
          </div>
        </label>
        <label class="slider-control">
          <span class="slider-header">Color B Lightness: {controls.colorBLight.toFixed(0)}%</span>
          <div class="slider-inputs">
            <input type="range" min="0" max="100" step="1" bind:value={controls.colorBLight} />
            <input class="number-input" type="number" min="0" max="100" step="1" bind:value={controls.colorBLight} />
          </div>
        </label>

        <label class="slider-control">
          <span class="slider-header">Background Hue: {controls.backgroundHue.toFixed(0)}</span>
          <div class="slider-inputs">
            <input type="range" min="0" max="360" step="1" bind:value={controls.backgroundHue} />
            <input class="number-input" type="number" min="0" max="360" step="1" bind:value={controls.backgroundHue} />
          </div>
        </label>
        <label class="slider-control">
          <span class="slider-header">Background Saturation: {controls.backgroundSat.toFixed(0)}%</span>
          <div class="slider-inputs">
            <input type="range" min="0" max="100" step="1" bind:value={controls.backgroundSat} />
            <input class="number-input" type="number" min="0" max="100" step="1" bind:value={controls.backgroundSat} />
          </div>
        </label>
        <label class="slider-control">
          <span class="slider-header">Background Lightness: {controls.backgroundLight.toFixed(0)}%</span>
          <div class="slider-inputs">
            <input type="range" min="0" max="100" step="1" bind:value={controls.backgroundLight} />
            <input class="number-input" type="number" min="0" max="100" step="1" bind:value={controls.backgroundLight} />
          </div>
        </label>

        <label class="slider-control">
          <span class="slider-header">Resolution Scale: {controls.resolutionScale.toFixed(2)}x</span>
          <div class="slider-inputs">
            <input data-testid="ctrl-resolution" type="range" min="0.35" max="1.5" step="0.01" bind:value={controls.resolutionScale} on:input={configureCanvas} />
            <input class="number-input" type="number" min="0.35" max="1.5" step="0.01" bind:value={controls.resolutionScale} on:input={configureCanvas} />
          </div>
        </label>
      </div>
    </aside>
  </section>
</div>

<style>
  .moire-page {
    display: grid;
    gap: 1.25rem;
    padding: clamp(0.6rem, 1.8vw, 1.2rem);
  }

  .hero {
    display: grid;
    gap: 0.4rem;
    max-width: 80ch;
  }

  .eyebrow {
    color: #7dd3fc;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 0.78rem;
  }

  h1 {
    margin: 0;
    line-height: 1.1;
    font-size: clamp(1.5rem, 3vw, 2.3rem);
    color: #f8fafc;
  }

  .intro {
    margin: 0;
    color: #bfdbfe;
    max-width: 70ch;
    font-size: 0.96rem;
  }

  .status {
    margin: 0.35rem 0 0;
    font-size: 0.9rem;
    color: #e2e8f0;
  }

  .workspace {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr);
    align-items: start;
  }

  .preview {
    border: 1px solid #1e293b;
    background: #020617;
    border-radius: 16px;
    min-height: 58vh;
    overflow: hidden;
    box-shadow: 0 20px 70px rgba(3, 7, 18, 0.6);
  }

  .preview-fullscreen {
    position: fixed;
    inset: 0;
    z-index: 40;
    border-radius: 0;
    border: 0;
    min-height: 100vh;
  }

  .fullscreen-mode {
    padding: 0;
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .controls {
    border: 1px solid #1f2937;
    border-radius: 16px;
    padding: 0.9rem;
    background:
      linear-gradient(170deg, rgba(17, 24, 39, 0.95), rgba(15, 23, 42, 0.88));
    box-shadow: 0 16px 48px rgba(2, 6, 23, 0.45);
  }

  .controls-header {
    display: flex;
    gap: 0.7rem;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .controls-header h2 {
    margin: 0;
    color: #f8fafc;
    font-size: 1rem;
  }

  .button-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  button {
    border: 1px solid #334155;
    color: #dbeafe;
    border-radius: 10px;
    background: rgba(30, 41, 59, 0.85);
    font-family: inherit;
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.4rem 0.6rem;
    cursor: pointer;
  }

  button:hover {
    border-color: #60a5fa;
    color: #eff6ff;
  }

  .grid-controls {
    display: grid;
    gap: 0.58rem;
    max-height: min(74vh, 860px);
    overflow: auto;
    padding-right: 0.4rem;
  }

  label {
    display: grid;
    gap: 0.25rem;
    font-size: 0.78rem;
    color: #cbd5e1;
  }

  label span {
    font-size: 0.72rem;
    letter-spacing: 0.01em;
    color: #93c5fd;
  }

  .slider-control {
    gap: 0.3rem;
  }

  .slider-header {
    display: block;
  }

  .slider-inputs {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 92px;
    gap: 0.5rem;
    align-items: center;
  }

  input[type='range'] {
    width: 100%;
  }

  .number-input {
    width: 100%;
    padding: 0.28rem 0.34rem;
    border-radius: 7px;
    border: 1px solid #334155;
    background: #0f172a;
    color: #dbeafe;
    font-family: inherit;
    font-size: 0.72rem;
  }

  input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: #38bdf8;
  }

  .switch-row {
    grid-template-columns: 1fr auto;
    align-items: center;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 0.45rem 0.55rem;
  }

  select {
    width: 100%;
    padding: 0.36rem;
    border-radius: 8px;
    background: #0f172a;
    color: #e2e8f0;
    border: 1px solid #334155;
    font-family: inherit;
  }

  @media (max-width: 1060px) {
    .workspace {
      grid-template-columns: 1fr;
    }

    .preview {
      min-height: 42vh;
    }
  }
</style>
