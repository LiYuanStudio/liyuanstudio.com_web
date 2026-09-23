import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './MaskedHeading.css';

type HeadingTag = 'h1' | 'h2';

export const MaskedHeading = React.forwardRef<
  HTMLHeadingElement,
  {
    as: HeadingTag;
    className?: string;
    id?: string;
    alternateText?: string;
    children: React.ReactNode;
  }
>(({ as: Tag, className, id, children, alternateText }, forwardedRef) => {
  const ref = useRef<HTMLHeadingElement>(null);
  const baseRef = useRef<HTMLSpanElement>(null);
  const [showAlternate, setShowAlternate] = useState(Boolean(alternateText));
  const normalizedChildren = React.Children.toArray(children).map((child) =>
    typeof child === 'string' ? child.trim() : child,
  );
  const headingChildren = normalizedChildren.length === 1 ? normalizedChildren[0] : normalizedChildren;
  const animated = Boolean(alternateText) && typeof headingChildren === 'string';
  const hasPeriod = animated && className?.split(/\s+/).includes('fixed-blue-period');

  useLayoutEffect(() => {
    const base = baseRef.current;
    if (!hasPeriod || !base) return;
    const measure = () => {
      for (const language of ['primary', 'alternate']) {
        const anchor: HTMLElement | null = base.querySelector<HTMLElement>(`.heading-morph-${language} .heading-period-anchor`);
        if (!anchor || !anchor.parentElement) continue;
        const origin = base.getBoundingClientRect();
        const bounds = anchor.getBoundingClientRect();
        const transform = getComputedStyle(anchor.parentElement).transform;
        const matrix = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
        const x = bounds.left - origin.left - matrix.m41;
        const y = bounds.top - origin.top - matrix.m42;
        base.style.setProperty(`--period-${language}-x`, `${x}px`);
        base.style.setProperty(`--period-${language}-y`, `${y}px`);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(base);
    document.fonts?.addEventListener('loadingdone', measure);
    return () => {
      observer.disconnect();
      document.fonts?.removeEventListener('loadingdone', measure);
    };
  }, [hasPeriod, headingChildren, alternateText]);

  useEffect(() => {
    if (!animated) return;
    let intro = true;
    let nearby = false;
    const timer = window.setTimeout(() => {
      intro = false;
      setShowAlternate(nearby);
    }, 700);
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const bounds = baseRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const dx = Math.max(bounds.left - event.clientX, 0, event.clientX - bounds.right);
      const dy = Math.max(bounds.top - event.clientY, 0, event.clientY - bounds.bottom);
      const next = Math.hypot(dx, dy) < (nearby ? 100 : 60);
      if (nearby !== next) {
        nearby = next;
        if (!intro) setShowAlternate(next);
      }
    };
    const leave = () => {
      nearby = false;
      if (!intro) setShowAlternate(false);
    };
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    window.addEventListener('scroll', leave, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
      window.removeEventListener('scroll', leave);
    };
  }, [animated]);

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

  return (
    <Tag
      ref={setRefs}
      id={id}
      aria-label={animated ? String(headingChildren) : undefined}
      className={className ? 'masked-heading ' + className : 'masked-heading'}
    >
      <span className={`masked-base${animated ? ' heading-morph' : ''}`} ref={baseRef}
        data-alternate={animated ? showAlternate : undefined}>
        {animated ? [String(headingChildren), alternateText ?? ''].map((text, layer) => (
          <span className={`heading-morph-layer heading-morph-${layer === 0 ? 'primary' : 'alternate'}`}
            key={layer} aria-hidden="true" lang={layer === 1 ? 'en' : 'zh-CN'}>
            {Array.from(text).map((character, index) => (
              <span className="heading-morph-character" key={index}
                style={{ '--character-delay': `${index / Math.max(1, text.length - 1) * 180}ms` } as React.CSSProperties}>
                {character === ' ' ? '\u00a0' : character}
                {hasPeriod && index === text.length - 1 && <span className="heading-period-anchor" />}
              </span>
            ))}
          </span>
        )) : headingChildren}
        {hasPeriod && <span className="heading-moving-period" aria-hidden="true" />}
      </span>
    </Tag>
  );
});
