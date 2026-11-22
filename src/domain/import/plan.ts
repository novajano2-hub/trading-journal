import { instrumentKey, resolveInstrument } from '../instruments';
import { riskFromStop } from '../metrics/summary';
import {
  buildTrades,
  canonicalSymbol,
  type BuildOptions,
} from '../trade-builder';
import type { Cents, Trade } from '../types';
import type { ParsedCsv } from './csv';
import {
  expiryCloseUtc,
  settleExpiredOptions,
  type ExpiredOption,
} from './expiry';
import type { ImportMapping, InstrumentOverrides } from './mapping';
import {
  readRows,
  type ImportedFill,
  type ImportedTrip,
  type RowIssue,
} from './rows';

export interface ImportContext {
  workspaceId: string;
  accountId: string;
  accountCurrency: string;
  nextSerial: number;
  /** The account's open trades. */
  openTrades: Trade[];
  /** Row fingerprints of the account's active imports. */
  fingerprints: string[];
  /** Point values remembered from earlier imports. */
  overrides: InstrumentOverrides;
  /** The workspace's import history revision when read; the plan carries it so a commit can refuse a stale plan. */
  importRevision: number;
}

export type TradeFlag =
  | { tradeId: string; code: 'unconverted-currency'; currency: string }
  | { tradeId: string; code: 'pnl-mismatch'; file: Cents; keel: Cents }
  | { tradeId: string; code: 'expired-worthless'; expiry: string };

export type ImportBlock = 'no-rows' | 'unresolved-symbols' | 'nothing-new';

export interface ImportPlan {
  importId: string;
  workspaceId: string;
  accountId: string;
  fileName: string;
  createdAt: string;
  mapping: ImportMapping;
  rowCount: number;
  /** To write, in serial order. Empty when blocked, like replacedTrades and flags. */
  trades: Trade[];
  /** Stored trades this import rebuilds. */
  replacedTrades: Trade[];
  issues: RowIssue[];
  /** rowIndex of each row already imported into the account. */
  duplicateRows: number[];
  /** Of the imported rows. */
  fingerprints: string[];
  unresolvedKeys: string[];
  flags: TradeFlag[];
  blocked: ImportBlock | null;
  /** `ImportContext.importRevision` of the context it was planned from. */
  importRevision: number;
}

/** A file P&L within one cent of Keel's gross or net agrees with it. */
const PNL_TOLERANCE: Cents = 1;

interface Built {
  /** Of the kept (not duplicate) rows. */
  fingerprints: string[];
  duplicateRows: number[];
  trades: Trade[];
  unresolvedSymbols: string[];
  /** Stored trades whose executions were rebuilt. */
  merged: Trade[];
  expired: ExpiredOption[];
  pnlFlags: TradeFlag[];
}

/**
 * Rows whose fingerprint is still counted among the already-imported ones are
 * duplicates; each match uses up one count, so a file's genuine twin fills
 * both import the first time.
 */
function dedupe<R extends { rowIndex: number; fingerprint: string }>(
  rows: readonly R[],
  imported: readonly string[],
): { kept: R[]; duplicateRows: number[] } {
  const remaining = new Map<string, number>();
  for (const f of imported) remaining.set(f, (remaining.get(f) ?? 0) + 1);
  const kept: R[] = [];
  const duplicateRows: number[] = [];
  for (const row of rows) {
    const n = remaining.get(row.fingerprint) ?? 0;
    if (n > 0) {
      remaining.set(row.fingerprint, n - 1);
      duplicateRows.push(row.rowIndex);
    } else kept.push(row);
  }
  return { kept, duplicateRows };
}

function expiredBy(t: Trade, now: string): boolean {
  const { assetClass, expiry } = t.instrument;
  return (
    assetClass === 'option' &&
    expiry !== undefined &&
    Date.parse(expiryCloseUtc(expiry)) <= Date.parse(now)
  );
}

