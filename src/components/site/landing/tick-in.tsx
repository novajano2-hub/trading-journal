'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useInView, useReducedMotion } from 'motion/react';

/**
 * Ticks the `[data-tick-row]` rows inside it in, one after another, the first
 * time it is seen. It arms itself after hydration (on the element, not in
 * state), so with no script, or under reduced motion, the rows are simply there.
 */
export function TickIn({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const seen = useInView(ref, { once: true, amount: 0.5 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) el.removeAttribute('data-tick-armed');
    else el.setAttribute('data-tick-armed', '');
  }, [reduced]);
  return (
    <div ref={ref} data-tick-in={seen ? '' : undefined}>
      {children}
    </div>
  );
}
