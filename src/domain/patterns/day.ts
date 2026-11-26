import { costBasis } from '../metrics/context';
import { rOf } from '../metrics/summary';
import { roundHalfEven } from '../money';
import { outcomeOf } from '../outcome';
import type { Cents } from '../types';
import {
  THRESHOLDS as T,
  type PatternEnv,
  type PatternHit,
  type PatternId,
} from './defs';
import { DAY_MS, median, type Fact, type Outcome } from './facts';

/** One local day of trades, read once. A day is the trade log's day (6A K37). */
interface Day {
  date: string;
  /** Days since 1970-01-01 of the date, for the look-back arithmetic. */
  index: number;
  /** Every trade of the day, open ones included, in entry order: counts and sides read these. */
  facts: Fact[];
  /** Its closed trades, in entry order: results, holds and gaps read these. */
  closed: Fact[];
  /** The closed trades' P&L added up. */
  net: Cents;
  /** Red or green by the breakeven range; none while no trade has closed. */
  outcome: Outcome | undefined;
  wins: number;
  losses: number;
  winSum: Cents;
  lossAbs: Cents;
}

/** The 60 days before a day, rolled forward: sums over the days of the window. */
interface Window {
  /** Days with a trade. */
  days: number;
  tradeCount: number;
  greenDays: number;
  greenNet: Cents;
  greenTradeCount: number;
  losses: number;
  lossAbs: Cents;
}

interface Context {
  env: PatternEnv;
  basis: 'net' | 'gross';
}

type Check = (
  d: Day,
  w: Window,
  c: Context,
) => Record<string, number> | undefined;

const dayIndex = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

/** Side changes through the day's trades in entry order. */
function sideChanges(facts: readonly Fact[]): number {
  let n = 0;
  for (let i = 1; i < facts.length; i++)
    if (facts[i]!.trade.direction !== facts[i - 1]!.trade.direction) n += 1;
  return n;
}

const absValue = (x: Fact) => Math.abs(x.value);

/** Every check, in the order of the pattern list. */
const CHECKS: readonly (readonly [PatternId, Check])[] = [
  [
    'losses-outweighed',
    (d) => {
      if (d.outcome !== 'loss' || d.losses === 0) return;
      const decided = d.wins + d.losses;
      if (d.wins < T.outweighedWinRate * decided) return;
      // Average loss at least `ratio` times the average win, without dividing.
      if (d.lossAbs * d.wins < T.outweighedRatio * d.winSum * d.losses) return;
      return {
        winRate: d.wins / decided,
        avgWin: roundHalfEven(d.winSum / d.wins),
        avgLoss: roundHalfEven(d.lossAbs / d.losses),
        net: d.net,
      };
    },
  ],
  [
    'switched-sides-red',
    (d) => {
      const changes = sideChanges(d.facts);
      if (d.outcome !== 'loss' || changes < T.flipChanges) return;
      return { changes, trades: d.facts.length, net: d.net };
    },
  ],
  [
    'switched-sides-green',
    (d) => {
      const changes = sideChanges(d.facts);
      if (d.outcome !== 'win' || changes < T.flipChanges) return;
      return { changes, trades: d.facts.length, net: d.net };
    },
  ],
  [
    'one-strong-trade',
    (d, _w, c) => {
      const only = d.facts[0]!;
      if (d.facts.length !== 1 || only.outcome !== 'win') return;
      const r = rOf(only.trade, c.basis);
      if (r === undefined || r < T.strongR) return;
      return { r, net: only.value };
    },
  ],
  [
    'low-return',
    (d, w) => {
      if (
        d.facts.length < T.lowReturnTrades ||
        d.outcome !== 'win' ||
        w.greenDays === 0
      )
        return;
      // Below a share of the average green day, without dividing.
      if (d.net * w.greenDays >= T.lowReturnShare * w.greenNet) return;
      return {
        net: d.net,
        avgGreenNet: roundHalfEven(w.greenNet / w.greenDays),
        trades: d.facts.length,
        greenDays: w.greenDays,
      };
    },
  ],
  [
    'sized-up-after-wins',
    (d, w) => {
      if (w.losses === 0) return;
      const c = d.closed;
      for (let i = T.sizedUpStreak; i < c.length; i++) {
        const x = c[i]!;
        const previous = c[i - 1]!;
        if (x.outcome !== 'loss' || x.volume <= previous.volume) continue;
        // Larger than the average loss: the loss over n beats the sum over n.
        if (absValue(x) * w.losses <= w.lossAbs) continue;
        let streak = 0;
        while (i - 1 - streak >= 0 && c[i - 1 - streak]!.outcome === 'win')
          streak += 1;
        if (streak < T.sizedUpStreak) continue;
        return {
          streak,
          size: x.volume,
          previousSize: previous.volume,
          loss: absValue(x),
          avgLoss: roundHalfEven(w.lossAbs / w.losses),
        };
      }
    },
  ],
  [
    'more-trades',
    (d, w) => {
      if (w.days === 0) return;
      const { num, den } = T.moreTradesOver;
      // At least `num/den` over the daily average, without dividing.
      if (den * d.facts.length * w.days < (den + num) * w.tradeCount) return;
      return {
        trades: d.facts.length,
        average: w.tradeCount / w.days,
        days: w.days,
      };
    },
  ],
  [
    'waited-then-won',
    (d, _w, c) => {
      const session = c.env.sessions.get(d.date);
      if (!session || d.outcome !== 'win') return;
      const waitMs = d.facts[0]!.open - Date.parse(session.start);
      if (!(waitMs >= T.waitedMs)) return;
      return { waitMinutes: waitMs / 60_000, net: d.net };
    },
  ],
  [
    'quick-reentries',
    (d) => {
      const quick = d.closed.filter(
        (x) =>
          x.outcome === 'loss' &&
          x.priorLoss !== undefined &&
          x.open - x.priorLoss.close! <= T.quickReentryMs,
      );
      if (quick.length < T.quickReentries) return;
      return {
        trades: quick.length,
        loss: quick.reduce((n, x) => n + absValue(x), 0),
      };
    },
  ],
  [
    'rushed-red-day',
    (d) => {
      if (d.outcome !== 'loss' || d.facts.length < T.rushedTrades) return;
      const c = d.closed;
      if (c.length < 2) return;
      const medianHoldMs = median(c.map((x) => x.close! - x.open));
      // The gap between a trade's exit and the next entry; trades that overlap have none.
      const medianGapMs = median(
        c.slice(1).map((x, i) => Math.max(0, x.open - c[i]!.close!)),
      );
      if (medianHoldMs >= T.rushedHoldMs || medianGapMs >= T.rushedGapMs)
        return;
      return { trades: d.facts.length, medianHoldMs, medianGapMs, net: d.net };
    },
  ],
  [
    'busier-than-green',
    (d, w) => {
      if (w.greenDays === 0) return;
      // At least `ratio` times the average green day's count, without dividing.
      if (d.facts.length * w.greenDays < T.busierRatio * w.greenTradeCount)
        return;
      return {
        trades: d.facts.length,
        average: w.greenTradeCount / w.greenDays,
        greenDays: w.greenDays,
      };
    },
  ],
];

