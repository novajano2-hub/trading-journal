import { roundHalfEven } from '../money';
import { plannedRMultiple } from '../risk';
import { isClosed } from '../trade-status';
import type { Cents, Trade } from '../types';
import {
  classify,
  costBasis,
  type MetricContext,
  type PnlBasis,
} from './context';
import { rOf, unitOf, type TradeUnit } from './units';

export { rOf } from './units';

/** `netPnl`/`grossPnl` are always the true net and gross totals; `basis` says which one every other figure uses. */
export interface Summary {
  closedCount: number;
  openCount: number;
  wins: number;
  losses: number;
  breakevens: number;
  netPnl: Cents;
  grossPnl: Cents;
  fees: Cents;
  /** Which P&L every classification, sum and ratio below is computed on. */
  basis: PnlBasis;
  winRate: number | null;
  /** Total won over total lost, on the basis P&L; in `ctx.unit` when the context has one. */
  profitFactor: number | null;
  avgWin: Cents | null;
  avgLoss: Cents | null;
  /** The average win over the size of the average loss; in `ctx.unit` when the context has one. */
  winLossRatio: number | null;
  expectancy: Cents | null;
  avgRealizedR: number | null;
  realizedRTradeCount: number;
  noRiskCount: number;
  avgPlannedR: number | null;
  plannedRTradeCount: number;
  largestWin: Cents | null;
  largestLoss: Cents | null;
  ruleAdherence: number | null;
  /** Net P&L over capital committed (cost basis), summed over closed trades; null with no cost basis. Always net. */
  netRoi: number | null;
  /** Sorted distinct pnlCurrency values of the closed trades; more than one means the set is mixed. */
  currencies: string[];
}

/**
 * Planned R: planned reward over planned risk, from `domain/risk`. A trade
 * saved before levels reads as it always did, |target - entry| / |entry - stop|,
 * and needs a target and a stop distinct from the entry.
 */
export function plannedR(trade: Trade): number | undefined {
  return plannedRMultiple(trade);
}

export { riskFromStop } from '../risk';

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);

/** Rounds away binary noise: lots of 1.8 and 1.5 are 3.3, not 3.3000000000000003. */
const clean = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * A trade's volume: its quantity counted once, the contracts, lots or shares
 * its opening fills bought or sold, not every fill (Part 2 ruling). A trade
 * with no fills counts its size.
 */
export function tradeVolume(t: Trade): number {
  if (t.executions.length === 0) return t.maxPosition;
  return clean(
    t.executions.reduce(
      (n, e) =>
        (e.side === 'buy') === (t.direction === 'long') ? n + e.qty : n,
      0,
    ),
  );
}

/**
 * The average trade P&L: a total over its closed trades, rounded half to even
 * to the cent. The one figure behind the Overview, the breakdown tables and
 * the Average trade P&L series. Null with no trade.
 */
export function averageTradePnl(total: Cents, count: number): Cents | null {
  return count === 0 ? null : roundHalfEven(total / count);
}

/** The volume of a set: each trade's quantity, counted once, open trades included. */
export function volumeOf(trades: readonly Trade[]): number {
  return clean(trades.reduce((n, t) => n + tradeVolume(t), 0));
}

/**
 * Total won over total lost: null without a loss, or when the losses do not
 * total below zero. The one profit factor for a set of results the caller has
 * already classified, in dollars or in a unit.
 */
export function profitFactorOf(
  won: readonly number[],
  lost: readonly number[],
): number | null {
  const lostSum = sum(lost);
  return lost.length === 0 || lostSum >= 0 ? null : sum(won) / -lostSum;
}

/** A side of a set's decided trades: how many, and their results summed. */
export interface Side {
  n: number;
  sum: number;
}

/**
 * Expectancy: win rate times average win, plus loss rate times average loss
 * (a negative number), over the decided trades, breakevens left out. The one
 * expectancy, in dollars or in a unit: the wins and losses are the results
 * `classify` decided, summed in whatever the caller reads them. Null with no
 * decided trade.
 */
export function expectancyOf(won: Side, lost: Side): number | null {
  const decided = won.n + lost.n;
  if (decided === 0) return null;
  return (
    (won.n / decided) * (won.n === 0 ? 0 : won.sum / won.n) +
    (lost.n / decided) * (lost.n === 0 ? 0 : lost.sum / lost.n)
  );
}

/**
 * The expectancy of the closed trades in a trade unit: `expectancyOf` over
 * their values in it, the wins and losses as `classify` calls them on their
 * P&L. A decided trade without a value in the unit is left out; null with
 * none left.
 */
