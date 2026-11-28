import { mergeTrades, splitTrade } from '@/domain/grouping';
import {
  levelPrice,
  levelProblems,
  levelValueAt,
  sidesOf,
  tradeRisk,
  type LevelRole,
} from '@/domain/risk';
import { feeRuleError } from '@/domain/rules/fee-rules';
import { qtyStep, targetRuleError } from '@/domain/rules/target-rules';
import { localDate } from '@/domain/time';
import type { BuildOptions } from '@/domain/trade-builder';
import {
  strategyRules,
  type Account,
  type AssetClass,
  type FeeRule,
  type HistoryRow,
  type JournalEntry,
  type LevelSide,
  type LevelUnit,
  type MissedTrade,
  type Strategy,
  type TargetRule,
  type Trade,
} from '@/domain/types';
import {
  changeRows,
  lifecycleRow,
  tradeChanges,
  tradeLabel,
  type FieldChange,
  type NewHistoryRow,
} from '../local/history';
import { ruleLabel, tidySymbols } from '../local/rule-shared';
import { SAMPLE_WORKSPACE } from '../workspaces';
import { DAY_MS, NY, mondayOf, nyMs, parseYmd, ymd } from './calendar';
import { ACCOUNT_SPECS, feesFor, snap } from './instruments';
import type { Random } from './random';

/**
 * Plan 6B's part of the sample (B53): levels on about a third of the trades,
 * two merges and a split, a default target rule and fee rule, swap on the
 * forex trades, a missed trade per strategy, and the history rows those edits
 * would have written. Nothing here reads a stream the rest of the sample
 * draws from, so every value v7 had stays as it was; the trades a merge or
 * the split takes are rebuilt by the app's own grouping. No files.
 */

const WS = SAMPLE_WORKSPACE.id;

/** The account the grouping happens in: the futures account, where every price and cost is whole cents. */
const GROUP_ACCOUNT = 'sample-futures';
/** The longest pause between two trades that a merge joins. */
const MERGE_GAP_MS = 10 * 60_000;
/** The id of the trade the split makes (the app's is `split:<uuid>`). */
const SPLIT_ID = 'split:sample-split-1';

/** Of the trades that have a stop and a target, and of those with a stop alone, the share given levels. */
const LEVEL_SHARE = { both: 0.33, stopOnly: 0.49 };
/** Level edits of trades opened this many days before the end date have history rows; older ones would have been purged. */
const LOGGED_DAYS = 30;
/** The time between two logged edits, at most. */
const EDIT_STEP_MS = 60_000;

/** The asset class each strategy's missed trade is in, by the strategy's place. */
const MISSED_CLASSES: readonly AssetClass[] = [
  'future',
  'stock',
  'forex',
  'crypto',
];

export interface TradeDepth {
  trades: Trade[];
  history: HistoryRow[];
  targetRules: TargetRule[];
  feeRules: FeeRule[];
  missedTrades: MissedTrade[];
}

/** The default seed time: 08:00 in New York the day after the end date. */
export function defaultSeedTime(endDate: string): string {
  return new Date(nyMs(ymd(parseYmd(endDate) + DAY_MS), 8, 0)).toISOString();
}

