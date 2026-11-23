'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A table (or any wide block) that scrolls sideways, with a fade on its right
 * edge while there is more past it, so a cut column reads as going on. The
 * fade is a veil of the card's surface laid over the edge, not a mask, so a
 * sticky first column keeps its own look. Below `lg` only: where the content
 * fits there is nothing to show. The fade ignores the pointer.
 */
export function ScrollFade({
  children,
  className = '',
}: {
  children: ReactNode;
  /** Classes for the scrolling box (its margin and padding). */
  className?: string;
}): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const next = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setMore((m) => (m === next ? m : next));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, []);
  return (
    <div className="relative">
      <div ref={scroller} className={`overflow-x-auto ${className}`}>
        {children}
      </div>
      {more ? (
        <div
          data-scroll-fade=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-[2] w-12 bg-linear-to-l from-surface-1 to-transparent lg:hidden"
        />
      ) : null}
    </div>
  );
}
