import type { CalendarDay, UnitSums } from '@/data/calendar';
import type { CalendarStat, Cents } from '@/domain/types';
import { formatUnitValue } from './display';
import { formatPct, plural } from './format';

/*
 * The lines a calendar day stacks, as text: the grid's cell and the Calendar
 * image write the same ones from here, so the picture cannot drift from the
 * grid. It holds no React nodes (the lines are text; the grid puts its own nodes
 * on top of them), but it still imports the display helpers, so it is not
 * free of the display hooks' module.
 */

/** A figure as text and label; the view builds it from the display unit. */
export type FormatMoney = (
  money: Cents,
  r?: number | null,
  /** A short figure for the phone's small cell: `+1.1k`. */
  compact?: boolean,
  /** The ticks, pips and points of the day, week or month, so it reads in those display units. */
  units?: UnitSums,
) => { text: string; label: string };

export const STAT_LABELS: Record<CalendarStat, string> = {
  net: 'Net P&L',
  trades: 'Trades',
  winRate: 'Win rate',
  rating: 'Day rating',
  r: 'R',
  fees: 'Fees',
  ticks: 'Ticks',
  pips: 'Pips',
  points: 'Points',
};

/** One decimal: 4.3. */
export const ratingText = (rating: number): string => rating.toFixed(1);

export interface TextLine {
  key: CalendarStat;
  /** Money and R take the day's tone; counts stay quiet. */
  toned: boolean;
  /** The short form (`+1.1k`, `+64t`), for the phone's small cell and for a line under the lead in a narrow cell. */
  compact?: string;
  /** The full value as plain text, to tell whether it fits a narrow cell. */
  text: string;
  /** The full value in words: the cell's tooltip and its accessible label. */
  label: string;
  /** Money lines: the figure the line is made of, which a view can set with its own markup (`text` carries the line's other words too: "… fees"). */
  figure?: { text: string; label: string };
}

/** The lines a day's cell stacks, in the order of the chosen stats. */
export function textLinesOf(
  day: CalendarDay,
  stats: readonly CalendarStat[],
  fmt: FormatMoney,
  currency: string,
): TextLine[] {
  return stats.flatMap<TextLine>((key) => {
    switch (key) {
      case 'net': {
        const full = fmt(day.net, day.r, false, day);
        return [
          {
            key,
            toned: true,
            figure: full,
            text: full.text,
            compact: fmt(day.net, day.r, true, day).text,
            label: full.label,
          },
        ];
      }
      case 'trades': {
        const text = `${day.trades} ${plural(day.trades, 'trade')}`;
        return [{ key, toned: false, text, label: text }];
      }
      case 'winRate': {
        const decided = day.wins + day.losses;
        if (decided === 0) return [];
        const rate = formatPct(day.wins / decided);
        return [
          {
            key,
            toned: false,
            text: `${rate} win rate`,
            compact: `${rate} win`,
            label: `${rate} win rate`,
          },
        ];
      }
      case 'rating': {
        // Nothing rated, nothing shown: the cell omits the line.
        if (day.rating === null) return [];
        const text = `${ratingText(day.rating)}★`;
        return [
          {
            key,
            toned: false,
            text,
            label: `Day rating ${ratingText(day.rating)} of 5`,
          },
        ];
      }
      case 'r': {
        if (day.r === null) return [];
        const full = formatUnitValue('r', day.r, { currency, signed: true });
        return [
          {
            key,
            toned: true,
            text: full,
            compact: formatUnitValue('r', day.r, {
              currency,
              signed: true,
              compact: true,
            }),
            label: full,
          },
        ];
      }
      case 'ticks':
      case 'pips':
      case 'points': {
        const value = day[key];
        // A day without an eligible trade says None, never a dash.
        if (value === null)
          return [
            {
              key,
              toned: false,
              text: 'None',
              compact: 'None',
              label: `${STAT_LABELS[key]}: None`,
            },
          ];
        const full = formatUnitValue(key, value, { currency, signed: true });
        return [
          {
            key,
            toned: true,
            text: full,
            compact: formatUnitValue(key, value, {
              currency,
              signed: true,
              compact: true,
            }),
            label: full,
          },
        ];
      }
      case 'fees': {
        const full = fmt(-day.fees);
        return [
          {
            key,
            toned: false,
            figure: full,
            text: `${full.text} fees`,
            compact: `${fmt(-day.fees, null, true).text} fees`,
            label: `${full.label} fees`,
          },
        ];
      }
    }
  });
}
