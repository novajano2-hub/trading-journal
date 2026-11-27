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
  rootClassName = '',
  tone = 'surface',
}: {
  children: ReactNode;
  /** Classes for the scrolling box (its margin and padding). */
  className?: string;
  /** Classes for the box around it, where the fade is laid (a bleed to the page edge). */
  rootClassName?: string;
  /** What the fade melts into: a card's white (default) or the page ground. */
  tone?: 'surface' | 'bg';
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
    <div className={`relative ${rootClassName}`}>
      {/* Positioned, so that what is absolutely placed inside it (a visually hidden heading, say) is clipped with the rest: its containing block would otherwise be the root, which does not clip, and the page would scroll sideways. */}
      <div ref={scroller} className={`relative overflow-x-auto ${className}`}>
        {children}
      </div>
      {more ? (
        <div
          data-scroll-fade=""
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 right-0 z-[2] w-12 bg-linear-to-l ${tone === 'bg' ? 'from-bg' : 'from-surface-1'} to-transparent lg:hidden`}
        />
      ) : null}
    </div>
  );
}
