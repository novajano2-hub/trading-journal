'use client';

import { useSyncExternalStore } from 'react';

export interface PrintState {
  /** The page is being laid out for paper: the print dialog is open, or print media is emulated. */
  printing: boolean;
  /** When the last print began, in ms (before any print, when the page began to be watched): a printed page says when it was made. */
  madeAt: number;
}

const SERVER: PrintState = { printing: false, madeAt: 0 };

let snapshot: PrintState | undefined;
const listeners = new Set<() => void>();
let detach: (() => void) | undefined;

const printMedia = () =>
  typeof matchMedia === 'function' ? matchMedia('print') : undefined;

function current(): PrintState {
  return (snapshot ??= {
    printing: printMedia()?.matches ?? false,
    madeAt: Date.now(),
  });
}

function set(printing: boolean): void {
  const now = current();
  if (printing === now.printing) return;
  snapshot = { printing, madeAt: printing ? Date.now() : now.madeAt };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    // `beforeprint` and `afterprint` bracket the browser's own print dialog;
    // the media query also follows print media that is only emulated.
    const media = printMedia();
    const before = () => set(true);
    const after = () => set(false);
    const change = () => set(media?.matches ?? false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    media?.addEventListener('change', change);
    detach = () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
      media?.removeEventListener('change', change);
    };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      detach?.();
      detach = undefined;
      snapshot = undefined;
    }
  };
}

/**
 * Whether the page is being laid out for paper, and when the print began.
 * Layout that was measured on screen (a chart's width) cannot follow the
 * paper: `beforeprint` runs just ahead of the print layout, and what a
 * component sets from it is in place when that layout is taken.
 */
export function usePrintState(): PrintState {
  return useSyncExternalStore(subscribe, current, () => SERVER);
}