export function addTradeDepth(s: {
  trades: readonly Trade[];
  journal: readonly JournalEntry[];
  accounts: readonly Account[];
  strategies: readonly Strategy[];
  endDate: string;
  /** The time the sample is written; the history rows come just before it. */
  now: string;
  levelRng: Random;
  swapRng: Random;
  missedRng: Random;
}): TradeDepth {
  const writes: NewHistoryRow[][] = [];
  const account = s.accounts.find((a) => a.id === GROUP_ACCOUNT)!;

  // The rules come first, as a trader sets them up before the edits below:
  // two of each kind in the futures account, a rule naming symbols made
  // first and one for all symbols after it, so the older symbol rule still
  // rules its symbols over the newer one (B15, B18).
  const rule = { workspaceId: WS, accountId: GROUP_ACCOUNT, createdAt: '' };
  const esTargets: TargetRule = {
    ...rule,
    id: 'sample-target-rule-1',
    assetClass: 'future',
    symbols: tidySymbols(['ES']),
    target: {
      unit: 'ticks',
      levels: [
        { value: 12, pct: 50 },
        { value: 24, pct: 50 },
      ],
    },
    stop: { unit: 'ticks', levels: [{ value: 12, pct: 100 }] },
  };
  const microFees: FeeRule = {
    ...rule,
    id: 'sample-fee-rule-1',
    assetClass: 'future',
    symbols: tidySymbols(['MES', 'MNQ']),
    mode: 'per-contract',
    applyOn: 'all',
    commission: 59,
    fee: 35,
  };
  const allTargets: TargetRule = {
    ...rule,
    id: 'sample-target-rule-2',
    assetClass: 'future',
    symbols: tidySymbols([]),
    target: { unit: 'ticks', levels: [{ value: 20, pct: 100 }] },
    stop: { unit: 'ticks', levels: [{ value: 10, pct: 100 }] },
  };
  const allFees: FeeRule = {
    ...rule,
    id: 'sample-fee-rule-2',
    assetClass: 'future',
    symbols: tidySymbols([]),
    mode: 'per-contract',
    applyOn: 'all',
    commission: 225,
    fee: 35,
  };
  const rules = [esTargets, microFees, allTargets, allFees];
  for (const r of rules) {
    const problem = 'mode' in r ? feeRuleError(r) : targetRuleError(r);
    if (problem) throw new Error(`sample rule: ${problem}`);
    writes.push([
      lifecycleRow(
        'mode' in r ? 'fee-rule' : 'target-rule',
        'created',
        r.id,
        ruleLabel(account, r),
      ),
    ]);
  }

  const grouped = groupTrades(s.trades, s.journal, s.strategies, account);
  const levelled = addLevels(s.levelRng, grouped.trades, s.endDate);
  writes.push(...levelled.writes, ...grouped.writes);
  const trades = addSwap(s.swapRng, levelled.trades, s.trades, s.journal);
  const missedTrades = addMissedTrades(
    s.missedRng,
    trades,
    s.strategies,
    s.endDate,
  );

  // Each write's rows share one time, a step apart, ending just before the
  // seed time and starting after the last fill.
  const seedMs = Date.parse(s.now);
  const lastFill = Math.max(
    ...trades.flatMap((t) => t.executions.map((e) => Date.parse(e.time))),
  );
  const step = Math.max(
    1,
    Math.min(
      EDIT_STEP_MS,
      Math.floor((seedMs - lastFill) / (writes.length + 1)),
    ),
  );
  const history: HistoryRow[] = writes.flatMap((rows, k) => {
    const at = new Date(seedMs - (writes.length - k) * step).toISOString();
    return rows.map((row) => ({ ...row, id: '', workspaceId: WS, at }));
  });
  history.forEach((row, i) => {
    row.id = `sample-history-${String(i + 1).padStart(4, '0')}`;
  });
  rules.forEach((r, i) => {
    r.createdAt = history[i]!.at;
  });

  return {
    trades,
    history,
    targetRules: [esTargets, allTargets],
    feeRules: [microFees, allFees],
    missedTrades,
  };
}

// ---- merges and the split --------------------------------------------------

const dayOf = (t: Trade): string => localDate(t.openedAt, NY);

/** Whether a trade carries a check of a rule graded only on a loss. */
const hasLoserChecks = (t: Trade, loserRules: ReadonlySet<string>): boolean =>
  t.ruleChecks.some((c) => loserRules.has(c.ruleId));

/**
 * Whether a note's words could read the trade's figures: a note is its own or
 * links it, or its day has a daily note. The grouping and the swap leave such
 * trades alone, so no note's figures or links change.
 */
function notedBy(journal: readonly JournalEntry[]): (t: Trade) => boolean {
  const linked = new Set(journal.flatMap((j) => j.linkedTradeIds));
  const daily = new Set(
    journal.flatMap((j) =>
      j.kind === 'daily-review' && j.date !== undefined ? [j.date] : [],
    ),
  );
  return (t) =>
    t.noteId !== undefined || linked.has(t.id) || daily.has(dayOf(t));
}

