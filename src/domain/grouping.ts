import { copySide, riskFromStop, tradeRisk } from './risk';
import {
  buildGroup,
  canonicalSymbol,
  type BuildOptions,
} from './trade-builder';
import type { Cents, Execution, Instrument, RuleCheck, Trade } from './types';

/**
 * Merging trades and splitting one by their fills (Plan 6B spec §5.1, B1 to
 * B5). Both rebuild the trades they touch with `buildGroupedTrade`, which never
 * cuts at a flat point, and mark every result `grouping: 'manual'`.
 */

/** Why a merge or a split is not offered. */
export type GroupRefusal =
  | 'mixed-account'
  | 'mixed-instrument'
  /** Merge: fewer than two trades, or picks in fewer than two of them. Split: one fill only, or none moved. */
  | 'too-few'
  /** Split: every fill moved, so the original would have none. */
  | 'nothing-left';

/** `mergeTrades` and `splitTrade` throw this for what `canMerge` and `canSplit` refuse. */
export class GroupRefused extends Error {
  constructor(readonly refusal: GroupRefusal) {
    super(`These trades cannot be grouped: ${refusal}`);
    this.name = 'GroupRefused';
  }
}

/** A risk derived from the stop follows the position's size; one the user entered stays (as `inherit` in the import plan reads it). */
function riskAfter(rebuilt: Trade, base: Trade): Cents | undefined {
  if (base.targets !== undefined || base.stops !== undefined)
    return tradeRisk(rebuilt) ?? base.initialRisk;
  const stop = base.plannedStop;
  if (stop === undefined) return base.initialRisk;
  return base.initialRisk === riskFromStop(base, stop)
    ? riskFromStop(rebuilt, stop)
    : base.initialRisk;
}

/**
 * One trade from the given fills, never cut at a flat point: they may return
 * to flat any number of times and stay one trade, and it is open if the
 * position does not end flat. `base` is the record the trade keeps (id,
 * serial, journaling, levels); the fills decide everything else.
 *
 * Its swap is `base.swap`, added to `net` and not to `gross` (ledger R3). Its
 * risk is rewritten for the new size (`riskAfter`), and its MAE and MFE are
 * dropped, as they describe fills it no longer has.
 */
export function buildGroupedTrade(
  executions: readonly Execution[],
  base: Trade,
  opts: BuildOptions,
): Trade {
  // Array.prototype.sort is stable: equal times keep input order, as in buildTrades.
  const fills = [...executions].sort(
    (a, b) => Date.parse(a.time) - Date.parse(b.time),
  );
  const [built] = buildGroup(
    fills,
    base.instrument,
    base.accountId,
    opts,
    false,
  );
  if (!built) throw new Error('a trade needs at least one execution');

  const t: Trade = {
    ...base,
    strategyIds: [...base.strategyIds],
    tagIds: [...base.tagIds],
    ruleChecks: base.ruleChecks.map((c) => ({ ...c })),
    direction: built.direction,
    status: built.status,
    openedAt: built.openedAt,
    executions: built.executions,
    avgEntry: built.avgEntry,
    maxPosition: built.maxPosition,
    pnlCurrency: built.pnlCurrency,
    gross: built.gross,
    fees: built.fees,
    net: built.net + (base.swap ?? 0),
  };
  if (base.targets) t.targets = copySide(base.targets);
  if (base.stops) t.stops = copySide(base.stops);
  // An exit and a close time exist only when the fills have them.
  delete t.avgExit;
  delete t.closedAt;
  if (built.avgExit !== undefined) t.avgExit = built.avgExit;
  if (built.closedAt !== undefined) t.closedAt = built.closedAt;
  delete t.mae;
  delete t.mfe;
  const risk = riskAfter(t, base);
  if (risk === undefined) delete t.initialRisk;
  else t.initialRisk = risk;
  return t;
}

const manual = (t: Trade): Trade => ({ ...t, grouping: 'manual' });

