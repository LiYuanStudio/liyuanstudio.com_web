import { useEffect, useRef } from 'react';
import './HeroVisual.css';

type Pattern = 'planet' | 'neural' | 'collision' | 'lattice' | 'gravity';
const PATTERNS: Pattern[] = ['planet', 'neural', 'collision', 'lattice', 'gravity'];
const TRANSITION_SECONDS = 2.4;
const TEAL = '#14b8a6';
const CYCLE_SECONDS = 8;
const TAU = Math.PI * 2;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const band = (distance: number, width: number) => Math.exp(-Math.pow(distance / width, 2));

// Keep the original 15-unit grid and circular boundary; use one teal hue.
const DOTS = Array.from({ length: 67 * 67 }, (_, index) => {
  const row = Math.floor(index / 67);
  const column = index % 67;
  const x = column * 15 + 7.5;
  const y = row * 15 + 7.5;
  const radius = Math.hypot(x - 500, y - 500) / 492;
  const angle = Math.atan2(y - 500, x - 500);
  const sample = Math.sin((row + 1) * 127.1 + (column + 1) * 311.7) * 43758.5453;
  const accent = radius >= 405 / 492 && radius <= 485 / 492 && sample - Math.floor(sample) < 0.25;
  return { x, y, radius, angle, accent };
}).filter((dot) => dot.radius <= 1);

