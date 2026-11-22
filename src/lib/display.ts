'use client';

import { createContext, useContext } from 'react';
import { metricContextOf } from '@/data/metrics';
import { usePrefs } from '@/data/query/hooks';
import { costBasis, pnlOf, type MetricContext } from '@/domain/metrics/context';
import { rOf } from '@/domain/metrics/summary';
import { localDate } from '@/domain/time';
import type { Account, Cents, DisplayUnit, Trade } from '@/domain/types';
import { formatMoney, formatPnl, plural } from './format';

/** The units a figure can carry besides dollars and a percentage. */
type TradeUnit = 'r' | 'ticks' | 'pips' | 'points';

/**
 * One amount in every unit it has. `money` is always there; a unit it can't be
 * read in is `null` (or absent), and shows as dollars.
 */
export interface Figure {
  money: Cents;
  /** A 0..1 ratio: 0.0125 is 1.25%. */
  pct?: number | null;
  r?: number | null;
  ticks?: number | null;
  pips?: number | null;
  points?: number | null;
  /** Trades left out of the units that need a field they lack (an aggregate only). */
  leftOut?: number;
  /** The same count, per unit. */
  leftOutBy?: Partial<Record<TradeUnit, number>>;
}

export interface FormatOptions {
  unit: DisplayUnit;
  currency: string;
  /** `+` on gains and a minus on losses; unsigned for a balance or a target. */
  signed: boolean;
}

/** Rounds away binary noise: 0.00205 / 0.0001 is 20.499999999999996. */
const clean = (n: number) => Math.round(n * 1e6) / 1e6;

/** One trade in every unit. Ticks and points are futures', pips forex's; the rest are null. */
export function tradeFigure(t: Trade, ctx: MetricContext): Figure {
  const money = pnlOf(t, ctx.pnlBasis);
  const base = costBasis(t);
  const r = rOf(t, ctx.pnlBasis);
  const { instrument } = t;
  let points: number | null = null;
  if (t.avgExit !== undefined) {
    points = clean(
      (t.avgExit - t.avgEntry) * (t.direction === 'long' ? 1 : -1),
    );
  }
  const future = instrument.assetClass === 'future';
  const forex = instrument.assetClass === 'forex';
  const pip = instrument.quoteCurrency === 'JPY' ? 0.01 : 0.0001;
  return {
    money,
    pct: base > 0 ? money / base : null,
    r: r === undefined ? null : r,
    ticks:
      points !== null && future && instrument.tickSize > 0
        ? clean(points / instrument.tickSize)
        : null,
    pips: points !== null && forex ? clean(points / pip) : null,
    points: future ? points : null,
  };
}

const UNITS: readonly TradeUnit[] = ['r', 'ticks', 'pips', 'points'];

/** The figure's sum, its percentage over `pctBase` (null without one). A unit sums over the trades that have it; the others are counted as left out. */
export function sumFigures(
  figs: readonly Figure[],
  pctBase: Cents | null,
): Figure {
  const money = figs.reduce((n, f) => n + f.money, 0);
  const out: Figure = {
    money,
    pct: pctBase !== null && pctBase > 0 ? money / pctBase : null,
  };
  const leftOutBy: Partial<Record<TradeUnit, number>> = {};
  for (const u of UNITS) {
    const have = figs.flatMap((f) => f[u] ?? []);
    out[u] = have.length === 0 ? null : clean(have.reduce((a, b) => a + b, 0));
    leftOutBy[u] = figs.length - have.length;
  }
  out.leftOutBy = leftOutBy;
  out.leftOut = leftOutBy.r ?? 0;
  return out;
}

/** The average figure per trade: each unit over the trades that have it. */
export function meanFigure(
  figs: readonly Figure[],
  pctBase: Cents | null,
): Figure {
  const n = figs.length;
  if (n === 0) return { money: 0, pct: null };
  const sum = sumFigures(figs, pctBase);
  const money = Math.round(sum.money / n);
  const out: Figure = {
    ...sum,
    money,
    pct: pctBase !== null && pctBase > 0 ? money / pctBase : null,
  };
  for (const u of UNITS) {
    const have = figs.filter((f) => f[u] !== null && f[u] !== undefined).length;
    out[u] = sum[u] == null || have === 0 ? null : clean(sum[u] / have);
  }
  return out;
}