/**
 * Two merges and a split in the futures account, built with the app's own
 * `mergeTrades` and `splitTrade` and logged as `trades.merge` and
 * `trades.split` log them. Only closed trades that no note names, on days
 * without a daily note, so no note's words or links change. A merge joins a
 * trade and the one before it in the same contract, the same day and way,
 * the later opened within ten minutes of the earlier closing; the split takes
 * a trade of two entries and two exits
 * that pair off, so both parts end flat. The latest of each are taken, and a
 * result that would turn a loss graded on its loser rules into a win is not.
 */
function groupTrades(
  trades: readonly Trade[],
  journal: readonly JournalEntry[],
  strategies: readonly Strategy[],
  account: Account,
): { trades: Trade[]; writes: NewHistoryRow[][] } {
  const opts: BuildOptions = {
    workspaceId: WS,
    startSerial: 0,
    resolve: () => null,
    accountCurrency: () => account.currency,
    costMethodOf: () => account.costMethod ?? 'fifo',
  };
  const noted = notedBy(journal);
  const loserRules = new Set(
    strategies.flatMap((st) =>
      strategyRules(st)
        .filter((r) => r.showWhen === 'loser')
        .map((r) => r.id),
    ),
  );
  const free = trades.filter(
    (t) => t.accountId === account.id && t.status === 'closed' && !noted(t),
  );
  const writes: NewHistoryRow[][] = [];
  const label = (t: Trade) => tradeLabel(t, NY);
  const fills = (before: number, after: number): FieldChange => ({
    field: 'fills',
    oldValue: before,
    newValue: after,
  });
  const row = (
    action: 'merged' | 'split',
    t: Trade,
    change: FieldChange,
  ): NewHistoryRow => ({
    type: 'trade',
    action,
    source: 'you',
    entityId: t.id,
    label: label(t),
    ...change,
  });

  const replaced = new Map<string, Trade>();
  const removed = new Set<string>();
  const taken = new Set<string>();

  // Merges, the latest first: a trade and the one before it in the same
  // contract, each pair apart from the others.
  const isFree = new Set(free.map((t) => t.id));
  const own = trades.filter((t) => t.accountId === account.id);
  const merges: NewHistoryRow[][] = [];
  for (let i = own.length - 1; i >= 1 && merges.length < 2; i--) {
    const b = own[i]!;
    const before = own.slice(0, i);
    const a = before.findLast(
      (t) => t.instrument.symbol === b.instrument.symbol,
    );
    if (!a || !isFree.has(a.id) || !isFree.has(b.id)) continue;
    if (taken.has(a.id) || taken.has(b.id)) continue;
    if (dayOf(a) !== dayOf(b) || a.direction !== b.direction) continue;
    const gap = Date.parse(b.openedAt) - Date.parse(a.closedAt!);
    if (gap <= 0 || gap > MERGE_GAP_MS) continue;
    const picked = new Set([...a.executions, ...b.executions].map((e) => e.id));
    const result = mergeTrades([a, b], picked, opts);
    const { kept } = result;
    if (result.changed.length > 0 || result.unlinkNoteIds.length > 0) continue;
    if (
      (hasLoserChecks(a, loserRules) || hasLoserChecks(b, loserRules)) &&
      kept.net >= 0
    )
      continue;
    const sources = new Map([a, b].map((t) => [t.id, t]));
    const count = (id: string) => sources.get(id)!.executions.length;
    replaced.set(kept.id, kept);
    for (const id of result.removedIds) removed.add(id);
    taken.add(a.id).add(b.id);
    merges.unshift([
      row('merged', kept, fills(count(kept.id), kept.executions.length)),
      ...result.removedIds.map((id) =>
        row('merged', sources.get(id)!, fills(count(id), 0)),
      ),
    ]);
  }
  writes.push(...merges);

  // The split, the latest trade whose fills pair off.
  let created: Trade | undefined;
  const highest = Math.max(...trades.map((t) => t.serial));
  for (let i = free.length - 1; i >= 0 && !created; i--) {
    const t = free[i]!;
    if (taken.has(t.id) || t.executions.length !== 4) continue;
    const [e1, e2, x1, x2] = t.executions as [
      Trade['executions'][number],
      Trade['executions'][number],
      Trade['executions'][number],
      Trade['executions'][number],
    ];
    if (
      e1.side !== e2.side ||
      x1.side !== x2.side ||
      e1.side === x1.side ||
      e1.qty !== x1.qty ||
      e2.qty !== x2.qty
    )
      continue;
    const { original, created: part } = splitTrade(t, new Set([e2.id, x2.id]), {
      ...opts,
      serial: highest + 1,
      id: SPLIT_ID,
    });
    if (original.status !== 'closed' || part.status !== 'closed') continue;
    if (hasLoserChecks(t, loserRules) && original.net >= 0) continue;
    replaced.set(original.id, original);
    taken.add(t.id);
    created = part;
    writes.push([
      row(
        'split',
        original,
        fills(t.executions.length, original.executions.length),
      ),
      row('split', part, fills(0, part.executions.length)),
    ]);
  }

  const out = trades
    .filter((t) => !removed.has(t.id))
    .map((t) => replaced.get(t.id) ?? t);
  if (created) out.push(created);
  return { trades: out, writes };
}