// Scientific visual studies, not numerical simulations. All dots stay on their grid.
function illumination(pattern: Pattern, radius: number, _angle: number, time: number, x: number, y: number) {
  if (pattern === 'planet') {
    // Project a rotating, tilted sphere onto the fixed grid. Longitude compression
    // at the limb makes the surface read as a globe rather than a flat light wave.
    const z = Math.sqrt(Math.max(0, 1 - radius * radius));
    const tiltedX = x * 0.94 + y * 0.342;
    const tiltedY = -x * 0.342 + y * 0.94;
    const longitude = Math.atan2(tiltedX, z) + time * 0.32;
    const latitude = Math.asin(Math.max(-1, Math.min(1, tiltedY)));
    const terrain = Math.sin(longitude * 3 + Math.sin(latitude * 4) * 1.2)
      + 0.55 * Math.cos(longitude * 5 - latitude * 7)
      + 0.3 * Math.sin(longitude * 9 + latitude * 3);
    const land = smooth((terrain + 0.12) / 0.48);
    const clouds = band(Math.sin(latitude * 8 + Math.sin(longitude * 3 - time * 0.12)), 0.2);
    const sunAngle = -0.65 + 0.18 * Math.sin(time * 0.35);
    const incidence = x * Math.cos(sunAngle) * -0.8 + y * 0.3 + z * 0.5;
    const daylight = smooth((incidence + 0.09) / 0.5);
    const surface = (0.08 + land * 0.77 + clouds * 0.2) * daylight;
    const atmosphere = band(radius - 0.955, 0.035) * (0.35 + daylight * 0.55);
    return clamp(surface + atmosphere);
  }
  if (pattern === 'neural') {
    // Layered activation: packets split into branching paths, then gather at nodes.
    const travel = (time % 5) * 0.56 - 1.35;
    let light = 0;
    for (let branch = 0; branch < 5; branch += 1) {
      const lane = (branch - 2) * 0.22 + 0.28;
      const path = lane + 0.12 * Math.sin(x * 7 + branch * 1.8);
      const wire = band(y - path, 0.026);
      const packet = band(x - travel + branch * 0.06, 0.17);
      const nodeX = Math.round((x + 0.9) / 0.32) * 0.32 - 0.9;
      const node = band(x - nodeX, 0.045) * band(y - path, 0.055);
      light = Math.max(light, wire * (0.12 + packet * 0.9) + node * packet * 0.6);
    }
    return clamp(light);
  }
  if (pattern === 'collision') {
    // A detector event: an incoming beam and curved, diverging particle tracks.
    const dx = x + 0.42;
    const dy = y - 0.3;
    const age = time % 4;
    const reach = age * 0.65;
    const distance = Math.hypot(dx, dy);
    let light = band(dy, 0.022) * band(dx + 1.15 - age * 1.3, 0.17) * (dx < 0 ? 1 : 0);
    for (let track = 0; track < 7; track += 1) {
      const angle = -1.35 + track * 0.49;
      const along = dx * Math.cos(angle) + dy * Math.sin(angle);
      const across = -dx * Math.sin(angle) + dy * Math.cos(angle);
      const curve = (track % 2 === 0 ? 1 : -1) * along * along * 0.32;
      const trail = smooth((reach - along) / 0.18) * Math.exp(-Math.max(0, reach - along) * 2);
      light = Math.max(light, band(across - curve, 0.018) * trail * smooth(along / 0.08));
    }
    return clamp(light + band(distance, 0.08) * band(age - 0.3, 0.23));
  }
  if (pattern === 'lattice') {
    // Material science: fixed lattice sites, coupled standing modes and nodal lines.
    const u = x * 0.87 + y * 0.5;
    const v = -x * 0.5 + y * 0.87;
    const sites = Math.pow(Math.abs(Math.cos(u * 25) * Math.cos(v * 25)), 12);
    const mode = Math.sin(u * 6.5) * Math.sin(v * 5.5);
    const response = 0.5 + 0.5 * Math.sin(time * 1.8 + mode * 4);
    const nodes = band(mode, 0.085) * 0.35;
    return clamp(sites * (0.25 + response * 0.75) + nodes * response);
  }
  // Astronomy: a drifting source bends into arcs around an off-centre lens.
  const dx = x + 0.38;
  const dy = y - 0.28;
  const radiusSquared = dx * dx + dy * dy;
  const deflection = 0.105 / Math.max(radiusSquared, 0.015);
  const sourceX = dx * (1 - deflection);
  const sourceY = dy * (1 - deflection);
  const drift = 0.13 * Math.sin(time * 0.48);
  const image = band(Math.hypot(sourceX - drift, sourceY - 0.04), 0.055);
  const field = Math.pow(0.5 + 0.5 * Math.cos(sourceX * 35 + sourceY * 9), 20) * 0.2;
  return clamp((image + field) * smooth(radiusSquared / 0.022));
}
export function HeroVisual() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clockRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');

    let frame = 0;
    let lastTime: number | null = null;
    let visible = true;
    let size = 0;

    const draw = () => {
      const elapsed = preference.matches ? 3.2 : clockRef.current;
      const cycle = Math.floor(elapsed / CYCLE_SECONDS);
      const time = elapsed % CYCLE_SECONDS;
      const pattern = PATTERNS[cycle % PATTERNS.length];
      const previous = PATTERNS[(cycle + PATTERNS.length - 1) % PATTERNS.length];
      context.clearRect(0, 0, 1000, 1000);
      context.fillStyle = TEAL;
      for (const dot of DOTS) {
        const x = (dot.x - 500) / 492;
        const y = (dot.y - 500) / 492;
        const nextLight = illumination(pattern, dot.radius, dot.angle, time, x, y);
        // A centre-out dissolve overlaps both moving fields, with no blank frame.
        const blend = smooth((time - dot.radius * 0.6) / (TRANSITION_SECONDS - 0.6));
        const previousLight = cycle > 0 && time < TRANSITION_SECONDS
          ? illumination(previous, dot.radius, dot.angle, CYCLE_SECONDS + time, x, y)
          : nextLight;
        const light = cycle === 0
          ? nextLight * smooth(time / 0.9)
          : previousLight + (nextLight - previousLight) * blend;
        context.globalAlpha = clamp(0.09 + dot.radius * 0.16 + light * 0.85);
        context.beginPath();
        context.arc(dot.x, dot.y, (dot.accent ? 4.2 : 3.2) * (1 + light * 0.48), 0, TAU);
        context.fill();
      }
    };
    const resize = () => {
      size = canvas.getBoundingClientRect().width;
      const pixels = Math.round(size * Math.min(window.devicePixelRatio || 1, 2));
      canvas.width = pixels;
      canvas.height = pixels;
      context.setTransform(pixels / 1000, 0, 0, pixels / 1000, 0, 0);
      draw();
    };
    const animate = (time: number) => {
      if (lastTime !== null) clockRef.current += Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      if (size > 0) draw();
      frame = window.requestAnimationFrame(animate);
    };
    const resume = () => {
      window.cancelAnimationFrame(frame);
      lastTime = null;

      draw();
      if (!preference.matches && visible && !document.hidden) frame = window.requestAnimationFrame(animate);
    };
    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      resume();
    });
    resizeObserver.observe(canvas);
    intersectionObserver.observe(canvas);
    preference.addEventListener('change', resume);
    document.addEventListener('visibilitychange', resume);
    resize();
    resume();
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      preference.removeEventListener('change', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);

  return (
    <div className="hero-visual">
      <div className="hv-art" aria-hidden="true"><canvas ref={canvasRef} className="hv-canvas" /></div>

    </div>
  );
}
