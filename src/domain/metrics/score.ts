import { isClosed } from '../trade-status';
import type { Trade } from '../types';
import { pnlOf, type MetricContext } from './context';
import { dailyPnl } from './days';
import { maxDrawdown } from './equity';
import { summarize } from './summary';

/**
 * The Edge score (#23): six parts, each scored 0 to 100, weighted into a total
 * of 0 to 100. Pure money figures: it ignores `ctx.unit`, as TradeZella's does.
 */
export type ScorePart =
  | 'winRate'
  | 'profitFactor'
  | 'winLoss'
  | 'recovery'
  | 'drawdown'
  | 'consistency';

export const SCORE_WEIGHTS: Record<ScorePart, number> = {
  profitFactor: 0.25,
  winLoss: 0.2,
  drawdown: 0.2,
  winRate: 0.15,
  recovery: 0.1,
  consistency: 0.1,
};

/**
 * Why a part scores as it does when its raw value cannot be computed or is not
 * a figure. 'no-profit' is the ratios' with no winning trade (C77): nothing was
 * won, so no edge is shown and they score 0.
 */
export type ScoreWhy = 'no-losses' | 'no-profit' | 'no-drawdown' | 'net-loss';

export interface ScorePartResult {
  /**
   * The figure the part is scored from: win rate and max drawdown in percent
   * (0 to 100 and up), profit factor, avg win/loss and recovery as ratios, and
   * consistency as the standard deviation of the trades over the net (a
   * fraction). Null when there is no such figure (`why` says so, except for a
   * win rate with no decided trade and a drop from a peak at or under zero).
   */
  raw: number | null;
  /** The part's sub-score, 0 to 100: what the total counts. */
  score: number;
  /** What the radar draws, 0 to 100: the score, except recovery with no drawdown (drawn full, counted 0). */
  plotted: number;
  why?: ScoreWhy;
}

export interface ScoreResult {
  /** 0 to 100, to two decimals. */
  total: number;
  parts: Record<ScorePart, ScorePartResult>;
}

/** A linear stretch of a sub-score: `lo` at ratio `from`, `hi` at ratio `to`. */
interface Band {
  from: number;
  to: number;
  lo: number;
  hi: number;
}

/**
 * The score inside the highest band that starts at or below `r`, rising
 * linearly from the band's `lo` at its start to its `hi` at its end, and held
 * at `hi` past it. Null when `r` is under the first band.
 */
function inBands(r: number, bands: readonly Band[]): number | null {
  let hit: Band | undefined;
  for (const b of bands) if (r >= b.from) hit = b;
  if (!hit) return null;
  const t = Math.min(1, (r - hit.from) / (hit.to - hit.from));
  return hit.lo + t * (hit.hi - hit.lo);
}

/**
 * The help's bands for profit factor and avg win/loss, from 1.8: 50 at 1.8
 * rising to 100 at 2.6. Each band runs from its own score to the next band's,
 * so the score is continuous from 1.8 up (C21).
 */
const RATIO_BANDS: readonly Band[] = [
  { from: 1.8, to: 1.9, lo: 50, hi: 60 },
  { from: 1.9, to: 2.0, lo: 60, hi: 70 },
  { from: 2.0, to: 2.2, lo: 70, hi: 80 },
  { from: 2.2, to: 2.4, lo: 80, hi: 90 },
  { from: 2.4, to: 2.6, lo: 90, hi: 100 },
];

/**
 * The help's bands for the recovery factor, each from its first listed score
 * at its first listed ratio to its last at its last: "3.0 to 3.49: 70 to 89"
 * reaches 89 at 3.49 and holds it to 3.5, where the score is 100.
 */
const RECOVERY_BANDS: readonly Band[] = [
  { from: 1.0, to: 1.49, lo: 1, hi: 29 },
  { from: 1.5, to: 1.99, lo: 30, hi: 49 },
  { from: 2.0, to: 2.49, lo: 50, hi: 59 },
  { from: 2.5, to: 2.99, lo: 60, hi: 69 },
  { from: 3.0, to: 3.49, lo: 70, hi: 89 },
];

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

/**
 * Profit factor and avg win/loss. From 1.8 the help's bands (50 at 1.8, 100
 * from 2.6); under 1.8 the ratio x 33.3, never under 20 (TradeZella's own
 * readings, INFERRED). The step down at 1.8 is the help's, and is kept.
 */
