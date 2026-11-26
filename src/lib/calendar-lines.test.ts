import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { CalendarDay } from '@/data/calendar';
import type { CalendarStat } from '@/domain/types';
import {
  ratingText,
  STAT_LABELS,
  textLinesOf,
  type FormatMoney,
} from './calendar-lines';

const dollars = (c: number) =>
  `${c < 0 ? '−' : c > 0 ? '+' : ''}$${(Math.abs(c) / 100).toFixed(2)}`;

/** The figures as a plain dollar display writes them; the short form adds a "k". */
const fmt: FormatMoney = (money, _r, compact) => {
  const text = compact ? `${dollars(money)}k` : dollars(money);
  return { text, label: `${text} net` };
};

const day = (over: Partial<CalendarDay> = {}): CalendarDay => ({
  date: '2026-11-04',
  net: 20_000,
  gross: 20_500,
  fees: 500,
  trades: 2,
  volume: 4,
  profitFactor: null,
  wins: 1,
  losses: 1,
  r: 1.5,
  tone: 'gain',
  hasNote: false,
  ticks: 12,
  pips: null,
  points: null,
  rating: 4.3,
  ...over,
});

const lines = (stats: CalendarStat[], over: Partial<CalendarDay> = {}) =>
  textLinesOf(day(over), stats, fmt, 'USD');

describe('textLinesOf', () => {
  test('stacks the chosen stats in the order given, each with its key', () => {
    expect(lines(['trades', 'net', 'winRate']).map((l) => l.key)).toEqual([
      'trades',
      'net',
      'winRate',
    ]);
  });

  test('net is a toned money line with a short form and the figure it is made of', () => {
    const [net] = lines(['net']);
    expect(net).toEqual({
      key: 'net',
      toned: true,
      text: '+$200.00',
      label: '+$200.00 net',
      compact: '+$200.00k',
      figure: { text: '+$200.00', label: '+$200.00 net' },
    });
  });

  test('counts and rates are quiet; a day nobody decided has no win rate; an unrated day no rating', () => {
    const [trades, rate, stars] = lines(['trades', 'winRate', 'rating']);
    expect(trades).toEqual({
      key: 'trades',
      toned: false,
      text: '2 trades',
      label: '2 trades',
    });
    expect(rate).toMatchObject({
      toned: false,
      text: '50% win rate',
      compact: '50% win',
    });
    expect(stars).toMatchObject({
      text: '4.3★',
      label: 'Day rating 4.3 of 5',
    });
    expect(lines(['winRate'], { wins: 0, losses: 0 })).toEqual([]);
    expect(lines(['rating'], { rating: null })).toEqual([]);
  });

  test('R and the units read in their own words; a day without the unit says None, never a dash', () => {
    const [r, ticks, pips] = lines(['r', 'ticks', 'pips']);
    expect(r).toMatchObject({ toned: true, text: '+1.50R', compact: '+1.5R' });
    expect(ticks).toMatchObject({ toned: true, text: '+12.0 ticks' });
    expect(pips).toEqual({
      key: 'pips',
      toned: false,
      text: 'None',
      compact: 'None',
      label: `${STAT_LABELS.pips}: None`,
    });
    expect(lines(['r'], { r: null })).toEqual([]);
  });

  test('fees read as a figure and the word fees', () => {
    const [fees] = lines(['fees']);
    expect(fees).toMatchObject({
      key: 'fees',
      toned: false,
      text: '−$5.00 fees',
      label: '−$5.00 net fees',
      figure: { text: '−$5.00', label: '−$5.00 net' },
    });
  });

  test('a rating is read to one decimal', () => {
    expect(ratingText(4)).toBe('4.0');
  });
});

/** Every file under `dir` that is source, not a test or a fixture. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === '__fixtures__' ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

test("nothing in src/lib imports from the components: the Calendar image shares the grid's lines through a pure module", () => {
  const importing = sources('src/lib').filter((file) =>
    /from\s+['"](@\/components\/|(\.\.\/)+components\/)/.test(
      readFileSync(file, 'utf8'),
    ),
  );
  expect(importing).toEqual([]);
});