/** Kept fills join the account's open trades in their symbol; FIFO runs across imports. */
function buildFills(
  fills: readonly ImportedFill[],
  ctx: ImportContext,
  opts: BuildOptions,
  now: string,
): Built {
  const { kept, duplicateRows } = dedupe(fills, ctx.fingerprints);
  const symbols = new Set(kept.map((f) => canonicalSymbol(f.execution.symbol)));
  // Hand-entered trades never merge with an import, not even to settle an expiry.
  const merged = ctx.openTrades.filter(
    (t) =>
      t.status === 'open' &&
      t.source !== 'manual' &&
      (symbols.has(canonicalSymbol(t.instrument.symbol)) || expiredBy(t, now)),
  );
  const { executions, expired } = settleExpiredOptions(
    [...merged.flatMap((t) => t.executions), ...kept.map((f) => f.execution)],
    opts.resolve,
    now,
  );
  return {
    ...buildTrades(executions, opts),
    fingerprints: kept.map((f) => f.fingerprint),
    duplicateRows,
    merged,
    expired,
    pnlFlags: [],
  };
}

/** One row is one trade; the file's P&L is checked against Keel's. */
function buildTrips(
  trips: readonly ImportedTrip[],
  ctx: ImportContext,
  opts: BuildOptions,
): Built {
  const { kept, duplicateRows } = dedupe(trips, ctx.fingerprints);
  const trades: Trade[] = [];
  const unresolvedSymbols: string[] = [];
  const pnlFlags: TradeFlag[] = [];
  for (const trip of kept) {
    const built = buildTrades([trip.entry, trip.exit], opts);
    unresolvedSymbols.push(...built.unresolvedSymbols);
    const t = built.trades[0];
    if (!t) continue;
    trades.push(t);
    const file = trip.filePnl;
    if (file === undefined) continue;
    if (t.pnlCurrency !== ctx.accountCurrency) {
      // A pair without the account currency: the file's figure is the conversion.
      t.gross = file;
      t.net = file - t.fees;
      t.pnlCurrency = ctx.accountCurrency;
    } else if (
      Math.abs(file - t.gross) > PNL_TOLERANCE &&
      Math.abs(file - t.net) > PNL_TOLERANCE
    ) {
      pnlFlags.push({
        tradeId: t.id,
        code: 'pnl-mismatch',
        file,
        keel: t.gross,
      });
    }
  }
  return {
    fingerprints: kept.map((r) => r.fingerprint),
    duplicateRows,
    trades,
    unresolvedSymbols,
    merged: [],
    expired: [],
    pnlFlags,
  };
}

/**
 * The execution a stored trade's identity rests on: the one its id names
 * (`<account>:<symbol>:<execution id>`), or its first execution when that one
 * is gone. An id carried over from an earlier merge keeps naming the same
 * fill, so no rebuilt trade can take that id from the builder as well.
 */
function anchorOf(stored: Trade): string | undefined {
  const prefix = `${stored.accountId}:${canonicalSymbol(stored.instrument.symbol)}:`;
  const named = stored.id.startsWith(prefix)
    ? stored.id.slice(prefix.length)
    : undefined;
  return named !== undefined && stored.executions.some((e) => e.id === named)
    ? named
    : stored.executions[0]?.id;
}

/**
 * The stored trade each rebuilt trade continues: the one whose anchor it holds.
 * Stored executions are rebuilt unchanged (the file's copy of one is a
 * duplicate row), so the anchor survives even when an overlapping export adds
 * an earlier fill. When the earlier fill reverses the position through it, the
 * builder splits it, and the part that still opens a position (`:b`) carries on.
 */
function continuations(
  trades: readonly Trade[],
  merged: readonly Trade[],
): Map<Trade, Trade> {
  const out = new Map<Trade, Trade>();
  for (const stored of merged) {
    const anchor = anchorOf(stored);
    if (anchor === undefined) continue;
    const t = trades.find(
      (b) =>
        !out.has(b) &&
        b.executions.some((e) => e.id === anchor || e.id === `${anchor}:b`),
    );
    if (t) out.set(t, stored);
  }
  return out;
}

/** A risk derived from the stop follows the rebuilt position; one the user entered stays. */
function mergedRisk(built: Trade, stored: Trade): Cents | undefined {
  const stop = stored.plannedStop;
  return stop !== undefined && stored.initialRisk === riskFromStop(stored, stop)
    ? riskFromStop(built, stop)
    : stored.initialRisk;
}

/**
 * The rebuilt trade keeps the stored trade's identity and the user's journaling.
 * The planned stop, target and risk were set for the stored direction, so a
 * rebuild that flips it drops them.
 */
