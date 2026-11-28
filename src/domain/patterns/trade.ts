import { roundHalfEven } from '../money';
import type { Execution, Trade } from '../types';
import { THRESHOLDS as T, type PatternHit, type PatternId } from './defs';
import { DAY_MS, SortedWindow, type Fact } from './facts';

/**
 * The look-back of one trade (B20), rolled forward as entries advance: the
 * trades that had closed before this one's entry, within 60 days of it, for
 * the outcome patterns, and the trades entered before it, within 60 days, for
 * size. Only what had happened by the entry is in it, so a later trade never
 * changes an earlier result.
 */
class Window {
  /** Holds of the wins and of the losses, by outcome (breakevens are neither, B22). */
  readonly holds = { win: new SortedWindow(), loss: new SortedWindow() };
  /** The losses' sizes added up, for their average. */
  lossAbs = 0;
  readonly volumes = new SortedWindow();
}

const isEntry = (t: Trade, e: Execution) =>
  (e.side === 'buy') === (t.direction === 'long');

const count = (t: Trade, entries: boolean) =>
  t.executions.reduce((n, e) => (isEntry(t, e) === entries ? n + 1 : n), 0);

const hold = (x: Fact) => x.close! - x.open;
const absValue = (x: Fact) => Math.abs(x.value);

type Check = (x: Fact, w: Window) => Record<string, number> | undefined;

/** Every check, in the order of the pattern list. */
const CHECKS: readonly (readonly [PatternId, Check])[] = [
  [
    'held-longer',
    (x, w) => {
      if (x.outcome !== 'win' && x.outcome !== 'loss') return;
      const sample = w.holds[x.outcome];
      if (sample.size === 0) return;
      const limitMs = sample.quantile(T.heldLongerShare);
      if (hold(x) <= limitMs) return;
      return {
        holdMs: hold(x),
        limitMs,
        sample: sample.size,
        win: x.outcome === 'win' ? 1 : 0,
      };
    },
  ],
  [
    'long-loss-hold',
    (x, w) => {
      if (x.outcome !== 'loss') return;
      const n = w.holds.loss.size;
      if (n === 0) return;
      const limitMs = w.holds.loss.quantile(T.longLossShare);
      // Larger than their average: the loss over n beats the sum over n.
      if (hold(x) <= limitMs || absValue(x) * n <= w.lossAbs) return;
      return {
        holdMs: hold(x),
        limitMs,
        loss: absValue(x),
        avgLoss: roundHalfEven(w.lossAbs / n),
        sample: n,
      };
    },
  ],
  [
    'loss-after-loss',
    (x) => {
      const prior = x.priorLoss;
      if (x.outcome !== 'loss' || !prior) return;
      const gapMs = x.open - prior.close!;
      if (gapMs > T.lossAfterLossMs) return;
      return { gapMs, priorLoss: absValue(prior) };
    },
  ],
  [
    'added-to-position',
    (x) => {
      const entries = count(x.trade, true);
      if (entries < T.scaledFills) return;
      return { entries, volume: x.volume };
    },
  ],
  [
    'exited-in-parts',
    (x) => {
      if (x.close === undefined) return;
      const exits = count(x.trade, false);
      if (exits < T.scaledFills) return;
      // T15's text gives the parts, the average exit and the gross P&L; the
      // tick lets the sentence write the price as the trade page does.
      const { avgExit, gross, instrument } = x.trade;
      return {
        exits,
        ...(avgExit === undefined ? {} : { avgExit }),
        gross,
        tick: instrument.tickSize,
      };
    },
  ],
  [
    'large-size',
    (x, w) => {
      if (w.volumes.size === 0) return;
      const limit = w.volumes.quantile(T.largeSizeShare);
      if (x.volume <= limit) return;
      return { volume: x.volume, limit, sample: w.volumes.size };
    },
  ],
];

/**
 * The trade-level patterns of every trade, by trade id; a trade with none is
 * absent. `facts` come in entry order (`buildFacts`). Both look-backs roll:
 * two pointers move forward over the trades, each added and removed once.
 */
export function tradePatterns(
  facts: readonly Fact[],
): Map<string, PatternHit[]> {
  const span = T.lookbackDays * DAY_MS;
  const out = new Map<string, PatternHit[]>();
  const w = new Window();

  // The decided trades by exit, for the outcome look-back.
  const exited = facts
    .filter((f) => f.outcome === 'win' || f.outcome === 'loss')
    .sort((a, b) => a.close! - b.close!);
  let exitedHi = 0;
  let exitedLo = 0;
  let enteredHi = 0;
  let enteredLo = 0;

  for (const x of facts) {
    while (exitedHi < exited.length && exited[exitedHi]!.close! < x.open) {
      const y = exited[exitedHi++]!;
      w.holds[y.outcome as 'win' | 'loss'].add(hold(y));
      if (y.outcome === 'loss') w.lossAbs += absValue(y);
    }
    while (exitedLo < exitedHi && exited[exitedLo]!.close! < x.open - span) {
      const y = exited[exitedLo++]!;
      w.holds[y.outcome as 'win' | 'loss'].remove(hold(y));
      if (y.outcome === 'loss') w.lossAbs -= absValue(y);
    }
    while (enteredHi < facts.length && facts[enteredHi]!.open < x.open)
      w.volumes.add(facts[enteredHi++]!.volume);
    while (enteredLo < enteredHi && facts[enteredLo]!.open < x.open - span)
      w.volumes.remove(facts[enteredLo++]!.volume);

    const hits: PatternHit[] = [];
    for (const [id, check] of CHECKS) {
      const figures = check(x, w);
      if (figures) hits.push({ id, tradeId: x.trade.id, figures });
    }
    if (hits.length > 0) out.set(x.trade.id, hits);
  }
  return out;
}
