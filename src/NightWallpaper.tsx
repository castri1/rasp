import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { hexToRgba } from './theme';
import { wallpaperPalette } from './wallpaper';
import type { WallpaperConfig } from './wallpaper';
import './wallpaper.css';

const PARTICLES = { eco: 620, balanced: 1120, rich: 1680 } as const;
const TARGET_FRAME_MS = { eco: 40, balanced: 33, rich: 27 } as const;

function randomSource(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

export default function NightWallpaper({ config, onExit }: { config: WallpaperConfig; onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const canvasNode = canvasRef.current;
    const surfaceNode = surfaceRef.current;
    if (!canvasNode || !surfaceNode) return;
    const drawingContext = canvasNode.getContext('2d', { alpha: false });
    if (!drawingContext) return;
    const canvas = canvasNode;
    const surface = surfaceNode;
    const context = drawingContext;

    const palette = wallpaperPalette(config.preset);
    const maximum = Math.round(PARTICLES[config.quality] * config.density);
    const random = randomSource(config.seed);
    const x = new Float32Array(maximum);
    const y = new Float32Array(maximum);
    const depth = new Float32Array(maximum);
    const phase = new Float32Array(maximum);
    const drift = new Float32Array(maximum);
    const layer = new Uint8Array(maximum);
    for (let index = 0; index < maximum; index += 1) {
      const initialX = random();
      const clustered = random() < .48;
      x[index] = initialX;
      y[index] = clustered
        ? (.47 + Math.sin(initialX * 7.2 + random() * 2.6) * .12 + (random() + random() - 1) * .09 + 1) % 1
        : random();
      depth[index] = random();
      phase[index] = random() * Math.PI * 2;
      drift[index] = .7 + random() * .6;
      layer[index] = Math.min(3, Math.floor(depth[index] * 4));
    }

    let width = 800;
    let height = 480;
    let pixelRatio = 1;
    let frame = 0;
    let animation = 0;
    let lastFrame = 0;
    let renderedAt = performance.now();
    let activeCount = maximum;
    let renderCost = 0;
    let costSamples = 0;
    let pointerX = 0;
    let pointerY = 0;
    let targetPointerX = 0;
    let targetPointerY = 0;
    let running = !document.hidden;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const frameInterval = TARGET_FRAME_MS[config.quality];
    const rgba = {
      atmosphere: hexToRgba(palette.midnight, .42 * config.glow),
      deep: hexToRgba(palette.deep, .28 * config.glow),
      filament: hexToRgba(palette.filament, .15 * config.glow),
      accent: hexToRgba(palette.accent, .72),
      sparkle: hexToRgba(palette.sparkle, .9),
      veil: hexToRgba(palette.accent, .045 * config.glow),
    };

    function resize() {
      width = Math.max(1, Math.round(surface.clientWidth));
      height = Math.max(1, Math.round(surface.clientHeight));
      pixelRatio = Math.min(window.devicePixelRatio || 1, config.quality === 'rich' ? 1.35 : 1);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }

    function drawAtmosphere(time: number) {
      context.fillStyle = palette.background;
      context.fillRect(0, 0, width, height);
      const firstX = width * (.58 + Math.sin(time * .011) * .12) + pointerX * 10;
      const firstY = height * (.44 + Math.cos(time * .009) * .13) + pointerY * 7;
      const radius = Math.max(width, height) * .64;
      const glow = context.createRadialGradient(firstX, firstY, 0, firstX, firstY, radius);
      glow.addColorStop(0, rgba.atmosphere);
      glow.addColorStop(.42, rgba.deep);
      glow.addColorStop(1, palette.background);
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      const secondX = width * (.22 + Math.cos(time * .007) * .08);
      const secondY = height * (.72 + Math.sin(time * .013) * .08);
      const second = context.createRadialGradient(secondX, secondY, 0, secondX, secondY, radius * .58);
      second.addColorStop(0, hexToRgba(palette.deep, .13 * config.glow));
      second.addColorStop(1, hexToRgba(palette.background, 0));
      context.fillStyle = second;
      context.fillRect(0, 0, width, height);
    }

    function drawFilaments(time: number) {
      context.save();
      context.globalCompositeOperation = 'lighter';
      context.lineCap = 'round';
      const migration = Math.sin(time * .012) * width * .12;
      for (let current = 0; current < 2; current += 1) {
        context.beginPath();
        for (let step = 0; step <= 34; step += 1) {
          const progress = step / 34;
          const px = -width * .1 + progress * width * 1.2;
          const envelope = .45 + Math.sin(progress * Math.PI) * .55;
          const py = height * (.43 + current * .17) + Math.sin(progress * (4.6 + current * .7) + time * (.021 - current * .004) + current * 2.1) * height * .12 * envelope;
          if (step === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.globalAlpha = 1;
        context.strokeStyle = rgba.veil;
        context.lineWidth = 22 - current * 5;
        context.stroke();
      }
      for (let strand = 0; strand < 7; strand += 1) {
        const offset = (strand - 3) * height * .072;
        context.beginPath();
        for (let step = 0; step <= 30; step += 1) {
          const progress = step / 30;
          const px = -width * .08 + progress * width * 1.16;
          const envelope = Math.sin(progress * Math.PI);
          const wave = Math.sin(progress * 5.2 + time * (.026 + strand * .0008) + strand * 1.27);
          const cross = Math.sin(progress * 11.3 - time * .014 + strand) * .22;
          const py = height * .48 + offset + (wave + cross) * height * .09 * envelope + migration * .08;
          if (step === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.globalAlpha = (.12 - Math.abs(strand - 3) * .012) * config.glow;
        context.strokeStyle = strand === 3 ? palette.accent : palette.filament;
        context.lineWidth = strand === 3 ? .78 : .52;
        context.stroke();
      }
      context.restore();
    }

    function updateParticles(time: number, deltaSeconds: number) {
      const regionX = .57 + Math.sin(time * .0107) * .16;
      const regionY = .46 + Math.cos(time * .0083) * .13;
      const movement = config.motion * config.speed;
      pointerX += (targetPointerX - pointerX) * .025;
      pointerY += (targetPointerY - pointerY) * .025;
      for (let index = 0; index < activeCount; index += 1) {
        const px = x[index];
        const py = y[index];
        const z = depth[index];
        const local = Math.sin(py * 8.1 + time * .037 + phase[index]) + Math.cos(px * 6.4 - time * .029 + phase[index] * .7);
        const broad = Math.sin((px + py) * 4.7 + time * .016) * .7;
        const angle = local * .72 + broad + Math.sin(time * .006 + phase[index]) * .24;
        const dx = px - regionX;
        const dy = py - regionY;
        const influence = Math.exp(-(dx * dx * 5.5 + dy * dy * 9));
        const speed = (.0024 + z * .0048) * drift[index] * movement;
        x[index] += (Math.cos(angle) * speed + -dy * influence * .0032 * movement) * deltaSeconds;
        y[index] += (Math.sin(angle) * speed + dx * influence * .0025 * movement) * deltaSeconds;
        x[index] += pointerX * config.parallax * (z - .5) * .00008 * deltaSeconds;
        y[index] += pointerY * config.parallax * (z - .5) * .00006 * deltaSeconds;
        if (x[index] < -.035) x[index] += 1.07;
        else if (x[index] > 1.035) x[index] -= 1.07;
        if (y[index] < -.05) y[index] += 1.1;
        else if (y[index] > 1.05) y[index] -= 1.1;
      }
    }

    function drawParticles(time: number) {
      context.save();
      context.globalCompositeOperation = 'lighter';
      for (let currentLayer = 0; currentLayer < 4; currentLayer += 1) {
        const radius = [.38, .55, .78, 1.05][currentLayer];
        const parallaxX = pointerX * config.parallax * (currentLayer - 1.5) * 2.2;
        const parallaxY = pointerY * config.parallax * (currentLayer - 1.5) * 1.5;
        const shimmer = .9 + Math.sin(time * (.17 + currentLayer * .021) + currentLayer) * .1;
        context.globalAlpha = (.16 + currentLayer * .085) * config.brightness * shimmer;
        context.fillStyle = currentLayer < 2 ? palette.filament : palette.accent;
        context.beginPath();
        for (let index = 0; index < activeCount; index += 1) {
          if (layer[index] !== currentLayer) continue;
          const px = x[index] * width + parallaxX;
          const py = y[index] * height + parallaxY;
          context.moveTo(px + radius, py);
          context.arc(px, py, radius, 0, Math.PI * 2);
        }
        context.fill();
      }

      context.fillStyle = rgba.accent;
      context.globalAlpha = .4 * config.brightness * config.glow;
      context.shadowColor = palette.accent;
      context.shadowBlur = 3.5 * config.glow;
      context.beginPath();
      for (let index = 0; index < activeCount; index += 1) {
        const px = x[index];
        const strand = .49 + Math.sin(px * 6.1 + time * .025 + phase[index] * .13) * .105;
        const threshold = .018 + depth[index] * .027;
        if (Math.abs(y[index] - strand) > threshold || Math.sin(phase[index] * 2.7 + time * .11) < -.35) continue;
        const drawX = px * width + pointerX * config.parallax * depth[index] * 2;
        const drawY = y[index] * height + pointerY * config.parallax * depth[index] * 1.4;
        const radius = .48 + depth[index] * .62;
        context.moveTo(drawX + radius, drawY);
        context.arc(drawX, drawY, radius, 0, Math.PI * 2);
      }
      context.fill();
      context.shadowBlur = 0;

      context.fillStyle = rgba.sparkle;
      context.globalAlpha = .46 * config.brightness;
      context.beginPath();
      for (let index = 0; index < activeCount; index += 1) {
        if (depth[index] < .68 || Math.sin(phase[index] + time * .19) < .88) continue;
        const px = x[index] * width + pointerX * config.parallax * 2;
        const py = y[index] * height + pointerY * config.parallax * 1.4;
        context.moveTo(px + 1.05, py);
        context.arc(px, py, 1.05, 0, Math.PI * 2);
      }
      context.fill();
      context.restore();
    }

    function render(timestamp: number, force = false) {
      if (!force && timestamp - lastFrame < frameInterval) return;
      const started = performance.now();
      const deltaSeconds = Math.min(.08, (timestamp - renderedAt) / 1000 || .016);
      const time = timestamp / 1000 * config.speed + config.seed * .013;
      lastFrame = timestamp;
      renderedAt = timestamp;
      updateParticles(time, deltaSeconds);
      drawAtmosphere(time);
      drawFilaments(time);
      drawParticles(time);
      frame += 1;
      renderCost += performance.now() - started;
      costSamples += 1;
      if (frame % 120 === 0 && costSamples) {
        const average = renderCost / costSamples;
        if (average > 18 && activeCount > maximum * .58) activeCount = Math.max(Math.round(maximum * .58), Math.round(activeCount * .82));
        else if (average < 10 && activeCount < maximum) activeCount = Math.min(maximum, activeCount + Math.ceil(maximum * .08));
        renderCost = 0;
        costSamples = 0;
      }
    }

    function loop(timestamp: number) {
      if (!running) return;
      render(timestamp);
      animation = requestAnimationFrame(loop);
    }
    function visibility() {
      running = !document.hidden;
      cancelAnimationFrame(animation);
      if (running && !reducedMotion) {
        renderedAt = performance.now();
        animation = requestAnimationFrame(loop);
      }
    }
    function pointer(event: PointerEvent) {
      const bounds = surface.getBoundingClientRect();
      targetPointerX = ((event.clientX - bounds.left) / bounds.width - .5) * 2;
      targetPointerY = ((event.clientY - bounds.top) / bounds.height - .5) * 2;
    }
    function pointerLeave() { targetPointerX = 0; targetPointerY = 0; }

    resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(surface);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', visibility);
    surface.addEventListener('pointermove', pointer, { passive: true });
    surface.addEventListener('pointerleave', pointerLeave, { passive: true });
    render(performance.now(), true);
    if (!reducedMotion) animation = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(animation);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      surface.removeEventListener('pointermove', pointer);
      surface.removeEventListener('pointerleave', pointerLeave);
    };
  }, [config]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') onExit();
  }

  return <button ref={surfaceRef} type="button" className="night-wallpaper" onClick={onExit} onKeyDown={onKeyDown} aria-label="Volver a la agenda">
    <canvas ref={canvasRef} aria-hidden="true" />
    <span className="wallpaper-vignette" aria-hidden="true" />
    <span className="visually-hidden">Toca para volver a la agenda</span>
  </button>;
}
