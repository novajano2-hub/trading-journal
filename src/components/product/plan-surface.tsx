import type { ReactNode } from 'react';

/**
 * The app's one coloured surface, the "Your plan" card: ultramarine lit from
 * the top left, an inner highlight on its top edge, a brand shadow. It stays
 * ultramarine in either theme, so its colours are the brand's own, not tokens
 * that follow the theme. Add padding at the call site.
 */
export const PLAN_SURFACE =
  'relative flex flex-col overflow-hidden rounded-card bg-[#2b35af] bg-[linear-gradient(155deg,#3440c2_0%,#2b35af_45%,#232b98_100%)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),var(--shadow-hero)]';

/**
 * The band along the plan surface's foot: what the broken rules cost. It
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
      className={`mt-auto flex min-h-[54px] items-center justify-between gap-4 border-t border-white/10 bg-[rgb(10_14_70/0.22)] py-3 text-[13.5px] text-on-accent-muted ${bleed}`}
    >
      {label}
      <b className="text-[21px] font-semibold tracking-[-0.02em] text-on-accent-loss tnum">
        {children}
      </b>
    </p>
  );
}
