import React, { useCallback, useRef } from 'react';
import './MaskedHeading.css';

type HeadingTag = 'h1' | 'h2';

export const MaskedHeading = React.forwardRef<
  HTMLHeadingElement,
  {
    as: HeadingTag;
    className?: string;
    id?: string;
    children: React.ReactNode;
  }
>(({ as: Tag, className, id, children }, forwardedRef) => {
  const ref = useRef<HTMLHeadingElement>(null);
  const baseRef = useRef<HTMLSpanElement>(null);
  const normalizedChildren = React.Children.toArray(children).map((child) =>
    typeof child === 'string' ? child.trim() : child,
  );
  const headingChildren = normalizedChildren.length === 1 ? normalizedChildren[0] : normalizedChildren;

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
      className={className ? 'masked-heading ' + className : 'masked-heading'}
    ><span className="masked-base" ref={baseRef}>{headingChildren}</span></Tag>
  );
});
