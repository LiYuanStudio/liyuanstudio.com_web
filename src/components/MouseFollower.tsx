import React, { useEffect, useRef } from 'react';
import type { GlowPosition } from '../types.js';
import './MouseFollower.css';

// Must match the .mouse-glow diameter (270px) in MouseFollower.css.
export const GLOW_RADIUS = 135;
export const MOUSE_CURSOR_SIZE = 28;
export const PERIOD_SIZE = 16;
export const PERIOD_GAP = 12;
export const TITLE_BASELINE_RATIO = 0.78;
export const NAV_SCROLL_OFFSET = 120;

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(n, max));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function MouseFollower({
  boundaryRef,
  heroRef,
  titleRef,
  glowRef,
}: {
  boundaryRef: React.RefObject<HTMLElement | null>;
  heroRef: React.RefObject<HTMLElement | null>;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  glowRef: React.RefObject<GlowPosition | null>;
}) {
  const dotRef = useRef<HTMLDivElement>(null);
  const cursorCrossRef = useRef<HTMLDivElement>(null);
  const cursorDotRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const cursorCrossCurrentRef = useRef({ x: 0, y: 0 });
  const cursorDotCurrentRef = useRef({ x: 0, y: 0 });
  const visibleRef = useRef(true);
  const cursorVisibleRef = useRef(true);
  const hoverRef = useRef(false);
  const progressRef = useRef(0);
  const titleEndRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0, size: PERIOD_SIZE });
  const currentRef = useRef({ x: 0, y: 0, size: PERIOD_SIZE });
  const hasMouseMovedRef = useRef(false);

  useEffect(() => {
    const initialX = window.innerWidth / 2;
    const initialY = window.innerHeight / 2;
    mouseRef.current = { x: initialX, y: initialY };
    cursorCrossCurrentRef.current = { x: initialX, y: initialY };
    cursorDotCurrentRef.current = { x: initialX, y: initialY };
    targetRef.current = { x: initialX, y: initialY, size: PERIOD_SIZE };
    currentRef.current = { x: initialX, y: initialY, size: PERIOD_SIZE };

    const computeTitleEnd = () => {
      const title = titleRef.current;
      const baseSpan = title?.querySelector('.masked-base');
      if (!title || !baseSpan) return;

      const text = baseSpan.textContent ?? '';
      if (text.length === 0) return;

      const baseRect = baseSpan.getBoundingClientRect();
      const style = getComputedStyle(title);

      // Chinese full-width punctuation (e.g. 「」) leaves empty side-bearing on
      // its right half, so measuring the last character's bounding box places the
      // dot far from the visible glyph. Use the canvas ink bounds instead.
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let inkRight = baseRect.width;
      if (ctx) {
        ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        inkRight = ctx.measureText(text).actualBoundingBoxRight;
      }

      titleEndRef.current = {
        x: baseRect.left + inkRight + PERIOD_GAP,
        y: baseRect.top + baseRect.height * TITLE_BASELINE_RATIO,
      };
    };

    const computeProgress = () => {
      const hero = heroRef.current;
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      progressRef.current = clamp(-rect.top / rect.height, 0, 1);
    };

    const updateTarget = () => {
      const hero = heroRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // Transition from the current cursor/intro position to the title's
      // trailing period over a fixed scroll distance. This avoids the
      // "short hero" problem where a percentage-based transition completes in
      // too few frames on pages like Papyrus.
      const PERIOD_TRANSITION_PX = 140;
      const scrollTop = hero ? Math.max(-hero.getBoundingClientRect().top, 0) : 0;
      const t = easeInOutCubic(clamp(scrollTop / PERIOD_TRANSITION_PX, 0, 1));
      const baseSize = hasMouseMovedRef.current ? GLOW_RADIUS * 2 : PERIOD_SIZE;
      const baseX = hasMouseMovedRef.current ? mx : initialX;
      const baseY = hasMouseMovedRef.current ? my : initialY;

      targetRef.current = {
        x: lerp(baseX, titleEndRef.current.x, t),
        y: lerp(baseY, titleEndRef.current.y, t),
        size: lerp(baseSize, PERIOD_SIZE, t),
      };
    };

    const handleMove = (e: MouseEvent) => {
      hasMouseMovedRef.current = true;
      mouseRef.current = { x: e.clientX, y: e.clientY };
      cursorVisibleRef.current = true;

      const target = e.target as HTMLElement | null;
      hoverRef.current =
        target !== null &&
        (target.closest('a, button, [role="button"], input, textarea, select') !==
          null);

      const boundary = boundaryRef.current;
      if (boundary) {
        const rect = boundary.getBoundingClientRect();
        // Distance from the cursor to the nav rectangle. Hide the glow while
        // the circle (radius = GLOW_RADIUS) would overlap the nav, so the
        // circle's top edge lines up with the nav bottom boundary.
        const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
        const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
        const dist = Math.sqrt(dx * dx + dy * dy);
        visibleRef.current = dist > GLOW_RADIUS;
      } else {
        visibleRef.current = true;
      }
    };

    const handleLeave = () => {
      visibleRef.current = false;
      cursorVisibleRef.current = false;
    };

    const handleEnter = () => {
      visibleRef.current = true;
      cursorVisibleRef.current = true;
    };

    const handleScroll = () => {
      computeProgress();
      computeTitleEnd();
    };

    const handleResize = () => {
      computeTitleEnd();
    };

    let rafId: number;

    const animate = () => {
      updateTarget();

      currentRef.current.x = targetRef.current.x;
      currentRef.current.y = targetRef.current.y;
      currentRef.current.size = targetRef.current.size;

      const shared = glowRef.current;
      if (shared) {
        shared.x = currentRef.current.x;
        shared.y = currentRef.current.y;
        shared.size = currentRef.current.size;
        shared.visible = visibleRef.current;
      }

      const el = dotRef.current;
      if (el) {
        const transitionStrength = easeInOutCubic(
          clamp((progressRef.current - 0.5) / 0.5, 0, 1),
        );
        const visibleOpacity = visibleRef.current ? 1 : 0;
        el.style.transform = `translate(-50%, -50%) translate(${currentRef.current.x}px, ${currentRef.current.y}px)`;
        el.style.width = `${currentRef.current.size}px`;
        el.style.height = `${currentRef.current.size}px`;
        el.style.opacity = String(Math.max(visibleOpacity, transitionStrength));
      }

      const cursorCrossEl = cursorCrossRef.current;
      const cursorDotEl = cursorDotRef.current;
      if (cursorCrossEl && cursorDotEl) {
        const CURSOR_DOT_SMOOTHING = 0.25;
        const CURSOR_CROSS_SMOOTHING = 0.08;

        cursorDotCurrentRef.current.x = lerp(
          cursorDotCurrentRef.current.x,
          mouseRef.current.x,
          CURSOR_DOT_SMOOTHING,
        );
        cursorDotCurrentRef.current.y = lerp(
          cursorDotCurrentRef.current.y,
          mouseRef.current.y,
          CURSOR_DOT_SMOOTHING,
        );

        cursorCrossCurrentRef.current.x = lerp(
          cursorCrossCurrentRef.current.x,
          cursorDotCurrentRef.current.x,
          CURSOR_CROSS_SMOOTHING,
        );
        cursorCrossCurrentRef.current.y = lerp(
          cursorCrossCurrentRef.current.y,
          cursorDotCurrentRef.current.y,
          CURSOR_CROSS_SMOOTHING,
        );

        const glowRadius = currentRef.current.size / 2;
        const dx = cursorDotCurrentRef.current.x - currentRef.current.x;
        const dy = cursorDotCurrentRef.current.y - currentRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const insideGlow = visibleRef.current && dist <= glowRadius;
        const opacity = cursorVisibleRef.current && !insideGlow ? 1 : 0;

        const scale = hoverRef.current ? 1.4 : 1;
        cursorCrossEl.style.transform = `translate(-50%, -50%) translate(${cursorCrossCurrentRef.current.x}px, ${cursorCrossCurrentRef.current.y}px) scale(${scale})`;
        cursorCrossEl.style.width = `${MOUSE_CURSOR_SIZE}px`;
        cursorCrossEl.style.height = `${MOUSE_CURSOR_SIZE}px`;
        cursorCrossEl.style.opacity = String(opacity);

        cursorDotEl.style.transform = `translate(-50%, -50%) translate(${cursorDotCurrentRef.current.x}px, ${cursorDotCurrentRef.current.y}px) scale(${scale})`;
        cursorDotEl.style.width = '5px';
        cursorDotEl.style.height = '5px';
        cursorDotEl.style.opacity = String(opacity);
      }

      rafId = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMove);
    document.body.addEventListener('mouseleave', handleLeave);
    document.body.addEventListener('mouseenter', handleEnter);
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    computeProgress();
    computeTitleEnd();
    document.fonts?.ready.then(computeTitleEnd);

    rafId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      document.body.removeEventListener('mouseleave', handleLeave);
      document.body.removeEventListener('mouseenter', handleEnter);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(rafId);
    };
  }, [boundaryRef, heroRef, titleRef]);

  return (
    <>
      <div ref={dotRef} className="mouse-glow" />
      <div ref={cursorCrossRef} className="mouse-cursor-cross" />
      <div ref={cursorDotRef} className="mouse-cursor-dot" />
    </>
  );
}