const sameInstrument = (a: Instrument, b: Instrument): boolean =>
  canonicalSymbol(a.symbol) === canonicalSymbol(b.symbol) &&
  a.assetClass === b.assetClass &&
  a.pointValue === b.pointValue;

/** Whether the trade has a fill among the picked ones. */
const gives = (t: Trade, picked: ReadonlySet<string>): boolean =>
  t.executions.some((e) => picked.has(e.id));

/** Earliest opened first; trades opened together by serial. */
const byOpening = (a: Trade, b: Trade): number =>
  Date.parse(a.openedAt) - Date.parse(b.openedAt) || a.serial - b.serial;

/**
 * Whether these trades can be merged (B1): two or more, in one account and one
 * instrument. With `picked` (execution ids), the picks must also reach at least
 * two of the trades, or there is nothing to join.
 */
export function canMerge(
  trades: readonly Trade[],
  picked?: ReadonlySet<string>,
): GroupRefusal | null {
  const [first] = trades;
  if (!first || trades.length < 2) return 'too-few';
  if (trades.some((t) => t.accountId !== first.accountId))
    return 'mixed-account';
  if (trades.some((t) => !sameInstrument(t.instrument, first.instrument)))
    return 'mixed-instrument';
  if (picked && trades.filter((t) => gives(t, picked)).length < 2)
    return 'too-few';
  return null;
}

/**
 * The trade whose record a merge keeps: the earliest opened of those that give
 * a picked fill (all of them, without `picked`). A trade that gives nothing is
 * left out, so it never wears a record it has no fill in.
 */
export function mergeKeeper(
  trades: readonly Trade[],
  picked?: ReadonlySet<string>,
): Trade | undefined {
  return [...trades].sort(byOpening).find((t) => !picked || gives(t, picked));
}

/** Every id once, in the order first met. */
const union = (lists: readonly (readonly string[])[]): string[] => [
  ...new Set(lists.flat()),
];

/**
 * The first trade's checks, then the others' for rules it has none for. A
 * check still unanswered (`null`) counts as none, so another trade's answer
 * fills it.
 */
function mergedChecks(trades: readonly Trade[]): RuleCheck[] {
  const out: RuleCheck[] = [];
  for (const t of trades)
    for (const c of t.ruleChecks) {
      const at = out.findIndex((x) => x.ruleId === c.ruleId);
      if (at < 0) out.push({ ...c });
      else if (out[at]?.followed === null && c.followed !== null)
        out[at] = { ...c };
    }
  return out;
}

export interface MergeResult {
  /** The merged trade: the keeper's record, rebuilt from the picked fills. */
  kept: Trade;
  /** Sources that gave all their fills and are gone. */
  removedIds: string[];
  /** Sources left with the fills that were not picked, rebuilt. */
  changed: Trade[];
  /** Notes of the removed sources: unlinked, kept in Trade notes. */
  unlinkNoteIds: string[];
}

/**
 * Merges the trades by their picked executions (`picked`, execution ids; B2 to B3).
 *
 * - The earliest-opened source that gives a fill is `kept`: its id, serial,
 *   note, rating, reviewed mark, levels and rule checks stay; tags and
 *   strategies are the union of the sources that give; their rule checks fill
 *   what it has none for. The kept trade's own fills all stay in it, picked or
 *   not.
 * - A fill not picked stays in its trade, which is rebuilt (`changed`); a trade
 *   left with none is gone (`removedIds`) and its note is unlinked.
 * - Swap stays with the trade it was on, and a trade that is gone hands its
 *   swap to the merged one (ledger R3).
 *
 * Throws `GroupRefused` for what `canMerge(sources, picked)` refuses.
 */