/** The figure's number in `unit`, or null when it has none (dollars always have one). */
export function unitValue(f: Figure, unit: DisplayUnit): number | null {
  switch (unit) {
    case 'dollar':
    case 'privacy':
      return f.money;
    case 'percent':
      return f.pct ?? null;
    default:
      return f[unit] ?? null;
  }
}

/** The unit a figure really shows in: its own, or dollars when it has no value there. */
export function shownUnit(f: Figure, unit: DisplayUnit): DisplayUnit {
  return unitValue(f, unit) === null ? 'dollar' : unit;
}

/** `+`, a minus (U+2212) or nothing for a number that rounds to zero. */
function signed(value: number, digits: number, on: boolean): string {
  const body = Math.abs(value).toFixed(digits);
  if (Number(body) === 0 || value === 0) return body;
  if (value < 0) return `−${body}`;
  return on ? `+${body}` : body;
}

/** The currency's own symbol, so Privacy hides a euro as it does a dollar. */
function symbolOf(currency: string): string {
  const part = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  })
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  return part?.value ?? currency;
}

/** A hidden amount keeps the sign: `+$•••`, `−$•••`, `$•••`. */
function hidden(money: Cents, currency: string, on: boolean): string {
  const sign = money < 0 ? '−' : money > 0 && on ? '+' : '';
  return `${sign}${symbolOf(currency)}•••`;
}

/** One value (cents for dollar and privacy, the unit's own number otherwise) as text. */
export function formatUnitValue(
  unit: DisplayUnit,
  value: number,
  o: { currency: string; signed: boolean },
): string {
  switch (unit) {
    case 'percent':
      return `${signed(value * 100, 2, o.signed)}%`;
    case 'r':
      return `${signed(value, 2, o.signed)}R`;
    case 'ticks':
      return `${signed(value, 1, o.signed)} ticks`;
    case 'pips':
      return `${signed(value, 1, o.signed)} pips`;
    case 'points':
      return `${signed(value, 1, o.signed)} pts`;
    case 'privacy':
      return hidden(Math.round(value), o.currency, o.signed);
    default: {
      const cents = Math.round(value);
      return o.signed || cents < 0
        ? formatPnl(cents, o.currency)
        : formatMoney(cents, o.currency);
    }
  }
}

/** The figure as text, and as the words a screen reader and a tooltip get. */
export function formatFigure(
  f: Figure,
  o: FormatOptions,
): { text: string; label: string } {
  if (o.unit === 'privacy')
    return {
      text: hidden(f.money, o.currency, o.signed),
      label: 'hidden amount',
    };
  const unit = shownUnit(f, o.unit);
  const text = formatUnitValue(unit, unitValue(f, unit)!, o);
  const out = leftOutIn(f, o.unit);
  return {
    text,
    label: out > 0 ? `${text}, ${out} ${plural(out, 'trade')} left out` : text,
  };
}

/**
 * What the percentage is measured against: the selected accounts' starting
 * balances plus the net they realized before the range began (the whole
 * history's start when the range is open). Null with no accounts, or no
 * capital. Cash flows are not in it yet.
 */
export function pctBaseOf(args: {
  accounts: readonly Account[];
  trades: readonly Trade[];
  /** Empty: every account. */
  accountIds: readonly string[];
  currency?: string;
  /** The range's first local date; undefined: open. */
  from?: string;
  timeZone?: string;
}): Cents | null {
  const chosen = args.accounts.filter(
    (a) =>
      (args.accountIds.length === 0 || args.accountIds.includes(a.id)) &&
      (args.currency === undefined || a.currency === args.currency),
  );
  if (chosen.length === 0) return null;
  const ids = new Set(chosen.map((a) => a.id));
  let base = chosen.reduce((n, a) => n + a.startingBalance, 0);
  const { from } = args;
  if (from !== undefined)
    for (const t of args.trades) {
      if (!ids.has(t.accountId) || t.status !== 'closed' || !t.closedAt)
        continue;
      if (localDate(t.closedAt, args.timeZone ?? 'UTC') < from) base += t.net;
    }
  return base > 0 ? base : null;
}

/** What a view hands the figures under it: the trades behind them, the metrics context and the percentage's base. */
export interface FigureSource {
  tradesById: ReadonlyMap<string, Trade>;
  ctx: MetricContext;
  pctBase: Cents | null;
}
export const FigureSourceContext = createContext<FigureSource | null>(null);

/** A number counted toward by a ticker, and how it reads on each frame. */
export interface TickerSpec {
  value: number;
  format: (value: number) => string;
}

