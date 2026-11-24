'use client';

import { createContext, useContext } from 'react';
import { metricContextOf } from '@/data/metrics';
import { usePrefs } from '@/data/query/hooks';
import { balanceAt, dayBefore } from '@/domain/metrics/balance';
import {
  classify,
  costBasis,
  pnlOf,
  type MetricContext,
} from '@/domain/metrics/context';
import { expectancyOf, type Side } from '@/domain/metrics/summary';
import {
  TRADE_UNITS,
  tradeUnits,
  type TradeUnit,
} from '@/domain/metrics/units';
import type {
  Account,
  CashFlow,
  Cents,
  DisplayUnit,
  Trade,
} from '@/domain/types';
import { formatMoney, formatPnl, plural } from './format';

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
  /** A short figure for a small cell: `+1.1k`, `−388`. The label keeps the full one. */
  compact?: boolean;
}

/** Rounds away binary noise: 0.00205 / 0.0001 is 20.499999999999996. */
const clean = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * One trade in every unit (`tradeUnits`): ticks and points are futures',
 * pips forex's, R needs an initial risk; the rest are null. Ticks and points
 * count every contract the trade closed; pips are per lot.
 */
export function tradeFigure(t: Trade, ctx: MetricContext): Figure {
  const money = pnlOf(t, ctx.pnlBasis);
  const base = costBasis(t);
  return {
    money,
    pct: base > 0 ? money / base : null,
    ...tradeUnits(t, ctx.pnlBasis),
  };
}

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
  for (const u of TRADE_UNITS) {
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
  for (const u of TRADE_UNITS) {
    const have = figs.filter((f) => f[u] !== null && f[u] !== undefined).length;
    out[u] = sum[u] == null || have === 0 ? null : clean(sum[u] / have);
  }
  return out;
}

/**
 * Expectancy as a figure, in every unit: `expectancyOf` over the decided
 * closed trades (wins and losses as `classify` calls them, breakevens left
 * out), each unit over the decided trades that have it. `money` is the
 * summary's own expectancy. The one expectancy every page shows, so no page
 * reads the average trade and calls it expectancy.
 */