// ---- levels ------------------------------------------------------------------

const tidy = (n: number): number => Math.round(n * 1e9) / 1e9;

/** Whether a value reads as a trader would type it in its unit. */
function readable(t: Trade, unit: LevelUnit, value: number): boolean {
  if (!(value > 0)) return false;
  const whole = (x: number) => Math.abs(x - Math.round(x)) < 1e-6;
  switch (unit) {
    case 'ticks':
      return whole(value);
    case 'pips':
      return whole(value * 10);
    case 'points':
    case 'movement':
      return whole(value / t.instrument.tickSize);
    default:
      return true;
  }
}

/**
 * A side whose levels sit at these prices, in `unit`: in Price when the unit
 * cannot say a price in whole ticks or tenths of a pip, or would not land on
 * it. An Amount is the money a level makes, so its price follows the cents.
 */
function sideAt(
  t: Trade,
  role: LevelRole,
  unit: LevelUnit,
  at: readonly { price: number; qty: number }[],
): LevelSide {
  if (unit !== 'price') {
    const levels = at.map(({ price, qty }) => ({
      value: levelValueAt(t, role, unit, price, qty),
      qty,
    }));
    const lands = levels.every(
      (l, i) =>
        readable(t, unit, l.value) &&
        (unit === 'amount' ||
          Math.abs(levelPrice(t, role, unit, l) - at[i]!.price) < 1e-9),
    );
    if (lands) return { unit, levels };
  }
  return {
    unit: 'price',
    levels: at.map(({ price, qty }) => ({ value: price, qty })),
  };
}

/** The unit a trader of this kind of instrument sets a stop in. */
function stopUnit(t: Trade): LevelUnit {
  switch (t.instrument.assetClass) {
    case 'future':
      return 'ticks';
    case 'forex':
      return 'pips';
    default:
      return 'price';
  }
}

function targetUnit(t: Trade, single: boolean, roll: number): LevelUnit {
  if (single && roll < 0.4) return 'amount';
  switch (t.instrument.assetClass) {
    case 'future':
      return roll < 0.7 ? 'ticks' : 'points';
    case 'forex':
      return 'pips';
    default:
      return roll < 0.7 ? 'price' : 'movement';
  }
}

/**
 * Levels, as the trade page saves them, on about a third of the trades that
 * have a stop: a target and a stop on half of those, a stop alone on the rest
 * (only where the trade has no single target, so no target reads from it).
 * The stop is the trade's own stop on the whole position, so the stored risk
 * is the stop side's loss to the cent and no R moves; the target is its own
 * target, or that and one further out on half the position each. The single
 * stop and target go, as a save in levels drops them. A trade whose levels
 * would not be valid gets none. A trade hand grouped is left as it is.
 */
