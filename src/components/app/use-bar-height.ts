'use client';

import { useLayoutEffect, type RefObject } from 'react';

/**
 * Tells the page how tall the pinned bar is, as `--top-bar` on the root: what
 * pins itself under the bar (the trade views' switch row) sits at that offset,
 * and the page's `scroll-padding-top` keeps a focused control clear of it
 * (globals.css). Kept up to date as the bar resizes, taken back when the bar
 * goes (edit mode swaps one bar for the other). `active` is false while the
 * bar is not drawn.
 */
export function useBarHeight(
  bar: RefObject<HTMLElement | null>,
  active = true,
): void {
  useLayoutEffect(() => {
    const el = bar.current;
    if (!active || !el) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty(
        '--top-bar',
        `${el.getBoundingClientRect().height}px`,
      );
    publish();
    const unpublish = () => root.style.removeProperty('--top-bar');
    if (typeof ResizeObserver === 'undefined') return unpublish;
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      unpublish();
    };
  }, [bar, active]);
}