export interface Display {
  unit: DisplayUnit;
  /** The figure as text and label; `currency` defaults to the base currency. */
  figure(
    f: Figure,
    signed?: boolean,
    currency?: string,
  ): { text: string; label: string };
  /** A bare amount: in a percentage it is over the base, elsewhere dollars. */
  cash(
    cents: Cents,
    signed?: boolean,
    currency?: string,
  ): { text: string; label: string };
  /** The figure for a set of closed trades, by id, with `money` as the view reports it. */
  ofTrades(ids: readonly string[], money: Cents): Figure;
  /** The figure for one trade. */
  ofTrade(t: Trade): Figure;
  /** The figure for every closed trade the view holds, with `money` as it reports. */
  ofAll(money: Cents): Figure;
  /** The mean figure of every closed trade the view holds, with `money` as reported. */
  meanOfAll(money: Cents): Figure;
  /** The figure as a count-up's number and its formatter. */
  ticker(f: Figure, currency?: string): TickerSpec;
}

const allOf = (source: FigureSource | null): Trade[] => [
  ...(source?.tradesById.values() ?? []),
];

const closedFigures = (trades: readonly Trade[], ctx: MetricContext) =>
  trades.filter((t) => t.status === 'closed').map((t) => tradeFigure(t, ctx));

/** The view's own total wins over the sum of its trades; the units follow the same trades. */
function withMoney(f: Figure, money: Cents, pctBase: Cents | null): Figure {
  return {
    ...f,
    money,
    pct: pctBase !== null && pctBase > 0 ? money / pctBase : null,
  };
}

/**
 * The average per closed trade in `unit`, for a trend line's windows; null
 * when no trade has the unit. Dollars and Privacy read the summary's own
 * expectancy, so this is for the others.
 */
export function meanInUnit(
  trades: readonly Trade[],
  unit: DisplayUnit,
  ctx: MetricContext,
  pctBase: Cents | null,
): number | null {
  const closed = closedFigures(trades, ctx);
  return closed.length === 0
    ? null
    : unitValue(meanFigure(closed, pctBase), unit);
}

/** The chosen unit, and the figures it formats. Reads the prefs and the view's `FigureSourceContext`. */
export function useDisplay(): Display {
  const prefs = usePrefs().data;
  const source = useContext(FigureSourceContext);
  const unit: DisplayUnit = prefs?.displayUnit ?? 'dollar';
  const base = prefs?.baseCurrency ?? 'USD';
  const ctx =
    source?.ctx ??
    (prefs
      ? metricContextOf(prefs)
      : {
          timeZone: 'UTC',
          pnlBasis: 'net' as const,
          breakevenRange: { unit: 'amount' as const, from: 0, to: 0 },
        });
  const pctBase = source?.pctBase ?? null;
  const figure: Display['figure'] = (f, signed = true, currency = base) =>
    formatFigure(f, { unit, currency, signed });
  return {
    unit,
    figure,
    cash: (cents, signed, currency) =>
      figure(
        { money: cents, pct: pctBase ? cents / pctBase : null },
        signed,
        currency,
      ),
    ofTrades(ids, money) {
      const trades = ids.flatMap((id) => source?.tradesById.get(id) ?? []);
      return withMoney(
        sumFigures(closedFigures(trades, ctx), pctBase),
        money,
        pctBase,
      );
    },
    ofTrade: (t) => tradeFigure(t, ctx),
    ofAll: (money) =>
      withMoney(
        sumFigures(closedFigures(allOf(source), ctx), pctBase),
        money,
        pctBase,
      ),
    meanOfAll: (money) =>
      withMoney(
        meanFigure(closedFigures(allOf(source), ctx), pctBase),
        money,
        pctBase,
      ),
    ticker(f, currency = base) {
      const shown = shownUnit(f, unit);
      return {
        value: unitValue(f, shown)!,
        format: (v) => formatUnitValue(shown, v, { currency, signed: true }),
      };
    },
  };
}

/** How many trades a figure leaves out of the unit it is read in; 0 where it shows in dollars. */
export function leftOutIn(f: Figure, unit: DisplayUnit): number {
  const shown = shownUnit(f, unit);
  return shown === 'r' ||
    shown === 'ticks' ||
    shown === 'pips' ||
    shown === 'points'
    ? (f.leftOutBy?.[shown] ?? f.leftOut ?? 0)
    : 0;
}