function addLevels(
  rng: Random,
  trades: readonly Trade[],
  endDate: string,
): { trades: Trade[]; writes: NewHistoryRow[][] } {
  const since = ymd(parseYmd(endDate) - LOGGED_DAYS * DAY_MS);
  const writes: NewHistoryRow[][] = [];
  const out = trades.map((t) => {
    if (t.plannedStop === undefined || t.grouping === 'manual') return t;
    const both = t.plannedTarget !== undefined;
    // Every draw is made for every candidate, so the stream does not depend on sizes.
    const take = rng.chance(both ? LEVEL_SHARE.both : LEVEL_SHARE.stopOnly);
    const two = rng.chance(0.5);
    const roll = rng.next();
    if (!take) return t;

    const size = t.maxPosition;
    const stopAt = [{ price: t.plannedStop, qty: size }];
    let targetAt: { price: number; qty: number }[] | undefined;
    if (both) {
      const target = t.plannedTarget!;
      const step = qtyStep(t);
      const first = tidy(Math.floor(size / 2 / step + 1e-9) * step);
      const tick = t.instrument.tickSize;
      const dec = tick < 0.001 ? 5 : tick < 0.01 ? 3 : 2;
      const dir = t.direction === 'long' ? 1 : -1;
      const further = snap(
        target + dir * Math.max(tick, 0.5 * Math.abs(target - t.avgEntry)),
        tick,
        dec,
      );
      targetAt =
        two && first >= step && size - first >= step - 1e-9
          ? [
              { price: target, qty: first },
              { price: further, qty: tidy(size - first) },
            ]
          : [{ price: target, qty: size }];
    }
    // A trade saved in levels leaves the single stop and target, as the
    // trade page's save does (`applyTradePatch`, B14).
    const build = (plain: boolean): Trade => {
      const next: Trade = {
        ...t,
        stops: sideAt(t, 'stop', plain ? 'price' : stopUnit(t), stopAt),
      };
      delete next.plannedStop;
      delete next.plannedTarget;
      if (targetAt) {
        const unit = targetUnit(t, targetAt.length === 1, roll);
        next.targets = sideAt(t, 'target', plain ? 'price' : unit, targetAt);
      }
      return next;
    };
    const valid = (x: Trade) =>
      levelProblems(x, sidesOf(x)).length === 0 &&
      tradeRisk(x) === t.initialRisk;
    let next = build(false);
    if (!valid(next)) next = build(true);
    if (!valid(next)) return t;

    // Logged as the trade page logs the save: a side that reads as it did
    // (a single stop kept in Price at its size) is no change.
    const rows = changeRows(
      'trade',
      t.id,
      tradeLabel(next, NY),
      tradeChanges(t, next),
    );
    if (localDate(t.openedAt, NY) >= since && rows.length > 0)
      writes.push(rows);
    return next;
  });
  return { trades: out, writes };
}

// ---- swap ----------------------------------------------------------------------

/**
 * Swap on the closed forex trades that no note's words read (`notedBy`), as a
 * closed-trades file gives it: small (10 cents to 1.20 dollars a lot), into
 * the net and not the gross, as the import adds it (ledger R3). The notes
 * were written from the trades with their swap, so a weekly recap's net, its
 * share of winners and its best and worst trades must read as they do: the
 * week's trades take their swap in pairs, a charge on one and the same credit
 * on the other, and a pair whose swap would turn a win into a loss, or reach
 * the week's best or worst trade, takes 0.00, as does a trade left over. The weeks sum to nothing, so
 * the forex evaluation's bounds stay where they were.
 */
