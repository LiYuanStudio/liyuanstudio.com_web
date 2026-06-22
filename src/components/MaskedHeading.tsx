import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { GlowPosition } from '../types.js';
import './MaskedHeading.css';

type HeadingTag = 'h1' | 'h2';

export const MaskedHeading = React.forwardRef<
  HTMLHeadingElement,
  {
    as: HeadingTag;
    className?: string;
    id?: string;
    glowRef: React.RefObject<GlowPosition | null>;
    children: React.ReactNode;
  }
>(({ as: Tag, className, id, glowRef, children }, forwardedRef) => {
  const ref = useRef<HTMLHeadingElement>(null);
  const baseRef = useRef<HTMLSpanElement>(null);
  const overlayRef = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState({ x: -999, y: -999, r: 0 });

  const setRefs = useCallback(
    (node: HTMLHeadingElement | null) => {
      ref.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef],
  );

  useEffect(() => {
    const overlayEl = overlayRef.current;
    let rafId: number;

    const tick = () => {
      const textEl = ref.current;
      const glow = glowRef.current;
      if (!textEl || !glow) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const textRect = textEl.getBoundingClientRect();
      const dx = Math.max(
        textRect.left - glow.x,
        0,
        glow.x - textRect.right,
      );
      const dy = Math.max(
        textRect.top - glow.y,
        0,
        glow.y - textRect.bottom,
      );
      const dist = Math.sqrt(dx * dx + dy * dy);

      const radius = glow.size / 2;
      if (glow.visible && dist <= radius) {
        const localRect = overlayEl?.getBoundingClientRect() ?? textRect;
        setPos({
          x: glow.x - localRect.left,
          y: glow.y - localRect.top,
          r: radius,
        });
        setActive(true);
      } else {
        setActive(false);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [glowRef]);

  return (
    <Tag
      ref={setRefs}
      id={id}
      className={className ? `masked-heading ${className}` : 'masked-heading'}
    >
      <span className="masked-base" ref={baseRef}>
        {children}
      </span>
      <span
        ref={overlayRef}
        className="masked-overlay"
        aria-hidden="true"
        style={{
          clipPath: active
            ? `circle(${pos.r}px at ${pos.x}px ${pos.y}px)`
            : 'circle(0px at -999px -999px)',
        }}
      >
        {children}
      </span>
    </Tag>
  );
});