export function expectancyIn(
  trades: readonly Trade[],
  ctx: MetricContext,
  unit: TradeUnit,
): number | null {
  const won: Side = { n: 0, sum: 0 };
  const lost: Side = { n: 0, sum: 0 };
  for (const t of trades) {
    if (!isClosed(t)) continue;
    const { outcome } = classify(t, ctx);
    if (outcome === 'breakeven') continue;
    const v = unitOf(t, unit, ctx.pnlBasis);
    if (v === null) continue;
    const side = outcome === 'win' ? won : lost;
    side.n += 1;
    side.sum += v;
  }
  return expectancyOf(won, lost);
}

/**
 * Total won over total lost and the average win over the average loss, in a
 * trade unit. Wins and losses are the trades `classify` calls so, on their
 * P&L, as for the win rate; their values are read in the unit. A loss total
 * that is not below zero has no profit factor.
 */
function unitRatios(
  wins: readonly Trade[],
  losses: readonly Trade[],
  unit: TradeUnit,
  basis: PnlBasis,
): { profitFactor: number | null; winLossRatio: number | null } {
  const values = (ts: readonly Trade[]) =>
    ts.flatMap((t) => unitOf(t, unit, basis) ?? []);
  const won = values(wins);
  const lost = values(losses);
  const lostSum = sum(lost);
  const avgWin = ratio(sum(won), won.length);
  const avgLoss = ratio(lostSum, lost.length);
  return {
    profitFactor: profitFactorOf(won, lost),
    winLossRatio:
      avgWin === null || avgLoss === null || avgLoss >= 0
        ? null
        : avgWin / -avgLoss,
  };
}

/**
 * Under `ctx.unit`, the closed trade `classify` calls a win (or a loss) that is
 * largest in that unit: the most ticks won, or lost. Undefined without a unit
 * or without such a trade. In money the summary's `largestWin` and
 * `largestLoss` say it; a unit can rank the trades otherwise (a five-lot win in
 * ticks against a one-lot win in dollars).
 */
export function largestInUnit(
  trades: readonly Trade[],
  ctx: MetricContext,
  outcome: 'win' | 'loss',
): Trade | undefined {
  const { unit } = ctx;
  if (!unit) return undefined;
  let best: { t: Trade; v: number } | undefined;
  for (const t of trades) {
    if (!isClosed(t) || classify(t, ctx).outcome !== outcome) continue;
    const v = unitOf(t, unit, ctx.pnlBasis);
    if (v === null) continue;
    if (!best || (outcome === 'win' ? v > best.v : v < best.v)) best = { t, v };
  }
  return best?.t;
}

/**
 * The closed trade `classify` calls a win (or a loss) with the largest result:
 * in `ctx.unit` the most ticks, pips, points or R, otherwise the highest (or
 * lowest) P&L on the basis. The trade itself, so a link can name it by id.
 */
export function largestTrade(
  trades: readonly Trade[],
  ctx: MetricContext,
  outcome: 'win' | 'loss',
): Trade | undefined {
  if (ctx.unit) return largestInUnit(trades, ctx, outcome);
  let best: { t: Trade; v: number } | undefined;
  for (const t of trades) {
    if (!isClosed(t)) continue;
    const c = classify(t, ctx);
    if (c.outcome !== outcome) continue;
    if (!best || (outcome === 'win' ? c.value > best.v : c.value < best.v))
      best = { t, v: c.value };
  }
  return best?.t;
}

/**
 * Aggregate closed trades. The input must be a single-currency set (the data layer
 * partitions by pnlCurrency first); `currencies` lets the UI warn when it is not.
 */