export function expectancyFigure(
  trades: readonly Trade[],
  ctx: MetricContext,
  pctBase: Cents | null,
  money: Cents,
): Figure {
  const decided = trades.flatMap((t) => {
    if (t.status !== 'closed') return [];
    const { outcome } = classify(t, ctx);
    return outcome === 'breakeven'
      ? []
      : [{ win: outcome === 'win', units: tradeUnits(t, ctx.pnlBasis) }];
  });
  const out: Figure = {
    money,
    pct: pctBase !== null && pctBase > 0 ? money / pctBase : null,
  };
  const leftOutBy: Partial<Record<TradeUnit, number>> = {};
  for (const u of TRADE_UNITS) {
    const won: Side = { n: 0, sum: 0 };
    const lost: Side = { n: 0, sum: 0 };
    for (const d of decided) {
      const v = d.units[u];
      if (v === null) continue;
      const side = d.win ? won : lost;
      side.n += 1;
      side.sum += v;
    }
    const e = expectancyOf(won, lost);
    out[u] = e === null ? null : clean(e);
    leftOutBy[u] = decided.length - won.n - lost.n;
  }
  out.leftOutBy = leftOutBy;
  out.leftOut = leftOutBy.r ?? 0;
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

/** `+`, a minus (U+2212) or nothing for a number that rounds to zero; thousands grouped, as money is. */
function signed(value: number, digits: number, on: boolean): string {
  const fixed = Math.abs(value).toFixed(digits);
  const body = Number(fixed).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (Number(fixed) === 0 || value === 0) return body;
  if (value < 0) return `−${body}`;
  return on ? `+${body}` : body;
}

/** Whole dollars to three figures: 388, 1.1k, 12k, 2.5M. No symbol: the cell's tone and the label carry it. */
function compactCents(cents: Cents, on: boolean): string {
  const dollars = Math.abs(cents) / 100;
  const short = (n: number, unit: string) =>
    `${n.toFixed(n < 10 ? 1 : 0).replace(/\.0$/, '')}${unit}`;
  const body =
    dollars >= 999_500
      ? short(dollars / 1_000_000, 'M')
      : dollars >= 999.5
        ? short(dollars / 1000, 'k')
        : String(Math.round(dollars));
  if (body === '0') return '0';
  return cents < 0 ? `−${body}` : on ? `+${body}` : body;
}

/**
 * A tick, pip or point count to three figures for a small cell: 64, 12.5,
 * 1.2k. The suffix (t, p, pt) goes after it; the full figure stays in the label.
 */
function compactUnit(value: number, on: boolean): string {
  const abs = Math.abs(value);
  const body =
    abs >= 999.5
      ? `${(abs / 1000).toFixed(abs < 9950 ? 1 : 0).replace(/\.0$/, '')}k`
      : abs >= 100
        ? String(Math.round(abs))
        : String(Number(abs.toFixed(1)));
  if (body === '0') return '0';
  return value < 0 ? `−${body}` : on ? `+${body}` : body;
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
  o: { currency: string; signed: boolean; compact?: boolean },
): string {
  switch (unit) {
    case 'percent':
      return `${signed(value * 100, o.compact ? 1 : 2, o.signed)}%`;
    case 'r':
      return `${signed(value, o.compact ? 1 : 2, o.signed)}R`;
    case 'ticks':
      return o.compact
        ? `${compactUnit(value, o.signed)}t`
        : `${signed(value, 1, o.signed)} ticks`;
    case 'pips':
      return o.compact
        ? `${compactUnit(value, o.signed)}p`
        : `${signed(value, 1, o.signed)} pips`;
    case 'points':
      return o.compact
        ? `${compactUnit(value, o.signed)}pt`
        : `${signed(value, 1, o.signed)} pts`;
    case 'privacy':
      return hidden(Math.round(value), o.currency, o.signed);
    default: {
      const cents = Math.round(value);
      if (o.compact) return compactCents(cents, o.signed);
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
  const value = unitValue(f, unit)!;
  const full = formatUnitValue(unit, value, { ...o, compact: false });
  const out = leftOutIn(f, o.unit);
  return {
    text: o.compact ? formatUnitValue(unit, value, o) : full,
    label: out > 0 ? `${full}, ${out} ${plural(out, 'trade')} left out` : full,
  };
}

/**
 * What the percentage is measured against: the selected accounts' balance the
 * day before the range began (their starting balances, the deposits and
 * withdrawals dated before it and the net their exits realized before it; the
 * starting balances alone when the range is open). Only active accounts
 * count unless some are picked, and then those, archived or not. Null with
 * no accounts, or no capital.
 */
export function pctBaseOf(args: {
  accounts: readonly Account[];
  flows: readonly CashFlow[];
  trades: readonly Trade[];
  /** Empty: every active account. */
  accountIds: readonly string[];
  currency?: string;
  /** The range's first local date; undefined: open. */
  from?: string;
  timeZone?: string;
}): Cents | null {
  const picked = new Set(args.accountIds);
  const chosen = args.accounts.filter(
    (a) =>
      (picked.size === 0 ? a.status === 'active' : picked.has(a.id)) &&
      (args.currency === undefined || a.currency === args.currency),
  );
  if (chosen.length === 0) return null;
  const { from } = args;
  const base =
    from === undefined
      ? chosen.reduce((n, a) => n + a.startingBalance, 0)
      : balanceAt(chosen, args.flows, args.trades, dayBefore(from), {
          timeZone: args.timeZone ?? 'UTC',
        });
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
  /** What a screen reader gets for the final figure. */
  label: string;
}

export interface Display {
  unit: DisplayUnit;
  /** The figure as text and label; `currency` defaults to the base currency. */
  figure(
    f: Figure,
    signed?: boolean,
    currency?: string,
    /** A short figure for a small cell: `+1.1k`. Privacy still shows `+$•••`. */
    compact?: boolean,
  ): { text: string; label: string };
  /** A bare amount: in a percentage it is over the base, elsewhere dollars. */
  cash(
    cents: Cents,
    signed?: boolean,
    currency?: string,
  ): { text: string; label: string };
  /** The figure for a set of closed trades, by id, with `money` as the view reports it. */
  ofTrades(ids: readonly string[], money: Cents): Figure;
  /** The mean figure of a set of closed trades, by id, with `money` as the view reports the average. */
  meanOfTrades(ids: readonly string[], money: Cents): Figure;
  /** The figure for one trade. */
  ofTrade(t: Trade): Figure;
  /** The figure for every closed trade the view holds, with `money` as it reports. */
  ofAll(money: Cents): Figure;
  /** The mean figure of every closed trade the view holds, with `money` as reported. */
  meanOfAll(money: Cents): Figure;
  /**
   * The expectancy of a set of closed trades, by id (every one the view holds
   * without `ids`), with `money` as the summary reports it: `expectancyFigure`.
   */
  expectancy(money: Cents, ids?: readonly string[]): Figure;
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
 * A trend window's expectancy in `unit` (`expectancyFigure`), from the
 * window's own summary expectancy; null when it has none or no decided
 * trade has the unit. Dollars and Privacy read the summary's own, so this is
 * for the others.
 */
export function expectancyInUnit(
  trades: readonly Trade[],
  money: Cents | null,
  unit: DisplayUnit,
  ctx: MetricContext,
  pctBase: Cents | null,
): number | null {
  if (money === null) return null;
  return unitValue(expectancyFigure(trades, ctx, pctBase, money), unit);
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
  const figure: Display['figure'] = (
    f,
    signed = true,
    currency = base,
    compact = false,
  ) => formatFigure(f, { unit, currency, signed, compact });
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
    meanOfTrades(ids, money) {
      const trades = ids.flatMap((id) => source?.tradesById.get(id) ?? []);
      return withMoney(
        meanFigure(closedFigures(trades, ctx), pctBase),
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
    expectancy: (money, ids) =>
      expectancyFigure(
        ids === undefined
          ? allOf(source)
          : ids.flatMap((id) => source?.tradesById.get(id) ?? []),
        ctx,
        pctBase,
        money,
      ),
    ticker(f, currency = base) {
      const shown = shownUnit(f, unit);
      return {
        value: unitValue(f, shown)!,
        format: (v) => formatUnitValue(shown, v, { currency, signed: true }),
        label: figure(f, true, currency).label,
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
