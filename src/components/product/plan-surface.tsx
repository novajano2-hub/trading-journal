import type { ReactNode } from 'react';

/**
 * The app's "Your plan" card for a product shot: a white card like the rest
 * (no coloured panel), with a cost band at its foot. Add padding at the call
 * site.
 */
export const PLAN_SURFACE =
  'relative flex flex-col overflow-hidden rounded-card border border-line bg-surface-1 text-text shadow-[var(--shadow-card)]';

/**
 * The band along the plan card's foot: what the broken rules cost. It
 * bleeds to the surface's edges, so pass the surface's side padding as
 * `bleed` (for example `-mx-5 px-5`).
 */
export function CostBand({
  label,
  children,
  bleed,
}: {
  label: string;
  children: ReactNode;
  bleed: string;
}) {
  return (
    <p
      className={`mt-auto flex min-h-[54px] items-center justify-between gap-4 border-t border-line bg-sunken/60 py-3 text-[13.5px] text-muted ${bleed}`}
    >
      {label}
      <b className="text-[21px] font-semibold tracking-[-0.02em] text-loss tnum">
        {children}
      </b>
    </p>
  );
}