export function mergeTrades(
  sources: readonly Trade[],
  picked: ReadonlySet<string>,
  opts: BuildOptions,
): MergeResult {
  const refusal = canMerge(sources, picked);
  if (refusal) throw new GroupRefused(refusal);
  const [keeper, ...joining] = [...sources]
    .sort(byOpening)
    .filter((t) => gives(t, picked));
  if (!keeper) throw new GroupRefused('too-few');

  const parts = joining.map((t) => ({
    trade: t,
    taken: t.executions.filter((e) => picked.has(e.id)),
    left: t.executions.filter((e) => !picked.has(e.id)),
  }));
  const gone = parts.filter((p) => p.left.length === 0).map((p) => p.trade);

  const given = [keeper, ...joining];
  const base: Trade = {
    ...keeper,
    strategyIds: union(given.map((t) => t.strategyIds)),
    tagIds: union(given.map((t) => t.tagIds)),
    ruleChecks: mergedChecks(given),
  };
  const swaps = [keeper, ...gone].flatMap((t) =>
    t.swap === undefined ? [] : [t.swap],
  );
  if (swaps.length > 0) base.swap = swaps.reduce((a, b) => a + b, 0);

  const kept = manual(
    buildGroupedTrade(
      [...keeper.executions, ...parts.flatMap((p) => p.taken)],
      base,
      opts,
    ),
  );
  const noteIds = gone.flatMap((t) =>
    t.noteId === undefined || t.noteId === keeper.noteId ? [] : [t.noteId],
  );
  return {
    kept,
    removedIds: gone.map((t) => t.id),
    changed: parts
      .filter((p) => p.left.length > 0)
      .map((p) => manual(buildGroupedTrade(p.left, p.trade, opts))),
    unlinkNoteIds: [...new Set(noteIds)],
  };
}

/**
 * Whether the picked executions (`moved`, ids) can be split off (B4): the trade
 * needs two fills at least, and at least one must move and one stay.
 */
export function canSplit(
  trade: Trade,
  moved: ReadonlySet<string>,
): GroupRefusal | null {
  const n = trade.executions.filter((e) => moved.has(e.id)).length;
  if (trade.executions.length < 2 || n === 0) return 'too-few';
  return n === trade.executions.length ? 'nothing-left' : null;
}

export interface SplitResult {
  /** The trade with the fills that stayed; its record is untouched. */
  original: Trade;
  /** The trade made of the moved fills. */
  created: Trade;
}

/**
 * What the new part of a split starts from: where its fills came from
 * (account, instrument, and the import an undo would look for), and the tags
 * and strategies; nothing else of the record (B4).
 */
function newPart(trade: Trade, id: string, serial: number): Trade {
  const part: Trade = {
    id,
    serial,
    workspaceId: trade.workspaceId,
    accountId: trade.accountId,
    instrument: trade.instrument,
    strategyIds: trade.strategyIds,
    tagIds: trade.tagIds,
    ruleChecks: [],
    // The fills decide the rest; `buildGroupedTrade` replaces these.
    direction: trade.direction,
    status: 'open',
    openedAt: trade.openedAt,
    executions: [],
    avgEntry: 0,
    maxPosition: 0,
    pnlCurrency: trade.pnlCurrency,
    gross: 0,
    fees: 0,
    net: 0,
  };
  if (trade.source !== undefined) part.source = trade.source;
  if (trade.importId !== undefined) part.importId = trade.importId;
  return part;
}

/**
 * Moves the picked executions (`moved`, ids) to a new trade, with the id and
 * serial in `opts`. Each part is rebuilt, so one that does not return to flat
 * is open. The original keeps its record, swap and levels (a level now over its
 * size shows as an error until fixed); the new trade is not reviewed.
 *
 * Throws `GroupRefused` for what `canSplit` refuses.
 */
export function splitTrade(
  trade: Trade,
  moved: ReadonlySet<string>,
  opts: BuildOptions & { serial: number; id: string },
): SplitResult {
  const refusal = canSplit(trade, moved);
  if (refusal) throw new GroupRefused(refusal);
  return {
    original: manual(
      buildGroupedTrade(
        trade.executions.filter((e) => !moved.has(e.id)),
        trade,
        opts,
      ),
    ),
    created: manual(
      buildGroupedTrade(
        trade.executions.filter((e) => moved.has(e.id)),
        newPart(trade, opts.id, opts.serial),
        opts,
      ),
    ),
  };
}