/** The days of the workspace, oldest first, each with its trades read once. */
function buildDays(facts: readonly Fact[], env: PatternEnv): Day[] {
  const byDate = new Map<string, Day>();
  for (const f of facts) {
    let d = byDate.get(f.day);
    if (!d) {
      d = {
        date: f.day,
        index: dayIndex(f.day),
        facts: [],
        closed: [],
        net: 0,
        outcome: undefined,
        wins: 0,
        losses: 0,
        winSum: 0,
        lossAbs: 0,
      };
      byDate.set(f.day, d);
    }
    d.facts.push(f);
    if (f.close === undefined) continue;
    d.closed.push(f);
    d.net += f.value;
    if (f.outcome === 'win') {
      d.wins += 1;
      d.winSum += f.value;
    } else if (f.outcome === 'loss') {
      d.losses += 1;
      d.lossAbs += absValue(f);
    }
  }
  const percent = env.breakevenRange.unit === 'percent';
  for (const d of byDate.values()) {
    if (d.closed.length === 0) continue;
    // The day's colour as the Overview reads it: its net against the range,
    // by Net ROI on the day's cost basis for a percent range.
    const basis = percent
      ? d.closed.reduce((n, f) => n + costBasis(f.trade), 0)
      : 0;
    d.outcome = outcomeOf(
      d.net,
      env.breakevenRange,
      basis > 0 ? d.net / basis : undefined,
    );
  }
  return [...byDate.values()].sort((a, b) => a.index - b.index);
}

/** Adds (+1) or removes (-1) a day from the window's sums. */
function roll(w: Window, d: Day, sign: 1 | -1): void {
  w.days += sign;
  w.tradeCount += sign * d.facts.length;
  w.losses += sign * d.losses;
  w.lossAbs += sign * d.lossAbs;
  if (d.outcome === 'win') {
    w.greenDays += sign;
    w.greenNet += sign * d.net;
    w.greenTradeCount += sign * d.facts.length;
  }
}

/**
 * The day-level patterns of every day with a trade, by date; a day with none
 * is absent. `facts` come in entry order (`buildFacts`). The look-back of a day
 * is the 60 days before it (B20), rolled forward day by day.
 */
export function dayPatterns(
  facts: readonly Fact[],
  env: PatternEnv,
): Map<string, PatternHit[]> {
  const days = buildDays(facts, env);
  const ctx: Context = { env, basis: env.pnlBasis ?? 'net' };
  const out = new Map<string, PatternHit[]>();
  const w: Window = {
    days: 0,
    tradeCount: 0,
    greenDays: 0,
    greenNet: 0,
    greenTradeCount: 0,
    losses: 0,
    lossAbs: 0,
  };
  let hi = 0;
  let lo = 0;
  for (const d of days) {
    while (hi < days.length && days[hi]!.index < d.index)
      roll(w, days[hi++]!, 1);
    while (lo < hi && days[lo]!.index < d.index - T.lookbackDays)
      roll(w, days[lo++]!, -1);
    const hits: PatternHit[] = [];
    for (const [id, check] of CHECKS) {
      const figures = check(d, w, ctx);
      if (figures) hits.push({ id, date: d.date, figures });
    }
    if (hits.length > 0) out.set(d.date, hits);
  }
  return out;
}