export function summarize(
  trades: readonly Trade[],
  ctx: MetricContext,
): Summary {
  const closed = trades.filter(isClosed);
  const classified = closed.map((t) => classify(t, ctx));
  const inUnit = ctx.unit
    ? unitRatios(
        closed.filter((_, i) => classified[i]!.outcome === 'win'),
        closed.filter((_, i) => classified[i]!.outcome === 'loss'),
        ctx.unit,
        ctx.pnlBasis,
      )
    : undefined;
  const winNets = classified
    .filter((c) => c.outcome === 'win')
    .map((c) => c.value);
  const lossNets = classified
    .filter((c) => c.outcome === 'loss')
    .map((c) => c.value);
  const wins = winNets.length;
  const losses = lossNets.length;

  const winSum = sum(winNets);
  const lossSum = sum(lossNets);
  const avgWinRaw = ratio(winSum, wins);
  const avgLossRaw = ratio(lossSum, losses);

  const rs = closed
    .map((t) => rOf(t, ctx.pnlBasis))
    .filter((r): r is number => r !== undefined);
  const planned = closed
    .map(plannedR)
    .filter((r): r is number => r !== undefined);
  const checks = closed
    .flatMap((t) => t.ruleChecks)
    .filter((c) => c.followed !== null);
  const followed = checks.filter((c) => c.followed === true).length;
  const decisive = wins + losses;
  const expectancy = expectancyOf(
    { n: wins, sum: winSum },
    { n: losses, sum: lossSum },
  );

  return {
    closedCount: closed.length,
    openCount: trades.length - closed.length,
    wins,
    losses,
    breakevens: closed.length - wins - losses,
    netPnl: sum(closed.map((t) => t.net)),
    basis: ctx.pnlBasis,
    grossPnl: sum(closed.map((t) => t.gross)),
    fees: sum(closed.map((t) => t.fees)),
    winRate: ratio(wins, decisive),
    profitFactor: inUnit
      ? inUnit.profitFactor
      : profitFactorOf(winNets, lossNets),
    avgWin: avgWinRaw === null ? null : roundHalfEven(avgWinRaw),
    avgLoss: avgLossRaw === null ? null : roundHalfEven(avgLossRaw),
    winLossRatio: inUnit
      ? inUnit.winLossRatio
      : avgWinRaw === null || avgLossRaw === null || avgLossRaw === 0
        ? null
        : avgWinRaw / Math.abs(avgLossRaw),
    expectancy: expectancy === null ? null : roundHalfEven(expectancy),
    avgRealizedR: ratio(sum(rs), rs.length),
    realizedRTradeCount: rs.length,
    noRiskCount: closed.length - rs.length,
    avgPlannedR: ratio(sum(planned), planned.length),
    plannedRTradeCount: planned.length,
    largestWin: wins === 0 ? null : Math.max(...winNets),
    largestLoss: losses === 0 ? null : Math.min(...lossNets),
    ruleAdherence: ratio(followed, checks.length),
    netRoi: ratio(
      sum(closed.map((t) => t.net)),
      sum(closed.map((t) => costBasis(t))),
    ),
    currencies: [...new Set(closed.map((t) => t.pnlCurrency))].sort(),
  };
}

/**
 * Expectancy in R: win rate times the average winning R, plus loss rate times
 * the average losing R, over the decided trades that have a realized R.
 * Outcomes come from `classify`, as every other figure's do. `count` is the
 * trades it read; the value is null with none.
 */
export function rExpectancy(
  trades: readonly Trade[],
  ctx: MetricContext,
): { value: number | null; count: number } {
  const count = trades.filter(
    (t) =>
      isClosed(t) &&
      classify(t, ctx).outcome !== 'breakeven' &&
      unitOf(t, 'r', ctx.pnlBasis) !== null,
  ).length;
  return { value: expectancyIn(trades, ctx, 'r'), count };
}

const MINUTE = 60_000;

/** Minutes a closed trade was held, open to close. */
const heldMinutes = (t: Trade & { closedAt: string }): number =>
  (Date.parse(t.closedAt) - Date.parse(t.openedAt)) / MINUTE;

/** The longest a closed trade was held, in minutes; null with none. */
export function longestHold(trades: readonly Trade[]): number | null {
  const held = trades.filter(isClosed).map(heldMinutes);
  return held.length === 0 ? null : Math.max(...held);
}

/**
 * Minutes held, averaged over all closed trades and over the winners, the
 * losers and the breakevens apart (outcomes from `classify`). A trade is held
 * from its open to its close; a side with no trade has none.
 */
export function holdTimes(
  trades: readonly Trade[],
  ctx: MetricContext,
): Record<'all' | 'wins' | 'losses' | 'breakevens', number | null> {
  const held = trades.filter(isClosed).map((t) => ({
    minutes: heldMinutes(t),
    outcome: classify(t, ctx).outcome,
  }));
  const mean = (xs: readonly { minutes: number }[]) =>
    ratio(sum(xs.map((x) => x.minutes)), xs.length);
  const of = (o: 'win' | 'loss' | 'breakeven') =>
    mean(held.filter((h) => h.outcome === o));
  return {
    all: mean(held),
    wins: of('win'),
    losses: of('loss'),
    breakevens: of('breakeven'),
  };
}

/**
 * The commissions and the fees of the closed trades' fills, each in its own
 * total. A trade with no fills (typed in by hand) carries its whole cost as
 * fees. Their sum is `Summary.fees`.
 */
export function costsOf(trades: readonly Trade[]): {
  commissions: Cents;
  fees: Cents;
} {
  let commissions = 0;
  let fees = 0;
  for (const t of trades.filter(isClosed)) {
    if (t.executions.length === 0) {
      fees += t.fees;
      continue;
    }
    for (const e of t.executions) {
      commissions += e.commission;
      fees += e.fees;
    }
  }
  return { commissions, fees };
}
