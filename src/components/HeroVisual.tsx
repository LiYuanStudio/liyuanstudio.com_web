import { useEffect, useRef } from 'react';
import './HeroVisual.css';

const PARALLAX_LERP = 0.06;
const SETTLE_THRESHOLD = 0.001;

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/**
 * Decorative "living core" graphic shown beside the hero heading.
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
      <div className="hv-layer" data-depth="12">
        <div className="hv-halo" />
      </div>
      <div className="hv-layer hv-layer-ring" data-depth="18">
        <div className="hv-ring hv-ring-outer">
          <div className="hv-ring-circle" />
          <div className="hv-ring-spin hv-ring-spin-slow">
            <span className="hv-ring-dot hv-ring-dot-teal" />
          </div>
        </div>
      </div>
      <div className="hv-layer hv-layer-ring" data-depth="24">
        <div className="hv-ring hv-ring-inner">
          <div className="hv-ring-circle" />
          <div className="hv-ring-spin hv-ring-spin-fast">
            <span className="hv-ring-dot hv-ring-dot-blue" />
          </div>
        </div>
      </div>
      <div className="hv-layer" data-depth="30">
        <div className="hv-orb hv-orb-core" />
      </div>
      <div className="hv-layer" data-depth="40">
        <div className="hv-orb hv-orb-sat hv-orb-sat-teal" />
      </div>
      <div className="hv-layer" data-depth="46">
        <div className="hv-orb hv-orb-sat hv-orb-sat-blue" />
      </div>
      <div className="hv-layer" data-depth="50">
        <div className="hv-orb hv-orb-sat hv-orb-sat-green" />
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