function inherit(built: Trade, stored: Trade): Trade {
  const t: Trade = {
    ...built,
    id: stored.id,
    serial: stored.serial,
    strategyIds: [...stored.strategyIds],
    tagIds: [...stored.tagIds],
    ruleChecks: stored.ruleChecks.map((r) => ({ ...r })),
  };
  if (stored.rating !== undefined) t.rating = stored.rating;
  if (stored.reviewed !== undefined) t.reviewed = stored.reviewed;
  if (stored.noteId !== undefined) t.noteId = stored.noteId;
  if (built.direction !== stored.direction) return t;
  if (stored.plannedStop !== undefined) t.plannedStop = stored.plannedStop;
  if (stored.plannedTarget !== undefined)
    t.plannedTarget = stored.plannedTarget;
  const risk = mergedRisk(built, stored);
  if (risk !== undefined) t.initialRisk = risk;
  return t;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function tradeFlags(
  trades: readonly Trade[],
  accountCurrency: string,
  expired: readonly ExpiredOption[],
  pnlFlags: readonly TradeFlag[],
): TradeFlag[] {
  const flags: TradeFlag[] = [...pnlFlags];
  for (const t of trades) {
    if (t.pnlCurrency !== accountCurrency)
      flags.push({
        tradeId: t.id,
        code: 'unconverted-currency',
        currency: t.pnlCurrency,
      });
    const settled = expired.find((x) =>
      t.executions.some((e) => e.id === x.executionId),
    );
    if (settled)
      flags.push({
        tradeId: t.id,
        code: 'expired-worthless',
        expiry: settled.expiry,
      });
  }
  const serial = new Map(trades.map((t) => [t.id, t.serial]));
  return flags.sort(
    (a, b) =>
      (serial.get(a.tradeId) ?? 0) - (serial.get(b.tradeId) ?? 0) ||
      cmp(a.code, b.code),
  );
}

export function planImport(
  parsed: ParsedCsv,
  mapping: ImportMapping,
  ctx: ImportContext,
  meta: { importId: string; fileName: string; now: string },
): ImportPlan {
  const { fills, trips, issues } = readRows(parsed, mapping, {
    importId: meta.importId,
    accountId: ctx.accountId,
  });
  // Point values remembered from earlier imports apply; this mapping's values win.
  const overrides = { ...ctx.overrides, ...mapping.overrides };
  const opts: BuildOptions = {
    workspaceId: ctx.workspaceId,
    startSerial: ctx.nextSerial,
    resolve: (s) =>
      resolveInstrument(s, { forexQtyUnit: mapping.forexQtyUnit, overrides }),
    accountCurrency: () => ctx.accountCurrency,
  };

  const built =
    mapping.kind === 'fills'
      ? buildFills(fills, ctx, opts, meta.now)
      : buildTrips(trips, ctx, opts);
  const valid = built.fingerprints.length + built.duplicateRows.length;

  const continued = continuations(built.trades, built.merged);
  // A stable sort: trades opened together keep file and builder order.
  const fresh = built.trades
    .filter((t) => !continued.has(t))
    .sort((a, b) => cmp(a.openedAt, b.openedAt));
  fresh.forEach((t, i) => {
    t.serial = ctx.nextSerial + i;
  });
  const trades = [
    ...[...continued].map(([t, stored]) => inherit(t, stored)),
    ...fresh,
  ]
    .map((t) => ({ ...t, importId: meta.importId }))
    .sort((a, b) => a.serial - b.serial);

  const unresolvedKeys = [
    ...new Set(built.unresolvedSymbols.map(instrumentKey)),
  ].sort();
  const blocked: ImportBlock | null =
    valid === 0
      ? 'no-rows'
      : unresolvedKeys.length > 0
        ? 'unresolved-symbols'
        : built.fingerprints.length === 0
          ? 'nothing-new'
          : null;

  // A blocked plan is never committed, so it carries nothing to write.
  const writes = blocked
    ? { trades: [], replacedTrades: [], flags: [] }
    : {
        trades,
        replacedTrades: built.merged,
        flags: tradeFlags(
          trades,
          ctx.accountCurrency,
          built.expired,
          built.pnlFlags,
        ),
      };

  return {
    importId: meta.importId,
    workspaceId: ctx.workspaceId,
    accountId: ctx.accountId,
    fileName: meta.fileName,
    createdAt: meta.now,
    mapping,
    rowCount: parsed.rows.length,
    ...writes,
    issues,
    duplicateRows: built.duplicateRows,
    fingerprints: built.fingerprints,
    unresolvedKeys,
    blocked,
    importRevision: ctx.importRevision,
  };
}
