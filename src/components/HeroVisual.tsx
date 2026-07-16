import { useEffect, useRef } from 'react';
import './HeroVisual.css';

const PARALLAX_LERP = 0.06;
const SETTLE_THRESHOLD = 0.001;

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

const DOT_COLORS = {
  blue: '#206ccf',
  teal: '#14b8a6',
  lightBlue: '#4ea1ff',
  green: '#30d158',
} as const;

/** Deterministic pseudo-random in [0, 1) so the dot pattern is stable between renders. */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface DotMatrixProps {
  /** Width/height of the square viewBox. */
  size: number;
  /** Radius of the circular dot field, in viewBox units. */
  radius: number;
  /** Grid spacing between dot centers, in viewBox units. */
  step: number;
  className?: string;
  dotRadius: (dist: number, index: number) => number;
  dotFill: (dx: number, dy: number, dist: number, index: number) => string;
}

/** Flat circle built from a grid of solid dots (halftone / dot-matrix look). */
function DotMatrix({ size, radius, step, className, dotRadius, dotFill }: DotMatrixProps) {
  const dots: Array<{ cx: number; cy: number; r: number; fill: string }> = [];
  let index = 0;
  for (let y = step / 2; y <= size - step / 2 + 0.001; y += step) {
    for (let x = step / 2; x <= size - step / 2 + 0.001; x += step) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) continue;
      dots.push({ cx: x, cy: y, r: dotRadius(dist, index), fill: dotFill(dx, dy, dist, index) });
      index += 1;
    }
  }
  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} focusable="false">
      {dots.map((dot, i) => (
        <circle key={i} cx={dot.cx} cy={dot.cy} r={dot.r} fill={dot.fill} />
      ))}
    </svg>
  );
}

const CORE_RADIUS = 96;

/** Halftone shading: bigger dots near the center, smaller at the edge. */
function coreDotRadius(dist: number): number {
  return 1.9 + 3.1 * (1 - dist / CORE_RADIUS);
}

function coreDotFill(dx: number, dy: number, dist: number, index: number): string {
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (dist > 48 && angle > 8 && angle < 82) return DOT_COLORS.teal; // crescent along the bottom-right rim
  if (seededRandom(index) > 0.96) return DOT_COLORS.green; // sparse "vital" accents
  return DOT_COLORS.blue;
}

function flatFill(color: string) {
  return () => color;
}

function uniformDotRadius(r: number) {
  return () => r;
}

/**
 * Decorative dot-matrix graphic shown beside the hero heading.
 * Layers drift with the cursor at different depths (parallax); all motion
 * is disabled when the user prefers reduced motion.
 */
export function HeroVisual() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const motionAllowed =
      typeof window.matchMedia !== 'function' ||
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rafAvailable = typeof window.requestAnimationFrame === 'function';
    if (!motionAllowed || !rafAvailable) return;

    const layers = Array.from(root.querySelectorAll<HTMLElement>('[data-depth]'));
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let rafId = 0;
    let running = false;

    const tick = () => {
      currentX += (targetX - currentX) * PARALLAX_LERP;
      currentY += (targetY - currentY) * PARALLAX_LERP;
      for (const layer of layers) {
        const depth = Number(layer.dataset.depth ?? 0);
        layer.style.transform = `translate3d(${(-currentX * depth).toFixed(2)}px, ${(-currentY * depth).toFixed(2)}px, 0)`;
      }
      const settled =
        Math.abs(targetX - currentX) < SETTLE_THRESHOLD &&
        Math.abs(targetY - currentY) < SETTLE_THRESHOLD;
      if (settled) {
        running = false;
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      rafId = window.requestAnimationFrame(tick);
    };

    const handleMouseMove = (event: MouseEvent) => {
      const rect = root.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      targetX = clampUnit((event.clientX - centerX) / (window.innerWidth / 2));
      targetY = clampUnit((event.clientY - centerY) / (window.innerHeight / 2));
      start();
    };

    const resetTarget = () => {
      targetX = 0;
      targetY = 0;
      start();
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', resetTarget);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', resetTarget);
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div ref={rootRef} className="hero-visual" aria-hidden="true">
      <div className="hv-layer" data-depth="8">
        <div className="hv-grid" />
      </div>
      <div className="hv-layer" data-depth="18">
        <div className="hv-ring hv-ring-outer">
          <svg className="hv-ring-line" viewBox="0 0 100 100" focusable="false">
            <circle cx="50" cy="50" r="48" />
          </svg>
          <div className="hv-ring-spin hv-ring-spin-slow">
            <span className="hv-ring-dot hv-ring-dot-teal" />
          </div>
        </div>
      </div>
      <div className="hv-layer" data-depth="24">
        <div className="hv-ring hv-ring-inner">
          <svg className="hv-ring-line" viewBox="0 0 100 100" focusable="false">
            <circle cx="50" cy="50" r="48" />
          </svg>
          <div className="hv-ring-spin hv-ring-spin-fast">
            <span className="hv-ring-dot hv-ring-dot-blue" />
          </div>
        </div>
      </div>
      <div className="hv-layer" data-depth="30">
        <div className="hv-orb hv-orb-core">
          <DotMatrix
            className="hv-matrix hv-matrix-spin"
            size={200}
            radius={CORE_RADIUS}
            step={11}
            dotRadius={coreDotRadius}
            dotFill={coreDotFill}
          />
        </div>
      </div>
      <div className="hv-layer" data-depth="40">
        <div className="hv-orb hv-orb-sat hv-orb-sat-teal">
          <DotMatrix
            className="hv-matrix hv-matrix-spin-reverse"
            size={100}
            radius={46}
            step={12}
            dotRadius={uniformDotRadius(3)}
            dotFill={flatFill(DOT_COLORS.teal)}
          />
        </div>
      </div>
      <div className="hv-layer" data-depth="46">
        <div className="hv-orb hv-orb-sat hv-orb-sat-blue">
          <DotMatrix
            className="hv-matrix hv-matrix-spin"
            size={100}
            radius={46}
            step={13}
            dotRadius={uniformDotRadius(2.6)}
            dotFill={flatFill(DOT_COLORS.lightBlue)}
          />
        </div>
      </div>
      <div className="hv-layer" data-depth="50">
        <div className="hv-orb hv-orb-sat hv-orb-sat-green">
          <DotMatrix
            className="hv-matrix hv-matrix-spin-reverse"
            size={100}
            radius={44}
            step={16}
            dotRadius={uniformDotRadius(3.4)}
            dotFill={flatFill(DOT_COLORS.green)}
          />
        </div>
      </div>
      <div className="hv-layer" data-depth="34">
        <div className="hv-particles">
          <span className="hv-particle" />
          <span className="hv-particle" />
          <span className="hv-particle" />
          <span className="hv-particle" />
          <span className="hv-particle" />
          <span className="hv-particle" />
          <span className="hv-particle" />
          <span className="hv-particle" />
        </div>
      </div>
      <div className="hv-layer" data-depth="56">
        <div className="hv-chip hv-chip-product">
          <img src="/png/logo.png" alt="" />
          <span className="hv-chip-text">
            <strong>Papyrus Desktop</strong>
            <span>由简入深</span>
          </span>
        </div>
      </div>
      <div className="hv-layer" data-depth="60">
        <div className="hv-chip hv-chip-cli">
          <span className="hv-chip-glyph">&gt;_</span>
          <strong>Papyrus CLI</strong>
        </div>
      </div>
    </div>
  );
}
