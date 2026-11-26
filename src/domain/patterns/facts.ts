import { classify } from '../metrics/context';
import { tradeVolume } from '../metrics/summary';
import { localDate } from '../time';
import { isClosed } from '../trade-status';
import type { Cents, Trade } from '../types';
import type { PatternEnv } from './defs';

export const DAY_MS = 86_400_000;

/** What a closed trade's P&L decided, against the breakeven range. */
export type Outcome = 'win' | 'loss' | 'breakeven';

/** One trade, read once: its instants in ms, its outcome, its day. */
export interface Fact {
  trade: Trade;
  /** Entry instant. */
  open: number;
  /** Exit instant: closed trades only, never before the entry. */
  close: number | undefined;
  /** Closed trades only; an open trade has no outcome (B22). */
  outcome: Outcome | undefined;
  /** The P&L on the basis; 0 for an open trade. */
  value: Cents;
  /** `tradeVolume`: the quantity of the opening fills, counted once. */
  volume: number;
  /** The trade log's day (6A K37): the close date, else the open date, in the profile zone. */
  day: string;
  /** For a loss: the closest loss to exit at or before its entry, if any (T8, D13). */
  priorLoss: Fact | undefined;
}

/** Entry order: by entry instant, then serial, then id, so a result never depends on the list's order. */
const byEntry = (a: Fact, b: Fact): number =>
  a.open - b.open ||
  a.trade.serial - b.trade.serial ||
  (a.trade.id < b.trade.id ? -1 : a.trade.id > b.trade.id ? 1 : 0);

/** Every trade of the workspace as a fact, in entry order. */
export function buildFacts(trades: readonly Trade[], env: PatternEnv): Fact[] {
  const ctx = {
    pnlBasis: env.pnlBasis ?? 'net',
    breakevenRange: env.breakevenRange,
  } as const;
  const facts = trades.map((trade): Fact => {
    const open = Date.parse(trade.openedAt);
    const closed = isClosed(trade);
    const decided = closed ? classify(trade, ctx) : undefined;
    return {
      trade,
      open,
      close: closed ? Math.max(open, Date.parse(trade.closedAt)) : undefined,
      outcome: decided?.outcome,
      value: decided?.value ?? 0,
      volume: tradeVolume(trade),
      day: localDate(closed ? trade.closedAt : trade.openedAt, env.timeZone),
      priorLoss: undefined,
    };
  });
  facts.sort(byEntry);
  linkPriorLosses(facts);
  return facts;
}

/**
 * For each loss, the loss that exited closest at or before its entry (never
 * itself): one binary search per loss over the losses by exit.
 */
function linkPriorLosses(facts: readonly Fact[]): void {
  const losses = facts
    .filter((f) => f.outcome === 'loss')
    .sort((a, b) => a.close! - b.close!);
  for (const x of losses) {
    let lo = 0;
    let hi = losses.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (losses[mid]!.close! <= x.open) lo = mid + 1;
      else hi = mid;
    }
    let i = lo - 1;
    if (i >= 0 && losses[i] === x) i -= 1;
    if (i >= 0) x.priorLoss = losses[i];
  }
}

/**
 * A sorted multiset of numbers with the nearest-rank quantile: the window the
 * look-backs roll, one add and one remove per trade.
 */
export class SortedWindow {
  private readonly values: number[] = [];

  get size(): number {
    return this.values.length;
  }

  add(v: number): void {
    this.values.splice(this.lowerBound(v), 0, v);
  }

  remove(v: number): void {
    const i = this.lowerBound(v);
    if (this.values[i] === v) this.values.splice(i, 1);
  }

  /**
   * The smallest value with at least a share `q` of the window at or below it
   * (nearest rank). A value above it is longer, or larger, than at least `q`
   * of the window. Needs a value in the window.
   */
  quantile(q: number): number {
    return this.values[Math.ceil(q * this.values.length) - 1]!;
  }

  private lowerBound(v: number): number {
    let lo = 0;
    let hi = this.values.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.values[mid]! < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

/** The median: the middle value, or the mean of the middle two. Needs a value. */
export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