export function ratioScore(r: number): number {
  if (r >= 2.6) return 100;
  return inBands(r, RATIO_BANDS) ?? Math.max(20, (r * 100) / 3);
}

/**
 * The recovery factor: 100 from 3.5, 0 under 1.0, the help's bands between.
 * Null (no drawdown) scores 0.
 */
export function recoveryScore(r: number | null): number {
  if (r === null || r < 1) return 0;
  if (r >= 3.5) return 100;
  return inBands(r, RECOVERY_BANDS) ?? 0;
}

/** The win rate, in percent: 60 is full marks. */
export function winRateScore(pct: number): number {
  return clamp((pct / 60) * 100);
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

function part(
  raw: number | null,
  score: number,
  extra: { plotted?: number; why?: ScoreWhy } = {},
): ScorePartResult {
  return {
    raw,
    score,
    plotted: extra.plotted ?? score,
    ...(extra.why ? { why: extra.why } : {}),
  };
}

/**
 * A ratio part (profit factor or avg win/loss). With no winning trade nothing
 * was won, so it scores 0, 'no-profit' (C77); the raw is the ratio when there
 * is one (0 with losses), null when there is none (all breakeven). With a win
 * and no loss there is nothing to divide by: it scores full, 'no-losses'
 * (C23), which applies only when there is a profit.
 */
function ratioPart(raw: number | null, wins: number): ScorePartResult {
  if (wins === 0) return part(raw, 0, { why: 'no-profit' });
  return raw === null
    ? part(null, 100, { why: 'no-losses' })
    : part(raw, ratioScore(raw));
}

/**
 * The Edge score of a set of trades: null with no closed trade. The profit
 * factor, the win/loss ratio and the win rate are the summary's, on the
 * trader's P&L basis; the max drawdown reads the daily curve as the Overview
 * does (`maxDrawdown` from a zero start: the drop over the highest cumulative
 * P&L before it); the recovery factor is the net over that drawdown in money;
 * consistency is the population deviation of the trades' P&L over the net.
 * The set is one currency, as every metric's is.
 */
export function scoreOf(
  trades: readonly Trade[],
  ctx: MetricContext,
): ScoreResult | null {
  const closed = trades.filter(isClosed);
  if (closed.length === 0) return null;

  // The score reads money (TradeZella's behaviour): no unit.
  const money: MetricContext = { ...ctx };
  delete money.unit;

  const s = summarize(trades, money);
  const results = closed.map((t) => pnlOf(t, ctx.pnlBasis));
  const net = sum(results);
  const dd = maxDrawdown(dailyPnl(trades, money), 0);

  const winRate = s.winRate === null ? null : s.winRate * 100;

  // No wins and a loss is a ratio of 0; no loss has no ratio.
  const winLoss = s.losses === 0 ? null : s.wins === 0 ? 0 : s.winLossRatio;
  // (ratioPart scores either as no-profit when there is no win.)

  let drawdown: ScorePartResult;
  if (dd.amount === 0) drawdown = part(0, 100);
  else if (dd.pct === null) drawdown = part(null, 0);
  else drawdown = part(dd.pct * 100, clamp(100 - dd.pct * 100));

  let recovery: ScorePartResult;
  if (dd.amount === 0)
    recovery = part(null, 0, { plotted: 100, why: 'no-drawdown' });
  else {
    const raw = net / dd.amount;
    recovery = part(raw, recoveryScore(raw));
  }

  let consistency: ScorePartResult;
  if (net < 0) consistency = part(null, 0, { why: 'net-loss' });
  else if (net === 0) consistency = part(null, 0);
  else {
    const mean = net / results.length;
    const deviation = Math.sqrt(
      sum(results.map((r) => (r - mean) ** 2)) / results.length,
    );
    consistency = part(deviation / net, clamp(100 - (100 * deviation) / net));
  }

  const parts: Record<ScorePart, ScorePartResult> = {
    winRate:
      winRate === null ? part(null, 0) : part(winRate, winRateScore(winRate)),
    profitFactor: ratioPart(s.profitFactor, s.wins),
    winLoss: ratioPart(winLoss, s.wins),
    recovery,
    drawdown,
    consistency,
  };
  const total = (Object.keys(SCORE_WEIGHTS) as ScorePart[]).reduce(
    (n, k) => n + SCORE_WEIGHTS[k] * parts[k].score,
    0,
  );
  return { total: Math.round(clamp(total) * 100) / 100, parts };
}
