'use client';

import { FigureText } from '@/components/product/figure-text';
import { useDisplay } from '@/lib/display';
import { CARD, CARD_PAD } from '../dashboard/shared';

/** A card of the dashboard's grid: a section named by its heading. */
export const PANEL = `${CARD} ${CARD_PAD} flex min-w-0 flex-col`;

/** A money figure, signed or not, as the display shows it: hidden under Privacy, in the base currency, never in a percentage. */
export function Cash({
  cents,
  signed = true,
}: {
  cents: number;
  signed?: boolean;
}): React.JSX.Element {
  const display = useDisplay();
  return <FigureText f={display.cash(cents, signed)} />;
}

/** A rate as a thin track with its fill, for a share of one (the comp's `trk`). Decorative: the words beside it say the same. */
export function Track({
  share,
}: {
  /** 0 to 1. */
  share: number;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="relative block h-1.5 overflow-hidden rounded-[3px] bg-accent-soft [[data-theme=dark]_&]:bg-line"
    >
      <i
        className="absolute inset-y-0 left-0 block rounded-[3px] bg-accent"
        style={{
          width: `${(Math.min(1, Math.max(0, share)) * 100).toFixed(1)}%`,
        }}
      />
    </span>
  );
}