function addSwap(
  rng: Random,
  trades: readonly Trade[],
  /** The trades the notes were written from: before the grouping. */
  written: readonly Trade[],
  journal: readonly JournalEntry[],
): Trade[] {
  const noted = notedBy(journal);
  const closedFx = trades.filter(
    (t) => t.instrument.assetClass === 'forex' && t.status === 'closed',
  );
  // Every closed forex trade draws, so the stream does not depend on which take a swap.
  const draws = new Map(
    closedFx.map((t) => [
      t.id,
      {
        none: rng.chance(0.15),
        charge: rng.chance(0.5),
        perLot: 0.1 + rng.next() * 1.1,
      },
    ]),
  );
  const weeks = new Map<string, Trade[]>();
  for (const t of closedFx) {
    if (noted(t)) continue;
    const week = mondayOf(dayOf(t));
    weeks.set(week, [...(weeks.get(week) ?? []), t]);
  }
  // A week's best and worst, as its recap read them: the closed trades of
  // the accounts the journal was written from, before the grouping.
  const journalled = new Set(ACCOUNT_SPECS.map((a) => a.id));
  const recapped = written.filter(
    (t) => t.status === 'closed' && journalled.has(t.accountId),
  );
  const swaps = new Map<string, number>();
  for (const [week, own] of weeks) {
    const friday = ymd(parseYmd(week) + 4 * DAY_MS);
    const nets = recapped
      .filter((t) => dayOf(t) >= week && dayOf(t) <= friday)
      .map((t) => t.net);
    const best = Math.max(...nets);
    const worst = Math.min(...nets);
    const keeps = (t: Trade, swap: number) =>
      t.net + swap > 0 === t.net > 0 &&
      t.net + swap < best &&
      t.net + swap > worst;
    for (let i = 0; i < own.length; i += 2) {
      const a = own[i]!;
      const b = own[i + 1];
      const d = draws.get(a.id)!;
      const size = Math.min(a.maxPosition, b?.maxPosition ?? 0);
      const cents = Math.max(1, Math.round(size * d.perLot * 100));
      const swap = d.charge ? -cents : cents;
      const takes = b && !d.none && keeps(a, swap) && keeps(b, -swap);
      swaps.set(a.id, takes ? swap : 0);
      if (b) swaps.set(b.id, takes ? -swap : 0);
    }
  }
  return trades.map((t) => {
    const swap = swaps.get(t.id);
    return swap === undefined ? t : { ...t, swap, net: t.net + swap };
  });
}

// ---- missed trades -----------------------------------------------------------

/**
 * One missed trade for each strategy, with exactly the form's fields: a setup
 * seen beside one of the strategy's last trades in its asset class, in the
 * same session, at a nearby price, with the costs that size would have cost.
 */
function addMissedTrades(
  rng: Random,
  trades: readonly Trade[],
  strategies: readonly Strategy[],
  endDate: string,
): MissedTrade[] {
  const sessions = new Map(ACCOUNT_SPECS.map((a) => [a.id, a]));
  return strategies.flatMap((st, i) => {
    const wanted = MISSED_CLASSES[i];
    const cls =
      wanted && st.assetClasses.includes(wanted) ? wanted : st.assetClasses[0];
    const own = trades.filter(
      (t) =>
        t.strategyIds.includes(st.id) &&
        t.instrument.assetClass === cls &&
        sessions.has(t.accountId) &&
        dayOf(t) <= endDate,
    );
    const pool = own.slice(-12);
    const minutes = rng.int(12, 50);
    const later = rng.chance(0.5);
    const drift = rng.around(0, 0.0015);
    if (pool.length === 0) return [];
    const t = rng.pick(pool);
    const spec = sessions.get(t.accountId)!;
    const day = dayOf(t);
    const open = nyMs(day, spec.openH, spec.openM) + 5 * 60_000;
    const close =
      nyMs(day, spec.openH, spec.openM) + (spec.sessionMin - 5) * 60_000;
    const from = Date.parse(later ? (t.closedAt ?? t.openedAt) : t.openedAt);
    const raw = from + (later ? 1 : -1) * minutes * 60_000;
    const atMs =
      Math.floor(Math.min(close, Math.max(open, raw)) / 60_000) * 60_000;
    const tick = t.instrument.tickSize;
    const dec = tick < 0.001 ? 5 : tick < 0.01 ? 3 : 2;
    const price = snap(t.avgEntry * (1 + drift), tick, dec);
    const qty = t.executions[0]!.qty;
    const costs = feesFor(t.instrument.assetClass, qty, price);
    const missed: MissedTrade = {
      id: `sample-missed-${i + 1}`,
      workspaceId: WS,
      strategyId: st.id,
      symbol:
        t.instrument.assetClass === 'future'
          ? t.instrument.root
          : t.instrument.symbol,
      at: new Date(atMs).toISOString(),
      price,
      commission: costs.commission,
      fees: costs.fees,
    };
    return [missed];
  });
}
