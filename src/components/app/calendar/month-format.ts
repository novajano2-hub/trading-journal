import type { Cents } from '@/domain/types';
import type { Display } from '@/lib/display';
import type { FormatMoney } from './month-grid';

/**
 * A figure of a day, week, month or year in the display unit: the amount as
 * the unit reads it (a share of `pctBase` under Percentage, its R, ticks, pips
 * or points when the day carries them), through `display` so Privacy hides it.
 * `pctBase` is the balance the month's or year's first day began with.
 */
export function monthFormat(
  display: Display,
  pctBase: Cents | null,
  currency: string,
): FormatMoney {
  return (money, r, compact, units) =>
    display.figure(
      {
        money,
        pct: pctBase ? money / pctBase : null,
        r: r ?? null,
        ticks: units?.ticks ?? null,
        pips: units?.pips ?? null,
        points: units?.points ?? null,
      },
      true,
      currency,
      compact,
    );
}
